import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { addressSchema, bookingSchema, estimateItemSchema, scheduleSchema, usesVisitFee } from "../domain";
import { arrivalMinutesSchema, visitMinutesSchema } from "../scheduling";
import { ApiError } from "./http";
import { createBooking, updateBooking, reassignBooking } from "./bookings";
import { reconcileBooking } from "./payments";

type User = typeof t.users.$inferSelect;
const id = z.uuid();
const profileSchema = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number.") });
const schema = z.discriminatedUnion("type",[
  bookingSchema.extend({ type: z.literal("book"), serviceId: id, addressId: id, requestKey: id }),
  z.object({ type: z.enum(["accept","decline","cancel","pay"]), bookingId: id, reason: z.string().trim().min(3).max(300).optional(), arrivalMinutes: arrivalMinutesSchema.optional(), visitMinutes: visitMinutesSchema.optional() }),
  z.object({ type: z.literal("progress"), bookingId: id, status: z.enum(["on_the_way","inspecting","in_progress","completed"]) }),
  scheduleSchema.extend({ type: z.literal("reschedule"), bookingId: id }),
  z.object({ type: z.literal("estimate"), bookingId: id, items: z.array(estimateItemSchema).max(20) }),
  z.object({ type: z.literal("decide-estimate"), estimateId: id, approved: z.boolean() }),
  z.object({ type: z.literal("review"), bookingId: id, rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500) }),
  z.object({ type: z.literal("address"), id: id.optional(), address: addressSchema }),
  z.object({ type: z.literal("delete-address"), id }),
  z.object({ type: z.literal("default-address"), id }),
  z.object({ type: z.literal("read"), notificationId: id.optional() }),
  profileSchema.extend({ type: z.literal("profile") }),
  z.object({ type: z.literal("provider-profile"), bio: z.string().trim().min(10).max(1000), experienceYears: z.number().int().min(0).max(60), services: z.array(id).min(1).max(20), areas: z.array(z.string().regex(/^\d{6}$/)).min(1).max(30), profile: profileSchema.optional() }),
  z.object({ type: z.literal("clock"), clockedIn: z.boolean() }),
  z.object({ type: z.literal("provider-status"), providerId: id, status: z.enum(["approved","rejected"]), reason: z.string().trim().min(3).max(300).optional() }),
  z.object({ type: z.literal("service"), serviceId: id, price: z.number().int().min(1).max(10000000), active: z.boolean() }),
  z.object({ type: z.literal("suspend"), userId: id, suspended: z.boolean() }),
  z.object({ type: z.literal("reassign"), bookingId: id, providerId: id, reason: z.string().trim().min(3).max(300) }),
]);

function role(user: User, value: User["role"]) { if (user.role !== value) throw new ApiError(403,"Your account cannot perform this action."); }

export async function executeAction(user: User, input: unknown) {
  const action = schema.parse(input);
  const db = getDb();
  if (action.type === "book") { role(user,"customer"); return createBooking(user,action,action.requestKey); }
  if (["accept","decline","cancel","progress","reschedule"].includes(action.type)) return updateBooking(user,"bookingId" in action ? action.bookingId : "",{ ...action, action: action.type, reason: "reason" in action ? action.reason ?? "Cancelled by account holder" : undefined });
  if (action.type === "pay") { role(user,"customer"); return reconcileBooking(user,action.bookingId); }
  if (action.type === "reassign") { role(user,"admin"); return reassignBooking(user,action.bookingId,action.providerId,action.reason); }
  return db.transaction(async tx => {
    const [account] = await tx.select().from(t.users).where(eq(t.users.id,user.id)).for("no key update");
    if (!account || account.suspended || account.role !== user.role) throw new ApiError(403,"This account is unavailable.");
    if (["address","delete-address","default-address"].includes(action.type)) {
      role(user,"customer");
      const addresses = await tx.select().from(t.addresses).where(eq(t.addresses.customerId,user.id)).orderBy(t.addresses.createdAt);
      if (action.type === "address") {
        if (action.id) {
          if (!addresses.some(a => a.id === action.id)) throw new ApiError(404,"Address not found.");
          await tx.update(t.addresses).set(action.address).where(and(eq(t.addresses.id,action.id),eq(t.addresses.customerId,user.id)));
        } else await tx.insert(t.addresses).values({ ...action.address, customerId: user.id, isDefault: !addresses.length });
      }
      if (action.type === "delete-address" || action.type === "default-address") {
        const address = addresses.find(a => a.id === action.id);
        if (!address) throw new ApiError(404,"Address not found.");
        if (action.type === "delete-address") {
          await tx.delete(t.addresses).where(and(eq(t.addresses.id,action.id),eq(t.addresses.customerId,user.id)));
          const next = addresses.find(a => a.id !== action.id);
          if (address.isDefault && next) await tx.update(t.addresses).set({ isDefault: true }).where(eq(t.addresses.id,next.id));
        } else {
          await tx.update(t.addresses).set({ isDefault: false }).where(eq(t.addresses.customerId,user.id));
          await tx.update(t.addresses).set({ isDefault: true }).where(eq(t.addresses.id,action.id));
        }
      }
      return;
    }
    if (action.type === "read") {
      await tx.update(t.notifications).set({ readAt: new Date() }).where(and(eq(t.notifications.recipientId,user.id),action.notificationId ? eq(t.notifications.id,action.notificationId) : undefined)); return;
    }
    if (action.type === "profile") {
      await tx.update(t.users).set({ name: action.name, phone: action.phone, updatedAt: new Date() }).where(eq(t.users.id,user.id)); return;
    }
    if (action.type === "provider-profile") {
      if (user.role === "admin") throw new ApiError(403,"Admin accounts cannot enroll as providers.");
      if (account.role === "customer") {
        const [booking] = await tx.select({ id: t.bookings.id }).from(t.bookings).where(eq(t.bookings.customerId,user.id)).limit(1);
        if (booking) throw new ApiError(409,"This account has customer bookings. Use a separate account to become a provider.");
      }
      const serviceIds = [...new Set(action.services)];
      const active = await tx.select({ id: t.services.id }).from(t.services).innerJoin(t.serviceCategories,eq(t.services.categoryId,t.serviceCategories.id)).where(and(inArray(t.services.id,serviceIds),eq(t.services.active,true),eq(t.serviceCategories.active,true)));
      if (active.length !== serviceIds.length) throw new ApiError(400,"Choose active services.");
      const [current] = await tx.select().from(t.providerProfiles).where(eq(t.providerProfiles.userId,user.id)).for("update");
      const offered = await tx.select().from(t.providerServices).where(eq(t.providerServices.providerId,user.id));
      const areas = await tx.select().from(t.providerServiceAreas).where(eq(t.providerServiceAreas.providerId,user.id));
      const scopeChanged = !current || current.approval !== "approved" || JSON.stringify(offered.map(s => s.serviceId).sort()) !== JSON.stringify([...serviceIds].sort()) || JSON.stringify(areas.map(a => a.postalCode).sort()) !== JSON.stringify([...new Set(action.areas)].sort());
      await tx.update(t.users).set({ role: "provider", ...action.profile, updatedAt: new Date() }).where(eq(t.users.id,user.id));
      await tx.insert(t.providerProfiles).values({ userId: user.id, bio: action.bio, experienceYears: action.experienceYears }).onConflictDoUpdate({ target: t.providerProfiles.userId, set: { bio: action.bio, experienceYears: action.experienceYears, updatedAt: new Date(), ...(scopeChanged ? { approval: "pending" as const, clockedIn: false, clockChangedAt: new Date(), rejectionReason: null, reviewedAt: null, reviewedBy: null } : {}) } });
      await tx.delete(t.providerServices).where(eq(t.providerServices.providerId,user.id));
      await tx.insert(t.providerServices).values(serviceIds.map(serviceId => ({ providerId: user.id, serviceId })));
      await tx.delete(t.providerServiceAreas).where(eq(t.providerServiceAreas.providerId,user.id));
      await tx.insert(t.providerServiceAreas).values([...new Set(action.areas)].map(postalCode => ({ providerId: user.id, postalCode })));
      await tx.insert(t.notifications).values({ recipientId: user.id, type: "provider_profile", title: scopeChanged ? "Provider application submitted" : "Provider profile updated", description: scopeChanged ? "An administrator will review your services and service areas." : "Your profile changes were saved." });
      if (scopeChanged) {
        const administrators = await tx.select({ id: t.users.id }).from(t.users).where(and(eq(t.users.role,"admin"),eq(t.users.suspended,false)));
        if (administrators.length) await tx.insert(t.notifications).values(administrators.map(a => ({ recipientId: a.id, type: "provider_application", title: "A provider application needs review", description: action.profile?.name ?? account.name })));
      }
      return;
    }
    if (action.type === "clock") {
      role(user,"provider");
      const [profile] = await tx.select().from(t.providerProfiles).where(eq(t.providerProfiles.userId,user.id)).for("update");
      if (!profile) throw new ApiError(404,"Provider profile not found.");
      if (action.clockedIn && profile.approval !== "approved") throw new ApiError(403,"Administrator approval is required before clocking in.");
      if (profile.clockedIn === action.clockedIn) return;
      await tx.update(t.providerProfiles).set({ clockedIn: action.clockedIn, clockChangedAt: new Date(), updatedAt: new Date() }).where(eq(t.providerProfiles.userId,user.id));
      await tx.insert(t.notifications).values({ recipientId: user.id, type: "provider_clock", title: action.clockedIn ? "Clocked in — open for requests" : "Clocked out — new requests paused", description: "Accepted jobs and their booked times are unchanged." });
      return;
    }
    if (action.type === "provider-status") {
      role(user,"admin");
      if (action.status === "rejected" && !action.reason) throw new ApiError(400,"Give a reason for rejecting the application.");
      const [provider] = await tx.select().from(t.providerProfiles).where(eq(t.providerProfiles.userId,action.providerId)).for("update");
      if (!provider) throw new ApiError(404,"Provider not found.");
      if (provider.approval !== "pending") throw new ApiError(409,"This application was already reviewed.");
      await tx.update(t.providerProfiles).set({ approval: action.status, rejectionReason: action.status === "rejected" ? action.reason : null, reviewedBy: user.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(t.providerProfiles.userId,action.providerId));
      await tx.insert(t.notifications).values({ recipientId: action.providerId, type: "provider_reviewed", title: `Provider application ${action.status}`, description: action.reason ?? "Clock in to see and accept matching requests." }); return;
    }
    if (action.type === "service") {
      role(user,"admin");
      const changed = await tx.update(t.services).set({ basePrice: action.price, active: action.active, updatedAt: new Date() }).where(eq(t.services.id,action.serviceId)).returning({ id: t.services.id });
      if (!changed.length) throw new ApiError(404,"Service not found."); return;
    }
    if (action.type === "suspend") {
      role(user,"admin");
      if (action.userId === user.id) throw new ApiError(400,"You cannot suspend your own administrator account.");
      const [target] = await tx.select().from(t.users).where(eq(t.users.id,action.userId)).for("no key update");
      if (!target || target.role === "admin") throw new ApiError(400,"Choose a customer or provider account.");
      // Uses the same provider lock as acceptance and clock changes.
      if (target.role === "provider") {
        await tx.select().from(t.providerProfiles).where(eq(t.providerProfiles.userId,target.id)).for("update");
        if (action.suspended) await tx.update(t.providerProfiles).set({ clockedIn: false, clockChangedAt: new Date(), updatedAt: new Date() }).where(eq(t.providerProfiles.userId,target.id));
      }
      await tx.update(t.users).set({ suspended: action.suspended, updatedAt: new Date() }).where(eq(t.users.id,target.id)); return;
    }
    if (action.type === "estimate" || action.type === "review" || action.type === "decide-estimate") {
      const [estimate] = action.type === "decide-estimate" ? await tx.select().from(t.estimates).where(eq(t.estimates.id,action.estimateId)).limit(1) : [];
      const bookingId = action.type === "decide-estimate" ? estimate?.bookingId : action.bookingId;
      if (!bookingId) throw new ApiError(404,"Booking or estimate not found.");
      const [booking] = await tx.select().from(t.bookings).where(eq(t.bookings.id,bookingId)).for("update");
      if (!booking) throw new ApiError(404,"Booking not found.");
      if (action.type === "estimate") {
        role(user,"provider");
        if (booking.providerId !== user.id) throw new ApiError(404,"Booking not found.");
        const initial = usesVisitFee(booking) && booking.status === "inspecting";
        if (!initial && booking.status !== "in_progress") throw new ApiError(409,"Send the initial quotation after inspection, or an extra-work estimate during approved work.");
        if (!initial && !action.items.length) throw new ApiError(400,"An extra-work estimate needs at least one item.");
        const existing = await tx.select().from(t.estimates).where(eq(t.estimates.bookingId,bookingId));
        if (existing.some(e => e.status === "pending")) throw new ApiError(409,"An estimate is already awaiting approval.");
        const total = action.items.reduce((sum,i) => sum+i.quantity*i.unitPrice,0);
        if (total > 10000000) throw new ApiError(400,"The additional-work estimate exceeds the supported limit.");
        const [created] = await tx.insert(t.estimates).values({ bookingId, providerId: user.id, version: Math.max(0,...existing.map(e => e.version))+1, total }).returning();
        if (action.items.length) await tx.insert(t.estimateItems).values(action.items.map(i => ({ ...i, estimateId: created.id, lineTotal: i.quantity*i.unitPrice })));
        if (initial) await tx.update(t.bookings).set({ status: "awaiting_approval", updatedAt: new Date() }).where(eq(t.bookings.id,bookingId));
        await tx.insert(t.bookingEvents).values({ bookingId, actorId: user.id, action: initial ? "quotation_submitted" : "estimate_submitted", fromStatus: booking.status, toStatus: initial ? "awaiting_approval" : booking.status });
        await tx.insert(t.notifications).values({ recipientId: booking.customerId, bookingId, type: "estimate_submitted", title: initial ? "Your quotation is ready" : "An estimate needs your approval", description: initial ? "Approve the total before work starts, or decline and pay only the visit fee." : "Review the extra work before it begins." });
      }
      if (action.type === "decide-estimate") {
        role(user,"customer");
        if (booking.customerId !== user.id) throw new ApiError(404,"Estimate not found.");
        const [current] = await tx.select().from(t.estimates).where(eq(t.estimates.id,action.estimateId)).for("update");
        const initial = usesVisitFee(booking) && booking.status === "awaiting_approval";
        if (current.status !== "pending" || (!initial && booking.status !== "in_progress")) throw new ApiError(409,"This estimate is no longer awaiting a decision.");
        const status = action.approved ? "approved" : "rejected";
        await tx.update(t.estimates).set({ status, decidedBy: user.id, decidedAt: new Date() }).where(eq(t.estimates.id,current.id));
        const total = initial ? booking.basePrice + (action.approved ? current.total : 0) : booking.total + (action.approved ? current.total : 0);
        if (total > 100000000) throw new ApiError(400,"Booking total exceeds the supported limit.");
        const nextStatus = initial ? action.approved ? "ready_to_start" : "inspection_completed" : booking.status;
        if (initial || action.approved) {
          await tx.update(t.bookings).set({ total, status: nextStatus, updatedAt: new Date() }).where(eq(t.bookings.id,bookingId));
        }
        await tx.insert(t.bookingEvents).values({ bookingId, actorId: user.id, action: initial ? `quotation_${status}` : `estimate_${status}`, fromStatus: booking.status, toStatus: nextStatus });
        await tx.insert(t.notifications).values({ recipientId: current.providerId, bookingId, type: `estimate_${status}`, title: `Estimate ${status}`, description: booking.reference });
        if (initial) await tx.insert(t.notifications).values({ recipientId: user.id, bookingId, type: `quotation_${status}`, title: action.approved ? "Quotation approved — no payment yet" : "Inspection closed — visit fee only", description: action.approved ? "Pay once after the approved work is completed." : "No work or material charges were added. Pay only the booked visit fee." });
      }
      if (action.type === "review") {
        role(user,"customer");
        if (booking.customerId !== user.id) throw new ApiError(404,"Booking not found.");
        const [paid] = await tx.select({ id: t.payments.id }).from(t.payments).where(and(eq(t.payments.bookingId,bookingId),eq(t.payments.status,"captured"))).limit(1);
        if (booking.status !== "completed" || !booking.providerId || !paid) throw new ApiError(409,"Reviews require a completed, paid booking.");
        await tx.insert(t.reviews).values({ bookingId, customerId: user.id, providerId: booking.providerId, rating: action.rating, comment: action.comment });
        await tx.insert(t.bookingEvents).values({ bookingId, actorId: user.id, action: "review_submitted" });
        await tx.insert(t.notifications).values({ recipientId: booking.providerId, bookingId, type: "review_submitted", title: "A customer shared their feedback", description: booking.reference });
      }
      return;
    }
    throw new ApiError(400,"Unsupported action.");
  });
}
