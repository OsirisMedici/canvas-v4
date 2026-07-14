import { query } from "@/lib/db";
import type { ChatMessage } from "@/lib/types";

export async function GET(_request: Request, context: RouteContext<"/api/chats/[id]">) {
  try {
    const { id } = await context.params;
    const result = await query<ChatMessage>(`
      SELECT id, session_id, role, content, created_at
      FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC
    `, [id]);
    return Response.json({ messages: result.rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load this chat." }, { status: 500 });
  }
}
