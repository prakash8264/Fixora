import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoState, demoCustomerId, demoProviderId } from "../src/lib/demo/seed";
import { applyCommand, eligibleProviders } from "../src/lib/demo/workflow";
import { canAdvance, futureSlot, localDate } from "../src/lib/domain";
import type { Actor } from "../src/lib/types";

const customer: Actor = { id: demoCustomerId, role: "customer" };
const provider: Actor = { id: demoProviderId, role: "provider" };
const admin: Actor = { id: "admin", role: "admin" };

test("matching respects service, area, approval, availability, and booked slots", () => {
  const state = createDemoState();
  const booking = state.bookings[0];
  assert(!eligibleProviders(state,booking).some(p => p.id === demoProviderId));
  assert.deepEqual(eligibleProviders(state,{ ...booking, address: { ...booking.address, postalCode: "999999" } }),[]);
  state.providers.find(p => p.id === demoProviderId)!.status = "pending";
  assert(!eligibleProviders(state,{ ...booking, date: localDate(5) }).some(p => p.id === demoProviderId));
});

test("first acceptance wins and closes other invitations", () => {
  const state = applyCommand(createDemoState(),provider,{ type: "accept", bookingId: "booking-1049" });
  assert.equal(state.bookings.find(b => b.id === "booking-1049")!.providerId,demoProviderId);
  assert.equal(state.invitations.find(i => i.providerId === "provider-dev")!.status,"expired");
  assert.throws(() => applyCommand(state,{ id: "provider-dev",role: "provider" },{ type: "accept",bookingId: "booking-1049" }));
});

test("a provider cannot accept two bookings in the same slot", () => {
  let state = createDemoState();
  state = applyCommand(state,customer,{ type: "book",serviceId: "electrical",addressId: "address-home",date: localDate(2),slot: "midday",description: "Please check the bedroom fan." });
  const second = state.bookings[0];
  state = applyCommand(state,provider,{ type: "accept",bookingId: "booking-1049" });
  assert.throws(() => applyCommand(state,provider,{ type: "accept",bookingId: second.id }),/no longer available/);
});

test("decline affects only the invitation, not the booking", () => {
  const state = applyCommand(createDemoState(),provider,{ type: "decline",bookingId: "booking-1049" });
  assert.equal(state.bookings.find(b => b.id === "booking-1049")!.status,"requested");
  assert.equal(state.invitations.find(i => i.providerId === "provider-dev")!.status,"pending");
});

test("authorization rejects another customer and an unassigned provider", () => {
  assert.throws(() => applyCommand(createDemoState(),{ id: "someone-else",role: "customer" },{ type: "cancel",bookingId: "booking-1048" }),/does not belong/);
  assert.throws(() => applyCommand(createDemoState(),{ id: "provider-dev",role: "provider" },{ type: "progress",bookingId: "booking-1048",status: "on_the_way" }));
  assert.throws(() => applyCommand(createDemoState(),customer,{ type: "provider-status",providerId: demoProviderId,status: "approved" }),/permission/);
});

test("job lifecycle cannot skip states or reopen a completed job", () => {
  assert.equal(canAdvance("accepted","completed"),false);
  assert.equal(canAdvance("completed","in_progress"),false);
  assert.throws(() => applyCommand(createDemoState(),provider,{ type: "progress",bookingId: "booking-1048",status: "completed" }),/not allowed/);
});

test("estimates require approval, preserve base pricing, and block completion while pending", () => {
  let state = applyCommand(createDemoState(),provider,{ type: "progress",bookingId: "booking-1048",status: "on_the_way" });
  state = applyCommand(state,provider,{ type: "progress",bookingId: "booking-1048",status: "in_progress" });
  state = applyCommand(state,provider,{ type: "estimate",bookingId: "booking-1048",items: [{ description: "Replacement washer",quantity: 2,unitPrice: 7500 }] });
  assert.equal(state.bookings[0].total,49900);
  assert.throws(() => applyCommand(state,provider,{ type: "progress",bookingId: "booking-1048",status: "completed" }),/pending estimate/);
  const estimateId = state.estimates[0].id;
  state = applyCommand(state,customer,{ type: "decide-estimate",estimateId,approved: true });
  assert.equal(state.bookings[0].total,64900);
  assert.equal(state.bookings[0].basePrice,49900);
  assert.throws(() => applyCommand(state,customer,{ type: "decide-estimate",estimateId,approved: true }),/no longer/);
  state = applyCommand(state,provider,{ type: "progress",bookingId: "booking-1048",status: "completed" });
  state = applyCommand(state,customer,{ type: "pay",bookingId: "booking-1048" });
  assert.equal(state.payments.at(-1)!.amount,64900);
  assert.throws(() => applyCommand(state,customer,{ type: "pay",bookingId: "booking-1048" }),/already been paid/);
});

test("reviews require payment and are unique per booking", () => {
  let state = createDemoState();
  assert.throws(() => applyCommand(state,customer,{ type: "review",bookingId: "booking-1048",rating: 5,comment: "Good" }),/completion and payment/);
  state = applyCommand(state,customer,{ type: "review",bookingId: "booking-1046",rating: 5,comment: "Excellent" });
  assert.throws(() => applyCommand(state,customer,{ type: "review",bookingId: "booking-1046",rating: 5,comment: "Again" }),/already reviewed/);
});

test("catalog and address edits cannot rewrite booking snapshots", () => {
  let state = applyCommand(createDemoState(),admin,{ type: "service",serviceId: "plumbing",price: 89900,active: true });
  state = applyCommand(state,customer,{ type: "address",id: "address-home",address: { label: "Home",line: "A different test street",city: "Ahmedabad",postalCode: "380054" } });
  assert.equal(state.bookings[0].basePrice,49900);
  assert.equal(state.bookings[0].address.postalCode,"380015");
});

test("cancel releases the provider slot and writes history and notifications", () => {
  const state = applyCommand(createDemoState(),customer,{ type: "cancel",bookingId: "booking-1048" });
  assert(eligibleProviders(state,state.bookings[0]).some(p => p.id === demoProviderId));
  assert.equal(state.events.at(-1)!.title,"Booking cancelled");
  assert(state.notifications.some(n => n.recipientId === demoProviderId && n.title === "A booking was cancelled"));
});

test("dates reject impossible days and slots that have already passed", () => {
  assert.equal(futureSlot("2027-02-30","morning",0),false);
  assert.equal(futureSlot("2027-01-10","morning",new Date("2027-01-10T04:00:00Z").getTime()),false);
  assert.equal(futureSlot("2027-01-10","midday",new Date("2027-01-10T04:00:00Z").getTime()),true);
});

test("a suspended provider cannot perform job actions", () => {
  const state = createDemoState(); state.providers[0].suspended = true;
  assert.throws(() => applyCommand(state,provider,{ type: "progress",bookingId: "booking-1048",status: "on_the_way" }),/suspended/);
});
