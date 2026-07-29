-- Apply truthful superseded status after the enum addition committed in the
-- preceding migration. The event trigger also protects future command changes
-- that emit request_superseded after first marking a request expired.

create or replace function private.align_superseded_employment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'request_superseded' and new.request_id is not null then
    update public.employment_requests
       set status = 'superseded',
           updated_at = now()
     where id = new.request_id
       and status = 'expired';
  end if;

  return new;
end;
$$;

revoke all on function private.align_superseded_employment_request()
  from public, anon, authenticated;

drop trigger if exists employment_events_align_superseded
  on public.employment_events;
create trigger employment_events_align_superseded
  after insert on public.employment_events
  for each row execute function private.align_superseded_employment_request();

update public.employment_requests as request
   set status = 'superseded',
       updated_at = greatest(request.updated_at, event.created_at)
  from public.employment_events as event
 where event.request_id = request.id
   and event.event_type = 'request_superseded'
   and request.status = 'expired';
