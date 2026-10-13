ALTER TABLE "bookings" ADD COLUMN "request_key" uuid NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_customer_request_key" ON "bookings" USING btree ("customer_id","request_key");