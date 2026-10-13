import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { createPaymentOrder } from "@/lib/server/payments";
import { apiError, checkOrigin, parseBody } from "@/lib/server/http";

export async function POST(request: Request) {
  try { checkOrigin(request); const user = await requireUser("customer"); const { bookingId } = z.object({ bookingId: z.uuid() }).parse(await parseBody(request)); return Response.json(await createPaymentOrder(user,bookingId)); }
  catch (error) { return apiError(error); }
}
