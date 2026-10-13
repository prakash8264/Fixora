ALTER TYPE "public"."booking_status" ADD VALUE 'inspecting' BEFORE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'awaiting_approval' BEFORE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'ready_to_start' BEFORE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'inspection_completed' BEFORE 'cancelled';--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "booking_assignment_valid";--> statement-breakpoint
ALTER TABLE "estimates" DROP CONSTRAINT "estimate_values_valid";--> statement-breakpoint
-- Preserve the agreed terms of existing bookings; only new bookings use the visit-fee rule.
ALTER TABLE "bookings" ADD COLUMN "payment_rule" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "payment_rule" SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "booking_payment_rule_valid" CHECK ("bookings"."payment_rule" in (1,2) and ("bookings"."status"::text <> 'inspection_completed' or ("bookings"."payment_rule" = 2 and "bookings"."total" = "bookings"."base_price")));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "booking_assignment_valid" CHECK (("bookings"."status"::text = 'requested' and "bookings"."provider_id" is null) or ("bookings"."status"::text in ('accepted','on_the_way','inspecting','awaiting_approval','ready_to_start','in_progress','completed','inspection_completed') and "bookings"."provider_id" is not null) or "bookings"."status"::text = 'cancelled');--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimate_values_valid" CHECK ("estimates"."total" >= 0 and "estimates"."version" > 0);
--> statement-breakpoint
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
  IF OLD.status::text IN ('completed','inspection_completed')
    AND (NEW.total IS DISTINCT FROM OLD.total OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Closed booking totals and outcomes are frozen';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_snapshots_immutable ON public.bookings;
--> statement-breakpoint
CREATE TRIGGER booking_snapshots_immutable BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.protect_booking_snapshots();
