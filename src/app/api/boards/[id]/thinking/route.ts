import { createThinkingColumn, getThinkingBoard } from "@/lib/thinking-board";

export async function GET(_request: Request, context: RouteContext<"/api/boards/[id]/thinking">) {
  try {
    const { id } = await context.params;
    const thinkingBoard = await getThinkingBoard(id);
    if (!thinkingBoard) return Response.json({ error: "Thinking Board not found." }, { status: 404 });
    return Response.json(thinkingBoard);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load the Thinking Board." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/boards/[id]/thinking">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { name?: string };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "Give the column a name." }, { status: 400 });
    const column = await createThinkingColumn(id, name.slice(0, 80));
    if (!column) return Response.json({ error: "Thinking Board not found." }, { status: 404 });
    return Response.json({ column }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the column." }, { status: 500 });
  }
}
