import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoState, demoCustomerId, demoProviderId } from "../src/lib/demo/seed";
import { applyCommand, openDemoRequests } from "../src/lib/demo/workflow";
import { localDate } from "../src/lib/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProviderClock } from "../src/components/provider-clock";

const provider = { id: demoProviderId, role: "provider" as const };
const customer = { id: demoCustomerId, role: "customer" as const };

test("availability UI renders a single clock control, not days or slot grids",() => {
  const state = createDemoState();
  const render = () => renderToStaticMarkup(createElement(QueryClientProvider,{ client: new QueryClient() },createElement(ProviderClock,{ data: state })));
  let html = render();
  assert.ok(html.includes("Clock out"));
  assert.ok(html.includes("Clocked in"));
  assert.ok(!html.includes("Weekly schedule"));
  assert.ok(!html.includes("Date-specific override"));
  assert.ok(!html.includes("<table"));
  state.providers.find(p => p.id === provider.id)!.clockedIn = false;
  html = render();
  assert.ok(html.includes("Clock in"));
  assert.ok(html.includes("Clocked out"));
});

test("clock-out hides new work but preserves assigned-job progress; clock-in restores requests",() => {
  let state = applyCommand(createDemoState(),provider,{ type: "clock", clockedIn: false });
  assert.equal(openDemoRequests(state,provider.id).length,0);
  assert.throws(() => applyCommand(state,provider,{ type: "accept", bookingId: "booking-1049" }));
  state = applyCommand(state,provider,{ type: "progress", bookingId: "booking-1048", status: "on_the_way" });
  assert.equal(state.bookings.find(b => b.id === "booking-1048")!.status,"on_the_way");
  state = applyCommand(state,provider,{ type: "clock", clockedIn: true });
  assert.ok(openDemoRequests(state,provider.id).some(b => b.id === "booking-1049"));
  assert.ok(state.providers.find(p => p.id === provider.id)?.clockChangedAt);
});

test("all online matching providers receive requests and clock-in reveals offline backlog",() => {
  let state = createDemoState();
  const original = state.providers.find(p => p.id === provider.id)!;
  state.providers.push({ ...original, id: "extra-a" },{ ...original, id: "extra-b" });
  state = applyCommand(state,provider,{ type: "clock", clockedIn: false });
  state = applyCommand(state,customer,{ type: "book", serviceId: "electrical", addressId: "address-home", date: localDate(20), slot: "morning", description: "Please inspect the broken switch" });
  const id = state.bookings[0].id;
  assert.ok(!state.invitations.some(i => i.bookingId === id && i.providerId === provider.id));
  state = applyCommand(state,provider,{ type: "clock", clockedIn: true });
  assert.ok(openDemoRequests(state,provider.id).some(b => b.id === id));
  assert.equal(state.invitations.filter(i => i.bookingId === id).length,4);
  state.invitations = state.invitations.filter(i => !(i.bookingId === id && i.providerId === provider.id));
  state = applyCommand(state,provider,{ type: "decline", bookingId: id });
  assert.ok(!openDemoRequests(state,provider.id).some(b => b.id === id));
});

test("customers and pending providers cannot clock in",() => {
  const state = createDemoState();
  assert.throws(() => applyCommand(state,customer,{ type: "clock", clockedIn: true }));
  assert.throws(() => applyCommand(state,{ id: "provider-nisha", role: "provider" },{ type: "clock", clockedIn: true }));
});
