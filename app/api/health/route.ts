import { AGENT_VERSION, getSafeBuildVersion, TERRAFIX_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "TerraFix",
    version: TERRAFIX_VERSION,
    agentVersion: AGENT_VERSION,
    build: getSafeBuildVersion(),
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
