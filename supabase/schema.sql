-- =====================================================================
-- Family Budget Tracker: database schema
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- =====================================================================

-- ---------- Tables ---------------------------------------------------

create table if not exists public.household (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default 'Our Family',
  currency          text not null default 'JOD',
  start_year        int  not null default extract(year from now())::int,
  shift_late_income boolean not null default false,
  shift_day         int  not null default 20 check (shift_day between 1 and 31),
  created_at        timestamptz not null default now()
);

create table if not exists public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  display_name text not null,
  role         text not null default 'contributor' check (role in ('admin','contributor')),
  lang         text not null default 'ar' check (lang in ('ar','en')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  type         text not null check (type in ('income','expense','savings')),
  name_en      text not null,
  name_ar      text not null,
  icon         text not null default '•',
  sort_order   int  not null default 100,
  active       boolean not null default true,
  unique (household_id, type, name_en)
);

create table if not exists public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  name_en      text not null,
  name_ar      text not null,
  icon         text not null default '•',
  sort_order   int  not null default 100,
  active       boolean not null default true,
  unique (household_id, name_en)
);

create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.household(id) on delete cascade,
  date              date not null default current_date,
  type              text not null check (type in ('income','expense','savings')),
  category_id       uuid not null references public.categories(id),
  amount            numeric(12,3) not null check (amount > 0),
  details           text,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  reviewed          boolean not null default false,
  reviewed_by       uuid references auth.users(id) on delete set null,
  reviewed_at       timestamptz
);
create index if not exists transactions_household_date_idx on public.transactions (household_id, date desc);
create index if not exists transactions_created_by_idx     on public.transactions (created_by);

create table if not exists public.budgets (
  household_id uuid not null references public.household(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  amount       numeric(12,3) not null default 0 check (amount >= 0),
  primary key (category_id, month)
);
create index if not exists budgets_household_month_idx on public.budgets (household_id, month);

-- ---------- Helper functions (security definer: avoid RLS recursion) --

create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.members
                   where user_id = auth.uid() and active), false)
$$;

-- Lets any member change only their own language.
create or replace function public.set_my_lang(p_lang text) returns void
language sql security definer set search_path = public as $$
  update public.members set lang = p_lang where user_id = auth.uid() and p_lang in ('ar','en')
$$;

-- ---------- Transaction guard trigger ---------------------------------
-- Forces ownership/review fields so a kid can never spoof them, and checks
-- that the category belongs to the household and matches the entry type.

create or replace function public.transactions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid   uuid    := auth.uid();
  admin boolean := public.is_admin();
  cat   public.categories%rowtype;
begin
  if uid is not null then                       -- a signed-in app user
    if tg_op = 'INSERT' then
      new.household_id := public.my_household();
      if new.household_id is null then
        raise exception 'Not an active household member';
      end if;
      new.created_by := uid;
      new.created_at := now();
      if admin then
        new.reviewed := true;  new.reviewed_by := uid;  new.reviewed_at := now();
      else
        new.reviewed := false; new.reviewed_by := null; new.reviewed_at := null;
      end if;
    else -- UPDATE
      new.household_id := old.household_id;
      new.created_by   := old.created_by;
      new.created_at   := old.created_at;
      if not admin then
        new.reviewed := old.reviewed; new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
      elsif new.reviewed and not old.reviewed then
        new.reviewed_by := uid; new.reviewed_at := now();
      elsif not new.reviewed then
        new.reviewed_by := null; new.reviewed_at := null;
      end if;
    end if;
  end if;

  new.updated_at := now();

  select * into cat from public.categories where id = new.category_id;
  if not found or cat.household_id <> new.household_id then
    raise exception 'Category does not belong to this household';
  end if;
  if cat.type <> new.type then
    raise exception 'Category type (%) does not match entry type (%)', cat.type, new.type;
  end if;
  return new;
end $$;

drop trigger if exists transactions_guard on public.transactions;
create trigger transactions_guard before insert or update on public.transactions
  for each row execute function public.transactions_guard();

-- ---------- Views & reporting functions -------------------------------

-- Effective month: late income (day >= shift_day) counts toward next month
-- when the setting is on. (Fixes the Excel bug DAY(date >= x).)
create or replace view public.transactions_effective
with (security_invoker = true) as
select t.*,
  case
    when t.type = 'income' and h.shift_late_income and extract(day from t.date) >= h.shift_day
      then (date_trunc('month', t.date) + interval '1 month')::date
    else date_trunc('month', t.date)::date
  end as effective_month
from public.transactions t
join public.household h on h.id = t.household_id;

-- Totals per effective month × category × member for one year.
-- security invoker → RLS still applies (a kid would only get their own rows).
create or replace function public.monthly_totals(p_year int)
returns table (month date, type text, category_id uuid, created_by uuid, total numeric, entries bigint)
language sql stable security invoker set search_path = public as $$
  select effective_month, type, category_id, created_by, sum(amount), count(*)
  from public.transactions_effective
  where extract(year from effective_month) = p_year
  group by 1,2,3,4
$$;

-- ---------- Row Level Security ----------------------------------------

alter table public.household       enable row level security;
alter table public.members         enable row level security;
alter table public.categories      enable row level security;
alter table public.payment_methods enable row level security;
alter table public.transactions    enable row level security;
alter table public.budgets         enable row level security;

-- household
drop policy if exists household_select on public.household;
create policy household_select on public.household for select to authenticated
  using (id = public.my_household());
drop policy if exists household_update on public.household;
create policy household_update on public.household for update to authenticated
  using (id = public.my_household() and public.is_admin())
  with check (id = public.my_household() and public.is_admin());

-- members: admins see everyone in the household; others only themselves
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (household_id = public.my_household() and (public.is_admin() or user_id = auth.uid()));
drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members for update to authenticated
  using (household_id = public.my_household() and public.is_admin())
  with check (household_id = public.my_household());

-- categories & payment methods: everyone reads, admins write
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (household_id = public.my_household());
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all to authenticated
  using (household_id = public.my_household() and public.is_admin())
  with check (household_id = public.my_household() and public.is_admin());

drop policy if exists payment_methods_select on public.payment_methods;
create policy payment_methods_select on public.payment_methods for select to authenticated
  using (household_id = public.my_household());
drop policy if exists payment_methods_admin on public.payment_methods;
create policy payment_methods_admin on public.payment_methods for all to authenticated
  using (household_id = public.my_household() and public.is_admin())
  with check (household_id = public.my_household() and public.is_admin());

-- transactions
drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select to authenticated
  using (household_id = public.my_household() and (public.is_admin() or created_by = auth.uid()));
drop policy if exists tx_insert on public.transactions;
create policy tx_insert on public.transactions for insert to authenticated
  with check (household_id = public.my_household() and created_by = auth.uid());
drop policy if exists tx_update on public.transactions;
create policy tx_update on public.transactions for update to authenticated
  using (household_id = public.my_household()
         and (public.is_admin() or (created_by = auth.uid() and not reviewed)))
  with check (household_id = public.my_household()
         and (public.is_admin() or (created_by = auth.uid() and not reviewed)));
drop policy if exists tx_delete on public.transactions;
create policy tx_delete on public.transactions for delete to authenticated
  using (household_id = public.my_household() and public.is_admin());

-- budgets: admins only
drop policy if exists budgets_admin on public.budgets;
create policy budgets_admin on public.budgets for all to authenticated
  using (household_id = public.my_household() and public.is_admin())
  with check (household_id = public.my_household() and public.is_admin());

-- ---------- Grants (nothing for anonymous visitors) -------------------

revoke all on public.household, public.members, public.categories, public.payment_methods,
              public.transactions, public.budgets, public.transactions_effective from anon;
grant select, insert, update, delete on public.household, public.members, public.categories,
              public.payment_methods, public.transactions, public.budgets to authenticated;
grant select on public.transactions_effective to authenticated;

revoke execute on function public.my_household(), public.is_admin(), public.set_my_lang(text),
                           public.monthly_totals(int) from public, anon;
grant execute on function public.my_household(), public.is_admin(), public.set_my_lang(text),
                          public.monthly_totals(int) to authenticated;

-- ---------- Seed: one household + default categories -----------------
-- Categories come from Personal_Budget_Tracker_v1.xlsx (typos fixed, Arabic added).

do $$
declare hid uuid;
begin
  select id into hid from public.household order by created_at limit 1;
  if hid is null then
    insert into public.household (name, currency, start_year) values ('Our Family', 'JOD', 2025)
    returning id into hid;
  end if;

  insert into public.categories (household_id, type, name_en, name_ar, icon, sort_order) values
    (hid,'income', 'Employment (Net)',             'الراتب (صافي)',          '💼', 10),
    (hid,'income', 'Side Hustle (Net)',            'دخل إضافي (صافي)',       '🛠️', 20),
    (hid,'income', 'Dividends',                    'أرباح الأسهم',           '📈', 30),
    (hid,'expense','Housing',                      'السكن',                  '🏠', 10),
    (hid,'expense','Utilities',                    'الفواتير والخدمات',      '💡', 20),
    (hid,'expense','Groceries',                    'البقالة',                '🛒', 30),
    (hid,'expense','Transportation',               'المواصلات',              '🚗', 40),
    (hid,'expense','Insurances',                   'التأمين',                '🛡️', 50),
    (hid,'expense','Clothing',                     'الملابس',                '👕', 60),
    (hid,'expense','Body Care & Medicine',         'العناية الشخصية والأدوية','💊', 70),
    (hid,'expense','Media',                        'الاشتراكات والإعلام',    '📺', 80),
    (hid,'expense','Fun & Vacation',               'الترفيه والسفر',         '🎡', 90),
    (hid,'expense','Food',                         'الطعام والمطاعم',        '🍽️', 100),
    (hid,'expense','Education',                    'التعليم والمدارس',       '🎓', 110),
    (hid,'savings','Emergency Fund',               'صندوق الطوارئ',          '🧯', 10),
    (hid,'savings','Retirement Account',           'حساب التقاعد',           '🏖️', 20),
    (hid,'savings','Stock Portfolio',              'محفظة الأسهم',           '📊', 30),
    (hid,'savings','Sinking Fund – Down Payment',  'ادخار الدفعة الأولى',    '🏡', 40),
    (hid,'savings','Sinking Fund – Other',         'ادخارات أخرى',           '🐷', 50)
  on conflict (household_id, type, name_en) do nothing;

  insert into public.payment_methods (household_id, name_en, name_ar, icon, sort_order) values
    (hid,'Cash',          'نقدًا',            '💵', 10),
    (hid,'Card',          'بطاقة',            '💳', 20),
    (hid,'CliQ',          'كليك',             '⚡', 30),
    (hid,'E-wallet',      'محفظة إلكترونية',  '📱', 40),
    (hid,'Bank transfer', 'تحويل بنكي',       '🏦', 50)
  on conflict (household_id, name_en) do nothing;
end $$;
