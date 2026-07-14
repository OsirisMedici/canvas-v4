import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { runCommand } from "@/lib/process";
import type { ContentItem, SourceType } from "@/lib/types";

type IngestedItem = Partial<ContentItem> & Pick<ContentItem, "source_type" | "title">;
export type RemoteFile = { bytes: Buffer; mimeType: string; fileName: string; finalUrl: string };
export type IngestedUrl = IngestedItem & { remoteFile?: RemoteFile };

function youtubeId(url: URL) {
  if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
  if (url.hostname.includes("youtube.com")) {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/);
    return match?.[1] || null;
  }
  return null;
}

function canonicalize(input: string) {
  const url = new URL(input.trim());
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key));
  const id = youtubeId(url);
  if (id) return new URL(`https://www.youtube.com/watch?v=${id}`);
  return url;
}

async function ingestYouTube(url: URL, id: string, originalUrl: URL): Promise<IngestedItem> {
  let metadata: Record<string, unknown> = {};
  try {
    const { stdout } = await runCommand("yt-dlp", ["--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", url.toString()], 45_000);
    metadata = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.toString())}&format=json`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("YouTube could not return metadata for this link.");
    metadata = await response.json() as Record<string, unknown>;
  }

  const timestamp = typeof metadata.timestamp === "number" ? new Date(metadata.timestamp * 1000).toISOString() : null;
  const width = typeof metadata.width === "number" ? metadata.width : null;
  const height = typeof metadata.height === "number" ? metadata.height : null;
  const aspectRatio = typeof metadata.aspect_ratio === "number" ? metadata.aspect_ratio : null;
  const canvasOrientation = originalUrl.pathname.startsWith("/shorts/") || (width && height && height > width) || (aspectRatio && aspectRatio < 1)
    ? "portrait"
    : "landscape";
  return {
    source_type: "youtube",
    canonical_url: url.toString(),
    external_id: id,
    title: String(metadata.title || "Untitled YouTube video"),
    author: String(metadata.uploader || metadata.author_name || metadata.channel || "YouTube"),
    description: typeof metadata.description === "string" ? metadata.description.slice(0, 40_000) : null,
    thumbnail_url: String(metadata.thumbnail || metadata.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
    published_at: timestamp,
    duration_seconds: typeof metadata.duration === "number" ? Math.round(metadata.duration) : null,
    view_count: typeof metadata.view_count === "number" ? metadata.view_count : null,
    transcript_status: "not_requested",
    metadata: { ...metadata, canvasOrientation, originalUrl: originalUrl.toString() },
  };
}

function responseFileName(response: Response, url: URL) {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const candidate = encoded ? decodeURIComponent(encoded) : plain || url.pathname.split("/").filter(Boolean).pop() || "download.pdf";
  return candidate.toLowerCase().endsWith(".pdf") ? candidate : `${candidate}.pdf`;
}

async function ingestWebPage(url: URL): Promise<IngestedUrl> {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CanvasVault/4.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const finalUrl = new URL(response.url || url.toString());
  const looksLikePdf = contentType.includes("application/pdf") || finalUrl.pathname.toLowerCase().endsWith(".pdf");
  if (looksLikePdf) {
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 100 * 1024 * 1024) throw new Error("This linked PDF is larger than the 100 MB capture limit.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("This linked PDF is larger than the 100 MB capture limit.");
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("The link claimed to be a PDF but did not contain a valid PDF file.");
    const fileName = responseFileName(response, finalUrl);
    return {
      source_type: "document",
      canonical_url: finalUrl.toString(),
      title: fileName.replace(/\.pdf$/i, ""),
      author: finalUrl.hostname.replace(/^www\./, ""),
      description: "Downloaded from the public link and stored locally.",
      transcript_status: "not_applicable",
      mime_type: "application/pdf",
      metadata: { contentType, capturedAt: new Date().toISOString(), originalUrl: url.toString() },
      remoteFile: { bytes, mimeType: "application/pdf", fileName, finalUrl: finalUrl.toString() },
    };
  }
  const html = (await response.text()).slice(0, 3_000_000);
  const dom = new JSDOM(html, { url: response.url });
  const document = dom.window.document;
  const article = new Readability(document.cloneNode(true) as Document).parse();
  const meta = (property: string) => document.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.getAttribute("content") || null;
  const title = article?.title || meta("og:title") || document.title || url.hostname;
  const description = article?.excerpt || meta("og:description") || meta("description") || null;
  const contentText = article?.textContent?.trim().slice(0, 2_000_000) || null;
  const author = article?.byline || meta("author") || url.hostname.replace(/^www\./, "");

  return {
    source_type: "article",
    canonical_url: response.url || url.toString(),
    title,
    author,
    description,
    content_text: contentText,
    thumbnail_url: meta("og:image"),
    transcript_status: "not_applicable",
    metadata: { siteName: meta("og:site_name"), contentType: response.headers.get("content-type") },
  };
}

export async function ingestUrl(input: string): Promise<IngestedUrl> {
  let url: URL;
  let originalUrl: URL;
  try {
    originalUrl = new URL(input.trim());
    url = canonicalize(input);
  } catch {
    throw new Error("Enter a complete public URL beginning with http:// or https://.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only public HTTP and HTTPS links are supported.");
  const id = youtubeId(url);
  if (id) return ingestYouTube(url, id, originalUrl);
  if ((url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && !url.pathname.startsWith("/share/")) {
    throw new Error("Private ChatGPT conversations cannot be read from a link. Paste the conversation text or upload an exported HTML, Markdown, text, or JSON file instead.");
  }
  try { return await ingestWebPage(url); }
  catch (error) {
    return {
      source_type: "article",
      canonical_url: url.toString(),
      title: url.hostname.replace(/^www\./, ""),
      author: url.hostname.replace(/^www\./, ""),
      description: "The link was saved, but its page content could not be captured.",
      transcript_status: "not_applicable",
      metadata: { captureError: error instanceof Error ? error.message : String(error), capturedAt: new Date().toISOString() },
    };
  }
}

export function sourceTypeForUpload(file: File): SourceType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf" || /\.(docx?|pdf|txt|md|rtf|html?|json|csv)$/i.test(file.name)) return "document";
  return "file";
}
