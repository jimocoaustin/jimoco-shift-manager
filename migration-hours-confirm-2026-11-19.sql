-- 근무시간 확인 (2026-11-19, Jay Kim 승인, v42)
-- 세미먼슬리 기간(1–15일 / 16일–말일)마다 직원이 본인 근무시간이 맞는지 확인한다.
-- 1) hours_confirmations : 직원·기간별 확인 결과 ('ok' 맞아요 / 'wrong' 틀린 게 있어요 + 메모)
-- 2) emp_confirm_hours / emp_period_status : 직원 PIN 확인 후 저장·조회
--    PIN 검증은 기존 check_emp_pin (본인 PIN 또는 마스터 PIN) 재사용 — emp_history·emp_update_shift 와 같은 방식
-- 3) admin_hours_confirmations : 관리자 세션(오너·매니저)에서 기간별 목록
-- 추가만 함. Supabase SQL Editor에 전체 붙여넣고 Run 한 번이면 됩니다.

create table if not exists hours_confirmations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('ok', 'wrong')),
  note text,
  total_minutes int,
  confirmed_at timestamptz default now(),
  unique (employee_id, period_start)
);
alter table hours_confirmations enable row level security;

create or replace function emp_confirm_hours(p_emp uuid, p_pin text, p_start date, p_end date,
  p_status text, p_note text, p_total_minutes int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin) then return false; end if;
  if p_status not in ('ok', 'wrong') or p_start is null or p_end is null then return false; end if;
  insert into hours_confirmations(employee_id, period_start, period_end, status, note, total_minutes, confirmed_at)
  values (p_emp, p_start, p_end, p_status, nullif(left(coalesce(p_note, ''), 500), ''), p_total_minutes, now())
  on conflict (employee_id, period_start) do update set
    period_end = excluded.period_end, status = excluded.status, note = excluded.note,
    total_minutes = excluded.total_minutes, confirmed_at = now();
  return true;
end $$;

create or replace function emp_period_status(p_emp uuid, p_pin text, p_start date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin) then return null; end if;
  return (select row_to_json(x) from (
    select employee_id, period_start, period_end, status, note, total_minutes, confirmed_at
    from hours_confirmations where employee_id = p_emp and period_start = p_start) x);
end $$;

create or replace function admin_hours_confirmations(p_token text, p_start date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) is null then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select employee_id, period_start, period_end, status, note, total_minutes, confirmed_at
    from hours_confirmations where period_start = p_start) x);
end $$;

grant execute on function emp_confirm_hours(uuid, text, date, date, text, text, int) to anon;
grant execute on function emp_period_status(uuid, text, date) to anon;
grant execute on function admin_hours_confirmations(text, date) to anon;

notify pgrst, 'reload schema';
