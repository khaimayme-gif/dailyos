# DailyOS

A shared household dashboard for Miki & Alex — financial tracking and
immigration/passport reminders, backed by a real Supabase (Postgres)
database with login.

## Connect the database (one-time setup)

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → sign up (free) → **New project**.
Pick any name/region/password (the password is for the Postgres superuser,
not your app login — you won't need it day to day).

### 2. Create the tables
In your new project: **SQL Editor → New query**, paste the contents of
[`sql/schema.sql`](./sql/schema.sql), and click **Run**. This creates all 8
tables, seeds the default expense categories, and turns on Row Level
Security so the data is only readable/writable by a signed-in user.

### 3. Create your login
**Authentication → Users → Add user**. Use whatever email/password you
want — this is the single shared login for both Miki and Alex. (Turn off
"Auto confirm user" only if you want an email confirmation step; leaving it
on is simplest for a private household app.)

### 4. Get your API keys
**Project Settings → API**. You need two values:
- **Project URL**
- **anon public** key

### 5. Add them to Vercel
In your Vercel project: **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL from step 4 |
| `VITE_SUPABASE_ANON_KEY` | the anon public key from step 4 |

Then **Deployments → ⋯ → Redeploy** so the build picks up the new
variables (Vite only reads env vars at build time).

### 6. Sign in
Visit your site, click through the welcome screen, and sign in with the
email/password you created in step 3. You're in — everything you add now
is saved to Supabase and will be there next time you open the app on any
device.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

## How the sync works

Every list in the app (income, expenses, obligations, categories, visas,
90-day reports, passports) still behaves like normal React state — the
existing `setX(prev => ...)` calls throughout `src/DailyOS.jsx` didn't need
to change. `src/lib/sync.js` wraps that state: on every update it diffs the
old and new arrays and pushes just the inserts/updates/deletes to Supabase
in the background. `src/lib/LoginGate.jsx` gates the whole app behind a
Supabase session and adds the sign-out button in the sidebar.
