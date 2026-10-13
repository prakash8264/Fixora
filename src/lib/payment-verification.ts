import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHmac(payload: string, signature: string, secret: string) {
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256",secret).update(payload).digest();
  const actual = Buffer.from(signature,"hex");
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}

export function matchesCapturedPayment(payment: { order_id: string; amount: number; currency: string; status: string; captured?: boolean }, order: { razorpayOrderId: string; amount: number; currency: string }) {
  return payment.order_id === order.razorpayOrderId && payment.amount === order.amount && payment.currency === order.currency && payment.status === "captured" && payment.captured === true;
}
