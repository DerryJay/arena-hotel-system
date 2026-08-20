create or replace function public.get_current_staff_hotel_access()
returns table (
  id uuid,
  hotel_id uuid,
  full_name text,
  role public.staff_role,
  is_active boolean,
  hotel_slug text,
  hotel_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    staff_profiles.id,
    staff_profiles.hotel_id,
    staff_profiles.full_name,
    staff_profiles.role,
    staff_profiles.is_active,
    hotels.slug,
    hotels.name
  from public.staff_profiles
  join public.hotels on hotels.id = staff_profiles.hotel_id
  where staff_profiles.id = auth.uid()
  limit 1
$$;

revoke all on function public.get_current_staff_hotel_access() from public;
grant execute on function public.get_current_staff_hotel_access() to authenticated;
