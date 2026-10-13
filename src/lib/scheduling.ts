import { z } from "zod";
import { dateLabel, isTerminal, localDate, scheduleSchema, slotLabels, type BookingStatus, type Slot } from "./domain";

export type ScheduleMode = "legacy" | "scheduled" | "asap";
export type Schedule = { date: string; slot: Slot; scheduleMode?: ScheduleMode; preferredTime?: string | null; arrivalAt?: string | Date | null; reservedUntil?: string | Date | null; visitMinutes?: number };
export type Commitment = Schedule & { id?: string; status: BookingStatus };
export type RequestAvailability = "available" | "conflict" | "busy" | "expired";
export const availabilityLabels: Record<RequestAvailability, string> = { available: "Available to accept", conflict: "Conflicts with another appointment", busy: "Busy — finish your current visit first", expired: "Arrival time has passed — customer must reschedule" };
export const activeVisitStatuses: BookingStatus[] = ["on_the_way", "inspecting", "awaiting_approval", "ready_to_start", "in_progress"];
export const arrivalMinutesSchema = z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]);
export const visitMinutesSchema = z.union([z.literal(60), z.literal(120), z.literal(180), z.literal(240), z.literal(480)]);
export const arrivalTimes = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2,"0")}:${i % 2 ? "30" : "00"}`);
export const travelBufferMinutes = 30;

export function timeLabel(time: string) {
  return new Intl.DateTimeFormat("en-IN",{ timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${time}:00+05:30`));
}
export function scheduleLabel(schedule: Schedule) {
  if (schedule.scheduleMode === "asap") return schedule.arrivalAt ? `ASAP · estimated arrival ${new Date(schedule.arrivalAt).toLocaleString("en-IN",{ timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}` : "As soon as possible · arrival estimate after acceptance";
  return `${dateLabel(schedule.date)} · ${schedule.scheduleMode === "scheduled" && schedule.preferredTime ? `${timeLabel(schedule.preferredTime)} preferred arrival` : slotLabels[schedule.slot]} · IST`;
}
export function serializeSchedule(schedule: Schedule) {
  return { date: schedule.date, slot: schedule.slot, scheduleMode: schedule.scheduleMode, preferredTime: schedule.preferredTime, arrivalAt: schedule.arrivalAt ? new Date(schedule.arrivalAt).toISOString() : null, reservedUntil: schedule.reservedUntil ? new Date(schedule.reservedUntil).toISOString() : null, visitMinutes: schedule.visitMinutes };
}
export function startTime(schedule: Schedule, now = Date.now(), arrivalMinutes = 30) {
  if (schedule.arrivalAt) return new Date(schedule.arrivalAt).getTime();
  if (schedule.scheduleMode === "asap") return now + arrivalMinutes * 60000;
  const time = schedule.scheduleMode === "scheduled" ? schedule.preferredTime : { morning: "09:00", midday: "12:00", afternoon: "15:00" }[schedule.slot];
  return new Date(`${schedule.date}T${time}:00+05:30`).getTime();
}
export function normalizeSchedule(input: z.input<typeof scheduleSchema>, now = Date.now()) {
  const values = scheduleSchema.parse(input);
  if (values.scheduleMode === "asap") return { scheduleMode: "asap" as const, date: localDate(), slot: "morning" as const, preferredTime: null, arrivalAt: null, reservedUntil: null, visitMinutes: 60 };
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(values.date);
  const preferredTime = values.scheduleMode === "scheduled" ? scheduleSchema.shape.preferredTime.unwrap().parse(values.preferredTime) : null;
  const slot = preferredTime ? (Number(preferredTime.slice(0,2)) < 12 ? "morning" : Number(preferredTime.slice(0,2)) < 15 ? "midday" : "afternoon") : z.enum(["morning","midday","afternoon"]).parse(values.slot);
  const schedule = { scheduleMode: values.scheduleMode, date, slot, preferredTime };
  const start = startTime(schedule);
  if (!Number.isFinite(start) || start <= now || new Intl.DateTimeFormat("en-CA",{ timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(start) !== date) throw new z.ZodError([{ code: "custom", path: ["date"], message: "Choose a valid future arrival date and time." }]);
  const visitMinutes = values.scheduleMode === "legacy" ? 120 : 60;
  return { ...schedule, arrivalAt: new Date(start), reservedUntil: new Date(start + (visitMinutes + travelBufferMinutes) * 60000), visitMinutes };
}
export function providerIsBusy(commitments: Commitment[]) {
  return commitments.some(b => !isTerminal(b.status) && (activeVisitStatuses.includes(b.status) || (b.scheduleMode === "asap" && b.status === "accepted")));
}
export function requestAvailability(schedule: Schedule, commitments: Commitment[], now = Date.now(), arrivalMinutes = 30, visitMinutes = schedule.visitMinutes ?? (schedule.scheduleMode === "legacy" || !schedule.scheduleMode ? 120 : 60)): RequestAvailability {
  const start = startTime(schedule,now,arrivalMinutes);
  if (schedule.scheduleMode !== "asap" && (!Number.isFinite(start) || start <= now)) return "expired";
  if (schedule.scheduleMode === "asap" && providerIsBusy(commitments)) return "busy";
  const end = start + (visitMinutes + travelBufferMinutes) * 60000;
  for (const job of commitments.filter(b => !isTerminal(b.status))) {
    const jobStart = startTime(job,now);
    // ponytail: visit estimate + 30-minute buffer, not a multi-day project/resource calendar.
    let jobEnd = job.reservedUntil ? new Date(job.reservedUntil).getTime() : jobStart + ((job.visitMinutes ?? 120) + travelBufferMinutes) * 60000;
    if (activeVisitStatuses.includes(job.status)) jobEnd = Math.max(jobEnd,now + (job.visitMinutes ?? 60) * 60000 + travelBufferMinutes * 60000);
    if (start < jobEnd && end > jobStart) return "conflict";
  }
  return "available";
}
