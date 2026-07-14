import path from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { query } from "@/lib/db";
import { getItem } from "@/lib/items";
import { getItemDir } from "@/lib/config";
import { persistItemSnapshot } from "@/lib/vault-files";
import { runCommand } from "@/lib/process";
import type { ContentItem } from "@/lib/types";

function parseVtt(input: string) {
  const output: string[] = [];
  let previous = "";
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!line || line === "WEBVTT" || line.includes("-->" ) || /^\d+$/.test(line) || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (line !== previous) output.push(line);
    previous = line;
  }
  return output.join(" ").replace(/\s+/g, " ").trim();
}

async function captionsForYouTube(item: ContentItem, directory: string) {
  const outputTemplate = path.join(directory, "source.%(ext)s");
  try {
    await runCommand(process.env.YTDLP_BIN || "yt-dlp", [
      "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en.*,en",
      "--sub-format", "vtt", "--no-playlist", "--no-warnings", "-o", outputTemplate,
      item.canonical_url!,
    ], 90_000);
  } catch {
    // A missing subtitle track can make yt-dlp exit non-zero; inspect output before falling back.
  }
  const files = (await readdir(directory)).filter((name) => name.endsWith(".vtt")).sort((a, b) => a.length - b.length);
  if (!files.length) return null;
  const transcript = parseVtt(await readFile(path.join(directory, files[0]), "utf8"));
  return transcript ? { text: transcript, origin: "source_caption", language: "en" } : null;
}

async function transcribeMedia(filePath: string, directory: string) {
  const python = process.env.TRANSCRIBE_PYTHON || "python3";
  const outputPath = path.join(directory, "generated-transcript.json");
  const script = process.env.TRANSCRIBE_SCRIPT || path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "transcribe.py");
  await runCommand(python, [script, filePath, outputPath], 3_600_000);
  const result = JSON.parse(await readFile(outputPath, "utf8")) as { text: string; language?: string };
  if (!result.text?.trim()) throw new Error("Local transcription completed but returned no text.");
  return { text: result.text.trim(), origin: "generated", language: result.language || null };
}

async function audioForYouTube(item: ContentItem, directory: string) {
  const outputTemplate = path.join(directory, "audio.%(ext)s");
  await runCommand(process.env.YTDLP_BIN || "yt-dlp", ["-x", "--audio-format", "m4a", "--audio-quality", "5", "--no-playlist", "--no-warnings", "-o", outputTemplate, item.canonical_url!], 600_000);
  const file = (await readdir(directory)).find((name) => /^audio\./.test(name));
  if (!file) throw new Error("The video audio could not be downloaded.");
  return path.join(directory, file);
}

export async function fetchTranscript(id: string) {
  const item = await getItem(id);
  if (!item) throw new Error("Item not found.");
  if (item.transcript_status === "ready") return item;
  if (!['youtube', 'audio', 'video'].includes(item.source_type)) throw new Error("Transcription is available for YouTube, audio, and video items.");

  await query("UPDATE content_items SET transcript_status = 'fetching', transcript_error = NULL, updated_at = now() WHERE id = $1", [id]);
  const directory = getItemDir(id);
  await mkdir(directory, { recursive: true });

  try {
    let transcript: { text: string; origin: string; language: string | null } | null = null;
    if (item.source_type === "youtube") {
      transcript = await captionsForYouTube(item, directory);
      if (!transcript) transcript = await transcribeMedia(await audioForYouTube(item, directory), directory);
    } else if (item.file_path) {
      transcript = await transcribeMedia(item.file_path, directory);
    }
    if (!transcript) throw new Error("No transcript could be produced for this item.");

    await writeFile(path.join(directory, "transcript.txt"), transcript.text, "utf8");
    const result = await query<ContentItem>(`
      UPDATE content_items
      SET transcript_text = $2, transcript_status = 'ready', transcript_origin = $3,
          transcript_language = $4, transcript_error = NULL, updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [id, transcript.text, transcript.origin, transcript.language]);
    await persistItemSnapshot(result.rows[0]);
    return result.rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcript fetch failed.";
    await query("UPDATE content_items SET transcript_status = 'failed', transcript_error = $2, updated_at = now() WHERE id = $1", [id, message.slice(0, 2_000)]);
    throw new Error(message);
  }
}
