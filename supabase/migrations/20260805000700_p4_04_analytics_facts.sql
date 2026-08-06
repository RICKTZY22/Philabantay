-- Phase 4 P4-04: the analytics fact layer.
--
-- Before this migration the only owner numbers came from `GET /shops/:id/stats`,
-- which counted appointments in TypeScript, never read `payment_records`, and
-- returned `revenue_cents` with `revenue_is_estimate: true`. Contract section 10
-- forbids calling any of these figures "revenue" precisely because an estimate
-- labelled revenue is the mistake it is guarding against, so that field is a live
-- contract violation and not a missing feature.
--
-- Everything below is computed in SQL from finalized facts, in the shop's own
-- timezone, and every figure ships with the definition used to produce it. That is
-- what "reproducible by replaying finalized facts" has to mean in practice: a
-- reader can take the definition string and re-derive the number by hand.
--
-- The five value concepts stay separate for the whole length of the function and
-- all the way out to the response. None of them is summed into a single headline.

create or replace function public.api_shop_analytics(
  p_shop_id uuid,
  p_owner_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop public.shops%rowtype;
  v_timezone text;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_days integer;
  v_demand jsonb;
  v_value jsonb;
  v_capacity jsonb;
  v_customers jsonb;
  v_services jsonb;
  v_staff jsonb;
  v_trust jsonb;
  v_walk_ins jsonb;
  v_available_provider_minutes numeric := 0;
  v_available_chair_minutes numeric := 0;
  v_assigned_minutes numeric := 0;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Shop not found.';
  end if;
  if v_shop.owner_id <> p_owner_id then
    raise exception using errcode = '42501', message = 'Only the shop owner may read these figures.';
  end if;
  if p_from > p_to then
    raise exception using errcode = '22023', message = 'The range start must not be after its end.';
  end if;
  -- Bounded query cost: the plan allows an "all time" range only where cost is
  -- bounded, so the widest accepted window is two years of local days.
  if p_to - p_from > 730 then
    raise exception using errcode = '22023', message = 'The widest supported range is 730 days.';
  end if;

  v_timezone := coalesce(v_shop.timezone, 'Asia/Manila');
  -- Local calendar days, not UTC days. A Manila shop's "yesterday" is not the
  -- same 24 hours as UTC's, and every bucket below uses the shop's own clock.
  v_from_ts := (p_from::timestamp) at time zone v_timezone;
  v_to_ts := ((p_to + 1)::timestamp) at time zone v_timezone;
  v_days := (p_to - p_from) + 1;

  -- -------------------------------------------------------------------------
  -- Demand
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'requested', count(*) filter (where a.status = 'requested'),
    'confirmed', count(*) filter (where a.status in ('confirmed', 'checked_in', 'in_progress', 'awaiting_confirmation')),
    'completed', count(*) filter (where a.status = 'completed'),
    'cancelled', count(*) filter (where a.status = 'cancelled'),
    'declined', count(*) filter (where a.status = 'declined'),
    'expired', count(*) filter (where a.status = 'expired'),
    'customer_no_show', count(*) filter (where a.status = 'customer_no_show'),
    'disputed', count(*) filter (where a.status = 'disputed'),
    'total', count(*),
    'series', coalesce((
      select jsonb_agg(day_row order by day_row->>'date')
      from (
        select jsonb_build_object(
          'date', (b.starts_at at time zone v_timezone)::date,
          'completed', count(*) filter (where b.status = 'completed'),
          'cancelled', count(*) filter (where b.status = 'cancelled'),
          'customer_no_show', count(*) filter (where b.status = 'customer_no_show'),
          'total', count(*)
        ) as day_row
        from public.appointments as b
        where b.shop_id = p_shop_id and b.starts_at >= v_from_ts and b.starts_at < v_to_ts
        group by (b.starts_at at time zone v_timezone)::date
      ) as days
    ), '[]'::jsonb)
  )
  into v_demand
  from public.appointments as a
  where a.shop_id = p_shop_id
    and a.starts_at >= v_from_ts
    and a.starts_at < v_to_ts;

  -- -------------------------------------------------------------------------
  -- Value and collection. Five separate concepts, contract section 10.
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    -- Booked value: the price snapshot taken when the booking was created, for
    -- every appointment that became a real commitment. Declined and expired
    -- requests never did, so they are excluded rather than counted at zero.
    'booked_value_cents', coalesce(sum(a.booked_price_cents) filter (
      where a.status not in ('declined', 'expired')
    ), 0),
    -- Completed service value: the same snapshot, restricted to visits that
    -- actually finished. It is not money, and it is never called revenue.
    'completed_service_value_cents', coalesce(sum(a.booked_price_cents) filter (
      where a.status = 'completed'
    ), 0),
    'completed_visits', count(*) filter (where a.status = 'completed')
  )
  into v_value
  from public.appointments as a
  where a.shop_id = p_shop_id
    and a.starts_at >= v_from_ts
    and a.starts_at < v_to_ts;

  -- Collected and refunded come from the payment event ledger, never from prices.
  -- Replaying the events reproduces both numbers exactly, which is the whole point
  -- of reading events rather than the current row state.
  --
  -- Bucketed on `payment_records.paid_at`, the date the money actually changed
  -- hands, not on when staff typed the record in. That keeps collected and refunded
  -- talking about the same payments, so `net_collected` is internally consistent
  -- for a period: a refund recorded later corrects the period the collection
  -- belongs to rather than opening a hole in a different one. This is the
  -- reproducible-from-finalized-facts behaviour plan section 10 asks for.
  v_value := v_value || (
    select jsonb_build_object(
      'collected_cents', coalesce(sum(event.amount_delta_cents) filter (where event.amount_delta_cents > 0), 0),
      'refunded_cents', coalesce(-sum(event.amount_delta_cents) filter (where event.amount_delta_cents < 0), 0),
      'net_collected_cents', coalesce(sum(event.amount_delta_cents), 0),
      'payment_event_count', count(*)
    )
    from public.payment_events as event
    join public.payment_records as record on record.id = event.payment_id
    where event.shop_id = p_shop_id
      and record.paid_at >= v_from_ts
      and record.paid_at < v_to_ts
  );

  -- -------------------------------------------------------------------------
  -- Capacity
  -- -------------------------------------------------------------------------
  -- Provider minutes are the scheduled roster: a date exception wins over the
  -- weekly pattern, and everything is clipped to the shop's open window for that
  -- local date, including replacement hours on a partial closure.
  select coalesce(sum(minutes), 0)
  into v_available_provider_minutes
  from (
    select greatest(0, extract(epoch from (
      least(schedule.end_time, open_window.close_time) - greatest(schedule.start_time, open_window.open_time)
    )) / 60) as minutes
    from generate_series(p_from, p_to, interval '1 day') as day(local_date)
    cross join lateral (
      select
        coalesce(closure.replacement_open_time, hours.open_time) as open_time,
        coalesce(closure.replacement_close_time, hours.close_time) as close_time
      from public.shop_operating_hours as hours
      left join public.shop_closures as closure
        on closure.shop_id = p_shop_id and closure.local_date = day.local_date::date
      where hours.shop_id = p_shop_id
        and hours.weekday = extract(dow from day.local_date)::integer
        and not hours.closed
        and coalesce(closure.closed, false) = false
    ) as open_window
    join public.barber_employment as employment
      on employment.shop_id = p_shop_id
        and employment.status = 'active'
        and employment.ended_at is null
        and employment.hired_at <= day.local_date::date
    cross join lateral (
      select coalesce(exception.start_time, pattern.start_time) as start_time,
             coalesce(exception.end_time, pattern.end_time) as end_time
      from (select 1) as anchor
      left join public.shift_exceptions as exception
        on exception.barber_id = employment.barber_id
          and exception.shop_id = p_shop_id
          and exception.date = day.local_date::date
      left join public.shift_patterns as pattern
        on pattern.barber_id = employment.barber_id
          and pattern.shop_id = p_shop_id
          and pattern.weekday = extract(dow from day.local_date)::integer
      where coalesce(exception.is_available, true)
        and coalesce(exception.start_time, pattern.start_time) is not null
        and coalesce(exception.end_time, pattern.end_time) is not null
    ) as schedule
  ) as provider_days;

  -- Chair minutes are the physical ceiling: chairs multiplied by the open window.
  select coalesce(sum(v_shop.chair_count * greatest(0, extract(epoch from (
    open_window.close_time - open_window.open_time
  )) / 60)), 0)
  into v_available_chair_minutes
  from generate_series(p_from, p_to, interval '1 day') as day(local_date)
  cross join lateral (
    select
      coalesce(closure.replacement_open_time, hours.open_time) as open_time,
      coalesce(closure.replacement_close_time, hours.close_time) as close_time
    from public.shop_operating_hours as hours
    left join public.shop_closures as closure
      on closure.shop_id = p_shop_id and closure.local_date = day.local_date::date
    where hours.shop_id = p_shop_id
      and hours.weekday = extract(dow from day.local_date)::integer
      and not hours.closed
      and coalesce(closure.closed, false) = false
  ) as open_window;

  select coalesce(sum(a.booked_duration_min + a.booked_buffer_min), 0)
  into v_assigned_minutes
  from public.appointments as a
  where a.shop_id = p_shop_id
    and a.starts_at >= v_from_ts
    and a.starts_at < v_to_ts
    -- Assigned means a chair was actually held. A pending request had not yet
    -- consumed capacity, and a refused one never did.
    and a.status in ('confirmed', 'checked_in', 'in_progress', 'awaiting_confirmation', 'completed', 'customer_no_show', 'disputed');

  v_capacity := jsonb_build_object(
    'available_provider_minutes', v_available_provider_minutes,
    'available_chair_minutes', v_available_chair_minutes,
    'assigned_minutes', v_assigned_minutes,
    'provider_utilization', case when v_available_provider_minutes = 0 then null
      else round(v_assigned_minutes / v_available_provider_minutes, 4) end,
    'chair_utilization', case when v_available_chair_minutes = 0 then null
      else round(v_assigned_minutes / v_available_chair_minutes, 4) end,
    'rejected_demand', (
      select count(*) from public.appointments as a
      where a.shop_id = p_shop_id and a.starts_at >= v_from_ts and a.starts_at < v_to_ts
        and a.status in ('declined', 'expired')
    )
  );

  -- -------------------------------------------------------------------------
  -- Customers
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'unique_visitors', count(distinct visits.customer_id),
    'repeat_visitors', count(*) filter (where visits.completed_visits > 1),
    'repeat_rate', case when count(distinct visits.customer_id) = 0 then null
      else round(count(*) filter (where visits.completed_visits > 1)::numeric
        / count(distinct visits.customer_id), 4) end,
    'top_visitors', coalesce((
      select jsonb_agg(top_row order by (top_row->>'completed_visits')::integer desc)
      from (
        select jsonb_build_object(
          'customer_id', ranked.customer_id,
          'full_name', profile.full_name,
          'avatar_url', profile.avatar_url,
          'completed_visits', ranked.completed_visits
        ) as top_row
        from (
          select a.customer_id, count(*) as completed_visits
          from public.appointments as a
          where a.shop_id = p_shop_id and a.status = 'completed'
            and a.completed_at >= v_from_ts and a.completed_at < v_to_ts
          group by a.customer_id
          order by count(*) desc, a.customer_id
          limit 5
        ) as ranked
        join public.users as profile on profile.id = ranked.customer_id
      ) as top
    ), '[]'::jsonb)
  )
  into v_customers
  from (
    select a.customer_id, count(*) as completed_visits
    from public.appointments as a
    where a.shop_id = p_shop_id and a.status = 'completed'
      and a.completed_at >= v_from_ts and a.completed_at < v_to_ts
    group by a.customer_id
  ) as visits;

  -- -------------------------------------------------------------------------
  -- Services
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'top_services', coalesce((
      select jsonb_agg(row_out order by (row_out->>'completed_count')::integer desc)
      from (
        select jsonb_build_object(
          'service_id', a.service_id,
          'name', a.booked_service_name,
          'completed_count', count(*),
          'completed_service_value_cents', coalesce(sum(a.booked_price_cents), 0),
          'booked_duration_min', round(avg(a.booked_duration_min), 1),
          -- How far real service time drifts from the booked duration. A shop
          -- cannot fix overruns it cannot see.
          'actual_duration_min_avg', round(avg(
            extract(epoch from (a.actual_finished_at - a.actual_started_at)) / 60
          ) filter (where a.actual_started_at is not null and a.actual_finished_at is not null), 1),
          'actual_duration_min_stddev', round(coalesce(stddev_samp(
            extract(epoch from (a.actual_finished_at - a.actual_started_at)) / 60
          ) filter (where a.actual_started_at is not null and a.actual_finished_at is not null), 0), 1)
        ) as row_out
        from public.appointments as a
        where a.shop_id = p_shop_id and a.status = 'completed'
          and a.completed_at >= v_from_ts and a.completed_at < v_to_ts
        group by a.service_id, a.booked_service_name
        order by count(*) desc
        limit 8
      ) as services
    ), '[]'::jsonb),
    'failure_reason_mix', coalesce((
      select jsonb_agg(jsonb_build_object('status', status_row.status, 'count', status_row.count))
      from (
        select a.status::text as status, count(*) as count
        from public.appointments as a
        where a.shop_id = p_shop_id
          and a.starts_at >= v_from_ts and a.starts_at < v_to_ts
          and a.status in ('cancelled', 'declined', 'expired', 'customer_no_show')
        group by a.status
      ) as status_row
    ), '[]'::jsonb)
  )
  into v_services;

  -- -------------------------------------------------------------------------
  -- Staff. Shop-caused failures stay separate from customer absence.
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(row_out order by (row_out->>'completed_cuts')::integer desc)
      from (
        select jsonb_build_object(
          'provider_id', provider.barber_id,
          'full_name', profile.full_name,
          'completed_cuts', provider.completed_cuts,
          'assigned_service_minutes', provider.assigned_minutes,
          -- Deliberately three separate figures. A customer who did not arrive is
          -- not a barber's failure, and required test 8 exists to keep it that way.
          'customer_no_shows', provider.customer_no_shows,
          'shop_caused_failures', provider.shop_caused_failures,
          'repeat_customers', provider.repeat_customers,
          'rating', coalesce(barber.rating, 0),
          'rating_count', coalesce(barber.rating_count, 0),
          'attendance_present', coalesce(attendance.present, 0),
          'attendance_absent', coalesce(attendance.absent, 0),
          'punctuality_rate', case when coalesce(attendance.present, 0) + coalesce(attendance.absent, 0) = 0
            then null
            else round(coalesce(attendance.present, 0)::numeric
              / (coalesce(attendance.present, 0) + coalesce(attendance.absent, 0)), 4) end
        ) as row_out
        from (
          select
            a.barber_id,
            count(*) filter (where a.status = 'completed') as completed_cuts,
            coalesce(sum(a.booked_duration_min) filter (where a.status = 'completed'), 0) as assigned_minutes,
            count(*) filter (where a.status = 'customer_no_show') as customer_no_shows,
            count(*) filter (where a.status in ('cancelled', 'declined')) as shop_caused_failures,
            count(distinct a.customer_id) filter (where a.status = 'completed') as repeat_customers
          from public.appointments as a
          where a.shop_id = p_shop_id and a.starts_at >= v_from_ts and a.starts_at < v_to_ts
          group by a.barber_id
        ) as provider
        join public.users as profile on profile.id = provider.barber_id
        left join public.barbers as barber on barber.id = provider.barber_id
        left join (
          select record.barber_id,
            count(*) filter (where record.status = 'present') as present,
            count(*) filter (where record.status = 'absent') as absent
          from public.attendance_records as record
          where record.shop_id = p_shop_id and record.date between p_from and p_to
          group by record.barber_id
        ) as attendance on attendance.barber_id = provider.barber_id
      ) as staff
    ), '[]'::jsonb)
  )
  into v_staff;

  -- -------------------------------------------------------------------------
  -- Trust
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'shop_rating', coalesce(v_shop.rating, 0),
    'shop_rating_count', coalesce(v_shop.rating_count, 0),
    -- Every score from one to five is always present, including the empty ones,
    -- so a distribution chart cannot silently omit a bucket.
    'distribution', coalesce((
      select jsonb_agg(jsonb_build_object('score', score_value.score, 'count', (
        select count(*)
        from public.ratings as rating
        join public.rating_eligibilities as eligibility on eligibility.id = rating.eligibility_id
        where rating.shop_id = p_shop_id
          and eligibility.state <> 'void'
          and rating.shop_rating = score_value.score
      )) order by score_value.score)
      from generate_series(1, 5) as score_value(score)
    ), '[]'::jsonb),
    'reviews_in_range', (
      select count(*) from public.ratings as rating
      join public.rating_eligibilities as eligibility on eligibility.id = rating.eligibility_id
      where rating.shop_id = p_shop_id and eligibility.state <> 'void'
        and rating.created_at >= v_from_ts and rating.created_at < v_to_ts
    ),
    'hidden_text_count', (
      select count(*) from public.ratings as rating
      where rating.shop_id = p_shop_id and rating.text_state = 'hidden'
    ),
    'open_reports', (
      select count(*) from public.rating_reports as report
      where report.shop_id = p_shop_id and report.status = 'open'
    ),
    'disputes_opened', (
      select count(*) from public.support_cases as support_case
      where support_case.shop_id = p_shop_id and support_case.kind = 'appointment_dispute'
        and support_case.created_at >= v_from_ts and support_case.created_at < v_to_ts
    ),
    'disputes_escalated', (
      select count(*) from public.support_cases as support_case
      where support_case.shop_id = p_shop_id and support_case.escalated_at is not null
        and support_case.created_at >= v_from_ts and support_case.created_at < v_to_ts
    ),
    -- Median would be better but needs an ordered-set aggregate over a subquery;
    -- the average is honest as long as the label says average, which it does.
    'owner_decision_hours_avg', (
      select round(avg(extract(epoch from (support_case.owner_decided_at - support_case.created_at)) / 3600), 2)
      from public.support_cases as support_case
      where support_case.shop_id = p_shop_id and support_case.owner_decided_at is not null
        and support_case.created_at >= v_from_ts and support_case.created_at < v_to_ts
    )
  )
  into v_trust;

  -- -------------------------------------------------------------------------
  -- Walk-ins
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'total', count(*),
    'claimed', count(*) filter (where walk_in.customer_user_id is not null),
    'unclaimed', count(*) filter (where walk_in.customer_user_id is null),
    'completed', count(*) filter (where walk_in.queue_status = 'completed'),
    'cancelled', count(*) filter (where walk_in.queue_status = 'cancelled'),
    'conversion_rate', case when count(*) = 0 then null
      else round(count(*) filter (where walk_in.queue_status = 'completed')::numeric / count(*), 4) end,
    'wait_minutes_min', round(min(
      extract(epoch from (walk_in.started_at - walk_in.created_at)) / 60
    ) filter (where walk_in.started_at is not null), 1),
    'wait_minutes_avg', round(avg(
      extract(epoch from (walk_in.started_at - walk_in.created_at)) / 60
    ) filter (where walk_in.started_at is not null), 1),
    'wait_minutes_max', round(max(
      extract(epoch from (walk_in.started_at - walk_in.created_at)) / 60
    ) filter (where walk_in.started_at is not null), 1),
    'service_mix', coalesce((
      select jsonb_agg(jsonb_build_object('service_id', mix.service_id, 'name', mix.name, 'count', mix.count))
      from (
        select entry.service_id, service.name, count(*) as count
        from public.walk_in_entries as entry
        left join public.services as service on service.id = entry.service_id
        where entry.shop_id = p_shop_id
          and entry.created_at >= v_from_ts and entry.created_at < v_to_ts
        group by entry.service_id, service.name
        order by count(*) desc
        limit 8
      ) as mix
    ), '[]'::jsonb)
  )
  into v_walk_ins
  from public.walk_in_entries as walk_in
  where walk_in.shop_id = p_shop_id
    and walk_in.created_at >= v_from_ts
    and walk_in.created_at < v_to_ts;

  return jsonb_build_object(
    'shop_id', p_shop_id,
    'timezone', v_timezone,
    'from_date', p_from,
    'to_date', p_to,
    'days', v_days,
    -- The cutoff is the moment this answer was computed. Every chart shows it,
    -- so a stale tab cannot present old numbers as current ones.
    'generated_at', now(),
    'demand', v_demand,
    'value', v_value,
    'capacity', v_capacity,
    'customers', v_customers,
    'services', v_services,
    'staff', v_staff,
    'trust', v_trust,
    'walk_ins', v_walk_ins,
    -- Shipped with the numbers on purpose. The plan requires every chart to state
    -- its definition, and a definition that lives only in a comment cannot.
    'definitions', jsonb_build_object(
      'booked_value_cents', 'Sum of the price snapshot taken when each booking was created, for appointments starting in range whose request was neither declined nor expired. Not money.',
      'completed_service_value_cents', 'Sum of the same creation-time price snapshot, restricted to appointments whose status is completed. Not money, and never called revenue.',
      'collected_cents', 'Sum of positive amount deltas in the payment event ledger, for payments whose paid_at date falls in range. Offline money staff recorded as received, bucketed by when the money changed hands rather than when it was entered.',
      'refunded_cents', 'Sum of negative amount deltas in the same ledger, expressed as a positive number, for payments whose paid_at date falls in range. Money recorded as returned or voided, including a refund entered after the collection period so the period stays correct.',
      'net_collected_cents', 'Collected minus refunded, computed as the plain sum of every amount delta on payments whose paid_at date falls in range.',
      'available_provider_minutes', 'Scheduled roster minutes for active staff on each local date in range: a date exception overrides the weekly pattern, and the result is clipped to the shop open window including replacement hours.',
      'available_chair_minutes', 'Chair count multiplied by the shop open window for each local date in range.',
      'assigned_minutes', 'Booked duration plus buffer for appointments in range that actually held a chair: confirmed, checked in, in progress, awaiting confirmation, completed, customer no-show, or disputed.',
      'provider_utilization', 'Assigned minutes divided by available provider minutes. Null when no roster minutes exist in range.',
      'rejected_demand', 'Appointments in range that ended declined or expired.',
      'repeat_rate', 'Customers with more than one completed visit in range, divided by all customers with a completed visit in range.',
      'customer_no_shows', 'Visits the customer did not attend. Reported separately from shop-caused failures and never mixed into a provider performance score.',
      'shop_caused_failures', 'Visits the shop cancelled or declined. Reported separately from customer absence.',
      'punctuality_rate', 'Present attendance records divided by present plus absent records for local dates in range.',
      'distribution', 'Count of shop ratings at each score from one to five, excluding reviews whose visit is no longer a finalized fact. Hidden review text is still counted, because moderating text does not remove a score.',
      'owner_decision_hours_avg', 'Average hours between a dispute being opened and the shop deciding it, for cases opened in range.',
      'wait_minutes_avg', 'Average minutes between a walk-in being created and its service starting, for walk-ins that started in range.',
      'conversion_rate', 'Walk-ins in range that reached completed, divided by all walk-ins created in range.'
    )
  );
end;
$$;

revoke all on function public.api_shop_analytics(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.api_shop_analytics(uuid, uuid, date, date) to service_role;

-- Provider-facing performance, same separations, scoped to one provider. A barber
-- must be able to see their own numbers without reading the shop's books.
create or replace function public.api_provider_performance(
  p_provider_id uuid,
  p_shop_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_result jsonb;
begin
  select coalesce(timezone, 'Asia/Manila') into v_timezone from public.shops where id = p_shop_id;
  if v_timezone is null then
    raise exception using errcode = 'P0002', message = 'Shop not found.';
  end if;
  if p_from > p_to or p_to - p_from > 730 then
    raise exception using errcode = '22023', message = 'Unsupported range.';
  end if;
  v_from_ts := (p_from::timestamp) at time zone v_timezone;
  v_to_ts := ((p_to + 1)::timestamp) at time zone v_timezone;

  select jsonb_build_object(
    'provider_id', p_provider_id,
    'shop_id', p_shop_id,
    'from_date', p_from,
    'to_date', p_to,
    'generated_at', now(),
    'completed_cuts', count(*) filter (where a.status = 'completed'),
    'assigned_service_minutes', coalesce(sum(a.booked_duration_min) filter (where a.status = 'completed'), 0),
    'repeat_customers', (
      select count(*) from (
        select b.customer_id
        from public.appointments as b
        where b.barber_id = p_provider_id and b.shop_id = p_shop_id and b.status = 'completed'
          and b.completed_at >= v_from_ts and b.completed_at < v_to_ts
        group by b.customer_id
        having count(*) > 1
      ) as repeats
    ),
    -- Three separate lines, never one blended score.
    'customer_no_shows', count(*) filter (where a.status = 'customer_no_show'),
    'shop_cancellations', count(*) filter (where a.status = 'cancelled'),
    'owner_declines', count(*) filter (where a.status = 'declined')
  )
  into v_result
  from public.appointments as a
  where a.barber_id = p_provider_id
    and a.shop_id = p_shop_id
    and a.starts_at >= v_from_ts
    and a.starts_at < v_to_ts;

  v_result := v_result || (
    select jsonb_build_object(
      'rating', coalesce(barber.rating, 0),
      'rating_count', coalesce(barber.rating_count, 0),
      'distribution', coalesce((
        select jsonb_agg(jsonb_build_object('score', score_value.score, 'count', (
          select count(*) from public.ratings as rating
          join public.rating_eligibilities as eligibility on eligibility.id = rating.eligibility_id
          where rating.barber_id = p_provider_id and eligibility.state <> 'void'
            and rating.barber_rating = score_value.score
        )) order by score_value.score)
        from generate_series(1, 5) as score_value(score)
      ), '[]'::jsonb)
    )
    from public.barbers as barber where barber.id = p_provider_id
  );

  v_result := v_result || (
    select jsonb_build_object(
      'attendance_present', count(*) filter (where record.status = 'present'),
      'attendance_absent', count(*) filter (where record.status = 'absent'),
      'punctuality_rate', case when count(*) = 0 then null
        else round(count(*) filter (where record.status = 'present')::numeric / count(*), 4) end
    )
    from public.attendance_records as record
    where record.barber_id = p_provider_id and record.shop_id = p_shop_id
      and record.date between p_from and p_to
  );

  return v_result || jsonb_build_object(
    'definitions', jsonb_build_object(
      'completed_cuts', 'Appointments assigned to you in range whose status is completed.',
      'customer_no_shows', 'Visits the customer did not attend. Shown separately and never counted against your performance.',
      'shop_cancellations', 'Visits the shop cancelled. Shown separately from customer absence.',
      'punctuality_rate', 'Present attendance records divided by all attendance records for local dates in range.'
    )
  );
end;
$$;

revoke all on function public.api_provider_performance(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.api_provider_performance(uuid, uuid, date, date) to service_role;
