-- RLS bypass and SQL privileges are separate Postgres controls. The Express
-- client authenticates as service_role, so explicitly grant the CRUD surface
-- used by the server while keeping anon/authenticated on the narrower grants
-- defined in the RLS migration.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
