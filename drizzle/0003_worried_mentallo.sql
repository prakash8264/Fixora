ALTER TABLE "provider_profiles" ADD COLUMN "clocked_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "clock_changed_at" timestamp with time zone;