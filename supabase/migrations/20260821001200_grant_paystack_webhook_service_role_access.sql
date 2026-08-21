grant usage on schema public to service_role;

grant select, update on table public.payments to service_role;

grant select on table public.reservations to service_role;
