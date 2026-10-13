import { isPayable, isTerminal } from "../domain";
import { paginate, type PageInfo, type PageList, type WorkspaceOptions } from "../pagination";
import { providerIsBusy, requestAvailability, serializeSchedule } from "../scheduling";
import type { Actor, DemoState, WorkspaceData } from "../types";
import { openDemoRequests } from "./workflow";

export function getDemoWorkspace(state: DemoState, actor: Actor, options: WorkspaceOptions): WorkspaceData {
  const data = { ...state, pages: {} as Partial<Record<PageList,PageInfo>> };
  const bookings = state.bookings.filter(b => actor.role === "admin" || (actor.role === "provider" ? b.providerId === actor.id : b.customerId === actor.id)).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const ids = new Set(bookings.map(b => b.id));
  const notifications = state.notifications.filter(n => n.recipientId === actor.id).map(n => ({ ...n, bookingAccessible: n.bookingId ? ids.has(n.bookingId) : undefined })).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const payments = state.payments.filter(p => ids.has(p.bookingId)).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const reviews = state.reviews.filter(r => ids.has(r.bookingId)).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const unpaid = bookings.filter(b => isPayable(b.status) && b.payment === "unpaid");
  const pending = bookings.filter(b => b.status === "completed" && b.payment === "captured" && !state.reviews.some(r => r.bookingId === b.id));
  const requests = actor.role === "provider" ? openDemoRequests(state,actor.id).sort((a,b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) : [];
  const page = <T extends { id: string }>(key: PageList, items: T[], pending = false) => {
    const result = paginate(items,pending ? options.pendingPage : options.page,options.pageSize);
    data.pages[key] = { ...result.pagination, ids: result.items.map(i => i.id) };
    return result.items;
  };
  data.stats = { bookings: bookings.length, active: bookings.filter(b => !isTerminal(b.status)).length, upcoming: bookings.filter(b => !isTerminal(b.status) && b.status !== "requested").length, completed: bookings.filter(b => b.status === "completed").length, collected: payments.reduce((s,p) => s + p.amount,0), payments: payments.length, unpaid: unpaid.length, reviews: reviews.length, unread: notifications.filter(n => !n.read).length, requests: requests.length, pendingProviders: state.providers.filter(p => p.status === "pending").length, approvedProviders: state.providers.filter(p => p.status === "approved").length };
  data.stats.busy = actor.role === "provider" && providerIsBusy(bookings);
  if (actor.role === "provider") data.reservations = bookings.filter(b => !isTerminal(b.status));
  if (options.bookingId) {
    data.bookings = bookings.filter(b => b.id === options.bookingId);
    if (!data.bookings.length) throw new Error("Booking not found or no longer assigned to you.");
    return data;
  }
  if (options.section === "bookings") data.bookings = page("bookings",bookings.filter(b => (options.status === "all" || b.status === options.status) && `${b.reference} ${state.services.find(s => s.id === b.serviceId)?.name} ${b.customerName}`.toLowerCase().includes(options.q.toLowerCase())).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)));
  if (options.section === "notifications") data.notifications = page("notifications",notifications);
  if (options.section === "requests") data.requests = page("requests",requests).map(b => ({ ...serializeSchedule(b), id: b.id, reference: b.reference, serviceId: b.serviceId, city: b.address.city, postalCode: b.address.postalCode, basePrice: b.basePrice, paymentRule: b.paymentRule, description: "Private issue details are available after assignment.", availability: requestAvailability(b,bookings) }));
  if (options.section === "providers") data.providers = page("providers",[...state.providers].sort((a,b) => Number(b.status === "pending") - Number(a.status === "pending") || a.id.localeCompare(b.id)));
  if (options.section === "payments") { data.payments = page("payments",payments); page("unpaid",unpaid,true); }
  if (options.section === "reviews") { data.reviews = page("reviews",reviews); if (actor.role === "customer") page("pendingReviews",pending,true); }
  return data;
}
