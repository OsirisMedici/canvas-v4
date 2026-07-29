import { createThinkingCard } from "@/lib/thinking-board";

export async function POST(request: Request, context: RouteContext<"/api/thinking-columns/[id]/cards">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { title?: string };
    const title = body.title?.trim().slice(0, 160) || "Untitled";
    const card = await createThinkingCard(id, title);
    if (!card) return Response.json({ error: "Column not found." }, { status: 404 });
    return Response.json({ card }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the document." }, { status: 500 });
  }
}
