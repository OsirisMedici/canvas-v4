import { deleteThinkingColumn, updateThinkingColumn } from "@/lib/thinking-board";

export async function PATCH(request: Request, context: RouteContext<"/api/thinking-columns/[id]">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { name?: string };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "Give the column a name." }, { status: 400 });
    const column = await updateThinkingColumn(id, name.slice(0, 80));
    if (!column) return Response.json({ error: "Column not found." }, { status: 404 });
    return Response.json({ column });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not rename the column." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/thinking-columns/[id]">) {
  try {
    const { id } = await context.params;
    const column = await deleteThinkingColumn(id);
    if (!column) return Response.json({ error: "Column not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the column." }, { status: 500 });
  }
}
