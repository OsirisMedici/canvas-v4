import { createNote, getStats, listItems, saveIngestedItem } from "@/lib/items";
import { ingestUrl } from "@/lib/ingest";
import { DEFAULT_BOARD_ID } from "@/lib/boards";
import { query } from "@/lib/db";
import { attachRemoteFile } from "@/lib/remote-files";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const [items, stats] = await Promise.all([
      listItems(url.searchParams.get("q") || "", url.searchParams.get("type") || "all", url.searchParams.get("board") || DEFAULT_BOARD_ID),
      getStats(),
    ]);
    return Response.json({ items, stats });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load the vault." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  try {
    const body = await request.json() as { kind?: string; url?: string; title?: string; body?: string; boardId?: string };
    const boardId = body.boardId || DEFAULT_BOARD_ID;
    if (body.kind === "note") {
      const text = body.body?.trim();
      if (!text) return Response.json({ error: "Write something before saving the note." }, { status: 400 });
      const title = body.title?.trim() || text.split(/\r?\n/)[0].slice(0, 100) || "Untitled note";
      return Response.json({ item: await createNote(title, text, boardId) }, { status: 201 });
    }
    if (!body.url?.trim()) return Response.json({ error: "Paste a URL first." }, { status: 400 });
    const job = await query<{ id: string }>("INSERT INTO ingest_jobs (job_type, status, source_url) VALUES ('url_capture', 'running', $1) RETURNING id", [body.url.trim()]);
    jobId = job.rows[0].id;
    const ingested = await ingestUrl(body.url);
    let item = await saveIngestedItem(ingested, boardId);
    if (ingested.remoteFile) item = await attachRemoteFile(item.id, ingested.remoteFile);
    await query("UPDATE ingest_jobs SET item_id = $2, status = 'completed', bytes_processed = $3, completed_at = now() WHERE id = $1", [jobId, item.id, ingested.remoteFile?.bytes.byteLength || null]);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (jobId) await query("UPDATE ingest_jobs SET status = 'failed', error = $2, completed_at = now() WHERE id = $1", [jobId, error instanceof Error ? error.message : String(error)]).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not save this item." }, { status: 400 });
  }
}
