-- BeautyContent AI Phase 02.3A: business profile and services foundation

alter table public.businesses
  add column if not exists brand_advantages text,
  add column if not exists preferred_phrases text,
  add column if not exists forbidden_phrases text;

do $$
declare
  duplicate_users text;
begin
  select string_agg(user_id::text, ', ' order by user_id::text)
  into duplicate_users
  from (
    select user_id
    from public.businesses
    group by user_id
    having count(*) > 1
  ) duplicates;

  if duplicate_users is not null then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce one business per user: duplicate businesses exist for user_id values: ' || duplicate_users,
      hint = 'Review and resolve the duplicate business rows manually, then re-run this migration.';
  end if;
end
$$;

create unique index if not exists businesses_user_id_unique
  on public.businesses (user_id);

create index if not exists services_business_id_idx
  on public.services (business_id);
