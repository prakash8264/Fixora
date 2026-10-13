import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoState, demoCustomerId, demoProviderId } from "../src/lib/demo/seed";
import { applyCommand } from "../src/lib/demo/workflow";
import { canAdvance, isPayable, localDate, money } from "../src/lib/domain";
import type { Actor } from "../src/lib/types";

const customer: Actor = { id: demoCustomerId, role: "customer" };
const provider: Actor = { id: demoProviderId, role: "provider" };
const bookingId = "booking-1048";
const items = [{ description: "Repair labour", quantity: 1, unitPrice: 40000 },{ description: "New tap", quantity: 1, unitPrice: 50000 }];

test("bill formatting preserves paise instead of hiding approved fractional rupees",() => {
  assert.equal(money(10001),"₹100.01");
  assert.equal(money(10000),"₹100");
});

function atInspection() {
  const seed = createDemoState();
  const booking = seed.bookings.find(b => b.id === bookingId)!;
  booking.paymentRule = 2;
  booking.basePrice = booking.total = 10000;
  let state = applyCommand(seed,provider,{ type: "progress", bookingId, status: "on_the_way" });
  assert.throws(() => applyCommand(state,provider,{ type: "progress", bookingId, status: "in_progress" }));
  assert.throws(() => applyCommand(state,customer,{ type: "pay", bookingId }));
  state = applyCommand(state,provider,{ type: "progress", bookingId, status: "inspecting" });
  return state;
}

test("new bookings use the single-payment visit-fee rule without an upfront payment",() => {
  const state = applyCommand(createDemoState(),customer,{ type: "book", serviceId: "electrical", addressId: "address-home", date: localDate(5), slot: "morning", description: "Please inspect the broken light" });
  assert.equal(state.bookings[0].paymentRule,2);
  assert.equal(state.bookings[0].payment,"unpaid");
  assert.throws(() => applyCommand(state,customer,{ type: "pay", bookingId: state.bookings[0].id }));
  assert.equal(isPayable("cancelled"),false);
});

test("approved work collects visit fee plus approved items once, only after completion",() => {
  let state = applyCommand(atInspection(),provider,{ type: "estimate", bookingId, items });
  const quote = state.estimates.find(e => e.bookingId === bookingId)!;
  assert.equal(state.bookings.find(b => b.id === bookingId)!.status,"awaiting_approval");
  assert.throws(() => applyCommand(state,provider,{ type: "progress", bookingId, status: "in_progress" }));
  state = applyCommand(state,customer,{ type: "decide-estimate", estimateId: quote.id, approved: true });
  assert.equal(state.bookings.find(b => b.id === bookingId)!.total,100000);
  assert.throws(() => applyCommand(state,customer,{ type: "pay", bookingId }));
  state = applyCommand(state,provider,{ type: "progress", bookingId, status: "in_progress" });
  assert.throws(() => applyCommand(state,customer,{ type: "pay", bookingId }));
  state = applyCommand(state,provider,{ type: "progress", bookingId, status: "completed" });
  state = applyCommand(state,customer,{ type: "pay", bookingId });
  assert.equal(state.payments.at(-1)!.amount,100000);
  assert.throws(() => applyCommand(state,customer,{ type: "pay", bookingId }),/already been paid/);
});

test("declining the inspection quotation closes work and charges only the visit fee",() => {
  let state = applyCommand(atInspection(),provider,{ type: "estimate", bookingId, items });
  const quote = state.estimates.find(e => e.bookingId === bookingId)!;
  state = applyCommand(state,customer,{ type: "decide-estimate", estimateId: quote.id, approved: false });
  const booking = state.bookings.find(b => b.id === bookingId)!;
  assert.equal(booking.status,"inspection_completed");
  assert.equal(booking.total,10000);
  assert.equal(booking.payment,"unpaid");
  assert.throws(() => applyCommand(state,customer,{ type: "decide-estimate", estimateId: quote.id, approved: true }));
  assert.throws(() => applyCommand(state,provider,{ type: "progress", bookingId, status: "in_progress" }));
  assert.throws(() => applyCommand(state,provider,{ type: "estimate", bookingId, items }));
  assert.throws(() => applyCommand(state,customer,{ type: "cancel", bookingId }));
  state = applyCommand(state,customer,{ type: "pay", bookingId });
  assert.equal(state.payments.at(-1)!.amount,10000);
  assert.throws(() => applyCommand(state,customer,{ type: "pay", bookingId }));
  assert.throws(() => applyCommand(state,customer,{ type: "review", bookingId, rating: 5, comment: "No work done" }));
});

test("declining later extras retains the approved job; accepting adds only the new items",() => {
  let state = applyCommand(atInspection(),provider,{ type: "estimate", bookingId, items });
  state = applyCommand(state,customer,{ type: "decide-estimate", estimateId: state.estimates.at(-1)!.id, approved: true });
  state = applyCommand(state,provider,{ type: "progress", bookingId, status: "in_progress" });
  state = applyCommand(state,provider,{ type: "estimate", bookingId, items: [{ description: "Extra fitting", quantity: 1, unitPrice: 5000 }] });
  assert.throws(() => applyCommand(state,provider,{ type: "progress", bookingId, status: "completed" }));
  state = applyCommand(state,customer,{ type: "decide-estimate", estimateId: state.estimates.at(-1)!.id, approved: false });
  assert.equal(state.bookings.find(b => b.id === bookingId)!.status,"in_progress");
  assert.equal(state.bookings.find(b => b.id === bookingId)!.total,100000);
  state = applyCommand(state,provider,{ type: "estimate", bookingId, items: [{ description: "Agreed fitting", quantity: 1, unitPrice: 2000 }] });
  state = applyCommand(state,customer,{ type: "decide-estimate", estimateId: state.estimates.at(-1)!.id, approved: true });
  assert.equal(state.bookings.find(b => b.id === bookingId)!.total,102000);
});

test("a quotation with no extra charges still needs approval; legacy transitions stay compatible",() => {
  let state = applyCommand(atInspection(),provider,{ type: "estimate", bookingId, items: [] });
  assert.equal(state.estimates.at(-1)!.total,0);
  state = applyCommand(state,customer,{ type: "decide-estimate", estimateId: state.estimates.at(-1)!.id, approved: true });
  state = applyCommand(state,provider,{ type: "progress", bookingId, status: "in_progress" });
  state = applyCommand(state,provider,{ type: "progress", bookingId, status: "completed" });
  assert.equal(state.bookings.find(b => b.id === bookingId)!.total,10000);
  assert.equal(canAdvance("on_the_way","in_progress",1),true);
  assert.equal(canAdvance("on_the_way","in_progress",2),false);
});
