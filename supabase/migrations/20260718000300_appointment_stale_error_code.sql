-- 40001 is PostgreSQL's serialization-failure code and may be retried by
-- infrastructure. Lifecycle version conflicts are ordinary application
-- conflicts, so give already-installed functions the dedicated P4090 code.

do $$
declare
  function_definition text;
  function_oid oid;
begin
  for function_oid in
    select procedure.oid
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'api_transition_appointment',
        'api_issue_appointment_check_in_code',
        'api_reschedule_appointment'
      )
  loop
    function_definition := pg_get_functiondef(function_oid);
    if function_definition like '%40001%' then
      execute replace(function_definition, '40001', 'P4090');
    end if;
  end loop;
end;
$$;
