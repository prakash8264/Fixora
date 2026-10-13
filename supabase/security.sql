-- Supabase-only setup. Run AFTER npm run db:migrate, using the SQL editor.
-- Browser clients get SELECT only. All writes go through authorized server routes.
-- Clerk subjects are text (user_...), not UUIDs. Do not use auth.uid() here.

REVOKE ALL ON TABLE public.users, public.provider_profiles, public.service_categories,
  public.services, public.provider_services, public.provider_service_areas,
  public.provider_availability, public.addresses, public.bookings, public.booking_requests,
  public.booking_events, public.notifications, public.estimates, public.estimate_items,
  public.payment_orders, public.payments, public.webhook_events, public.reviews
  FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.users, public.bookings, public.booking_requests,
  public.booking_events, public.notifications, public.estimates, public.estimate_items
  TO authenticated;

DROP POLICY IF EXISTS users_read_self ON public.users;
CREATE POLICY users_read_self ON public.users FOR SELECT TO authenticated
  USING (clerk_user_id = (SELECT auth.jwt()->>'sub') AND suspended = false);

DROP POLICY IF EXISTS bookings_read_participant ON public.bookings;
CREATE POLICY bookings_read_participant ON public.bookings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
    WHERE u.clerk_user_id = (SELECT auth.jwt()->>'sub') AND u.suspended = false
      AND (u.id = customer_id OR u.id = provider_id OR u.role = 'admin')));

DROP POLICY IF EXISTS requests_read_recipient ON public.booking_requests;
CREATE POLICY requests_read_recipient ON public.booking_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = provider_id AND u.clerk_user_id = (SELECT auth.jwt()->>'sub')
      AND u.role = 'provider' AND u.suspended = false));

DROP POLICY IF EXISTS notifications_read_recipient ON public.notifications;
CREATE POLICY notifications_read_recipient ON public.notifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = recipient_id AND u.clerk_user_id = (SELECT auth.jwt()->>'sub') AND u.suspended = false));

DROP POLICY IF EXISTS events_read_participant ON public.booking_events;
CREATE POLICY events_read_participant ON public.booking_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id));

DROP POLICY IF EXISTS estimates_read_participant ON public.estimates;
CREATE POLICY estimates_read_participant ON public.estimates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id));

DROP POLICY IF EXISTS items_read_participant ON public.estimate_items;
CREATE POLICY items_read_participant ON public.estimate_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id));

CREATE OR REPLACE FUNCTION public.prevent_booking_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Booking history is append-only';
END;
$$;
DROP TRIGGER IF EXISTS booking_events_immutable ON public.booking_events;
CREATE TRIGGER booking_events_immutable BEFORE UPDATE OR DELETE ON public.booking_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_event_mutation();

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
DROP TRIGGER IF EXISTS booking_snapshots_immutable ON public.bookings;
CREATE TRIGGER booking_snapshots_immutable BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.protect_booking_snapshots();

-- Enable only the necessary tables in the Realtime publication, idempotently.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['bookings','booking_requests','booking_events','notifications','estimates'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
