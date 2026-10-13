import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { matchesCapturedPayment, verifyHmac } from "../src/lib/payment-verification";

test("checkout signatures require the exact stored order and payment",() => {
  const secret = "test-secret";
  const payload = "order_example|pay_example";
  const signature = createHmac("sha256",secret).update(payload).digest("hex");
  assert.equal(verifyHmac(payload,signature,secret),true);
  assert.equal(verifyHmac("order_other|pay_example",signature,secret),false);
  assert.equal(verifyHmac(payload,signature,"other-secret"),false);
  assert.equal(verifyHmac(payload,"invalid",secret),false);
  assert.equal(verifyHmac(payload,signature,""),false);
});

test("webhook signatures cover the unmodified raw payload",() => {
  const body = '{"event":"payment.captured"}';
  const signature = createHmac("sha256","webhook-secret").update(body).digest("hex");
  assert.equal(verifyHmac(body,signature,"webhook-secret"),true);
  assert.equal(verifyHmac(`${body}\n`,signature,"webhook-secret"),false);
});

test("authorized or mismatched payments never mark a booking paid",() => {
  const order = { razorpayOrderId: "order_example", amount: 149900, currency: "INR" };
  const payment = { order_id: "order_example", amount: 149900, currency: "INR", status: "captured", captured: true };
  assert.equal(matchesCapturedPayment(payment,order),true);
  for (const change of [{ status: "authorized" },{ captured: false },{ captured: undefined },{ amount: 1 },{ order_id: "order_other" },{ currency: "USD" }]) assert.equal(matchesCapturedPayment({ ...payment,...change },order),false);
});
