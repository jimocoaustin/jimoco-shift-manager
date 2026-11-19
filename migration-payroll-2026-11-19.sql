-- 급여명세서 (2026-11-19, Jay Kim 요청, v41)
-- 회계사 명세서처럼 수표 + 명세서 2장을 앱에서 만들기 위한 저장소. 추가만 함 (기존 테이블·함수는 건드리지 않음).
-- 1) payroll_profiles : 명세서용 직원 정보 (이름·주소·월급제 금액·EI/CPP 면제·연초 이후 누계 YTD)
--    employee_id 는 비어 있어도 됨 (근무 기록이 없는 월급제 직원).
--    ytd = {"wage","bonus","vac","cpp","ei","tax","net"} 달러 단위, ytd_as_of 날짜까지의 누계 (회계사 명세서 기준)
-- 2) payroll_runs : 확정 저장한 기간별 명세서 숫자 (data jsonb, 달러 단위). 같은 기간을 다시 확정하면 덮어씀.
-- 접근은 오너 세션 RPC로만 (RLS 켜고 정책 없음 = anon 직접 접근 불가).
-- Supabase SQL Editor에 전체 붙여넣고 Run 한 번이면 됩니다.

create table if not exists payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  name text not null,
  address text,
  salary_cents int,
  ei_exempt boolean default false,
  cpp_exempt boolean default false,
  ytd_as_of date,
  ytd jsonb default '{}'::jsonb,
  active boolean default true,
  created_at timestamptz default now()
);
alter table payroll_profiles enable row level security;

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  cheque_date date,
  profile_id uuid not null references payroll_profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (period_start, period_end, profile_id)
);
alter table payroll_runs enable row level security;

create or replace function admin_payroll_profiles(p_token text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select id, employee_id, name, address, salary_cents, ei_exempt, cpp_exempt, ytd_as_of, ytd, active
    from payroll_profiles order by active desc, name) x);
end $$;

create or replace function admin_save_payroll_profile(p_token text, p_id uuid, p_row jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return json_build_object('ok', false); end if;
  if p_id is null then
    insert into payroll_profiles(employee_id, name, address, salary_cents, ei_exempt, cpp_exempt, ytd_as_of, ytd, active)
    values (nullif(p_row->>'employee_id', '')::uuid, p_row->>'name', p_row->>'address',
            nullif(p_row->>'salary_cents', '')::int,
            coalesce((p_row->>'ei_exempt')::boolean, false), coalesce((p_row->>'cpp_exempt')::boolean, false),
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
      ytd_as_of = nullif(p_row->>'ytd_as_of', '')::date,
      ytd = coalesce(p_row->'ytd', '{}'::jsonb),
      active = coalesce((p_row->>'active')::boolean, true)
    where id = v_id;
    if not found then return json_build_object('ok', false); end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function admin_payroll_runs(p_token text, p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select id, period_start, period_end, cheque_date, profile_id, data, created_at
    from payroll_runs
    where period_start <= p_to and period_end >= p_from
    order by period_start, profile_id) x);
end $$;

-- 한 기간 확정 저장: 그 기간(period_start·period_end 동일) 기록을 지우고 새로 넣는다.
-- p_rows = [{"profile_id": "...", "data": {...}}, ...]
create or replace function admin_save_payroll_run(p_token text, p_start date, p_end date, p_cheque_date date, p_rows jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return false; end if;
  if p_start is null or p_end is null or jsonb_typeof(p_rows) <> 'array' then return false; end if;
  delete from payroll_runs where period_start = p_start and period_end = p_end;
  insert into payroll_runs(period_start, period_end, cheque_date, profile_id, data)
  select p_start, p_end, p_cheque_date, (r->>'profile_id')::uuid, coalesce(r->'data', '{}'::jsonb)
  from jsonb_array_elements(p_rows) r;
  return true;
end $$;

grant execute on function admin_payroll_profiles(text) to anon;
grant execute on function admin_save_payroll_profile(text, uuid, jsonb) to anon;
grant execute on function admin_payroll_runs(text, date, date) to anon;
grant execute on function admin_save_payroll_run(text, date, date, date, jsonb) to anon;

notify pgrst, 'reload schema';
