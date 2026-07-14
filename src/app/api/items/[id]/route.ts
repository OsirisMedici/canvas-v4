import { getItem, trashItem } from "@/lib/items";

export async function GET(_request: Request, context: RouteContext<"/api/items/[id]">) {
  const { id } = await context.params;
  const item = await getItem(id);
  return item ? Response.json({ item }) : Response.json({ error: "Item not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/items/[id]">) {
  try {
    const { id } = await context.params;
    const item = await trashItem(id);
    if (!item) return Response.json({ error: "Item not found." }, { status: 404 });
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not move this item to Trash." }, { status: 500 });
  }
}
