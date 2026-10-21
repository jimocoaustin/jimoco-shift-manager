-- ============================================================
-- Jimoco Shift Standalone - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- (2026-10-20 보안 강화 반영: 개인정보 분리, 매니저 비밀번호 해시,
--  설정/계정은 RPC로만 접근, anon 직접 읽기는 기본 정보만 허용)
-- ============================================================

create extension if not exists "pgcrypto";

-- 직원 (기본 정보만 — 개인정보는 employee_private에 분리)
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text check (role in ('kitchen','server')),
  has_pin boolean default false,
  active boolean default true,
  pending boolean default false,
  created_at timestamptz default now()
);

-- 직원 개인정보 (RLS 정책 없음 = anon 접근 불가, RPC로만)
create table if not exists employee_private (
  employee_id uuid primary key references employees(id) on delete cascade,
  email text,
  phone text,
  address text,
  sin text,
  birthday date,
  first_shift_date date,
  hourly_rate_cents int,
  pin text
);
alter table employee_private enable row level security;

-- 근무 기록
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  work_date date,
  clock_in timestamptz,
  clock_out timestamptz,
  tips_cents int default 0,
  booster_cents int default 0,
  holiday_cents int default 0,
  is_fulltime boolean not null default false,  -- 풀타임 체크 (서버): evening_start~퇴근 구간만 부스터
  evening_start timestamptz,                   -- 저녁 쉬프트 시작 (부스터 구간 시작)
  created_at timestamptz default now()
);

-- 설정 (관리자 PIN 등) — 직접 접근 불가, RPC로만
create table if not exists settings (
  key text primary key,
  value text
);

-- 초기값은 플레이스홀더입니다. 배포 후 앱의 비밀번호 관리에서 실제 값으로 바꾸세요.
insert into settings (key, value) values ('manager_pin', 'CHANGE_ME') on conflict (key) do nothing;
insert into settings (key, value) values ('screen_password', 'CHANGE_ME') on conflict (key) do nothing;
insert into settings (key, value) values ('owner_username', 'jun') on conflict (key) do nothing;

-- 매니저 계정 (비밀번호는 bcrypt 해시로만 저장 — 앱/RPC가 crypt() 처리)
create table if not exists managers (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password text not null,
  email text,
  active boolean default true,
  created_at timestamptz default now()
);
alter table managers enable row level security;

-- 매니저 로그인 세션 (RPC가 발급, anon 접근 불가)
create table if not exists manager_sessions (
  token text primary key,
  username text not null,
  role text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table manager_sessions enable row level security;

-- 비밀번호 찾기 인증 코드 (10분 유효, 1회용) — 직접 접근 불가, RPC + 메일러만
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean default false,
  emailed boolean default false,
  created_at timestamptz default now()
);
alter table password_resets enable row level security;

-- 보안 이벤트 (비밀번호 실패 기록) — insert만 허용
create table if not exists security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  ip text,
  user_agent text,
  created_at timestamptz default now()
);
alter table security_events enable row level security;

-- 마감 정산 (서버 register close-out)
create table if not exists register_closeouts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  work_date date not null,
  total_sales_cents int default 0,
  cash_sales_cents int default 0,
  tips_cents int default 0,
  count_100 int default 0,
  count_50 int default 0,
  count_20 int default 0,
  count_10 int default 0,
  count_5 int default 0,
  count_2 int default 0,
  count_1 int default 0,
  count_25c int default 0,
  counted_cents int default 0,
  expected_cents int default 0,
  diff_cents int default 0,
  created_at timestamptz default now(),
  unique(employee_id, work_date)
);
alter table register_closeouts enable row level security;

alter table employees enable row level security;
alter table shifts enable row level security;
alter table settings enable row level security;

-- ---------- 4) RPC 함수들 ----------
create or replace function mgr_role(p_token text) returns text
language sql security definer set search_path = public as
$$ select role from manager_sessions where token = p_token and expires_at > now() $$;

create or replace function check_screen_password(p_pw text) returns boolean
language sql security definer set search_path = public as
$$ select exists(select 1 from settings where key = 'screen_password' and value = p_pw) $$;

create or replace function app_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public as $$
declare v_role text; v_user text; v_tok text; v_active boolean;
begin
  if coalesce(p_username, '') = '' or
     p_username = (select value from settings where key = 'owner_username') then
    if p_password = (select value from settings where key = 'manager_pin') then
      v_role := 'owner';
      v_user := (select value from settings where key = 'owner_username');
    end if;
  end if;
  if v_role is null and coalesce(p_username, '') <> '' then
    select m.active into v_active from managers m
     where m.username = p_username and m.password = crypt(p_password, m.password);
    if v_active is not null then
      if v_active then
        v_role := 'manager'; v_user := p_username;
      else
        return json_build_object('ok', false, 'pending', true);
      end if;
    end if;
  end if;
  if v_role is null then
    return json_build_object('ok', false);
  end if;
  v_tok := encode(gen_random_bytes(24), 'hex');
  insert into manager_sessions(token, username, role, expires_at)
  values (v_tok, v_user, v_role, now() + interval '12 hours');
  return json_build_object('ok', true, 'role', v_role, 'username', v_user, 'token', v_tok);
end $$;

create or replace function admin_employees(p_token text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) is null then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select e.id, e.name, e.role, e.active, e.pending, e.created_at, e.has_pin,
           p.email, p.phone, p.address, p.sin, p.birthday, p.first_shift_date,
           p.hourly_rate_cents, p.pin
    from employees e left join employee_private p on p.employee_id = e.id
    order by e.name
  ) x);
end $$;

create or replace function admin_save_employee(p_token text, p_id uuid, p_row jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if mgr_role(p_token) is null then return json_build_object('ok', false); end if;
  if p_id is null then
    insert into employees(name, role, active, pending)
    values (p_row->>'name', p_row->>'role', true, false) returning id into v_id;
  else
    v_id := p_id;
    update employees set name = p_row->>'name', role = p_row->>'role',
      active = coalesce((p_row->>'active')::boolean, active),
      pending = coalesce((p_row->>'pending')::boolean, pending)
    where id = v_id;
  end if;
  insert into employee_private(employee_id, email, phone, address, sin, birthday, first_shift_date, hourly_rate_cents, pin)
  values (v_id, p_row->>'email', p_row->>'phone', p_row->>'address', p_row->>'sin',
          nullif(p_row->>'birthday', '')::date, nullif(p_row->>'first_shift_date', '')::date,
          (p_row->>'hourly_rate_cents')::int, p_row->>'pin')
  on conflict (employee_id) do update set
    email = excluded.email, phone = excluded.phone, address = excluded.address,
    sin = excluded.sin, birthday = excluded.birthday,
    first_shift_date = excluded.first_shift_date,
    hourly_rate_cents = excluded.hourly_rate_cents,
    pin = coalesce(excluded.pin, employee_private.pin);
  update employees set has_pin = exists(
    select 1 from employee_private p where p.employee_id = v_id and p.pin is not null and p.pin <> '')
  where id = v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function admin_delete_employee(p_token text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) is null then return false; end if;
  delete from employees where id = p_id;
  return true;
end $$;

create or replace function admin_set_pin(p_token text, p_emp uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) is null then return false; end if;
  insert into employee_private(employee_id, pin) values (p_emp, nullif(p_pin, ''))
  on conflict (employee_id) do update set pin = excluded.pin;
  update employees set has_pin = (p_pin is not null and p_pin <> '') where id = p_emp;
  return true;
end $$;

create or replace function admin_managers(p_token text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select id, username, email, active, created_at from managers order by username) x);
end $$;

create or replace function admin_add_manager(p_token text, p_username text, p_email text, p_password text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return json_build_object('ok', false); end if;
  insert into managers(username, password, email, active)
  values (p_username, crypt(p_password, gen_salt('bf', 10)), nullif(p_email, ''), true);
  return json_build_object('ok', true);
exception when unique_violation then
  return json_build_object('ok', false, 'dup', true);
end $$;

create or replace function admin_update_manager(p_token text, p_id uuid, p_email text, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return false; end if;
  update managers set email = nullif(p_email, ''),
    password = case when coalesce(p_password, '') = '' then password
                    else crypt(p_password, gen_salt('bf', 10)) end
  where id = p_id;
  return true;
end $$;

create or replace function admin_set_manager_active(p_token text, p_id uuid, p_active boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return false; end if;
  update managers set active = p_active where id = p_id;
  return true;
end $$;

create or replace function admin_delete_manager(p_token text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return false; end if;
  delete from managers where id = p_id;
  return true;
end $$;

create or replace function signup_manager(p_username text, p_email text, p_password text)
returns json language plpgsql security definer set search_path = public as $$
begin
  insert into managers(username, password, email, active)
  values (p_username, crypt(p_password, gen_salt('bf', 10)), p_email, false);
  return json_build_object('ok', true);
exception when unique_violation then
  return json_build_object('ok', false, 'dup', true);
end $$;

create or replace function view_secret(p_token text, p_key text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return null; end if;
  return (select value from settings where key = p_key);
end $$;

create or replace function change_secret(p_token text, p_key text, p_value text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) <> 'owner' then return false; end if;
  if p_key not in ('screen_password', 'manager_pin', 'owner_username') then return false; end if;
  update settings set value = p_value where key = p_key;
  return true;
end $$;

create or replace function check_emp_pin(p_emp uuid, p_pin text) returns boolean
language sql security definer set search_path = public as
$$ select exists(select 1 from employee_private
    where employee_id = p_emp and pin = p_pin
      and p_pin is not null and p_pin <> '') $$;

create or replace function set_emp_pin_initial(p_emp uuid, p_new_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into employee_private(employee_id, pin) values (p_emp, p_new_pin)
  on conflict (employee_id) do update set pin = excluded.pin
  where employee_private.pin is null or employee_private.pin = '';
  get diagnostics v = row_count;
  if v > 0 then
    update employees set has_pin = true where id = p_emp;
    return true;
  end if;
  return false;
end $$;

create or replace function request_reset_code(p_key text)
returns json language plpgsql security definer set search_path = public as $$
declare v_email text; v_code text;
begin
  if p_key like 'pin:%' then
    select email into v_email from employee_private
     where employee_id = (substring(p_key from 5))::uuid;
  else
    select email into v_email from managers where username = p_key and active = true;
  end if;
  if v_email is null or v_email = '' then
    return json_build_object('ok', false, 'no_email', true);
  end if;
  update password_resets set used = true where username = p_key and used = false;
  v_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  insert into password_resets(username, email, code, expires_at)
  values (p_key, v_email, v_code, now() + interval '10 minutes');
  return json_build_object('ok', true);
end $$;

create or replace function complete_reset(p_key text, p_code text, p_new_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from password_resets
   where username = p_key and code = p_code and used = false and expires_at > now()
   order by created_at desc limit 1;
  if v_id is null then return false; end if;
  if p_key like 'pin:%' then
    insert into employee_private(employee_id, pin)
    values ((substring(p_key from 5))::uuid, p_new_secret)
    on conflict (employee_id) do update set pin = excluded.pin;
    update employees set has_pin = true where id = (substring(p_key from 5))::uuid;
  else
    update managers set password = crypt(p_new_secret, gen_salt('bf', 10))
     where username = p_key;
  end if;
  update password_resets set used = true where username = p_key;
  return true;
end $$;

create or replace function get_emp_self(p_emp uuid, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin) then return null; end if;
  return (select row_to_json(x) from (
    select e.name, p.phone, p.email, p.address, p.sin, p.birthday
    from employees e left join employee_private p on p.employee_id = e.id
    where e.id = p_emp) x);
end $$;

create or replace function update_emp_self(p_emp uuid, p_pin text, p_row jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin) then return false; end if;
  update employees set name = coalesce(p_row->>'name', name) where id = p_emp;
  insert into employee_private(employee_id, phone, email, address, sin, birthday, pin)
  values (p_emp, p_row->>'phone', p_row->>'email', p_row->>'address', p_row->>'sin',
          nullif(p_row->>'birthday', '')::date, nullif(p_row->>'pin', ''))
  on conflict (employee_id) do update set
    phone = excluded.phone, email = excluded.email, address = excluded.address,
    sin = excluded.sin, birthday = excluded.birthday,
    pin = coalesce(excluded.pin, employee_private.pin);
  update employees set has_pin = exists(
    select 1 from employee_private p where p.employee_id = p_emp and p.pin is not null and p.pin <> '')
  where id = p_emp;
  return true;
end $$;

create or replace function register_employee(p_row jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into employees(name, role, active, pending, has_pin)
  values (p_row->>'name', p_row->>'role', false, true, true) returning id into v_id;
  insert into employee_private(employee_id, phone, email, pin)
  values (v_id, p_row->>'phone', p_row->>'email', p_row->>'pin');
  return true;
end $$;

create or replace function emp_history(p_emp uuid, p_pin text, p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not check_emp_pin(p_emp, p_pin) then return null; end if;
  return json_build_object(
    'mine', (select coalesce(json_agg(row_to_json(x) order by x.work_date), '[]'::json) from (
      select * from shifts where employee_id = p_emp and work_date between p_from and p_to) x),
    'day_shifts', (select coalesce(json_agg(row_to_json(y)), '[]'::json) from (
      select s.id, s.employee_id, s.work_date, s.clock_in, s.clock_out, s.tips_cents,
             json_build_object('name', e.name, 'role', e.role) as employees
      from shifts s join employees e on e.id = s.employee_id
      where s.work_date between p_from and p_to) y),
    'closeouts', (select coalesce(json_agg(row_to_json(z)), '[]'::json) from (
      select employee_id, work_date, total_sales_cents from register_closeouts
      where work_date between p_from and p_to) z)
  );
end $$;

create or replace function admin_shifts(p_token text, p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) is null then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select s.*, json_build_object('id', e.id, 'name', e.name, 'role', e.role,
             'hourly_rate_cents', p.hourly_rate_cents) as employees
    from shifts s join employees e on e.id = s.employee_id
    left join employee_private p on p.employee_id = e.id
    where s.work_date between p_from and p_to
    order by s.work_date) x);
end $$;

create or replace function admin_closeouts(p_token text, p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if mgr_role(p_token) is null then return null; end if;
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select c.*, json_build_object('id', e.id, 'name', e.name) as employees
    from register_closeouts c left join employees e on e.id = c.employee_id
    where c.work_date between p_from and p_to
    order by c.work_date) x);
end $$;

create or replace function prev_closeout_counted(p_date date) returns int
language sql security definer set search_path = public as
$$ select coalesce((select counted_cents from register_closeouts
     where work_date < p_date order by work_date desc limit 1), 0) $$;

-- 직원용 "오늘의 정산" 조회 (관리자 토큰 불필요; 정산 금액만 반환, 개인정보 없음)
create or replace function staff_day_closeouts(p_date date)
returns json language plpgsql security definer set search_path = public as $$
begin
  return (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select c.*, json_build_object('id', e.id, 'name', e.name) as employees
    from register_closeouts c left join employees e on e.id = c.employee_id
    where c.work_date = p_date
    order by e.name) x);
end $$;

-- RPC 실행 권한 (anon)
grant execute on function mgr_role(text) to anon;
grant execute on function check_screen_password(text) to anon;
grant execute on function app_login(text, text) to anon;
grant execute on function admin_employees(text) to anon;
grant execute on function admin_save_employee(text, uuid, jsonb) to anon;
grant execute on function admin_delete_employee(text, uuid) to anon;
grant execute on function admin_set_pin(text, uuid, text) to anon;
grant execute on function admin_managers(text) to anon;
grant execute on function admin_add_manager(text, text, text, text) to anon;
grant execute on function admin_update_manager(text, uuid, text, text) to anon;
grant execute on function admin_set_manager_active(text, uuid, boolean) to anon;
grant execute on function admin_delete_manager(text, uuid) to anon;
grant execute on function signup_manager(text, text, text) to anon;
grant execute on function view_secret(text, text) to anon;
grant execute on function change_secret(text, text, text) to anon;
grant execute on function check_emp_pin(uuid, text) to anon;
grant execute on function set_emp_pin_initial(uuid, text) to anon;
grant execute on function request_reset_code(text) to anon;
grant execute on function complete_reset(text, text, text) to anon;
grant execute on function get_emp_self(uuid, text) to anon;
grant execute on function update_emp_self(uuid, text, jsonb) to anon;
grant execute on function register_employee(jsonb) to anon;
grant execute on function emp_history(uuid, text, date, date) to anon;
grant execute on function admin_shifts(text, date, date) to anon;
grant execute on function admin_closeouts(text, date, date) to anon;
grant execute on function prev_closeout_counted(date) to anon;
grant execute on function staff_day_closeouts(date) to anon;

-- ---------- RLS 정책 ----------
create policy "anon read" on employees for select using (true);

-- settings / managers: 직접 접근 전면 차단 (RPC로만)
drop policy if exists "anon all" on settings;
drop policy if exists "anon all" on managers;

-- password_resets: 직접 접근 차단 (RPC + 서비스키 메일러만)
drop policy if exists "anon all" on password_resets;

-- security_events: 기록(insert)만 허용
drop policy if exists "anon all" on security_events;
drop policy if exists "anon insert" on security_events;
create policy "anon insert" on security_events for insert with check (true);

-- shifts: 읽기는 RPC로만, 출퇴근 기록 쓰기/수정/삭제는 유지
drop policy if exists "anon all" on shifts;
drop policy if exists "anon write" on shifts;
create policy "anon write" on shifts for insert with check (true);
create policy "anon update" on shifts for update using (true) with check (true);
create policy "anon delete" on shifts for delete using (true);

-- register_closeouts: 읽기는 RPC로만, 정산 쓰기는 유지
drop policy if exists "anon all" on register_closeouts;
create policy "anon write" on register_closeouts for insert with check (true);
create policy "anon update" on register_closeouts for update using (true) with check (true);
create policy "anon delete" on register_closeouts for delete using (true);
