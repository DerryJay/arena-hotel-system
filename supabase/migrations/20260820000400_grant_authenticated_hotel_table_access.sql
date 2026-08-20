grant usage on schema public to authenticated;

grant select on table public.hotels to authenticated;
grant select on table public.staff_profiles to authenticated;
grant select on table public.room_types to authenticated;
grant select on table public.rooms to authenticated;
grant select on table public.guests to authenticated;
grant select on table public.reservations to authenticated;
grant select on table public.housekeeping_tasks to authenticated;
grant select on table public.folio_charges to authenticated;
grant select on table public.payments to authenticated;

grant update on table public.hotels to authenticated;

grant insert, update, delete on table public.staff_profiles to authenticated;
grant insert, update, delete on table public.room_types to authenticated;
grant insert, update, delete on table public.rooms to authenticated;
grant insert, update, delete on table public.guests to authenticated;
grant insert, update, delete on table public.reservations to authenticated;
grant insert, update, delete on table public.housekeeping_tasks to authenticated;

grant insert on table public.folio_charges to authenticated;
grant insert on table public.payments to authenticated;
