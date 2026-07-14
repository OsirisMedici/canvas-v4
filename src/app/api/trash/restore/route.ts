import { restoreTrash, type TrashType } from "@/lib/trash";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { type?: TrashType; id?: string };
    if (!body.type || !body.id || !["folder", "board", "item"].includes(body.type)) return Response.json({ error: "Choose something to restore." }, { status: 400 });
    const restored = await restoreTrash(body.type, body.id);
    return restored ? Response.json({ restored }) : Response.json({ error: "Trash item not found." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Restore failed." }, { status: 500 }); }
}
