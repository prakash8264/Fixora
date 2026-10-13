import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Address } from "@/lib/types";
import { bookingStatuses } from "@/lib/domain";
import type { ScheduleMode } from "@/lib/scheduling";

export const roleEnum = pgEnum("user_role", ["customer", "provider", "admin"]);
export const bookingStatusEnum = pgEnum("booking_status", bookingStatuses);
export const slotEnum = pgEnum("time_slot", ["morning", "midday", "afternoon"]);
export const approvalEnum = pgEnum("provider_approval", ["pending", "approved", "rejected"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "declined", "expired"]);
export const estimateStatusEnum = pgEnum("estimate_status", ["pending", "approved", "rejected", "superseded"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "authorized", "captured", "failed"]);
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  role: roleEnum("role").default("customer").notNull(),
  suspended: boolean("suspended").default(false).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}).enableRLS();

export const providerProfiles = pgTable("provider_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  bio: text("bio").notNull(),
  experienceYears: integer("experience_years").default(0).notNull(),
  approval: approvalEnum("approval").default("pending").notNull(),
  clockedIn: boolean("clocked_in").default(false).notNull(),
  clockChangedAt: timestamp("clock_changed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [check("provider_experience_nonnegative", sql`${t.experienceYears} >= 0`)]).enableRLS();

export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull().unique(), slug: text("slug").notNull().unique(), active: boolean("active").default(true).notNull(),
}).enableRLS();

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => serviceCategories.id),
  slug: text("slug").notNull().unique(), name: text("name").notNull(), description: text("description").notNull(),
  basePrice: integer("base_price").notNull(), icon: text("icon").default("sparkles").notNull(), color: text("color").default("mint").notNull(), active: boolean("active").default(true).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [check("service_price_nonnegative", sql`${t.basePrice} >= 0`)]).enableRLS();

export const providerServices = pgTable("provider_services", {
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.userId), serviceId: uuid("service_id").notNull().references(() => services.id),
}, t => [primaryKey({ columns: [t.providerId, t.serviceId] })]).enableRLS();

export const providerServiceAreas = pgTable("provider_service_areas", {
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.userId), postalCode: text("postal_code").notNull(),
}, t => [primaryKey({ columns: [t.providerId, t.postalCode] }), check("provider_postcode_format", sql`${t.postalCode} ~ '^[0-9]{6}$'`)]).enableRLS();

export const providerAvailability = pgTable("provider_availability", {
  id: uuid("id").defaultRandom().primaryKey(), providerId: uuid("provider_id").notNull().references(() => providerProfiles.userId),
  weekday: integer("weekday"), date: date("date"), slot: slotEnum("slot").notNull(), available: boolean("available").default(true).notNull(),
}, t => [
  check("availability_day_or_date", sql`(${t.weekday} is not null and ${t.weekday} between 0 and 6 and ${t.date} is null) or (${t.weekday} is null and ${t.date} is not null)`),
  uniqueIndex("weekly_provider_slot").on(t.providerId,t.weekday,t.slot).where(sql`${t.date} is null`),
  uniqueIndex("dated_provider_slot").on(t.providerId,t.date,t.slot).where(sql`${t.date} is not null`),
]).enableRLS();

export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(), customerId: uuid("customer_id").notNull().references(() => users.id),
  label: text("label").notNull(), line: text("line").notNull(), city: text("city").notNull(), postalCode: text("postal_code").notNull(), isDefault: boolean("is_default").default(false).notNull(), createdAt: createdAt(),
}, t => [index("address_customer_idx").on(t.customerId), uniqueIndex("one_default_address").on(t.customerId).where(sql`${t.isDefault} = true`), check("address_postcode_format", sql`${t.postalCode} ~ '^[0-9]{6}$'`)]).enableRLS();

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(), reference: text("reference").notNull().unique(), requestKey: uuid("request_key").notNull(),
  customerId: uuid("customer_id").notNull().references(() => users.id), providerId: uuid("provider_id").references(() => providerProfiles.userId), serviceId: uuid("service_id").notNull().references(() => services.id),
  addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }), addressSnapshot: jsonb("address_snapshot").$type<Address>().notNull(), serviceNameSnapshot: text("service_name_snapshot").notNull(),
  date: date("date").notNull(), slot: slotEnum("slot").notNull(), description: text("description").notNull(), basePrice: integer("base_price").notNull(), total: integer("total").notNull(),
  status: bookingStatusEnum("status").default("requested").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
  paymentRule: integer("payment_rule").default(2).notNull(),
  scheduleMode: text("schedule_mode").$type<ScheduleMode>().default("legacy").notNull(),
  preferredTime: text("preferred_time"),
  arrivalAt: timestamp("arrival_at", { withTimezone: true }),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }),
  visitMinutes: integer("visit_minutes").default(120).notNull(),
}, t => [
  index("booking_customer_idx").on(t.customerId), index("booking_provider_idx").on(t.providerId), uniqueIndex("booking_customer_request_key").on(t.customerId,t.requestKey),
  uniqueIndex("one_provider_active_visit").on(t.providerId).where(sql`${t.providerId} is not null and (${t.status} in ('on_the_way','inspecting','awaiting_approval','ready_to_start','in_progress') or (${t.scheduleMode} = 'asap' and ${t.status} = 'accepted'))`),
  check("booking_schedule_valid", sql`${t.scheduleMode} in ('legacy','scheduled','asap') and (${t.scheduleMode} <> 'scheduled' or (${t.preferredTime} is not null and ${t.preferredTime} ~ '^([01][0-9]|2[0-3]):(00|30)$')) and (${t.scheduleMode} = 'scheduled' or ${t.preferredTime} is null) and ${t.visitMinutes} in (60,120,180,240,480)`),
  check("booking_reservation_valid", sql`(${t.arrivalAt} is null and ${t.reservedUntil} is null and ${t.scheduleMode} = 'asap' and ${t.status} in ('requested','cancelled')) or (${t.arrivalAt} is not null and ${t.reservedUntil} is not null and ${t.reservedUntil} = ${t.arrivalAt} + (${t.visitMinutes} + 30) * interval '1 minute')`),
  check("booking_price_valid", sql`${t.basePrice} >= 0 and ${t.total} >= ${t.basePrice}`),
  check("booking_assignment_valid", sql`(${t.status}::text = 'requested' and ${t.providerId} is null) or (${t.status}::text in ('accepted','on_the_way','inspecting','awaiting_approval','ready_to_start','in_progress','completed','inspection_completed') and ${t.providerId} is not null) or ${t.status}::text = 'cancelled'`),
  check("booking_payment_rule_valid", sql`${t.paymentRule} in (1,2) and (${t.status}::text <> 'inspection_completed' or (${t.paymentRule} = 2 and ${t.total} = ${t.basePrice}))`),
]).enableRLS();

export const bookingRequests = pgTable("booking_requests", {
  id: uuid("id").defaultRandom().primaryKey(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), providerId: uuid("provider_id").notNull().references(() => providerProfiles.userId), status: invitationStatusEnum("status").default("pending").notNull(),
  serviceName: text("service_name").notNull(), city: text("city").notNull(), postalCode: text("postal_code").notNull(), date: date("date").notNull(), slot: slotEnum("slot").notNull(), basePrice: integer("base_price").notNull(),
  safeSummary: text("safe_summary").notNull(), respondedAt: timestamp("responded_at", { withTimezone: true }), createdAt: createdAt(),
}, t => [uniqueIndex("one_booking_provider_invitation").on(t.bookingId,t.providerId), index("invitation_provider_idx").on(t.providerId,t.status), check("invitation_price_nonnegative", sql`${t.basePrice} >= 0`)]).enableRLS();

export const bookingEvents = pgTable("booking_events", {
  id: uuid("id").defaultRandom().primaryKey(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), actorId: uuid("actor_id").notNull().references(() => users.id), action: text("action").notNull(), fromStatus: bookingStatusEnum("from_status"), toStatus: bookingStatusEnum("to_status"), reason: text("reason"), createdAt: createdAt(),
}, t => [index("event_booking_idx").on(t.bookingId,t.createdAt)]).enableRLS();

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(), recipientId: uuid("recipient_id").notNull().references(() => users.id), bookingId: uuid("booking_id").references(() => bookings.id), type: text("type").notNull(), title: text("title").notNull(), description: text("description").notNull(), readAt: timestamp("read_at", { withTimezone: true }), createdAt: createdAt(),
}, t => [index("notification_recipient_idx").on(t.recipientId,t.createdAt)]).enableRLS();

export const estimates = pgTable("estimates", {
  id: uuid("id").defaultRandom().primaryKey(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), providerId: uuid("provider_id").notNull().references(() => providerProfiles.userId), version: integer("version").notNull(), status: estimateStatusEnum("status").default("pending").notNull(), total: integer("total").notNull(), decidedBy: uuid("decided_by").references(() => users.id), decidedAt: timestamp("decided_at", { withTimezone: true }), createdAt: createdAt(),
}, t => [uniqueIndex("estimate_booking_version").on(t.bookingId,t.version), uniqueIndex("one_pending_estimate").on(t.bookingId).where(sql`${t.status} = 'pending'`), check("estimate_values_valid", sql`${t.total} >= 0 and ${t.version} > 0`)]).enableRLS();

export const estimateItems = pgTable("estimate_items", {
  id: uuid("id").defaultRandom().primaryKey(), estimateId: uuid("estimate_id").notNull().references(() => estimates.id), description: text("description").notNull(), quantity: integer("quantity").notNull(), unitPrice: integer("unit_price").notNull(), lineTotal: integer("line_total").notNull(),
}, t => [check("estimate_item_values_valid", sql`${t.quantity} between 1 and 100 and ${t.unitPrice} > 0 and ${t.lineTotal} = ${t.quantity} * ${t.unitPrice}`)]).enableRLS();

export const paymentOrders = pgTable("payment_orders", {
  id: uuid("id").defaultRandom().primaryKey(), bookingId: uuid("booking_id").notNull().references(() => bookings.id), razorpayOrderId: text("razorpay_order_id").notNull().unique(), amount: integer("amount").notNull(), currency: text("currency").default("INR").notNull(), status: text("status").default("created").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("one_open_order_per_booking").on(t.bookingId).where(sql`${t.status} = 'created'`), check("order_amount_positive", sql`${t.amount} > 0`), check("order_status_valid", sql`${t.status} in ('created','paid','closed')`), check("order_currency_inr", sql`${t.currency} = 'INR'`)]).enableRLS();

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(), orderId: uuid("order_id").notNull().references(() => paymentOrders.id), bookingId: uuid("booking_id").notNull().references(() => bookings.id), razorpayPaymentId: text("razorpay_payment_id").notNull().unique(), amount: integer("amount").notNull(), status: paymentStatusEnum("status").default("pending").notNull(), capturedAt: timestamp("captured_at", { withTimezone: true }), createdAt: createdAt(),
}, t => [uniqueIndex("one_captured_payment_per_booking").on(t.bookingId).where(sql`${t.status} = 'captured'`), check("payment_amount_positive", sql`${t.amount} > 0`)]).enableRLS();

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(), gatewayEventId: text("gateway_event_id").notNull().unique(), type: text("type").notNull(), processedAt: timestamp("processed_at", { withTimezone: true }), error: text("error"), createdAt: createdAt(),
}).enableRLS();

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(), bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id), customerId: uuid("customer_id").notNull().references(() => users.id), providerId: uuid("provider_id").notNull().references(() => providerProfiles.userId), rating: integer("rating").notNull(), comment: text("comment"), createdAt: createdAt(),
}, t => [check("review_rating_valid", sql`${t.rating} between 1 and 5`)]).enableRLS();
