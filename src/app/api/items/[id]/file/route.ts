import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getItem } from "@/lib/items";
import { getVaultDir } from "@/lib/config";
import { isInsideVault } from "@/lib/vault-files";

function fileHeaders(item: { mime_type: string | null; file_name: string | null }, size: number) {
  return {
    "accept-ranges": "bytes",
    "content-type": item.mime_type || "application/octet-stream",
    "content-disposition": `inline; filename="${(item.file_name || "file").replace(/["\r\n]/g, "")}"`,
    "content-length": String(size),
    "cache-control": "private, max-age=0, must-revalidate",
  };
}

export async function GET(request: Request, context: RouteContext<"/api/items/[id]/file">) {
  const { id } = await context.params;
  const item = await getItem(id);
  if (!item?.file_path || !isInsideVault(item.file_path, getVaultDir())) return new Response("File not found.", { status: 404 });
  try {
    const { size } = await stat(item.file_path);
    const range = request.headers.get("range");
    if (!range) {
      const stream = Readable.toWeb(createReadStream(item.file_path));
      return new Response(stream as BodyInit, { headers: fileHeaders(item, size) });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (!match[1] && match[2]) {
      const suffixLength = Number(match[2]);
      start = Math.max(size - suffixLength, 0);
      end = size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const length = end - start + 1;
    const stream = Readable.toWeb(createReadStream(item.file_path, { start, end }));
    return new Response(stream as BodyInit, {
      status: 206,
      headers: {
        ...fileHeaders(item, length),
        "content-range": `bytes ${start}-${end}/${size}`,
      },
    });
  } catch {
    return new Response("File not found.", { status: 404 });
  }
}
