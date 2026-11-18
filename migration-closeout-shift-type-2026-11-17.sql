-- 마감 정산 쉬프트 유형 (2026-11-17, Jay Kim 확정, v37)
-- 마감 정산(register_closeouts)에도 쉬프트 기록과 같은 유형(오픈/마감/마감 같이)을 남긴다.
-- 같은 직원·같은 날 정산이 여러 건일 때 어떤 쉬프트의 정산인지 구분하는 표시용 라벨. 급여·팁·부스터 계산에는 쓰지 않는다.
-- 1) register_closeouts.shift_type 컬럼 추가 ('open' / 'close' / 'close_together', 옛 정산은 null)
-- 2) staff_upsert_closeout 가 shift_type 을 저장하도록 교체
--    (기준: migration-till-withdrawals-2026-11-10.sql 정의 = 11/17 라이브 정의, shift_type 두 줄만 추가)
--    수정할 때 shift_type 이 안 오면(옛 화면 캐시) 기존 값을 유지한다.
-- admin_closeouts·staff_day_closeouts 는 c.* 를 돌려주므로 따로 고치지 않아도 shift_type 이 목록에 나온다.
-- Supabase SQL Editor에 전체 붙여넣고 Run 한 번이면 됩니다.

alter table register_closeouts add column if not exists shift_type text;

create or replace function staff_upsert_closeout(p_row jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_row->>'id', '')::uuid;
begin
  if v_id is not null then
    update register_closeouts set
      employee_id = (p_row->>'employee_id')::uuid,
      employee_id2 = nullif(p_row->>'employee_id2', '')::uuid,
      work_date = (p_row->>'work_date')::date,
      total_sales_cents = (p_row->>'total_sales_cents')::int,
      cash_sales_cents = (p_row->>'cash_sales_cents')::int,
      tips_cents = (p_row->>'tips_cents')::int,
      counted_cents = (p_row->>'counted_cents')::int,
      expected_cents = (p_row->>'expected_cents')::int,
      diff_cents = (p_row->>'diff_cents')::int,
      opening_cents = (p_row->>'opening_cents')::int,
      purchases_cents = coalesce((p_row->>'purchases_cents')::int, 0),
      purchase_note = nullif(p_row->>'purchase_note', ''),
      withdrawal_cents = coalesce((p_row->>'withdrawal_cents')::int, 0),
      shift_type = coalesce(nullif(p_row->>'shift_type', ''), shift_type),
      count_100 = coalesce((p_row->>'count_100')::int, 0),
      count_50 = coalesce((p_row->>'count_50')::int, 0),
      count_20 = coalesce((p_row->>'count_20')::int, 0),
      count_10 = coalesce((p_row->>'count_10')::int, 0),
      count_5 = coalesce((p_row->>'count_5')::int, 0),
      count_2 = coalesce((p_row->>'count_2')::int, 0),
      count_1 = coalesce((p_row->>'count_1')::int, 0),
      count_25c = coalesce((p_row->>'count_25c')::int, 0)
    where id = v_id;
    if found then return true; end if;
  end if;
  insert into register_closeouts(employee_id, employee_id2, work_date, total_sales_cents, cash_sales_cents,
    tips_cents, counted_cents, expected_cents, diff_cents, opening_cents, purchases_cents, purchase_note,
    withdrawal_cents, shift_type,
    count_100, count_50, count_20, count_10, count_5, count_2, count_1, count_25c)
  values ((p_row->>'employee_id')::uuid, nullif(p_row->>'employee_id2', '')::uuid, (p_row->>'work_date')::date,
    (p_row->>'total_sales_cents')::int, (p_row->>'cash_sales_cents')::int,
    (p_row->>'tips_cents')::int, (p_row->>'counted_cents')::int,
    (p_row->>'expected_cents')::int, (p_row->>'diff_cents')::int,
    (p_row->>'opening_cents')::int,
    coalesce((p_row->>'purchases_cents')::int, 0), nullif(p_row->>'purchase_note', ''),
    coalesce((p_row->>'withdrawal_cents')::int, 0), nullif(p_row->>'shift_type', ''),
    coalesce((p_row->>'count_100')::int, 0), coalesce((p_row->>'count_50')::int, 0),
    coalesce((p_row->>'count_20')::int, 0), coalesce((p_row->>'count_10')::int, 0),
    coalesce((p_row->>'count_5')::int, 0), coalesce((p_row->>'count_2')::int, 0),
    coalesce((p_row->>'count_1')::int, 0), coalesce((p_row->>'count_25c')::int, 0));
  return true;
end $$;

grant execute on function staff_upsert_closeout(jsonb) to anon;

notify pgrst, 'reload schema';
