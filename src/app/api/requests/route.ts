import { getWorkspace } from "@/lib/server/workspace";
import { parseWorkspaceOptions } from "@/lib/pagination";
import { requireUser } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireUser("provider");
    const params = new URL(request.url).searchParams;
    params.set("section","requests"); params.delete("bookingId");
    const data = await getWorkspace(user,parseWorkspaceOptions(params));
    return Response.json({ items: data.requests, pagination: data.pages?.requests },{ headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
