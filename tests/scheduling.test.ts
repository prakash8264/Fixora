import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingSchema, localDate } from "../src/lib/domain";
import { arrivalTimes, normalizeSchedule, providerIsBusy, requestAvailability, scheduleLabel, serializeSchedule, startTime } from "../src/lib/scheduling";
import { createDemoState, demoCustomerId, demoProviderId } from "../src/lib/demo/seed";
import { applyCommand, openDemoRequests } from "../src/lib/demo/workflow";
import { VisitTiming } from "../src/components/visit-timing";
import { ServiceRequestCard } from "../src/components/service-request-card";

const customer = { id: demoCustomerId, role: "customer" as const };
const provider = { id: demoProviderId, role: "provider" as const };
const now = new Date("2027-01-10T03:00:00Z").getTime();
const scheduled = (time: string) => normalizeSchedule({ scheduleMode: "scheduled", date: "2027-01-10", preferredTime: time },now);

test("scheduled arrivals use 30-minute increments and Asia/Kolkata; ASAP needs no fabricated slot",() => {
  const schedule = scheduled("10:30");
  assert.equal(startTime(schedule),new Date("2027-01-10T05:00:00Z").getTime());
  assert.ok(scheduleLabel(schedule).includes("10:30"));
  assert.equal(arrivalTimes.length,48);
  assert.throws(() => scheduled("10:15"));
  assert.throws(() => normalizeSchedule({ scheduleMode: "scheduled", date: "2027-02-30", preferredTime: "10:30" },0));
  assert.throws(() => normalizeSchedule({ scheduleMode: "scheduled", date: "2027-01-10" },now));
  const asap = normalizeSchedule({ scheduleMode: "asap" },now);
  assert.equal(asap.arrivalAt,null);
  assert.equal(asap.preferredTime,null);
  assert.equal(bookingSchema.parse({ scheduleMode: "asap", serviceId: "painting", addressId: "home", description: "Please inspect these walls" }).scheduleMode,"asap");
});

test("visit reservations include a travel buffer, allow touching boundaries, and honor longer estimates",() => {
  const job = { ...scheduled("10:00"), status: "accepted" as const };
  assert.equal(requestAvailability(scheduled("11:00"),[job],now),"conflict");
  assert.equal(requestAvailability(scheduled("11:30"),[job],now),"available");
  assert.equal(requestAvailability(scheduled("09:00"),[job],now),"conflict");
  assert.equal(requestAvailability(scheduled("11:30"),[{ ...job, visitMinutes: 240, reservedUntil: new Date(startTime(job) + 270 * 60000) }],now),"conflict");
});

test("closed visits free capacity even when unpaid; active overruns stay busy",() => {
  for (const status of ["completed","inspection_completed","cancelled"] as const) {
    const job = { ...scheduled("10:00"), status };
    assert.equal(requestAvailability(scheduled("10:00"),[job],now),"available");
    assert.equal(providerIsBusy([job]),false);
  }
  const busy = { ...scheduled("10:00"), status: "in_progress" as const };
  const later = new Date("2027-01-10T08:00:00Z").getTime();
  assert.equal(requestAvailability({ date: localDate(), slot: "morning", scheduleMode: "asap" },[busy],later),"busy");
  assert.equal(requestAvailability(scheduled("14:00"),[busy],later),"conflict");
  const future = normalizeSchedule({ scheduleMode: "scheduled", date: "2027-01-11", preferredTime: "10:00" },now);
  assert.equal(requestAvailability(future,[busy],later),"available");
  assert.equal(requestAvailability(scheduled("10:00"),[],later),"expired");
});

test("demo hybrid flow shows conflicts, stores ETA, blocks a second immediate visit, and preserves future appointments",() => {
  let state = createDemoState();
  state = applyCommand(state,customer,{ type: "book", scheduleMode: "asap", serviceId: "electrical", addressId: "address-home", description: "Please inspect the kitchen switch" });
  const first = state.bookings[0].id;
  state = applyCommand(state,provider,{ type: "accept", bookingId: first, arrivalMinutes: 15, visitMinutes: 120 });
  const accepted = state.bookings.find(b => b.id === first)!;
  assert.equal(new Date(accepted.reservedUntil!).getTime() - startTime(accepted),150 * 60000);
  assert.ok(scheduleLabel(accepted).includes("estimated arrival"));
  state = applyCommand(state,customer,{ type: "book", scheduleMode: "asap", serviceId: "electrical", addressId: "address-home", description: "Please inspect the second switch" });
  const second = state.bookings[0].id;
  assert.ok(openDemoRequests(state,provider.id).some(b => b.id === second));
  assert.throws(() => applyCommand(state,provider,{ type: "accept", bookingId: second }),/Busy/);
  state = applyCommand(state,customer,{ type: "book", scheduleMode: "scheduled", date: localDate(15), preferredTime: "10:30", serviceId: "electrical", addressId: "address-home", description: "Please inspect a future switch" });
  const future = state.bookings[0].id;
  state = applyCommand(state,provider,{ type: "accept", bookingId: future });
  assert.throws(() => applyCommand(state,provider,{ type: "progress", bookingId: future, status: "on_the_way" }),/current visit/);
  state = applyCommand(state,customer,{ type: "cancel", bookingId: first });
  state = applyCommand(state,provider,{ type: "accept", bookingId: second });
  assert.equal(state.bookings.find(b => b.id === second)!.status,"accepted");
});

test("expired and conflicting demo requests stay visible and can be rescheduled to ASAP",() => {
  let state = createDemoState();
  state = applyCommand(state,customer,{ type: "book", scheduleMode: "scheduled", date: localDate(20), preferredTime: "10:00", serviceId: "painting", addressId: "address-home", description: "Please inspect the bedroom walls" });
  const booking = state.bookings[0];
  Object.assign(booking,serializeSchedule(normalizeSchedule({ scheduleMode: "scheduled", date: "2020-01-01", preferredTime: "10:00" },-Infinity)));
  assert.ok(openDemoRequests(state,"provider-meera").some(b => b.id === booking.id));
  assert.throws(() => applyCommand(state,{ id: "provider-meera", role: "provider" },{ type: "accept", bookingId: booking.id }),/passed/);
  state = applyCommand(state,customer,{ type: "reschedule", bookingId: booking.id, scheduleMode: "asap" });
  assert.equal(state.bookings[0].scheduleMode,"asap");
  assert.equal(state.bookings[0].arrivalAt,null);
});

test("hybrid UI exposes both booking choices and disabled conflict requests without private details",() => {
  const html = renderToStaticMarkup(createElement(VisitTiming,{ mode: "scheduled", date: localDate(1), time: "10:30", onMode: () => {}, onDate: () => {}, onTime: () => {} }));
  assert.ok(html.includes("As soon as possible"));
  assert.ok(html.includes("Schedule a visit"));
  assert.ok(html.includes("Preferred arrival"));
  assert.ok(!html.includes("Time slot"));
  const state = createDemoState();
  const schedule = serializeSchedule(normalizeSchedule({ scheduleMode: "scheduled", date: localDate(20), preferredTime: "10:30" }));
  const card = renderToStaticMarkup(createElement(QueryClientProvider,{ client: new QueryClient() },createElement(ServiceRequestCard,{ data: state, request: { ...schedule, id: "fixture", reference: "fixture", serviceId: "painting", city: "Ahmedabad", postalCode: "380015", description: "Private issue details are available after assignment.", basePrice: 10000, availability: "conflict" } })));
  assert.ok(card.includes("Conflicts with another appointment"));
  assert.match(card,/<button[^>]*disabled[^>]*>Accept request/);
});
