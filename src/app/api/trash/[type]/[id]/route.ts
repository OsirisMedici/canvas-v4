import { permanentlyDelete, type TrashType } from "@/lib/trash";

type Context = { params: Promise<{ type: string; id: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { type, id } = await context.params;
    if (!["folder", "board", "item"].includes(type)) return Response.json({ error: "Unknown Trash type." }, { status: 400 });
    const deleted = await permanentlyDelete(type as TrashType, id);
    return deleted ? Response.json({ deleted }) : Response.json({ error: "Trash item not found." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Permanent deletion failed." }, { status: 500 }); }
}
