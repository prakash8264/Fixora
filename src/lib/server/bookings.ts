import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { addresses, bookingEvents, bookingRequests, bookings, estimates, notifications, providerProfiles, serviceCategories, services, users } from "@/db/schema";
import { bookingSchema, canAdvance, isTerminal, scheduleSchema, usesVisitFee } from "../domain";
import { activeVisitStatuses, arrivalMinutesSchema, availabilityLabels, normalizeSchedule, providerIsBusy, requestAvailability, scheduleLabel, serializeSchedule, startTime, travelBufferMinutes, visitMinutesSchema } from "../scheduling";
import { ApiError } from "./http";
import { pageInfo, pageOffset, type PageInfo } from "../pagination";

type User = typeof users.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type BookingRow = typeof bookings.$inferSelect;

async function matchingProviders(tx: Tx, booking: BookingRow, providerId?: string) {
  return tx.execute<{ id: string }>(sql`
    select p.user_id as id
    from provider_profiles p join users u on u.id = p.user_id
    where p.approval = 'approved' and p.clocked_in = true and u.role = 'provider' and u.suspended = false
      ${providerId ? sql`and p.user_id = ${providerId}::uuid` : sql``}
      and exists (select 1 from provider_services ps where ps.provider_id = p.user_id and ps.service_id = ${booking.serviceId}::uuid)
      and exists (select 1 from provider_service_areas pa where pa.provider_id = p.user_id and pa.postal_code = ${booking.addressSnapshot.postalCode})
    order by p.user_id
  `);
}

async function commitments(tx: Tx, providerId: string, excludeId?: string) {
  return tx.select().from(bookings).where(and(eq(bookings.providerId,providerId),sql`${bookings.status} not in ('completed','inspection_completed','cancelled')`,excludeId ? ne(bookings.id,excludeId) : undefined));
}

// Safe discovery feed, not a private-booking SELECT. Includes requests made while offline.
export async function listOpenRequests(tx: Tx, providerId: string, paging?: { page: number; pageSize: number; result?: PageInfo }) {
  const where = and(eq(bookings.status,"requested"),sql`
    exists (select 1 from provider_profiles p join users u on u.id = p.user_id
      where p.user_id = ${providerId}::uuid and p.clocked_in = true and p.approval = 'approved' and u.role = 'provider' and u.suspended = false
      and exists (select 1 from provider_services ps where ps.provider_id = p.user_id and ps.service_id = ${bookings.serviceId})
      and exists (select 1 from provider_service_areas pa where pa.provider_id = p.user_id and pa.postal_code = ${bookings.addressSnapshot}->>'postalCode'))
    and not exists (select 1 from booking_requests r where r.booking_id = ${bookings.id} and r.provider_id = ${providerId}::uuid and r.status = 'declined')
  `);
  let info: PageInfo | undefined;
  if (paging) {
    const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(bookings).where(where);
    info = pageInfo(count.total,paging.page,paging.pageSize);
    paging.result = info;
  }
  const rows = await tx.select({ id: bookings.id, reference: bookings.reference, serviceId: bookings.serviceId, date: bookings.date, slot: bookings.slot, basePrice: bookings.basePrice, paymentRule: bookings.paymentRule,
    scheduleMode: bookings.scheduleMode, preferredTime: bookings.preferredTime, arrivalAt: bookings.arrivalAt, reservedUntil: bookings.reservedUntil, visitMinutes: bookings.visitMinutes,
    city: sql<string>`${bookings.addressSnapshot}->>'city'`, postalCode: sql<string>`${bookings.addressSnapshot}->>'postalCode'`,
    description: sql<string>`${bookings.serviceNameSnapshot} || ' requested. Private issue details are available after assignment.'`,
  }).from(bookings).where(where).orderBy(bookings.date,bookings.createdAt,bookings.id).limit(info?.pageSize ?? 200).offset(info ? pageOffset(info) : 0);
  const jobs = await commitments(tx,providerId);
  return rows.map(r => ({ ...r, ...serializeSchedule(r), availability: requestAvailability(r,jobs) }));
}

function requestSnapshot(booking: BookingRow, providerId: string) {
  return { bookingId: booking.id, providerId, serviceName: booking.serviceNameSnapshot, city: booking.addressSnapshot.city, postalCode: booking.addressSnapshot.postalCode, date: booking.date, slot: booking.slot, basePrice: booking.basePrice, safeSummary: `${booking.serviceNameSnapshot} requested. Private issue details are available after assignment.` };
}

async function inviteProviders(tx: Tx, booking: BookingRow) {
  // Serialize dispatch with clock changes, including providers currently clocked out.
  // Otherwise a booking and clock-in committed together could miss each other's notification.
  await tx.execute(sql`select p.user_id from provider_profiles p join users u on u.id = p.user_id
    where p.approval = 'approved' and u.role = 'provider' and u.suspended = false
      and exists (select 1 from provider_services ps where ps.provider_id = p.user_id and ps.service_id = ${booking.serviceId}::uuid)
      and exists (select 1 from provider_service_areas pa where pa.provider_id = p.user_id and pa.postal_code = ${booking.addressSnapshot.postalCode})
    order by p.user_id for share of p`);
  const providers = await matchingProviders(tx,booking);
  for (const provider of providers) {
    await tx.insert(bookingRequests).values(requestSnapshot(booking,provider.id)).onConflictDoNothing();
    await tx.insert(notifications).values({ recipientId: provider.id, bookingId: booking.id, type: "request_created", title: "A new request near you", description: `${booking.serviceNameSnapshot} · ${booking.addressSnapshot.city} · ${scheduleLabel(booking)}` });
  }
}

export async function createBooking(user: User, input: unknown, requestKey: string) {
  const values = bookingSchema.extend({ serviceId: z.uuid(), addressId: z.uuid() }).parse(input);
  const schedule = normalizeSchedule(values,-Infinity);
  z.uuid().parse(requestKey);
  const db = getDb();
  return db.transaction(async tx => {
    // Serializes identical create retries for this customer; no global lock.
    const [account] = await tx.select().from(users).where(eq(users.id,user.id)).for("no key update");
    if (!account || account.suspended || account.role !== "customer") throw new ApiError(403,"This customer account is unavailable.");
    const [existing] = await tx.select().from(bookings).where(and(eq(bookings.customerId,user.id),eq(bookings.requestKey,requestKey))).limit(1);
    if (existing) {
      if (existing.serviceId !== values.serviceId || existing.addressId !== values.addressId || existing.scheduleMode !== schedule.scheduleMode || (schedule.scheduleMode !== "asap" && (existing.date !== schedule.date || existing.slot !== schedule.slot || existing.preferredTime !== schedule.preferredTime)) || existing.description !== values.description) throw new ApiError(409,"This idempotency key was used for a different booking.");
      return existing;
    }
    if (requestAvailability(schedule,[]) === "expired") throw new ApiError(400,"Choose a valid future arrival date and time.");
    const [catalog] = await tx.select({ service: services }).from(services).innerJoin(serviceCategories,eq(serviceCategories.id,services.categoryId)).where(and(eq(services.id,values.serviceId),eq(services.active,true),eq(serviceCategories.active,true))).limit(1);
    const service = catalog?.service;
    const [address] = await tx.select().from(addresses).where(and(eq(addresses.id,values.addressId),eq(addresses.customerId,user.id))).limit(1);
    if (!service || !address) throw new ApiError(400,"Choose an active service and an address you own.");
    const [booking] = await tx.insert(bookings).values({ ...schedule, customerId: user.id, requestKey, serviceId: service.id, addressId: address.id, addressSnapshot: { id: address.id, label: address.label, line: address.line, city: address.city, postalCode: address.postalCode }, serviceNameSnapshot: service.name, description: values.description, basePrice: service.basePrice, total: service.basePrice, reference: `FX-${crypto.randomUUID().slice(0,8).toUpperCase()}` }).returning();
    await tx.insert(bookingEvents).values({ bookingId: booking.id, actorId: user.id, action: "requested", toStatus: "requested" });
    await tx.insert(notifications).values({ recipientId: user.id, bookingId: booking.id, type: "booking_requested", title: "Your request is in", description: "We’re finding an eligible provider." });
    await inviteProviders(tx,booking);
    return booking;
  });
}

export const bookingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), arrivalMinutes: arrivalMinutesSchema.optional(), visitMinutes: visitMinutesSchema.optional() }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("progress"), status: z.enum(["on_the_way","inspecting","in_progress","completed"]) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(300) }),
  scheduleSchema.extend({ action: z.literal("reschedule") }),
]);

export async function updateBooking(user: User, bookingId: string, input: unknown) {
  z.uuid().parse(bookingId);
  const action = bookingActionSchema.parse(input);
  return getDb().transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id,user.id)).for("share");
    if (!account || account.suspended || account.role !== user.role) throw new ApiError(403,"This account is unavailable.");
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id,bookingId)).for("update");
    if (!booking) throw new ApiError(404,"Booking not found.");
    const isCustomer = user.role === "customer" && booking.customerId === user.id;
    const isAssigned = user.role === "provider" && booking.providerId === user.id;
    const [invitation] = user.role === "provider" ? await tx.select().from(bookingRequests).where(and(eq(bookingRequests.bookingId,booking.id),eq(bookingRequests.providerId,user.id))).limit(1) : [];
    const takingRequest = user.role === "provider" && ["accept","decline"].includes(action.action);
    if (user.role !== "admin" && !isCustomer && !isAssigned && !invitation && !takingRequest) throw new ApiError(404,"Booking not found.");
    if (takingRequest && !isAssigned) {
      // Same lock as clock-out: a clocked-out provider cannot win a stale request.
      const [profile] = await tx.select().from(providerProfiles).where(eq(providerProfiles.userId,user.id)).for("update");
      if (!profile?.clockedIn || profile.approval !== "approved") throw new ApiError(409,"Clock in with an approved profile before taking requests.");
      if (booking.status !== "requested" || invitation?.status === "declined") throw new ApiError(409,"This request is no longer open.");
      if (!(await matchingProviders(tx,booking,user.id)).length) throw new ApiError(404,"No eligible request found.");
    }
    let status = booking.status;
    let providerId = booking.providerId;
    let schedule = { scheduleMode: booking.scheduleMode, date: booking.date, slot: booking.slot, preferredTime: booking.preferredTime, arrivalAt: booking.arrivalAt, reservedUntil: booking.reservedUntil, visitMinutes: booking.visitMinutes };
    const previousViewers = booking.status === "requested" && ["cancel","reschedule"].includes(action.action) ? await matchingProviders(tx,booking) : [];
    if (action.action === "decline") {
      if (user.role !== "provider" || isAssigned) throw new ApiError(403,"Only unassigned requests can be declined.");
      await tx.insert(bookingRequests).values({ ...requestSnapshot(booking,user.id), status: "declined", respondedAt: new Date() }).onConflictDoUpdate({ target: [bookingRequests.bookingId,bookingRequests.providerId], set: { status: "declined", respondedAt: new Date() } });
      await tx.insert(bookingEvents).values({ bookingId, actorId: user.id, action: "invitation_declined" });
      // Never return the private booking to an unassigned provider.
      return { declined: true };
    }
    if (action.action === "accept") {
      if (user.role !== "provider") throw new ApiError(403,"Provider access is required.");
      if (isAssigned && booking.status !== "cancelled") return booking;
      if (booking.status !== "requested") throw new ApiError(409,"This booking has already been assigned.");
      const arrivalAt = new Date(startTime(booking,Date.now(),action.arrivalMinutes ?? 30));
      const visitMinutes = action.visitMinutes ?? booking.visitMinutes;
      schedule = { ...schedule, arrivalAt, visitMinutes, reservedUntil: new Date(arrivalAt.getTime() + (visitMinutes + travelBufferMinutes) * 60000) };
      const available = requestAvailability(schedule,await commitments(tx,user.id,booking.id));
      if (available !== "available") throw new ApiError(409,availabilityLabels[available]);
      const observers = await matchingProviders(tx,booking);
      status = "accepted"; providerId = user.id;
      await tx.insert(bookingRequests).values({ ...requestSnapshot(booking,user.id), status: "accepted", respondedAt: new Date() }).onConflictDoUpdate({ target: [bookingRequests.bookingId,bookingRequests.providerId], set: { status: "accepted", respondedAt: new Date() } });
      await tx.update(bookingRequests).set({ status: "expired", respondedAt: new Date() }).where(and(eq(bookingRequests.bookingId,booking.id),ne(bookingRequests.providerId,user.id),eq(bookingRequests.status,"pending")));
      const others = observers.filter(p => p.id !== user.id);
      if (others.length) await tx.insert(notifications).values(others.map(p => ({ recipientId: p.id, bookingId, type: "request_assigned", title: "An open request was assigned", description: "Your request list has been updated." })));
    }
    if (action.action === "progress") {
      if (!isAssigned) throw new ApiError(403,"Only the assigned provider can update job progress.");
      if (!canAdvance(booking.status,action.status,booking.paymentRule)) throw new ApiError(409,"That status transition is not allowed. Work starts only after quotation approval.");
      await tx.select().from(providerProfiles).where(eq(providerProfiles.userId,user.id)).for("update");
      if (activeVisitStatuses.includes(action.status) && providerIsBusy(await commitments(tx,user.id,booking.id))) throw new ApiError(409,"Finish your current visit before travelling to or starting another job.");
      if (action.status === "completed" || action.status === "in_progress") {
        const [pending] = await tx.select({ id: estimates.id }).from(estimates).where(and(eq(estimates.bookingId,booking.id),eq(estimates.status,"pending"))).limit(1);
        if (pending) throw new ApiError(409,"Resolve the pending estimate before work starts or completes.");
        if (usesVisitFee(booking)) {
          const [approved] = await tx.select({ id: estimates.id }).from(estimates).where(and(eq(estimates.bookingId,booking.id),eq(estimates.status,"approved"))).limit(1);
          if (!approved) throw new ApiError(409,"A customer-approved quotation is required before work starts or completes.");
        }
      }
      status = action.status;
    }
    if (action.action === "cancel") {
      if (!isCustomer && user.role !== "admin") throw new ApiError(403,"You cannot cancel this booking.");
      if (booking.status === "cancelled") return booking;
      if (user.role === "customer" && !["requested","accepted"].includes(booking.status)) throw new ApiError(409,"Contact an administrator for later cancellation.");
      if (isTerminal(booking.status)) throw new ApiError(409,"Closed bookings cannot be cancelled.");
      status = "cancelled";
      await tx.update(bookingRequests).set({ status: "expired", respondedAt: new Date() }).where(and(eq(bookingRequests.bookingId,booking.id),eq(bookingRequests.status,"pending")));
      await tx.update(estimates).set({ status: "superseded" }).where(and(eq(estimates.bookingId,booking.id),eq(estimates.status,"pending")));
    }
    if (action.action === "reschedule") {
      if (!isCustomer) throw new ApiError(403,"Only the booking customer can reschedule.");
      if (booking.status !== "requested") throw new ApiError(409,"Only unassigned requests can be rescheduled.");
      schedule = normalizeSchedule(action);
      await tx.delete(bookingRequests).where(eq(bookingRequests.bookingId,booking.id));
    }
    const [updated] = await tx.update(bookings).set({ ...schedule, status, providerId, updatedAt: new Date() }).where(eq(bookings.id,booking.id)).returning();
    await tx.insert(bookingEvents).values({ bookingId, actorId: user.id, action: action.action, fromStatus: booking.status, toStatus: status, reason: action.action === "cancel" ? action.reason : null });
    await tx.insert(notifications).values({ recipientId: booking.customerId, bookingId, type: `booking_${action.action}`, title: action.action === "reschedule" ? "Booking rescheduled" : `Booking ${status.replaceAll("_"," ")}`, description: ["accept","reschedule"].includes(action.action) ? `${booking.reference} · ${scheduleLabel(updated)}` : `${booking.reference} has an update.` });
    if (providerId && action.action === "cancel") await tx.insert(notifications).values({ recipientId: providerId, bookingId, type: "booking_cancelled", title: "Booking cancelled", description: booking.reference });
    if (providerId && action.action === "progress") await tx.insert(notifications).values({ recipientId: providerId, bookingId, type: "provider_capacity", title: "Your visit status changed", description: "Your availability and matching requests have been updated." });
    if (previousViewers.length) await tx.insert(notifications).values(previousViewers.map(p => ({ recipientId: p.id, bookingId, type: "request_updated", title: "An open request changed", description: "Your request list has been updated." })));
    if (action.action === "reschedule") await inviteProviders(tx,updated);
    return updated;
  });
}

export async function reassignBooking(user: User, bookingId: string, providerId: string, reason: string) {
  if (user.role !== "admin") throw new ApiError(403,"Administrator access is required.");
  z.uuid().parse(bookingId); z.uuid().parse(providerId);
  z.string().trim().min(3).max(300).parse(reason);
  return getDb().transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id,user.id)).for("share");
    if (!account || account.suspended || account.role !== "admin") throw new ApiError(403,"Administrator access is unavailable.");
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id,bookingId)).for("update");
    if (!booking || booking.status !== "accepted") throw new ApiError(409,"Only accepted jobs can be reassigned before the provider is on the way.");
    if (booking.providerId === providerId) throw new ApiError(400,"Choose a different provider.");
    await tx.select().from(providerProfiles).where(eq(providerProfiles.userId,providerId)).for("update");
    if (startTime(booking) <= Date.now() || !(await matchingProviders(tx,booking,providerId)).length || requestAvailability(booking,await commitments(tx,providerId,bookingId)) !== "available") throw new ApiError(409,"That provider is not eligible or available for this appointment.");
    const [updated] = await tx.update(bookings).set({ providerId, updatedAt: new Date() }).where(eq(bookings.id,bookingId)).returning();
    await tx.update(bookingRequests).set({ status: "expired" }).where(eq(bookingRequests.bookingId,bookingId));
    await tx.insert(bookingRequests).values({ bookingId, providerId, status: "accepted", serviceName: booking.serviceNameSnapshot, city: booking.addressSnapshot.city, postalCode: booking.addressSnapshot.postalCode, date: booking.date, slot: booking.slot, basePrice: booking.basePrice, safeSummary: "Assigned by administrator.", respondedAt: new Date() }).onConflictDoUpdate({ target: [bookingRequests.bookingId,bookingRequests.providerId], set: { status: "accepted", respondedAt: new Date() } });
    await tx.insert(bookingEvents).values({ bookingId, actorId: user.id, action: "provider_reassigned", reason });
    const recipients = [booking.customerId,providerId,...(booking.providerId ? [booking.providerId] : [])];
    await tx.insert(notifications).values(recipients.map(recipientId => ({ recipientId, bookingId, type: "provider_reassigned", title: "Provider assignment updated", description: booking.reference })));
    return updated;
  });
}
