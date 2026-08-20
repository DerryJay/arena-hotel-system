alter table public.reservations
add column booking_reference text;

create unique index reservations_booking_reference_key
on public.reservations(booking_reference)
where booking_reference is not null;

create or replace function public.generate_booking_reference()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := '3DH-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4));
    exit when not exists (
      select 1
      from public.reservations
      where booking_reference = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.set_reservation_booking_reference()
returns trigger
language plpgsql
as $$
begin
  if new.booking_reference is null or btrim(new.booking_reference) = '' then
    new.booking_reference := public.generate_booking_reference();
  end if;

  return new;
end;
$$;

create trigger reservations_set_booking_reference
before insert on public.reservations
for each row execute function public.set_reservation_booking_reference();
