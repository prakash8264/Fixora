import { requireUser } from "@/lib/server/auth";
import { getWorkspace } from "@/lib/server/workspace";
import { apiError } from "@/lib/server/http";
import { parseWorkspaceOptions } from "@/lib/pagination";

export async function GET(request: Request) {
  try { return Response.json(await getWorkspace(await requireUser(),parseWorkspaceOptions(new URL(request.url).searchParams)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
