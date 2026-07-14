import { trashFolder, updateFolder } from "@/lib/folders";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { name?: string; parentId?: string | null; restore?: boolean };
    const name = body.name === undefined ? undefined : body.name.trim().slice(0, 120);
    if (body.name !== undefined && !name) return Response.json({ error: "Give the folder a name." }, { status: 400 });
    const folder = await updateFolder(id, { name, parentId: body.parentId, restore: body.restore });
    if (!folder) return Response.json({ error: "Folder not found." }, { status: 404 });
    return Response.json({ folder });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update the folder." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await trashFolder(id);
    if (!result) return Response.json({ error: "Folder not found." }, { status: 404 });
    return Response.json({ trashed: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not move the folder to Trash." }, { status: 400 });
  }
}
