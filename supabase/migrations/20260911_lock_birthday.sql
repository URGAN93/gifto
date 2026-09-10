-- Run once in Supabase Dashboard > SQL Editor to make a saved birthday immutable.
create or replace function public.prevent_birth_date_change()
returns trigger language plpgsql as $$
begin
  if old.birth_date is not null and new.birth_date is distinct from old.birth_date then
    raise exception 'birth_date is immutable once set';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_birth_date_immutable on public.profiles;
create trigger profiles_birth_date_immutable
before update on public.profiles
for each row execute procedure public.prevent_birth_date_change();
