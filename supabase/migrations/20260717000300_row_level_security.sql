-- Row Level Security is the database boundary for direct user-token access.
-- The Express service-role client bypasses RLS by design, so Section 3 must
-- repeat these checks before every service-role query.

alter table public.users enable row level security;
alter table public.shops enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.barber_employment enable row level security;
alter table public.shift_patterns enable row level security;
alter table public.shift_exceptions enable row level security;
alter table public.appointments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ratings enable row level security;
alter table public.barber_applications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.hiring_listings enable row level security;
alter table public.shop_join_codes enable row level security;
alter table public.shift_change_requests enable row level security;
alter table public.staff_notes enable row level security;
alter table public.favorite_shops enable row level security;
alter table public.favorite_barbers enable row level security;
alter table public.bug_reports enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.shops from anon, authenticated;
revoke all on table public.barbers from anon, authenticated;
revoke all on table public.services from anon, authenticated;
revoke all on table public.barber_employment from anon, authenticated;
revoke all on table public.shift_patterns from anon, authenticated;
revoke all on table public.shift_exceptions from anon, authenticated;
revoke all on table public.appointments from anon, authenticated;
revoke all on table public.attendance_records from anon, authenticated;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.ratings from anon, authenticated;
revoke all on table public.barber_applications from anon, authenticated;
revoke all on table public.notification_preferences from anon, authenticated;
revoke all on table public.hiring_listings from anon, authenticated;
revoke all on table public.shop_join_codes from anon, authenticated;
revoke all on table public.shift_change_requests from anon, authenticated;
revoke all on table public.staff_notes from anon, authenticated;
revoke all on table public.favorite_shops from anon, authenticated;
revoke all on table public.favorite_barbers from anon, authenticated;
revoke all on table public.bug_reports from anon, authenticated;

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.owns_shop(uuid, uuid) to authenticated;
grant execute on function private.is_active_barber_for_shop(uuid, uuid) to authenticated;
grant execute on function private.is_shop_member(uuid, uuid) to authenticated;
grant execute on function private.is_conversation_participant(uuid, uuid) to authenticated;
grant execute on function private.rating_matches_completed_appointment(uuid, uuid, uuid, uuid) to authenticated;

grant select on public.users to authenticated;
grant update (full_name, phone, location, avatar_url) on public.users to authenticated;

grant select, insert, delete on public.shops to authenticated;
grant update (name, address, city, lat, lng) on public.shops to authenticated;

grant select on public.barbers to authenticated;
grant update (bio, shift_status, accepting_bookings) on public.barbers to authenticated;

grant select, insert, delete on public.services to authenticated;
grant update (name, duration_min, price_cents, active) on public.services to authenticated;

grant select, insert, delete on public.barber_employment to authenticated;
grant update (status, hired_at, ended_at) on public.barber_employment to authenticated;

grant select, insert, update, delete on public.shift_patterns to authenticated;
grant select, insert, update, delete on public.shift_exceptions to authenticated;

grant select, insert on public.appointments to authenticated;
grant update (barber_id, service_id, starts_at, status, notes) on public.appointments to authenticated;

grant select, insert, delete on public.attendance_records to authenticated;
grant update (status, notes) on public.attendance_records to authenticated;

grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

grant select, insert, delete on public.ratings to authenticated;
grant update (barber_rating, shop_rating, comment) on public.ratings to authenticated;

grant select, insert on public.barber_applications to authenticated;
grant update (status) on public.barber_applications to authenticated;

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.hiring_listings to authenticated;
grant select, insert, update, delete on public.shop_join_codes to authenticated;
grant select, insert on public.shift_change_requests to authenticated;
grant update (status) on public.shift_change_requests to authenticated;
grant select, insert on public.staff_notes to authenticated;
grant select, insert, delete on public.favorite_shops to authenticated;
grant select, insert, delete on public.favorite_barbers to authenticated;
grant select, insert on public.bug_reports to authenticated;

-- Profile rows contain private contact data, so direct clients only receive
-- their own full public.users row. Cross-user PublicProfile projections are
-- assembled by the authorized Express API with an explicit column allowlist.
create policy users_select_self
  on public.users for select to authenticated
  using (id = (select auth.uid()));

create policy users_update_self
  on public.users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Shop identity, active services, barber cards, and open hiring listings are
-- public catalogue data for authenticated discovery. Private operational rows
-- below remain participant/shop scoped.
create policy shops_select_catalogue
  on public.shops for select to authenticated
  using (true);

create policy shops_insert_owner
  on public.shops for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select private.current_user_role()) in ('shop_owner', 'admin')
  );

create policy shops_update_owner
  on public.shops for update to authenticated
  using (private.owns_shop(id))
  with check (private.owns_shop(id));

create policy shops_delete_owner
  on public.shops for delete to authenticated
  using (private.owns_shop(id));

create policy barbers_select_catalogue
  on public.barbers for select to authenticated
  using (true);

create policy barbers_update_self
  on public.barbers for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy services_select_catalogue_or_owner
  on public.services for select to authenticated
  using (active or private.owns_shop(shop_id));

create policy services_insert_owner
  on public.services for insert to authenticated
  with check (private.owns_shop(shop_id));

create policy services_update_owner
  on public.services for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

create policy services_delete_owner
  on public.services for delete to authenticated
  using (private.owns_shop(shop_id));

create policy barber_employment_select_participant
  on public.barber_employment for select to authenticated
  using (
    barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

create policy barber_employment_insert_owner
  on public.barber_employment for insert to authenticated
  with check (private.owns_shop(shop_id));

create policy barber_employment_update_owner
  on public.barber_employment for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

create policy barber_employment_delete_owner
  on public.barber_employment for delete to authenticated
  using (private.owns_shop(shop_id));

create policy shift_patterns_select_staff
  on public.shift_patterns for select to authenticated
  using (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_patterns_insert_staff
  on public.shift_patterns for insert to authenticated
  with check (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_patterns_update_staff
  on public.shift_patterns for update to authenticated
  using (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  )
  with check (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_patterns_delete_staff
  on public.shift_patterns for delete to authenticated
  using (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_exceptions_select_staff
  on public.shift_exceptions for select to authenticated
  using (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_exceptions_insert_staff
  on public.shift_exceptions for insert to authenticated
  with check (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_exceptions_update_staff
  on public.shift_exceptions for update to authenticated
  using (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  )
  with check (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy shift_exceptions_delete_staff
  on public.shift_exceptions for delete to authenticated
  using (
    (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    or private.owns_shop(shop_id)
  );

create policy appointments_select_participant
  on public.appointments for select to authenticated
  using (
    customer_id = (select auth.uid())
    or barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

create policy appointments_insert_customer
  on public.appointments for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and (select private.current_user_role()) = 'customer'
    and private.is_active_barber_for_shop(shop_id, barber_id)
  );

create policy appointments_update_participant
  on public.appointments for update to authenticated
  using (
    customer_id = (select auth.uid())
    or barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  )
  with check (
    customer_id = (select auth.uid())
    or barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

create policy attendance_select_staff
  on public.attendance_records for select to authenticated
  using (barber_id = (select auth.uid()) or private.owns_shop(shop_id));

create policy attendance_insert_staff
  on public.attendance_records for insert to authenticated
  with check (
    (barber_id = (select auth.uid()) and recorded_by = (select auth.uid()))
    or (private.owns_shop(shop_id) and recorded_by = (select auth.uid()))
  );

create policy attendance_update_staff
  on public.attendance_records for update to authenticated
  using (barber_id = (select auth.uid()) or private.owns_shop(shop_id))
  with check (barber_id = (select auth.uid()) or private.owns_shop(shop_id));

create policy attendance_delete_staff
  on public.attendance_records for delete to authenticated
  using (barber_id = (select auth.uid()) or private.owns_shop(shop_id));

create policy conversations_select_participant
  on public.conversations for select to authenticated
  using (private.is_conversation_participant(id));

create policy conversations_insert_participant
  on public.conversations for insert to authenticated
  with check (
    (
      kind = 'customer_shop'
      and customer_id = (select auth.uid())
      and (select private.current_user_role()) = 'customer'
      and private.is_active_barber_for_shop(shop_id, barber_id)
    )
    or (
      kind = 'staff'
      and customer_id = (select auth.uid())
      and private.owns_shop(shop_id)
      and private.is_active_barber_for_shop(shop_id, barber_id)
    )
  );

create policy messages_select_participant
  on public.messages for select to authenticated
  using (private.is_conversation_participant(conversation_id));

create policy messages_insert_sender
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_participant(conversation_id)
  );

create policy messages_mark_received_read
  on public.messages for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and private.is_conversation_participant(conversation_id)
  )
  with check (
    sender_id <> (select auth.uid())
    and private.is_conversation_participant(conversation_id)
  );

create policy ratings_select_participant
  on public.ratings for select to authenticated
  using (
    customer_id = (select auth.uid())
    or barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

create policy ratings_insert_customer
  on public.ratings for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and private.rating_matches_completed_appointment(appointment_id, customer_id, barber_id, shop_id)
  );

create policy ratings_update_customer
  on public.ratings for update to authenticated
  using (customer_id = (select auth.uid()))
  with check (
    customer_id = (select auth.uid())
    and private.rating_matches_completed_appointment(appointment_id, customer_id, barber_id, shop_id)
  );

create policy ratings_delete_customer
  on public.ratings for delete to authenticated
  using (customer_id = (select auth.uid()));

create policy barber_applications_select_participant
  on public.barber_applications for select to authenticated
  using (barber_id = (select auth.uid()) or private.owns_shop(shop_id));

create policy barber_applications_insert_barber
  on public.barber_applications for insert to authenticated
  with check (
    barber_id = (select auth.uid())
    and status = 'pending'
    and (select private.current_user_role()) = 'barber'
  );

create policy barber_applications_update_owner
  on public.barber_applications for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

create policy notification_preferences_select_self
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_preferences_insert_self
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy notification_preferences_update_self
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notification_preferences_delete_self
  on public.notification_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

create policy hiring_listings_select_catalogue_or_owner
  on public.hiring_listings for select to authenticated
  using (accepting_applications or private.owns_shop(shop_id));

create policy hiring_listings_insert_owner
  on public.hiring_listings for insert to authenticated
  with check (private.owns_shop(shop_id));

create policy hiring_listings_update_owner
  on public.hiring_listings for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

create policy hiring_listings_delete_owner
  on public.hiring_listings for delete to authenticated
  using (private.owns_shop(shop_id));

create policy shop_join_codes_select_owner
  on public.shop_join_codes for select to authenticated
  using (private.owns_shop(shop_id));

create policy shop_join_codes_insert_owner
  on public.shop_join_codes for insert to authenticated
  with check (private.owns_shop(shop_id));

create policy shop_join_codes_update_owner
  on public.shop_join_codes for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

create policy shop_join_codes_delete_owner
  on public.shop_join_codes for delete to authenticated
  using (private.owns_shop(shop_id));

create policy shift_change_requests_select_staff
  on public.shift_change_requests for select to authenticated
  using (barber_id = (select auth.uid()) or private.owns_shop(shop_id));

create policy shift_change_requests_insert_barber
  on public.shift_change_requests for insert to authenticated
  with check (
    barber_id = (select auth.uid())
    and status = 'pending'
    and private.is_active_barber_for_shop(shop_id)
  );

create policy shift_change_requests_update_owner
  on public.shift_change_requests for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

create policy staff_notes_select_subject_or_owner
  on public.staff_notes for select to authenticated
  using (barber_id = (select auth.uid()) or private.owns_shop(shop_id));

create policy staff_notes_insert_author
  on public.staff_notes for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      private.owns_shop(shop_id)
      or (barber_id = (select auth.uid()) and private.is_active_barber_for_shop(shop_id))
    )
  );

create policy favorite_shops_select_self
  on public.favorite_shops for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorite_shops_insert_self
  on public.favorite_shops for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy favorite_shops_delete_self
  on public.favorite_shops for delete to authenticated
  using (user_id = (select auth.uid()));

create policy favorite_barbers_select_self
  on public.favorite_barbers for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorite_barbers_insert_self
  on public.favorite_barbers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy favorite_barbers_delete_self
  on public.favorite_barbers for delete to authenticated
  using (user_id = (select auth.uid()));

create policy bug_reports_select_self
  on public.bug_reports for select to authenticated
  using (user_id = (select auth.uid()));

create policy bug_reports_insert_self
  on public.bug_reports for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Realtime remains row-filtered by each subscriber's SELECT policy.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
