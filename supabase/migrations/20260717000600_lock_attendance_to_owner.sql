-- Attendance is owner-controlled. Only the shop owner may record or edit
-- attendance rows; barbers keep read access to their own attendance via the
-- unchanged attendance_select_staff policy. This keeps the database boundary in
-- parity with the Express service-role checks (which are the authoritative gate).

drop policy if exists attendance_insert_staff on public.attendance_records;
drop policy if exists attendance_insert_owner on public.attendance_records;
create policy attendance_insert_owner
  on public.attendance_records for insert to authenticated
  with check (private.owns_shop(shop_id) and recorded_by = (select auth.uid()));

drop policy if exists attendance_update_staff on public.attendance_records;
drop policy if exists attendance_update_owner on public.attendance_records;
create policy attendance_update_owner
  on public.attendance_records for update to authenticated
  using (private.owns_shop(shop_id))
  with check (private.owns_shop(shop_id));

drop policy if exists attendance_delete_staff on public.attendance_records;
drop policy if exists attendance_delete_owner on public.attendance_records;
create policy attendance_delete_owner
  on public.attendance_records for delete to authenticated
  using (private.owns_shop(shop_id));

-- The recorder must be the shop owner (previously a barber could self-record).
create or replace function private.validate_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.barber_employment as e
    where e.id = new.employment_id
      and e.barber_id = new.barber_id
      and e.shop_id = new.shop_id
      and e.hired_at is not null
      and new.date >= e.hired_at
      and (e.ended_at is null or new.date <= e.ended_at)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Attendance date is outside the employment period.';
  end if;

  if not private.owns_shop(new.shop_id, new.recorded_by) then
    raise exception using
      errcode = '23514',
      message = 'Attendance can only be recorded by the shop owner.';
  end if;

  return new;
end;
$$;
