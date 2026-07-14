import { readFile } from "node:fs/promises";
import { getItem } from "@/lib/items";
import { getVaultDir } from "@/lib/config";
import { isInsideVault } from "@/lib/vault-files";

export async function GET(_request: Request, context: RouteContext<"/api/items/[id]/preview">) {
  const { id } = await context.params;
  const item = await getItem(id);
  const candidate = item?.preview_path || (item?.mime_type?.startsWith("image/") ? item.file_path : null);
  if (!candidate || !isInsideVault(candidate, getVaultDir())) return new Response("Preview not found.", { status: 404 });
  try {
    const file = await readFile(candidate);
    return new Response(file, {
      headers: {
        "content-type": item?.preview_path ? "image/jpeg" : item?.mime_type || "image/jpeg",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Preview not found.", { status: 404 });
  }
}
