import { requireUser } from "@/lib/server/auth";
import { executeAction } from "@/lib/server/actions";
import { apiError, checkOrigin, parseBody } from "@/lib/server/http";

export async function POST(request: Request) {
  try { checkOrigin(request); const user = await requireUser(); const result = await executeAction(user,await parseBody(request)); return Response.json({ ok: true, result }); }
  catch (error) { return apiError(error); }
}
