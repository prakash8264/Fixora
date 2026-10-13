import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookings, bookingEvents, notifications, paymentOrders, payments, users } from "@/db/schema";
import { ApiError } from "./http";
import { matchesCapturedPayment, verifyHmac } from "../payment-verification";
import { isPayable } from "../domain";

const gatewayPaymentSchema = z.object({ id: z.string().regex(/^pay_/), order_id: z.string(), amount: z.number().int(), currency: z.string(), status: z.string(), captured: z.boolean().optional() });
type GatewayPayment = z.infer<typeof gatewayPaymentSchema>;
type User = typeof users.$inferSelect;

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId?.startsWith("rzp_test_") || !secret) throw new ApiError(503,"Razorpay Test Mode is not configured. Live payment keys are not accepted.");
  return { keyId, secret };
}

async function gateway(path: string, method = "GET", body?: object) {
  const { keyId,secret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1/${path}`,{
    method, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new ApiError(502,"The payment gateway could not complete this request. Please try again.");
  return response.json();
}

export async function createPaymentOrder(user: User, bookingId: string) {
  if (user.role !== "customer") throw new ApiError(403,"Only customers can pay for their own bookings.");
  z.uuid().parse(bookingId);
  return getDb().transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id,user.id)).for("share");
    if (!account || account.suspended || account.role !== "customer") throw new ApiError(403,"This customer account is unavailable.");
    const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id,bookingId),eq(bookings.customerId,user.id))).for("update");
    if (!booking) throw new ApiError(404,"Booking not found.");
    if (!isPayable(booking.status)) throw new ApiError(409,"Pay once after work completion or after declining the inspection quotation.");
    const [paid] = await tx.select().from(payments).where(and(eq(payments.bookingId,bookingId),eq(payments.status,"captured"))).limit(1);
    if (paid) throw new ApiError(409,"This booking has already been paid.");
    const { keyId } = credentials();
    const [existing] = await tx.select().from(paymentOrders).where(and(eq(paymentOrders.bookingId,bookingId),eq(paymentOrders.status,"created"))).limit(1);
    if (existing) {
      if (existing.amount !== booking.total) throw new ApiError(409,"The stored payment order does not match the final bill.");
      return { keyId, orderId: existing.razorpayOrderId, amount: existing.amount, currency: existing.currency };
    }
    if (booking.total <= 0) throw new ApiError(409,"This booking has no payable balance.");
    // One stable receipt per booking. A DB lock prevents concurrent local orders.
    // ponytail: a gateway success followed by DB failure needs reconciliation by receipt.
    const remote = z.object({ id: z.string().regex(/^order_/), amount: z.number().int(), currency: z.literal("INR") }).parse(await gateway("orders","POST",{ amount: booking.total, currency: "INR", receipt: booking.id, notes: { booking_id: booking.id } }));
    if (remote.amount !== booking.total) throw new ApiError(502,"Gateway order amount did not match the booking.");
    await tx.insert(paymentOrders).values({ bookingId, razorpayOrderId: remote.id, amount: booking.total });
    return { keyId, orderId: remote.id, amount: remote.amount, currency: remote.currency };
  });
}

export async function recordCapturedPayment(payment: GatewayPayment, actorId?: string) {
  return getDb().transaction(async tx => {
    const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.razorpayOrderId,payment.order_id)).limit(1);
    if (!order) throw new ApiError(404,"Payment order not found.");
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id,order.bookingId)).for("update");
    if (!matchesCapturedPayment(payment,order) || order.amount !== booking.total || !isPayable(booking.status)) throw new ApiError(409,"Payment details do not match the closed booking.");
    const [existing] = await tx.select().from(payments).where(and(eq(payments.bookingId,booking.id),eq(payments.status,"captured"))).limit(1);
    if (existing) {
      if (existing.razorpayPaymentId !== payment.id) throw new ApiError(409,"Another payment already settled this booking. Contact support.");
      return { captured: true };
    }
    await tx.insert(payments).values({ orderId: order.id, bookingId: booking.id, razorpayPaymentId: payment.id, amount: payment.amount, status: "captured", capturedAt: new Date() });
    await tx.update(paymentOrders).set({ status: "paid" }).where(eq(paymentOrders.id,order.id));
    await tx.insert(bookingEvents).values({ bookingId: booking.id, actorId: actorId ?? booking.customerId, action: "payment_captured", reason: actorId ? "Server verified checkout or reconciliation" : "Verified Razorpay webhook" });
    await tx.insert(notifications).values([booking.customerId,...(booking.providerId ? [booking.providerId] : [])].map(recipientId => ({ recipientId, bookingId: booking.id, type: "payment_captured", title: "Payment confirmed", description: booking.reference })));
    return { captured: true };
  });
}

export async function verifyCheckout(user: User, input: unknown) {
  const values = z.object({ bookingId: z.uuid(), razorpay_order_id: z.string().regex(/^order_/), razorpay_payment_id: z.string().regex(/^pay_/), razorpay_signature: z.string() }).parse(input);
  const [order] = await getDb().select({ order: paymentOrders, customerId: bookings.customerId }).from(paymentOrders).innerJoin(bookings,eq(bookings.id,paymentOrders.bookingId)).where(and(eq(paymentOrders.bookingId,values.bookingId),eq(paymentOrders.razorpayOrderId,values.razorpay_order_id))).limit(1);
  if (!order || user.role !== "customer" || order.customerId !== user.id) throw new ApiError(404,"Payment order not found.");
  const { secret } = credentials();
  if (!verifyHmac(`${order.order.razorpayOrderId}|${values.razorpay_payment_id}`,values.razorpay_signature,secret)) throw new ApiError(400,"Payment signature verification failed.");
  const payment = gatewayPaymentSchema.parse(await gateway(`payments/${encodeURIComponent(values.razorpay_payment_id)}`));
  if (payment.id !== values.razorpay_payment_id || payment.order_id !== order.order.razorpayOrderId || payment.amount !== order.order.amount || payment.currency !== order.order.currency) throw new ApiError(409,"Gateway payment details do not match your order.");
  if (payment.status !== "captured" || !payment.captured) return { captured: false, pending: true };
  return recordCapturedPayment(payment,user.id);
}

export async function reconcileBooking(user: User, bookingId: string) {
  z.uuid().parse(bookingId);
  const [booking] = await getDb().select().from(bookings).where(and(eq(bookings.id,bookingId),eq(bookings.customerId,user.id))).limit(1);
  if (!booking || user.role !== "customer") throw new ApiError(404,"Booking not found.");
  const orders = await getDb().select().from(paymentOrders).where(and(eq(paymentOrders.bookingId,bookingId),inArray(paymentOrders.status,["created","paid"])));
  for (const order of orders) {
    const remote = z.object({ items: z.array(gatewayPaymentSchema) }).parse(await gateway(`orders/${encodeURIComponent(order.razorpayOrderId)}/payments`));
    const captured = remote.items.find(payment => matchesCapturedPayment(payment,order));
    if (captured) return recordCapturedPayment(captured,user.id);
  }
  return { captured: false, pending: true };
}

export { gatewayPaymentSchema };
