-- 주 24시간 제한 직원 (2026-11-19, Jay Kim, v43)
-- weekend_cap = true 이면 명세서 시간 = 기간 안의 금·토·일 × 8시간, 나머지 시간 × 시급은 보너스로 지급 (Anil).
-- 추가만 함: 컬럼 1개 + 기존 급여 정보 RPC 2개에 weekend_cap 반영.

alter table payroll_profiles add column if not exists weekend_cap boolean default false;

create or replace function admin_payroll_profiles(p_token text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select id, employee_id, name, address, salary_cents, ei_exempt, cpp_exempt, weekend_cap, ytd_as_of, ytd, active
    from payroll_profiles order by active desc, name) x);
end $$;

create or replace function admin_save_payroll_profile(p_token text, p_id uuid, p_row jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return json_build_object('ok', false); end if;
  if p_id is null then
    insert into payroll_profiles(employee_id, name, address, salary_cents, ei_exempt, cpp_exempt, weekend_cap, ytd_as_of, ytd, active)
    values (nullif(p_row->>'employee_id', '')::uuid, p_row->>'name', p_row->>'address',
            nullif(p_row->>'salary_cents', '')::int,
            coalesce((p_row->>'ei_exempt')::boolean, false), coalesce((p_row->>'cpp_exempt')::boolean, false),
            coalesce((p_row->>'weekend_cap')::boolean, false),
            nullif(p_row->>'ytd_as_of', '')::date, coalesce(p_row->'ytd', '{}'::jsonb),
            coalesce((p_row->>'active')::boolean, true))
    returning id into v_id;
  else
    v_id := p_id;
    update payroll_profiles set
      employee_id = nullif(p_row->>'employee_id', '')::uuid,
      name = p_row->>'name',
      address = p_row->>'address',
      salary_cents = nullif(p_row->>'salary_cents', '')::int,
      ei_exempt = coalesce((p_row->>'ei_exempt')::boolean, false),
      cpp_exempt = coalesce((p_row->>'cpp_exempt')::boolean, false),
      weekend_cap = coalesce((p_row->>'weekend_cap')::boolean, false),
      ytd_as_of = nullif(p_row->>'ytd_as_of', '')::date,
      ytd = coalesce(p_row->'ytd', '{}'::jsonb),
      active = coalesce((p_row->>'active')::boolean, true)
    where id = v_id;
    if not found then return json_build_object('ok', false); end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

update payroll_profiles set weekend_cap = true where name = 'Anil Shrestha';

notify pgrst, 'reload schema';
