-- 다음 급여에 더해 줄 시간 안내 (2026-11-19, Jay Kim 요청, v46)
-- 직원이 근무 입력 화면을 열면 본인 몫 안내가 보인다 (예: Ethan 11/16–30 급여에 추가 지급).
-- 추가만 함: 테이블 1개 + 직원용 RPC 1개.

create table if not exists pay_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  period_start date not null,      -- 이 시간을 더해 줄 급여 기간
  period_end date not null,
  minutes int not null,            -- 더해 줄 시간 (분)
  note text,                       -- 직원에게 보이는 설명
  created_at timestamptz default now()
);
alter table pay_adjustments enable row level security;

-- 본인 PIN이 맞거나(PIN이 아직 없는 직원은 PIN 없이) 지급 기간 끝 + 7일까지 보여줌
create or replace function emp_pay_adjustments(p_emp uuid, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin)
     and exists(select 1 from employee_private where employee_id = p_emp and coalesce(pin, '') <> '') then
    return null;
  end if;
  return (select coalesce(json_agg(row_to_json(x) order by x.period_start), '[]'::json) from (
    select period_start, period_end, minutes, note from pay_adjustments
    where employee_id = p_emp and current_date <= period_end + 7) x);
end $$;
grant execute on function emp_pay_adjustments(uuid, text) to anon;

-- Ethan: 11/8·10·13·15 근무 26:40 − 11/4 잘못 지급된 5:10 = 21:30 → 11/16–30 급여에 추가
insert into pay_adjustments(employee_id, period_start, period_end, minutes, note)
select id, '2026-11-16', '2026-11-30', 1290,
  'Added to your Nov 16–30 paycheck: 21h 30m. Your Nov 8, 10, 13 and 15 shifts (26h 40m) were missing from the Nov 1–15 timesheet. The 5h 10m on Nov 4 was entered by mistake and was already paid, so it is taken off: 26h 40m − 5h 10m = 21h 30m.'
from employees where name ilike 'ethan%'
  and not exists (select 1 from pay_adjustments a where a.employee_id = employees.id and a.period_start = '2026-11-16');

notify pgrst, 'reload schema';
