DROP INDEX "one_provider_booking_per_slot";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "schedule_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "preferred_time" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reserved_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "visit_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
-- Preserve existing arrival windows; do not rebook or change billing terms.
UPDATE public.bookings SET arrival_at =
  (date + CASE slot::text WHEN 'morning' THEN interval '9 hours' WHEN 'midday' THEN interval '12 hours' ELSE interval '15 hours' END) AT TIME ZONE 'Asia/Kolkata';--> statement-breakpoint
UPDATE public.bookings SET reserved_until = arrival_at + (visit_minutes + 30) * interval '1 minute';--> statement-breakpoint
CREATE UNIQUE INDEX "one_provider_active_visit" ON "bookings" USING btree ("provider_id") WHERE "bookings"."provider_id" is not null and "bookings"."status" in ('on_the_way','inspecting','awaiting_approval','ready_to_start','in_progress');--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "booking_schedule_valid" CHECK ("bookings"."schedule_mode" in ('legacy','scheduled','asap') and ("bookings"."schedule_mode" <> 'scheduled' or ("bookings"."preferred_time" is not null and "bookings"."preferred_time" ~ '^([01][0-9]|2[0-3]):(00|30)$')) and ("bookings"."schedule_mode" = 'scheduled' or "bookings"."preferred_time" is null) and "bookings"."visit_minutes" in (60,120,180,240,480));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "booking_reservation_valid" CHECK (("bookings"."arrival_at" is null and "bookings"."reserved_until" is null and "bookings"."schedule_mode" = 'asap' and "bookings"."status" in ('requested','cancelled')) or ("bookings"."arrival_at" is not null and "bookings"."reserved_until" is not null and "bookings"."reserved_until" = "bookings"."arrival_at" + ("bookings"."visit_minutes" + 30) * interval '1 minute'));--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
-- Stored endpoints avoid timezone-dependent timestamp arithmetic in index expressions.
ALTER TABLE public.bookings ADD CONSTRAINT provider_appointment_no_overlap
  EXCLUDE USING gist (provider_id WITH =, tstzrange(arrival_at, reserved_until, '[)') WITH &&)
  WHERE (provider_id IS NOT NULL AND status IN ('accepted','on_the_way','inspecting','awaiting_approval','ready_to_start','in_progress'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_booking_snapshots()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.request_key IS DISTINCT FROM OLD.request_key
    OR NEW.base_price IS DISTINCT FROM OLD.base_price
    OR NEW.payment_rule IS DISTINCT FROM OLD.payment_rule
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.service_name_snapshot IS DISTINCT FROM OLD.service_name_snapshot
    OR NEW.address_snapshot IS DISTINCT FROM OLD.address_snapshot THEN
    RAISE EXCEPTION 'Booking identity and price/address snapshots are immutable';
  END IF;
  IF OLD.status::text <> 'requested' AND
    (NEW.schedule_mode IS DISTINCT FROM OLD.schedule_mode OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.slot IS DISTINCT FROM OLD.slot OR NEW.preferred_time IS DISTINCT FROM OLD.preferred_time
     OR NEW.arrival_at IS DISTINCT FROM OLD.arrival_at OR NEW.reserved_until IS DISTINCT FROM OLD.reserved_until
     OR NEW.visit_minutes IS DISTINCT FROM OLD.visit_minutes) THEN
    RAISE EXCEPTION 'Assigned and closed appointment snapshots are immutable';
  END IF;
  IF OLD.status::text IN ('completed','inspection_completed')
    AND (NEW.total IS DISTINCT FROM OLD.total OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Closed booking totals and outcomes are frozen';
  END IF;
  RETURN NEW;
END;
$$;
