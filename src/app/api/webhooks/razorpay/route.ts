import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { webhookEvents } from "@/db/schema";
import { gatewayPaymentSchema, recordCapturedPayment } from "@/lib/server/payments";
import { verifyHmac } from "@/lib/payment-verification";
import { ApiError, apiError } from "@/lib/server/http";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !process.env.RAZORPAY_WEBHOOK_SECRET) return Response.json({ error: "Razorpay webhook processing is not configured." },{ status: 503 });
  try {
    const body = await request.text();
    if (body.length > 65536) throw new ApiError(413,"Webhook payload too large.");
    if (!verifyHmac(body,request.headers.get("x-razorpay-signature") ?? "",process.env.RAZORPAY_WEBHOOK_SECRET)) throw new ApiError(400,"Invalid webhook signature.");
    const eventId = z.string().min(1).max(150).parse(request.headers.get("x-razorpay-event-id"));
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new ApiError(400,"Invalid webhook body."); }
    const event = z.object({ event: z.string(), payload: z.object({ payment: z.object({ entity: gatewayPaymentSchema }).optional() }) }).parse(json);
    const db = getDb();
    const [existing] = await db.select().from(webhookEvents).where(eq(webhookEvents.gatewayEventId,eventId)).limit(1);
    if (existing?.processedAt) return Response.json({ received: true });
    await db.insert(webhookEvents).values({ gatewayEventId: eventId, type: event.event }).onConflictDoNothing({ target: webhookEvents.gatewayEventId });
    if (event.event === "payment.captured") {
      if (!event.payload.payment) throw new ApiError(400,"Payment details are required.");
      // A captured row is itself idempotent; retries after a crash are safe.
      await recordCapturedPayment(event.payload.payment.entity);
    }
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.gatewayEventId,eventId));
    return Response.json({ received: true });
  } catch (error) { return apiError(error); }
}
