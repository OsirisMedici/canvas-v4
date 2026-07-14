import { syncCodexWorkspace } from "@/lib/codex-workspace";

export async function POST() {
  try {
    return Response.json(await syncCodexWorkspace());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not prepare the Codex workspace." }, { status: 500 });
  }
}
