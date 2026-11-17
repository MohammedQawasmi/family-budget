# Workflow: Family Budget Tracker (Web App)

## Objective
Build and maintain a private web app that tracks the household's money: what comes in, what goes out, and what gets saved. It replaces `Personal_Budget_Tracker_v1.xlsx`. Family members log purchases from their phones. The parents plan monthly budgets and see dashboards that compare the plan with actual spending.

## Users & Permissions
| Role | Who | Can do |
|---|---|---|
| `admin` | Me, my wife | See everything. Add, edit and delete any entry. Manage budgets, categories, settings and members. |
| `contributor` | Kids | **Add entries and edit their own.** They can see only the entries they created, so they don't log the same purchase twice. They can edit their own entries **until a parent approves them**; approved entries are locked. They cannot delete entries or see the dashboard, budgets or other people's entries. |

- Nobody can sign up publicly. Only admins create accounts.
- Kids don't need real email addresses. Their accounts use username-style logins (for example `sara@family.local` with a password), set up through `tools/manage_members.py`.
- Every entry stores `created_by`, so the dashboard can show spending per family member.
- Entries made by kids are marked **unreviewed** until a parent approves them (one tap on the History screen).

## Architecture
```
Phone / PC browser  (installable PWA: "Add to Home Screen")
        │
        ▼
GitHub Pages  ── static app code only (HTML/CSS/JS). NEVER any data.
        │  supabase-js (public anon key; safe ONLY because RLS is on)
        ▼
Supabase (free tier) ── Postgres + Auth + Row Level Security
```
- **No build step:** plain HTML with JavaScript modules, plus supabase-js and Chart.js loaded from a CDN at fixed versions. The app can be edited without installing Node or any build tools.
- **Secrets:** Supabase now uses new key names. The **publishable key** (`sb_publishable_…`) replaces the old "anon" key, and the **secret key** (`sb_secret_…`) replaces the old "service_role" key.
  - The Project URL and the publishable key go in `app/config.js`. They are designed to be public, as long as Row Level Security is on.
  - The secret key goes ONLY in `.env`, is used ONLY by the Python tools, and is never committed or loaded in the browser. Supabase also refuses secret keys sent from a browser.
  - The Project URL is `https://<project-ref>.supabase.co`. Find it under Project Settings → Data API, or under the **Connect** button at the top of the dashboard.
- **Languages:** Arabic and English, switchable at any time. Arabic flips the whole layout to right-to-left (`dir="rtl"`). Each category stores both `name_en` and `name_ar`. The chosen language is saved per member.
- **Currency:** Jordanian dinar (JOD) by default. Amounts are stored as `numeric(12,3)` because the dinar has 3 decimals (fils).

## Data Model (Supabase / Postgres)
| Table | Key columns |
|---|---|
| `household` | id, name, currency, start_year, shift_late_income (bool), shift_day (int, default 20) |
| `members` | user_id → auth.users, household_id, display_name, role (`admin`/`contributor`), lang (`ar`/`en`) |
| `categories` | id, household_id, type (`income`/`expense`/`savings`), name_en, name_ar, icon, sort_order, active |
| `payment_methods` | id, household_id, name_en, name_ar (Cash, Card, CliQ, e-wallet…) |
| `transactions` | id, household_id, date, type, category_id, amount, details, payment_method_id, created_by, created_at, reviewed |
| `budgets` | household_id, category_id, month (first day of the month), amount. One row per category per month. |
| view `transactions_effective` | Adds `effective_month`. Income dated on or after `shift_day` counts toward next month when `shift_late_income` is on. |

### Row Level Security rules (must be enforced in the database, not only hidden in the app)
- `transactions` SELECT: admins see their whole household; contributors see only rows where `created_by = auth.uid()`.
- `transactions` INSERT: any member, only for their own household, with `created_by` forced to `auth.uid()` and `reviewed` forced to false for contributors.
- `transactions` UPDATE: admins can update any row. Contributors can update only their own rows where `reviewed = false`. They cannot change `created_by`, `household_id` or `reviewed`; a trigger enforces this.
- `transactions` DELETE: admins only.
- `budgets`, `household`, `members` write: admins only. `budgets` read: admins only.
- `categories`, `payment_methods` read: all members (needed for the add form). Write: admins only.

## Screens
1. **Login:** language toggle available before signing in.
2. **Add entry** (the home screen for everyone): amount keypad first, then type, category chips, date (defaults to today), payment method and an optional note. It should take under 10 seconds.
3. **History:** filter by month, type, category and member. Admins can edit, delete and approve kids' entries.
4. **Budget** (admins): grid of categories by month, carried over from the "Budget Planning" sheet. Includes the "To be allocated" counter, which shows ✔ when it reaches 0, and a "copy last month" button.
5. **Dashboard** (admins): pick a year and a period (a month or the whole year). Shows:
   - totals for income, expenses, savings and what's left to allocate
   - planned vs actual per category, sorted by size, as the old Excel ranking did
   - a 12-month trend
   - spending per member
   - days since the last entry
6. **Settings** (admins): household settings, categories (EN/AR), payment methods, members.

## Migrating from the Excel File
Default categories come from `Personal_Budget_Tracker_v1.xlsx`, with typos fixed and Arabic names added:
- **Income:** Employment (Net), Side Hustle (Net), Dividends
- **Expenses:** Housing, Utilities, Groceries, Transportation, Insurances, Clothing, Body Care & Medicine, Media, Fun & Vacation, Food
- **Savings:** Emergency Fund, Retirement Account, Stock Portfolio, Sinking Fund – Down Payment, Sinking Fund – Other

**Excel bugs. Do NOT copy them:**
- The late-income formula `DAY(Tracking[Date] >= shift_day)` has a misplaced bracket, so it shifts ALL income. The correct logic is `DAY(date) >= shift_day`.
- `current_date` was fixed at `DATE(2025,12,2)`. The app always uses the real current date.

## Tools (`tools/`)
| Script | Purpose |
|---|---|
| `supabase/schema.sql` | Tables, view, RLS policies, seed categories. Paste it into the Supabase SQL editor, or rerun it, since it is safe to run more than once. |
| `tools/manage_members.py` | Create, disable or reset the password of a member account and set their role. Uses the secret key from `.env`. |
| `tools/export_backup.py` | Download all tables to CSV/XLSX in `.tmp/` (or a chosen folder) for backups and for analysis with Claude. |
| `tools/test_rls.py` | Signs in as a test contributor and checks they CANNOT read other people's entries, budgets or the dashboard data. Run it after every schema change. |

## Build Phases
1. **Accounts (user):** create a free GitHub account and a free Supabase project, then put `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in `.env`.
2. **Database:** run `schema.sql`, create the admin and kid accounts with `manage_members.py`, then run `test_rls.py`. Do not move on until it passes.
3. **Core app:** login, add entry, history, language switch (AR/EN, RTL).
4. **Planning & analysis:** budget grid, dashboard and charts.
5. **Phone install:** add the PWA manifest, icons and offline app shell, then test "Add to Home Screen" on Android and iPhone.
6. **Deploy:** push `app/` to GitHub and turn on GitHub Pages. Check the live site still passes `test_rls.py` and the manual phone checks.
7. **Backup routine:** run `export_backup.py` monthly.

## Edge Cases & Known Constraints
- **Supabase free tier pauses after about 7 days with no activity.** Daily use prevents this. If it does pause, restore it from the Supabase dashboard. No data is lost.
- **GitHub Pages on a free account is public.** Only the code is public, never the data. Never commit `.env`, CSV exports or anything in `.tmp/`.
- **No signal in a shop:** v1 needs a connection to save. v2 idea: queue entries on the phone and sync them later.
- **Kid enters a wrong amount:** they can fix it themselves until a parent approves the entry. After approval, only a parent can change it.
- **Arabic numbers:** Western digits (0–9) by default, so typing and calculating amounts works the same in both languages.

## Project Layout
```
supabase/schema.sql      database: tables, RLS, triggers, seed (paste into the SQL Editor)
tools/supa.py            shared .env loader + REST client for the Python tools
tools/manage_members.py  accounts: add / list / reset-password / set-role / disable / enable
tools/test_rls.py        permission test (temporary test users, cleaned up afterwards)
tools/export_backup.py   full backup to .tmp/backups/*.xlsx
app/                     the web app (this folder is what GitHub Pages publishes)
  config.js              Project URL + publishable key (public by design)
  js/main.js             login, routing, tab bar     js/api.js   all database calls
  js/i18n.js             Arabic/English text          js/ui.js    DOM + money/date helpers
  js/views/*.js          add, history, budget, dashboard, settings
  sw.js, manifest.webmanifest, icons/   installable app (PWA)
.github/workflows/pages.yml   deploys app/ only; refuses to deploy if "sb_secret_" appears in app/
```

## Running Locally
`python -m http.server 8000 --directory app`, then open http://localhost:8000. The service worker only registers on https (the live site), so local testing always loads fresh files.

## Lessons Learned
- **2026-11-17: no import tool.** The old workbook had no tracking rows and no budget amounts, so only its category names were carried over, as seed rows in `schema.sql`. `import_excel.py` was dropped from the plan.
- **2026-11-17: Supabase URL copied with `/rest/v1/`.** The Data API page shows the REST endpoint (`https://<ref>.supabase.co/rest/v1/`). `tools/supa.py` strips a trailing `/rest/v1/` or `/auth/v1/` automatically, and `app/config.js` stores the clean base URL.
- **2026-11-17: SQL can't be run from the tools.** The publishable and secret keys work only with the REST and Auth APIs, not raw SQL. Schema changes are pasted into Supabase → SQL Editor by the user, then `test_rls.py` is run.
- **Sign-ups must be turned off by hand:** Supabase → Authentication → Sign In / Providers → turn off "Allow new users to sign up". `test_rls.py` fails until this is done.
- **2026-11-17: deploy guard false alarm.** The first deploy failed because the check `grep "sb_secret_"` matched the warning comment in `app/config.js`. It now matches only a real key (`sb_secret_` followed by 10 or more key characters).
- **Live:** https://mohammedqawasmi.github.io/family-budget/ (repo `MohammedQawasmi/family-budget`). Deploying = commit + push to `main`.
- **Chart colors:** the reference dataviz palette's slots 1–3 (income blue, expenses orange, savings aqua) pass the validator in both light and dark mode. Light-mode aqua is below 3:1 contrast, so the dashboard always includes the category table.
