import { createBoard, listBoards } from "@/lib/boards";
import type { BoardKind } from "@/lib/types";

export async function GET() {
  try {
    return Response.json({ boards: await listBoards() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load boards." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; folderId?: string | null; kind?: BoardKind };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "Give the board a name." }, { status: 400 });
    const kind = body.kind === "thinking" ? "thinking" : "source";
    return Response.json({ board: await createBoard(name.slice(0, 120), body.folderId || null, kind) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the board." }, { status: 500 });
  }
}
