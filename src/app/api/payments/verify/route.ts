import { requireUser } from "@/lib/server/auth";
import { verifyCheckout } from "@/lib/server/payments";
import { apiError, checkOrigin, parseBody } from "@/lib/server/http";

export async function POST(request: Request) {
  try { checkOrigin(request); return Response.json(await verifyCheckout(await requireUser("customer"),await parseBody(request))); }
  catch (error) { return apiError(error); }
}
