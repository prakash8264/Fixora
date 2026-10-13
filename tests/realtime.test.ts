import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { realtimeErrorMessage, watchWorkspace } from "../src/lib/realtime";

test("subscription diagnostics keep the failure reason but redact tokens and API keys",() => {
  const message = realtimeErrorMessage(new Error("InvalidJWT: eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signature sb_publishable_fixture sk_test_fixture"));
  assert.ok(message.includes("InvalidJWT"));
  assert.ok(!message.includes("eyJ"));
  assert.ok(!message.includes("sb_publishable_"));
  assert.ok(!message.includes("sk_test_"));
  assert.ok(realtimeErrorMessage().includes("timed out"));
});

test("workspace subscriptions wait for Postgres readiness and invalidate only matching account data",() => {
  for (const role of ["customer","provider","admin"] as const) {
    const handlers: { type: string; filter: Record<string,unknown>; callback: (value?: unknown) => void }[] = [];
    let channelOptions: unknown;
    let refreshed = 0;
    let reported = "";
    const channel = {
      on(type: string, filter: Record<string,unknown>, callback: (value?: unknown) => void) { handlers.push({ type, filter, callback }); return this; },
      subscribe(callback: (state: string) => void) { callback("SUBSCRIBED"); return this; },
    };
    const client = { channel(name: string, options: unknown) { assert.equal(name,"fixora:fixture"); channelOptions = options; return channel; } };
    watchWorkspace(client as unknown as SupabaseClient,{ id: "fixture", role },() => { refreshed++; },state => { reported = state; });
    assert.deepEqual(channelOptions,{ config: { postgres_changes_options: { wait: true } } });
    assert.equal(reported,"SUBSCRIBED");
    const booking = handlers.find(h => h.filter.table === "bookings")!;
    assert.equal(booking.filter.filter,role === "admin" ? undefined : `${role === "customer" ? "customer_id" : "provider_id"}=eq.fixture`);
    assert.equal(handlers.find(h => h.filter.table === "notifications")!.filter.filter,"recipient_id=eq.fixture");
    assert.equal(handlers.some(h => h.filter.table === "booking_requests"),role === "provider");
    booking.callback();
    assert.equal(refreshed,1);
    handlers.find(h => h.type === "system")!.callback({ status: "error", message: "Replication failed" });
    assert.equal(reported,"CHANNEL_ERROR");
  }
});
