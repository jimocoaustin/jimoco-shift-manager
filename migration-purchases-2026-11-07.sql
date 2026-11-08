-- 마감 정산 물품 구매비 (2026-11-07, Jay Kim 요청)
-- 재료가 떨어져 직원이 돈통에서 물품을 구매한 금액을 정산에 입력할 수 있게 한다.
-- 1) purchases_cents(구매비), purchase_note(구매 품목 메모) 컬럼 추가
-- 2) staff_upsert_closeout 가 두 값을 저장하도록 교체 (기준: migration-opening-cash-2026-11-01.sql 최신본)
-- 예상 금액 = 시작 캐쉬 + 현금 매출 − 구매비 (앱에서 계산해 expected_cents 로 저장)
-- Supabase SQL Editor에 전체 붙여넣고 Run 한 번이면 됩니다.

alter table register_closeouts add column if not exists purchases_cents int not null default 0;
alter table register_closeouts add column if not exists purchase_note text;

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
    count_100, count_50, count_20, count_10, count_5, count_2, count_1, count_25c)
  values ((p_row->>'employee_id')::uuid, nullif(p_row->>'employee_id2', '')::uuid, (p_row->>'work_date')::date,
    (p_row->>'total_sales_cents')::int, (p_row->>'cash_sales_cents')::int,
    (p_row->>'tips_cents')::int, (p_row->>'counted_cents')::int,
    (p_row->>'expected_cents')::int, (p_row->>'diff_cents')::int,
    (p_row->>'opening_cents')::int,
    coalesce((p_row->>'purchases_cents')::int, 0), nullif(p_row->>'purchase_note', ''),
    coalesce((p_row->>'count_100')::int, 0), coalesce((p_row->>'count_50')::int, 0),
    coalesce((p_row->>'count_20')::int, 0), coalesce((p_row->>'count_10')::int, 0),
    coalesce((p_row->>'count_5')::int, 0), coalesce((p_row->>'count_2')::int, 0),
    coalesce((p_row->>'count_1')::int, 0), coalesce((p_row->>'count_25c')::int, 0));
  return true;
end $$;

grant execute on function staff_upsert_closeout(jsonb) to anon;

notify pgrst, 'reload schema';
