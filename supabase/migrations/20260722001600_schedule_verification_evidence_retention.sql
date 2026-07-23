-- Raw professional-verification evidence is retained for 90 days after any
-- final decision, then becomes eligible for the two-phase purge worker. The
-- trigger keeps approval, rejection, and withdrawal commands consistent even
-- when their implementations evolve independently.
create or replace function private.schedule_verification_evidence_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('approved', 'rejected', 'withdrawn')
     and old.status is distinct from new.status then
    update public.verification_documents
    set purge_after = now() + interval '90 days',
        version = version + 1
    where submission_id = new.id
      and status <> 'purged'
      and purge_after is null;
  end if;
  return new;
end;
$$;

revoke all on function private.schedule_verification_evidence_retention()
  from public, anon, authenticated, service_role;

drop trigger if exists verification_submissions_schedule_evidence_retention
  on public.verification_submissions;
create trigger verification_submissions_schedule_evidence_retention
after update of status on public.verification_submissions
for each row execute function private.schedule_verification_evidence_retention();
