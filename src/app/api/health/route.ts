import { ensureSchema, getPool } from "@/lib/db";
import { getDataDir, getWorkspaceDir } from "@/lib/config";

export async function GET() {
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT now() AS now");
    return Response.json({
      ok: true,
      app: "Canvas Vault",
      managedBy: process.env.VAULT_MANAGED_BY || "manual",
      database: { status: "connected" },
      dataDir: getDataDir(),
      workspaceDir: getWorkspaceDir(),
      time: result.rows[0].now,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      app: "Canvas Vault",
      managedBy: process.env.VAULT_MANAGED_BY || "manual",
      database: { status: "unavailable" },
      dataDir: getDataDir(),
      workspaceDir: getWorkspaceDir(),
      error: error instanceof Error ? error.message : "Health check failed.",
    }, { status: 503 });
  }
}
