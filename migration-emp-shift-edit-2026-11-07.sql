-- 직원 본인 근무 기록 수정 (2026-11-07, Jay Kim 요청)
-- 직원이 출퇴근 시간을 잘못 입력했을 때, 기록 화면(PIN 확인済)에서 본인 기록의
-- 날짜·출근·퇴근 시간과 풀타임/저녁 시작 시간을 직접 수정할 수 있게 한다.
-- PIN 검증은 기존 check_emp_pin (본인 PIN 또는 마스터 PIN) 재사용.
-- 본인(employee_id 일치) 기록만 수정 가능. 팁·부스터·휴일수당 값은 건드리지 않는다
-- (부스터는 급여 계산 때 시간 기준으로 재산정됨).
-- Supabase SQL Editor에 전체 붙여넣고 Run 한 번이면 됩니다.

create or replace function emp_update_shift(p_emp uuid, p_pin text, p_id uuid, p_row jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin) then return false; end if;
  update shifts set
    work_date = coalesce((p_row->>'work_date')::date, work_date),
    clock_in = coalesce((p_row->>'clock_in')::timestamptz, clock_in),
    clock_out = coalesce((p_row->>'clock_out')::timestamptz, clock_out),
    is_fulltime = case when p_row ? 'is_fulltime'
                       then (p_row->>'is_fulltime')::boolean else is_fulltime end,
    evening_start = case when p_row ? 'evening_start'
                         then nullif(p_row->>'evening_start', '')::timestamptz else evening_start end
  where id = p_id and employee_id = p_emp;
  return found;
end $$;

grant execute on function emp_update_shift(uuid, text, uuid, jsonb) to anon;

notify pgrst, 'reload schema';
