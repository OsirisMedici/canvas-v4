import { createFolder, listFolders } from "@/lib/folders";

export async function GET() {
  try {
    return Response.json({ folders: await listFolders() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load folders." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; parentId?: string | null };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "Give the folder a name." }, { status: 400 });
    return Response.json({ folder: await createFolder(name.slice(0, 120), body.parentId || null) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the folder." }, { status: 500 });
  }
}
