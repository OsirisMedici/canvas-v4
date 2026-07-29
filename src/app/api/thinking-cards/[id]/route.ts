import { deleteThinkingCard, getThinkingCard, updateThinkingCard } from "@/lib/thinking-board";

export async function GET(_request: Request, context: RouteContext<"/api/thinking-cards/[id]">) {
  try {
    const { id } = await context.params;
    const card = await getThinkingCard(id);
    if (!card) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ card });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load the document." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/thinking-cards/[id]">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { title?: string; contentText?: string; columnId?: string };
    const changes: { title?: string; contentText?: string; columnId?: string } = {};
    if (body.title !== undefined) changes.title = body.title.trim().slice(0, 160) || "Untitled";
    if (body.contentText !== undefined) changes.contentText = body.contentText.slice(0, 1_000_000);
    if (body.columnId !== undefined) changes.columnId = body.columnId;
    const card = await updateThinkingCard(id, changes);
    if (!card) return Response.json({ error: "Document or destination column not found." }, { status: 404 });
    return Response.json({ card });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save the document." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/thinking-cards/[id]">) {
  try {
    const { id } = await context.params;
    const card = await deleteThinkingCard(id);
    if (!card) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the document." }, { status: 500 });
  }
}
