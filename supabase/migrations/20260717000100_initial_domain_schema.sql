-- Philabantay domain schema.
-- All application identifiers become UUIDs because public.users.id mirrors
-- auth.users.id. The API adapter maps these rows to packages/shared shapes.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('customer', 'barber', 'shop_owner', 'admin');
create type public.onboarding_role as enum ('customer', 'barber', 'shop_owner');
create type public.verification_status as enum (
  'unverified',
  'not_required',
  'pending',
  'verified',
  'rejected',
  'suspended'
);
create type public.barber_shift_status as enum ('off', 'on');
create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);
create type public.employment_status as enum ('applied', 'active', 'resigned');
create type public.barber_application_status as enum ('pending', 'accepted', 'declined');
create type public.attendance_status as enum ('present', 'absent');
create type public.conversation_kind as enum ('customer_shop', 'staff');
create type public.employment_type as enum ('full_time', 'part_time', 'chair_rental');
create type public.shift_change_request_status as enum ('pending', 'approved', 'declined');
create type public.bug_category as enum ('visual', 'booking', 'map', 'chat', 'account', 'other');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  requested_role public.onboarding_role,
  verification_status public.verification_status not null default 'unverified',
  onboarding_completed boolean not null default false,
  full_name text not null,
  email text not null,
  phone text,
  location text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_full_name_length check (char_length(btrim(full_name)) between 1 and 80),
  constraint users_email_length check (char_length(email) between 3 and 254),
  constraint users_phone_length check (phone is null or char_length(phone) <= 16)
);

create unique index users_email_unique on public.users (lower(email));

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete restrict,
  name text not null,
  address text not null,
  city text not null,
  lat double precision not null,
  lng double precision not null,
  rating numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint shops_address_length check (char_length(btrim(address)) between 1 and 240),
  constraint shops_city_length check (char_length(btrim(city)) between 1 and 120),
  constraint shops_latitude check (lat between -90 and 90),
  constraint shops_longitude check (lng between -180 and 180),
  constraint shops_rating check (rating between 0 and 5),
  constraint shops_rating_count check (rating_count >= 0)
);

create unique index shops_one_owner_name_unique
  on public.shops (owner_id, lower(name))
  where owner_id is not null;

create table public.barbers (
  id uuid primary key references public.users(id) on delete cascade,
  bio text,
  rating numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  shift_status public.barber_shift_status not null default 'off',
  accepting_bookings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barbers_bio_length check (bio is null or char_length(bio) <= 1000),
  constraint barbers_rating check (rating between 0 and 5),
  constraint barbers_rating_count check (rating_count >= 0)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  duration_min integer not null,
  price_cents integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint services_duration check (duration_min between 5 and 480),
  constraint services_price check (price_cents >= 0),
  constraint services_id_shop_unique unique (id, shop_id)
);

create unique index services_active_name_unique
  on public.services (shop_id, lower(name))
  where active;

create table public.barber_employment (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  status public.employment_status not null default 'applied',
  applied_at timestamptz not null default now(),
  hired_at date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_employment_state_dates check (
    (status = 'applied' and hired_at is null and ended_at is null)
    or (status = 'active' and hired_at is not null and ended_at is null)
    or (status = 'resigned' and hired_at is not null and ended_at is not null and ended_at >= hired_at)
  ),
  constraint barber_employment_identity_unique unique (id, barber_id, shop_id)
);

create unique index barber_employment_one_active_per_barber
  on public.barber_employment (barber_id)
  where status = 'active';

create unique index barber_employment_one_applied_per_shop
  on public.barber_employment (barber_id, shop_id)
  where status = 'applied';

create index barber_employment_shop_status_idx
  on public.barber_employment (shop_id, status);

create table public.shift_patterns (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null,
  barber_id uuid not null,
  shop_id uuid not null,
  weekday smallint not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_patterns_weekday check (weekday between 0 and 6),
  constraint shift_patterns_time_order check (start_time < end_time),
  constraint shift_patterns_employment_fk
    foreign key (employment_id, barber_id, shop_id)
    references public.barber_employment (id, barber_id, shop_id)
    on delete cascade,
  constraint shift_patterns_unique unique (employment_id, weekday, start_time, end_time)
);

create index shift_patterns_barber_weekday_idx
  on public.shift_patterns (barber_id, weekday);

create table public.shift_exceptions (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null,
  barber_id uuid not null,
  shop_id uuid not null,
  date date not null,
  is_available boolean not null,
  start_time time without time zone,
  end_time time without time zone,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_exceptions_time_pair check (
    (is_available and start_time is not null and end_time is not null and start_time < end_time)
    or (not is_available and start_time is null and end_time is null)
  ),
  constraint shift_exceptions_reason_length check (reason is null or char_length(reason) <= 500),
  constraint shift_exceptions_employment_fk
    foreign key (employment_id, barber_id, shop_id)
    references public.barber_employment (id, barber_id, shop_id)
    on delete cascade,
  constraint shift_exceptions_unique unique (employment_id, date)
);

create index shift_exceptions_barber_date_idx
  on public.shift_exceptions (barber_id, date);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_order check (starts_at < ends_at),
  constraint appointments_notes_length check (notes is null or char_length(notes) <= 1000),
  constraint appointments_service_shop_fk
    foreign key (service_id, shop_id)
    references public.services (id, shop_id)
    on delete restrict,
  constraint appointments_no_barber_overlap
    exclude using gist (
      barber_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in ('pending', 'confirmed'))
);

create index appointments_customer_starts_at_idx
  on public.appointments (customer_id, starts_at desc);
create index appointments_barber_starts_at_idx
  on public.appointments (barber_id, starts_at desc);
create index appointments_shop_starts_at_idx
  on public.appointments (shop_id, starts_at desc);
create index appointments_shop_status_idx
  on public.appointments (shop_id, status);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null,
  barber_id uuid not null,
  shop_id uuid not null,
  date date not null,
  status public.attendance_status not null,
  notes text,
  recorded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_notes_length check (notes is null or char_length(notes) <= 1000),
  constraint attendance_employment_fk
    foreign key (employment_id, barber_id, shop_id)
    references public.barber_employment (id, barber_id, shop_id)
    on delete cascade,
  constraint attendance_one_record_per_day unique (employment_id, date)
);

create index attendance_shop_date_idx
  on public.attendance_records (shop_id, date desc);
create index attendance_barber_date_idx
  on public.attendance_records (barber_id, date desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null default 'customer_shop',
  customer_id uuid not null references public.users(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create unique index conversations_customer_shop_unique
  on public.conversations (customer_id, shop_id)
  where kind = 'customer_shop';

create unique index conversations_staff_unique
  on public.conversations (customer_id, shop_id, barber_id)
  where kind = 'staff';

create index conversations_shop_activity_idx
  on public.conversations (shop_id, last_message_at desc);
create index conversations_customer_activity_idx
  on public.conversations (customer_id, last_message_at desc);
create index conversations_barber_activity_idx
  on public.conversations (barber_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete restrict,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (char_length(btrim(body)) between 1 and 4000)
);

create index messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at desc);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  barber_rating smallint not null,
  shop_rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ratings_barber_score check (barber_rating between 1 and 5),
  constraint ratings_shop_score check (shop_rating between 1 and 5),
  constraint ratings_comment_length check (comment is null or char_length(comment) <= 2000)
);

create index ratings_customer_created_at_idx
  on public.ratings (customer_id, created_at desc);
create index ratings_barber_created_at_idx
  on public.ratings (barber_id, created_at desc);
create index ratings_shop_created_at_idx
  on public.ratings (shop_id, created_at desc);

create table public.barber_applications (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  status public.barber_application_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index barber_applications_one_pending_per_shop
  on public.barber_applications (barber_id, shop_id)
  where status = 'pending';

create index barber_applications_shop_status_idx
  on public.barber_applications (shop_id, status, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  booking_reminders boolean not null default true,
  chat_notifications boolean not null default true,
  email_updates boolean not null default false,
  nearby_alerts boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing DataBackend persistence beyond the minimum requested table list.
create table public.hiring_listings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  role_title text not null,
  employment_type public.employment_type not null,
  requirements text[] not null default '{}',
  open_positions integer not null default 1,
  accepting_applications boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint hiring_role_title_length check (char_length(btrim(role_title)) between 1 and 120),
  constraint hiring_open_positions check (open_positions >= 0)
);

create table public.shop_join_codes (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  constraint shop_join_codes_length check (char_length(code) between 6 and 32)
);

create table public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null,
  barber_id uuid not null,
  shop_id uuid not null,
  date date not null,
  message text not null,
  status public.shift_change_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_change_message_length check (char_length(btrim(message)) between 1 and 1000),
  constraint shift_change_employment_fk
    foreign key (employment_id, barber_id, shop_id)
    references public.barber_employment (id, barber_id, shop_id)
    on delete cascade
);

create index shift_change_requests_shop_status_idx
  on public.shift_change_requests (shop_id, status, created_at desc);
create index shift_change_requests_barber_created_idx
  on public.shift_change_requests (barber_id, created_at desc);

create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint staff_notes_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index staff_notes_shop_barber_created_idx
  on public.staff_notes (shop_id, barber_id, created_at desc);

create table public.favorite_shops (
  user_id uuid not null references public.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

create table public.favorite_barbers (
  user_id uuid not null references public.users(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, barber_id)
);

create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category public.bug_category not null,
  summary text not null,
  description text not null,
  page_url text,
  created_at timestamptz not null default now(),
  constraint bug_reports_summary_length check (char_length(btrim(summary)) between 1 and 160),
  constraint bug_reports_description_length check (char_length(btrim(description)) between 1 and 5000),
  constraint bug_reports_page_url_length check (page_url is null or char_length(page_url) <= 2048)
);

create index bug_reports_user_created_idx
  on public.bug_reports (user_id, created_at desc);
