import { emptyTrash, listTrash } from "@/lib/trash";

export async function GET() {
  try { return Response.json(await listTrash()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load Trash." }, { status: 500 }); }
}

export async function DELETE() {
  try { return Response.json(await emptyTrash()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not empty Trash." }, { status: 500 }); }
}
