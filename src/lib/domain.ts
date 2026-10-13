import { z } from "zod";

export const roles = ["customer", "provider", "admin"] as const;
export type Role = (typeof roles)[number];
export const bookingStatuses = ["requested", "accepted", "on_the_way", "inspecting", "awaiting_approval", "ready_to_start", "in_progress", "completed", "inspection_completed", "cancelled"] as const;
export type BookingStatus = (typeof bookingStatuses)[number];
export const slotLabels = { morning: "9:00 AM – 11:00 AM", midday: "12:00 PM – 2:00 PM", afternoon: "3:00 PM – 5:00 PM" } as const;
export type Slot = keyof typeof slotLabels;
export const statusLabels: Record<BookingStatus, string> = { requested: "Finding a provider", accepted: "Confirmed", on_the_way: "On the way", inspecting: "Inspecting", awaiting_approval: "Awaiting quotation approval", ready_to_start: "Quotation approved", in_progress: "Work in progress", completed: "Work completed", inspection_completed: "Inspection completed — work declined", cancelled: "Cancelled" };
export function isPayable(status: BookingStatus) { return status === "completed" || status === "inspection_completed"; }
export function isTerminal(status: BookingStatus) { return isPayable(status) || status === "cancelled"; }
export function usesVisitFee(booking: { paymentRule?: number }) { return booking.paymentRule === 2; }
export const scheduleSchema = z.object({
  scheduleMode: z.enum(["legacy", "scheduled", "asap"]).default("legacy"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slot: z.enum(["morning", "midday", "afternoon"]).optional(),
  preferredTime: z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/, "Choose an arrival time in 30-minute increments.").optional(),
});
export const bookingSchema = scheduleSchema.extend({
  serviceId: z.string().min(1),
  addressId: z.string().min(1),
  description: z.string().trim().min(10, "Please describe the issue in at least 10 characters.").max(1000),
});
export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  line: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().regex(/^\d{6}$/, "Enter a 6-digit Indian postal code."),
});
export const estimateItemSchema = z.object({ description: z.string().trim().min(2).max(150), quantity: z.number().int().min(1).max(100), unitPrice: z.number().int().min(1).max(10000000) });
export function nextBookingStatus(from: BookingStatus, paymentRule = 2) {
  const next: Partial<Record<BookingStatus, BookingStatus>> = { accepted: "on_the_way", on_the_way: paymentRule === 2 ? "inspecting" : "in_progress", ready_to_start: "in_progress", in_progress: "completed" };
  return next[from];
}
export function canAdvance(from: BookingStatus, to: BookingStatus, paymentRule = 2) {
  return nextBookingStatus(from,paymentRule) === to;
}
export function money(paise: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(paise / 100); }
export function dateLabel(date: string, long = false) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: long ? "long" : "short", ...(long ? { year: "numeric" } : {}), timeZone: "Asia/Kolkata" }).format(new Date(`${date}T12:00:00+05:30`)); }
export function localDate(offset = 0) { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
export function futureSlot(date: string, slot: Slot, now = Date.now()) {
  const hours = { morning: "09", midday: "12", afternoon: "15" };
  const start = new Date(`${date}T${hours[slot]}:00:00+05:30`);
  return Number.isFinite(start.getTime()) && start.getTime() > now && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(start) === date;
}
