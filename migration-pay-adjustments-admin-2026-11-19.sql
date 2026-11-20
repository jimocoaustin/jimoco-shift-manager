-- 급여명세서에 추가 시간 자동 반영 (2026-11-19, Jay Kim "자동으로 더해줘", v47)
-- 오너 세션에서 기간에 걸친 pay_adjustments 목록을 읽는다. 추가만 함.

create or replace function admin_pay_adjustments(p_token text, p_start date, p_end date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mgr_role(p_token), '') <> 'owner' then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select employee_id, period_start, period_end, minutes, note from pay_adjustments
    where period_start <= p_end and period_end >= p_start) x);
end $$;
grant execute on function admin_pay_adjustments(text, date, date) to anon;

notify pgrst, 'reload schema';
