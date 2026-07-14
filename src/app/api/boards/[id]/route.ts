import { trashBoard, updateBoard } from "@/lib/boards";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { name?: string; folderId?: string | null; restore?: boolean };
    const name = body.name === undefined ? undefined : body.name.trim().slice(0, 120);
    if (body.name !== undefined && !name) return Response.json({ error: "Give the board a name." }, { status: 400 });
    const board = await updateBoard(id, { name, folderId: body.folderId, restore: body.restore });
    if (!board) return Response.json({ error: "Board not found." }, { status: 404 });
    return Response.json({ board });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update the board." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const board = await trashBoard(id);
    if (!board) return Response.json({ error: "Keep at least one active board in your vault." }, { status: 400 });
    return Response.json({ board });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not move the board to Trash." }, { status: 500 });
  }
}
