import { addressSchema, bookingSchema, canAdvance, estimateItemSchema, isPayable, isTerminal, scheduleSchema, statusLabels, usesVisitFee } from "../domain";
import { activeVisitStatuses, arrivalMinutesSchema, availabilityLabels, normalizeSchedule, providerIsBusy, requestAvailability, scheduleLabel, serializeSchedule, startTime, travelBufferMinutes, visitMinutesSchema, type Schedule } from "../scheduling";
import type { Actor, Address, Booking, DemoState, EstimateItem, Provider } from "../types";
import { z } from "zod";

export type Command =
  | ({ type: "book"; serviceId: string; addressId: string; description: string; requestKey?: string } & z.input<typeof scheduleSchema>)
  | { type: "accept" | "decline" | "cancel" | "pay"; bookingId: string; reason?: string; arrivalMinutes?: number; visitMinutes?: number }
  | { type: "progress"; bookingId: string; status: Booking["status"] }
  | ({ type: "reschedule"; bookingId: string } & z.input<typeof scheduleSchema>)
  | { type: "estimate"; bookingId: string; items: EstimateItem[] }
  | { type: "decide-estimate"; estimateId: string; approved: boolean }
  | { type: "review"; bookingId: string; rating: number; comment: string }
  | { type: "address"; address: Omit<Address, "id">; id?: string }
  | { type: "delete-address"; id: string }
  | { type: "read"; notificationId?: string }
  | { type: "provider-status"; providerId: string; status: Provider["status"]; reason?: string }
  | { type: "clock"; clockedIn: boolean }
  | { type: "profile"; name: string; phone: string }
  | { type: "service"; serviceId: string; price: number; active: boolean }
  | { type: "provider-profile"; bio: string; experienceYears: number; services: string[]; areas: string[]; profile?: { name: string; phone: string } }
  | { type: "suspend"; userId: string; suspended: boolean }
  | { type: "default-address"; id: string }
  | { type: "reassign"; bookingId: string; providerId: string; reason: string };

function fail(message: string): never { throw new Error(message); }
function requireRole(actor: Actor, role: Actor["role"]) { if (actor.role !== role) fail("You do not have permission to do that."); }
function matchingProviders(state: DemoState, booking: Pick<Booking, "serviceId" | "address">) {
  return state.providers.filter(p => p.status === "approved" && p.clockedIn && !p.suspended && p.services.includes(booking.serviceId) && p.areas.includes(booking.address.postalCode));
}
export function eligibleProviders(state: DemoState, booking: Pick<Booking, "serviceId" | "address"> & Schedule) {
  return matchingProviders(state,booking).filter(p => requestAvailability(booking,state.bookings.filter(b => b.providerId === p.id)) === "available")
    .sort((a, b) => state.bookings.filter(x => x.providerId === a.id && !isTerminal(x.status)).length - state.bookings.filter(x => x.providerId === b.id && !isTerminal(x.status)).length || b.rating - a.rating || a.id.localeCompare(b.id));
}

export function openDemoRequests(state: DemoState, providerId: string) {
  return state.bookings.filter(b => b.status === "requested" && matchingProviders(state,b).some(p => p.id === providerId) && !state.invitations.some(i => i.bookingId === b.id && i.providerId === providerId && i.status === "declined"));
}

// Demo simulation only: browser storage does not provide cross-user transactions.
// The live server uses PostgreSQL row locks and appointment-overlap constraints.
export function applyCommand(input: DemoState, actor: Actor, command: Command): DemoState {
  const state = structuredClone(input);
  if (actor.role === "provider" && state.providers.find(p => p.id === actor.id)?.suspended) fail("This provider account is suspended.");
  const now = new Date().toISOString();
  const id = () => crypto.randomUUID();
  const notify = (recipientId: string, title: string, description: string, bookingId?: string) => state.notifications.unshift({ id: id(), recipientId, title, description, bookingId, read: false, createdAt: now });
  const event = (bookingId: string, title: string) => state.events.push({ id: id(), bookingId, title, actor: actor.role === "customer" ? state.profile.name : actor.role === "admin" ? "Fixora admin" : state.providers.find(p => p.id === actor.id)?.name ?? "Provider", createdAt: now });
  const getBooking = (bookingId: string) => {
    const booking = state.bookings.find(b => b.id === bookingId) ?? fail("Booking not found.");
    if (actor.role === "customer" && booking.customerId !== actor.id) fail("This booking does not belong to you.");
    if (actor.role === "provider" && booking.providerId !== actor.id && !state.invitations.some(i => i.bookingId === booking.id && i.providerId === actor.id && i.status === "pending") && !(["accept","decline"].includes(command.type) && openDemoRequests(state,actor.id).some(b => b.id === booking.id))) fail("This booking is not assigned or offered to you.");
    return booking;
  };
  const assigned = (booking: Booking) => { requireRole(actor, "provider"); if (booking.providerId !== actor.id) fail("Only the assigned provider can update this job."); };
  const invite = (booking: Booking) => {
    for (const p of matchingProviders(state, booking)) {
      state.invitations.push({ id: id(), bookingId: booking.id, providerId: p.id, status: "pending" });
      notify(p.id, "A new request near you", `${state.services.find(s => s.id === booking.serviceId)?.name} · ${booking.address.city} · ${scheduleLabel(booking)}`, booking.id);
    }
  };
  switch (command.type) {
    case "book": {
      requireRole(actor, "customer");
      const values = bookingSchema.parse(command);
      const schedule = serializeSchedule(normalizeSchedule(values));
      const service = state.services.find(s => s.id === values.serviceId && s.active) ?? fail("This service is unavailable.");
      const address = state.addresses.find(a => a.id === values.addressId) ?? fail("Choose a saved address.");
       const booking: Booking = { ...values, ...schedule, id: id(), reference: `FX-${1050 + state.bookings.length - 5}`, customerId: actor.id, customerName: state.profile.name, providerId: null, address: { ...address }, basePrice: service.price, total: service.price, paymentRule: 2, status: "requested", payment: "unpaid", createdAt: now };
      state.bookings.unshift(booking);
      event(booking.id, "Service requested");
      invite(booking);
      notify(actor.id, "Your request is in", "We’re finding an available provider for your home.", booking.id);
      break;
    }
    case "accept": {
      requireRole(actor, "provider");
      const booking = getBooking(command.bookingId);
      if (booking.status !== "requested" || booking.providerId) fail("This request has already been assigned.");
        if (!openDemoRequests(state,actor.id).some(b => b.id === booking.id)) fail("This request is no longer open.");
      const arrivalMinutes = arrivalMinutesSchema.parse(command.arrivalMinutes ?? 30);
      const visitMinutes = visitMinutesSchema.parse(command.visitMinutes ?? booking.visitMinutes ?? 120);
      const arrivalAt = new Date(startTime(booking,Date.now(),arrivalMinutes)).toISOString();
      const schedule = { ...booking, arrivalAt, visitMinutes, reservedUntil: new Date(new Date(arrivalAt).getTime() + (visitMinutes + travelBufferMinutes) * 60000).toISOString() };
      const available = requestAvailability(schedule,state.bookings.filter(b => b.providerId === actor.id && b.id !== booking.id));
      if (available !== "available") fail(`${availabilityLabels[available]} — you are no longer available for this visit.`);
      Object.assign(booking,serializeSchedule(schedule));
      booking.providerId = actor.id;
      booking.status = "accepted";
      if (!state.invitations.some(i => i.bookingId === booking.id && i.providerId === actor.id)) state.invitations.push({ id: id(), bookingId: booking.id, providerId: actor.id, status: "pending" });
      state.invitations.filter(i => i.bookingId === booking.id).forEach(i => { i.status = i.providerId === actor.id ? "accepted" : "expired"; });
      event(booking.id, "Provider accepted the booking");
      notify(booking.customerId, "Your booking is confirmed", `${state.providers.find(p => p.id === actor.id)?.name} · ${scheduleLabel(booking)}`, booking.id);
      break;
    }
    case "decline": {
      requireRole(actor, "provider");
      const booking = getBooking(command.bookingId);
       if (!openDemoRequests(state,actor.id).some(b => b.id === booking.id)) fail("No eligible open request found.");
       let invitation = state.invitations.find(i => i.bookingId === booking.id && i.providerId === actor.id);
       if (!invitation) { invitation = { id: id(), bookingId: booking.id, providerId: actor.id, status: "pending" }; state.invitations.push(invitation); }
      invitation.status = "declined";
      event(booking.id, "A provider declined their invitation");
      break;
    }
    case "progress": {
      const booking = getBooking(command.bookingId); assigned(booking);
      if (!canAdvance(booking.status, command.status, booking.paymentRule ?? 1)) fail("That booking status change is not allowed. Work needs quotation approval.");
      if (activeVisitStatuses.includes(command.status) && providerIsBusy(state.bookings.filter(b => b.providerId === actor.id && b.id !== booking.id))) fail("Finish your current visit before starting another job.");
      if (["in_progress","completed"].includes(command.status)) {
        if (state.estimates.some(e => e.bookingId === booking.id && e.status === "pending")) fail("Resolve the pending estimate before work starts or completes.");
        if (usesVisitFee(booking) && !state.estimates.some(e => e.bookingId === booking.id && e.status === "approved")) fail("A customer-approved quotation is required.");
      }
      booking.status = command.status;
      event(booking.id, statusLabels[command.status]);
      notify(booking.customerId, `Your service: ${statusLabels[command.status].toLowerCase()}`, "Open the booking to see the latest update.", booking.id);
      break;
    }
    case "cancel": {
      const booking = getBooking(command.bookingId);
      if (actor.role === "provider") fail("Providers cannot cancel an assigned job. Contact the administrator.");
      if (!["requested", "accepted"].includes(booking.status)) fail("This booking can no longer be cancelled here.");
      booking.status = "cancelled";
      state.invitations.filter(i => i.bookingId === booking.id && i.status === "pending").forEach(i => { i.status = "expired"; });
      state.estimates.filter(e => e.bookingId === booking.id && e.status === "pending").forEach(e => { e.status = "superseded"; });
      event(booking.id, "Booking cancelled");
      notify(booking.customerId, "Booking cancelled", "Your booking has been cancelled. No payment was collected.", booking.id);
      if (booking.providerId) notify(booking.providerId, "A booking was cancelled", booking.reference, booking.id);
      break;
    }
    case "reschedule": {
      requireRole(actor, "customer"); const booking = getBooking(command.bookingId);
      if (booking.status !== "requested") fail("Only unassigned requests can be rescheduled.");
      Object.assign(booking,serializeSchedule(normalizeSchedule(command)));
      state.invitations = state.invitations.filter(i => i.bookingId !== booking.id);
      invite(booking); event(booking.id, "Booking rescheduled"); break;
    }
    case "estimate": {
      const booking = getBooking(command.bookingId); assigned(booking);
      const initial = usesVisitFee(booking) && booking.status === "inspecting";
      if (!initial && booking.status !== "in_progress") fail("Send a quotation after inspection or extra-work items during approved work.");
      const items = z.array(estimateItemSchema).min(initial ? 0 : 1).max(20).parse(command.items);
      if (items.reduce((sum,i) => sum+i.quantity*i.unitPrice,0) > 10000000) fail("The additional-work estimate exceeds the supported limit.");
      if (state.estimates.some(e => e.bookingId === booking.id && e.status === "pending")) fail("An estimate is already awaiting a decision.");
      state.estimates.push({ id: id(), bookingId: booking.id, providerId: actor.id, version: state.estimates.filter(e => e.bookingId === booking.id).length + 1, status: "pending", items, total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), createdAt: now });
      if (initial) booking.status = "awaiting_approval";
      event(booking.id, initial ? "Inspection quotation submitted" : "Additional-work estimate submitted"); notify(booking.customerId, "An estimate needs your approval", "Review the work and cost before it begins.", booking.id); break;
    }
    case "decide-estimate": {
      requireRole(actor, "customer");
      const estimate = state.estimates.find(e => e.id === command.estimateId) ?? fail("Estimate not found.");
      const booking = getBooking(estimate.bookingId);
      const initial = usesVisitFee(booking) && booking.status === "awaiting_approval";
      if (estimate.status !== "pending" || (!initial && booking.status !== "in_progress")) fail("This estimate is no longer awaiting approval.");
      estimate.status = command.approved ? "approved" : "rejected";
      booking.total = booking.basePrice + state.estimates.filter(e => e.bookingId === booking.id && e.status === "approved").reduce((sum, e) => sum + e.total, 0);
      if (booking.total > 100000000) fail("Booking total exceeds the supported limit.");
      if (initial) {
        booking.status = command.approved ? "ready_to_start" : "inspection_completed";
        if (!command.approved) booking.total = booking.basePrice;
        notify(booking.customerId, command.approved ? "Quotation approved — pay after work" : "Inspection closed — pay only the visit fee", "One payment; the visit fee is included once.", booking.id);
      }
      event(booking.id, `Estimate ${estimate.status}`); notify(estimate.providerId, `Estimate ${estimate.status}`, booking.reference, booking.id); break;
    }
    case "pay": {
      requireRole(actor, "customer"); const booking = getBooking(command.bookingId);
      if (!isPayable(booking.status)) fail("Pay after work completion or after declining the inspection quotation.");
      if (booking.payment === "captured") fail("This booking has already been paid.");
      booking.payment = "captured";
      state.payments.push({ id: `DEMO-${id().slice(0, 8)}`, bookingId: booking.id, amount: booking.total, createdAt: now });
      event(booking.id, "Demo payment simulated — no money collected");
      notify(actor.id, "Demo payment recorded", "This is a simulation, not a Razorpay transaction.", booking.id);
      if (booking.providerId) notify(booking.providerId, "Demo payment recorded", booking.reference, booking.id);
      break;
    }
    case "review": {
      requireRole(actor, "customer"); const booking = getBooking(command.bookingId);
      if (booking.status !== "completed" || booking.payment !== "captured" || !booking.providerId) fail("Reviews are available after completion and payment.");
      if (state.reviews.some(r => r.bookingId === booking.id)) fail("You have already reviewed this booking.");
      z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500) }).parse(command);
      state.reviews.push({ id: id(), bookingId: booking.id, providerId: booking.providerId, rating: command.rating, comment: command.comment.trim(), createdAt: now });
      event(booking.id, "Customer review submitted"); break;
    }
    case "address": {
      requireRole(actor, "customer"); const values = addressSchema.parse(command.address);
      if (command.id) { const address = state.addresses.find(a => a.id === command.id) ?? fail("Address not found."); Object.assign(address, values); }
      else state.addresses.push({ id: id(), ...values });
      break;
    }
    case "delete-address": requireRole(actor, "customer"); state.addresses = state.addresses.filter(a => a.id !== command.id); break;
    case "read": state.notifications.filter(n => n.recipientId === actor.id && (!command.notificationId || n.id === command.notificationId)).forEach(n => { n.read = true; }); break;
    case "provider-status": {
      requireRole(actor,"admin");
      const provider = state.providers.find(p => p.id === command.providerId) ?? fail("Provider not found.");
      provider.status = command.status;
      if (command.status !== "approved") provider.clockedIn = false;
      break;
    }
    case "clock": {
      requireRole(actor, "provider");
      z.boolean().parse(command.clockedIn);
      const provider = state.providers.find(p => p.id === actor.id) ?? fail("Provider not found.");
      if (command.clockedIn && provider.status !== "approved") fail("Administrator approval is required before clocking in.");
      provider.clockedIn = command.clockedIn;
      provider.clockChangedAt = now;
      for (const booking of openDemoRequests(state,actor.id)) if (!state.invitations.some(i => i.bookingId === booking.id && i.providerId === actor.id)) state.invitations.push({ id: id(), bookingId: booking.id, providerId: actor.id, status: "pending" });
      notify(actor.id, command.clockedIn ? "Clocked in" : "Clocked out", "Accepted jobs are unchanged."); break;
    }
    case "profile": {
      requireRole(actor, "customer");
      z.object({ name: z.string().trim().min(2).max(80), phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number.") }).parse(command);
      state.profile.name = command.name.trim(); state.profile.phone = command.phone; break;
    }
    case "service": {
      requireRole(actor, "admin"); z.number().int().min(0).max(10000000).parse(command.price);
      const service = state.services.find(s => s.id === command.serviceId) ?? fail("Service not found.");
      service.price = command.price; service.active = command.active; break;
    }
    case "default-address": {
      requireRole(actor,"customer");
      const address = state.addresses.find(a => a.id === command.id) ?? fail("Address not found.");
      state.addresses = [address, ...state.addresses.filter(a => a.id !== command.id)]; break;
    }
    case "provider-profile": case "suspend": case "reassign": fail("This action is available in the live workspace only.");
  }
  return state;
}
