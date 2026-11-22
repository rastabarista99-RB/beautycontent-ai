create table public.generation_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date_utc date not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  primary key (user_id, usage_date_utc)
);

alter table public.generation_daily_usage enable row level security;

revoke all on table public.generation_daily_usage from public, anon, authenticated, service_role;

create or replace function public.reserve_daily_generation_attempt()
returns table (
  allowed boolean,
  remaining_attempts integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_usage_date date := (statement_timestamp() at time zone 'UTC')::date;
  v_reset_at timestamptz := ((v_usage_date + 1)::timestamp at time zone 'UTC');
  v_attempts integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to reserve a generation attempt.'
      using errcode = '42501';
  end if;

  insert into public.generation_daily_usage as daily_usage (
    user_id,
    usage_date_utc,
    attempts
  )
  values (v_user_id, v_usage_date, 1)
  on conflict (user_id, usage_date_utc)
  do update
    set attempts = daily_usage.attempts + 1
    where daily_usage.attempts < 5
  returning daily_usage.attempts into v_attempts;

  if found then
    return query select true, 5 - v_attempts, v_reset_at;
    return;
  end if;

  select daily_usage.attempts
  into v_attempts
  from public.generation_daily_usage as daily_usage
  where daily_usage.user_id = v_user_id
    and daily_usage.usage_date_utc = v_usage_date;

  if not found then
    raise exception 'The daily generation reservation could not be read.'
      using errcode = '40001';
  end if;

  return query select false, 0, v_reset_at;
end;
$function$;

alter function public.reserve_daily_generation_attempt() owner to postgres;

revoke all on function public.reserve_daily_generation_attempt() from public, anon, service_role;
grant execute on function public.reserve_daily_generation_attempt() to authenticated;

comment on table public.generation_daily_usage is
  'Internal UTC-day counter for reserved AI generation attempts.';

comment on function public.reserve_daily_generation_attempt() is
  'Atomically reserves one of five daily generation attempts for auth.uid().';
