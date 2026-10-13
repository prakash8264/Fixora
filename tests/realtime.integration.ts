import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { config } from "dotenv";
import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { getDb } from "../src/db";
import * as t from "../src/db/schema";
import { executeAction } from "../src/lib/server/actions";
import { getWorkspace } from "../src/lib/server/workspace";
import { localDate } from "../src/lib/domain";
import { normalizeSchedule } from "../src/lib/scheduling";
import { watchWorkspace } from "../src/lib/realtime";
import { createBooking, updateBooking } from "../src/lib/server/bookings";

config({ path: [".env.local", ".env"], quiet: true });

test("Clerk-authenticated Realtime delivers quotations, hybrid requests, and capacity changes with account isolation",{
  skip: !process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  timeout: 120000,
},async () => {
  assert.ok(process.env.CLERK_SECRET_KEY!.startsWith("sk_test_"),"Run only against a Clerk development instance and a development database.");
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const db = getDb();
  const raw = postgres(process.env.DATABASE_URL!,{ prepare: false, max: 1, onnotice: () => {} });
  const tag = randomUUID();
  const ids = Array.from({ length: 3 },() => randomUUID());
  const categoryId = randomUUID();
  const serviceId = randomUUID();
  const bookingId = randomUUID();
  const addressId = randomUUID();
  const clerkIds: string[] = [];
  const clients: SupabaseClient[] = [];
  try {
    for (const [index,role] of ["customer","provider","customer"].entries()) {
      const identity = await clerk.users.createUser({ emailAddress: [`fixora-${tag}-${index}+clerk_test@example.com`], firstName: "Realtime fixture", skipPasswordRequirement: true });
      clerkIds.push(identity.id);
      const session = await clerk.sessions.createSession({ userId: identity.id });
      const token = (await clerk.sessions.getToken(session.id)).jwt;
      const claims = JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());
      assert.equal(claims.role,"authenticated","Enable the Clerk Supabase integration's authenticated role claim, then issue a new session token.");
      await db.insert(t.users).values({ id: ids[index], clerkUserId: identity.id, name: `Realtime fixture ${tag}`, email: identity.emailAddresses[0].emailAddress, role: role as "customer" | "provider" });
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{ accessToken: async () => (await clerk.sessions.getToken(session.id)).jwt });
      clients.push(client);
      await client.realtime.setAuth(token);
      const { data, error } = await client.from("users").select("id").eq("id",ids[index]);
      assert.equal(error,null,"Supabase must accept the real Clerk session token.");
      assert.equal(data?.length,1,"The token must resolve to this fixture's RLS-protected account.");
    }
    await db.insert(t.serviceCategories).values({ id: categoryId, name: `Realtime fixture ${tag}`, slug: `realtime-${tag}` });
    await db.insert(t.services).values({ id: serviceId, categoryId, name: "Realtime fixture", slug: `realtime-${tag}`, description: "Temporary quotation delivery test", basePrice: 10000 });
    await db.insert(t.providerProfiles).values({ userId: ids[1], bio: "Temporary realtime fixture", approval: "approved", clockedIn: true });
    await db.insert(t.providerServices).values({ providerId: ids[1], serviceId });
    await db.insert(t.providerServiceAreas).values({ providerId: ids[1], postalCode: "999999" });
    await db.insert(t.addresses).values({ id: addressId, customerId: ids[0], label: "Fixture", line: "Private test address", city: "Fixture", postalCode: "999999" });
    await db.insert(t.bookings).values({ ...normalizeSchedule({ date: localDate(30), slot: "morning" }), id: bookingId, reference: `RT-${tag}`, requestKey: randomUUID(), customerId: ids[0], providerId: ids[1], serviceId, serviceNameSnapshot: "Realtime fixture", addressSnapshot: { id: randomUUID(), label: "Fixture", line: "Private test address", city: "Fixture", postalCode: "999999" }, description: "Temporary realtime fixture", basePrice: 10000, total: 10000, status: "inspecting", paymentRule: 2 });
    const [customer,provider] = await Promise.all(ids.slice(0,2).map(async id => (await db.select().from(t.users).where(eq(t.users.id,id)))[0]));
    await executeAction(provider,{ type: "estimate", bookingId, items: [{ description: "Approved labour", quantity: 1, unitPrice: 90000 }] });
    const quote = (await getWorkspace(customer)).estimates.find(e => e.bookingId === bookingId)!;
    let providerChanges = 0;
    let outsiderChanges = 0;
    let decisionReceived!: () => void;
    let changeReceived: (() => void) | undefined;
    const decision = new Promise<void>(resolve => { decisionReceived = resolve; });
    await Promise.all([clients[1],clients[2]].map((client,index) => new Promise<void>((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error("Realtime subscription did not connect within 30 seconds.")),30000);
      watchWorkspace(client,{ id: ids[1], role: "provider" },() => {
          if (index === 0) { providerChanges++; decisionReceived(); changeReceived?.(); }
          else outsiderChanges++;
        },(status,error) => {
          if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); reject(new Error(`Realtime ${status}: ${error?.message ?? "connection timed out"}`)); }
        });
    })));
    await executeAction(customer,{ type: "decide-estimate", estimateId: quote.id, approved: true });
    await new Promise<void>((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error("Quotation approval was not delivered to the provider within 15 seconds.")),15000);
      decision.then(() => { clearTimeout(timeout); resolve(); },reject);
    });
    const snapshot = await getWorkspace(provider);
    assert.equal(snapshot.bookings.find(b => b.id === bookingId)?.status,"ready_to_start");
    assert.equal(snapshot.bookings.find(b => b.id === bookingId)?.total,100000);
    assert.ok(providerChanges > 0);
    const observe = async (mutation: () => Promise<unknown>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const event = new Promise<void>((resolve,reject) => {
        changeReceived = resolve;
        timer = setTimeout(() => reject(new Error("The provider did not receive a hybrid-workspace update within 15 seconds.")),15000);
      });
      try { await mutation(); await event; }
      finally { clearTimeout(timer); changeReceived = undefined; }
    };
    let requestId = "";
    await observe(async () => { requestId = (await createBooking(customer,{ serviceId, addressId, scheduleMode: "asap", description: "Private temporary fixture issue" },randomUUID())).id; });
    let request = (await getWorkspace(provider)).requests!.find(r => r.id === requestId)!;
    assert.equal(request.availability,"busy");
    assert.ok(!JSON.stringify(request).includes("Private temporary fixture issue"));
    await observe(() => executeAction(provider,{ type: "clock", clockedIn: false }));
    assert.equal((await getWorkspace(provider)).requests!.length,0);
    await observe(() => executeAction(provider,{ type: "clock", clockedIn: true }));
    await updateBooking(provider,bookingId,{ action: "progress", status: "in_progress" });
    await observe(() => updateBooking(provider,bookingId,{ action: "progress", status: "completed" }));
    request = (await getWorkspace(provider)).requests!.find(r => r.id === requestId)!;
    assert.equal(request.availability,"available","Completed unpaid work must release immediate availability.");
    await observe(() => updateBooking(provider,requestId,{ action: "accept", arrivalMinutes: 15 }));
    const confirmed = (await getWorkspace(customer)).bookings.find(b => b.id === requestId)!;
    assert.equal(confirmed.scheduleMode,"asap");
    assert.ok(confirmed.arrivalAt);
    await new Promise(resolve => setTimeout(resolve,1000));
    assert.equal(outsiderChanges,0,"Another customer must not receive this booking's event.");
  } finally {
    await Promise.all(clients.map(client => client.removeAllChannels()));
    // Only this run's UUIDs are deleted; immutable-history bypass is transaction-local.
    try {
      await raw.begin(async tx => {
        await tx.unsafe("set local session_replication_role = replica");
        await tx`delete from estimate_items where estimate_id in (select id from estimates where booking_id in (select id from bookings where customer_id = ${ids[0]}::uuid))`;
        await tx`delete from estimates where booking_id in (select id from bookings where customer_id = ${ids[0]}::uuid)`;
        await tx`delete from notifications where recipient_id = any(${ids}::uuid[])`;
        await tx`delete from booking_events where booking_id in (select id from bookings where customer_id = ${ids[0]}::uuid)`;
        await tx`delete from booking_requests where provider_id = ${ids[1]}::uuid`;
        await tx`delete from bookings where customer_id = ${ids[0]}::uuid`;
        await tx`delete from provider_services where provider_id = ${ids[1]}::uuid`;
        await tx`delete from provider_service_areas where provider_id = ${ids[1]}::uuid`;
        await tx`delete from provider_profiles where user_id = ${ids[1]}::uuid`;
        await tx`delete from addresses where id = ${addressId}::uuid`;
        await tx`delete from services where id = ${serviceId}::uuid`;
        await tx`delete from service_categories where id = ${categoryId}::uuid`;
        await tx`delete from users where id = any(${ids}::uuid[])`;
      });
    } finally {
      await raw.end();
      await Promise.all(clerkIds.map(id => clerk.users.deleteUser(id)));
      await db.$client.end();
    }
  }
});
