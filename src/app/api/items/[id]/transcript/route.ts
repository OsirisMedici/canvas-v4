import { fetchTranscript } from "@/lib/transcript";

export const maxDuration = 3600;

export async function POST(_request: Request, context: RouteContext<"/api/items/[id]/transcript">) {
  try {
    const { id } = await context.params;
    return Response.json({ item: await fetchTranscript(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Transcript fetch failed." }, { status: 500 });
  }
}
