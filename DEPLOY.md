# Putting Simple Services on the web

The app is hosted on **Vercel**, with its database on **Neon** (added through Vercel), uploaded
files in **Vercel Blob**, and email sent by **Resend**. All four have free tiers that cover one
church. Every push to the `master` branch on GitHub redeploys the site.

Steps marked **(you)** need someone signed in to that service; they can't be done from the code.

## 1. Create the project **(you)**

1. Sign in at [vercel.com](https://vercel.com) with the GitHub account that owns the repository.
2. **Add New → Project**, pick your copy of the repository, and stop at the settings screen.
   Leave the framework as Next.js and the build settings alone: the repo's `vercel-build` script
   applies database changes and then builds.
3. Don't deploy yet. The first build needs the database from step 2.

## 2. Add the database and file storage **(you)**

In the project: **Storage → Create Database**.

1. **Neon** (Postgres). Accept the defaults and connect it to the project for all environments.
   This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the project by itself.
2. **Blob**. Create a store with **private** access and connect it. This adds
   `BLOB_READ_WRITE_TOKEN`.

## 3. Add the settings **(you)**

**Settings → Environment Variables**, for Production (and Preview if you want preview sites to work):

| Name | Value |
|---|---|
| `SESSION_SECRET` | A long random string, 32 characters or more. Generate one with the command below. |
| `CRON_SECRET` | Another long random string. Vercel sends it with the daily reminder job. |
| `APP_URL` | The site's address, e.g. `https://services.yourchurch.org` (no slash on the end). Used in email links. |
| `RESEND_API_KEY` | From step 5. Until it is set, emails are written to the log instead of sent. |
| `EMAIL_FROM` | e.g. `Your Church <services@yourchurch.org>` |

A random string for the two secrets (run it twice):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The `SEED_*` values are only needed if you start with an empty database and run `npm run db:seed`
against it, not if you copy the local data in step 6.

## 4. Deploy, then add the church address **(you)**

1. **Deployments → Redeploy** (or push any commit). The build creates the database tables.
2. **Settings → Domains → Add** `services.yourchurch.org` (or whatever name you choose).
   Vercel shows one DNS record to add, a `CNAME` pointing at `cname.vercel-dns.com`. Add it
   wherever the church's domain is managed. It usually works within minutes.
3. Make sure `APP_URL` matches that address, and redeploy if you changed it.

## 5. Email **(you)**

1. Create an account at [resend.com](https://resend.com) and **Add Domain** `yourchurch.org`.
2. Resend lists DNS records (SPF and DKIM). Add them where the domain is managed and press Verify.
3. Create an API key, put it in `RESEND_API_KEY`, set `EMAIL_FROM`, and redeploy.

Until this is done the app works, but invitations, password resets and schedule requests are not
actually sent.

## 6. Bring the local data across (once)

This copies the people, teams, service types, songs, plans and scheduling from the database on
your computer to the hosted one. Songs, plans and people without a login are marked as **sample
data**, so they can all be cleared in one go later.

1. In Vercel, open the Neon database and copy its **unpooled** (direct) connection string.
2. Add it to `simple-services/.env` on your computer as a new line: `WEB_DATABASE_URL="…"`.
   That file is never committed.
3. With the local database running (`npm run db:start`):

   ```bash
   npm run db:copy-to-web
   ```

It refuses to run if the hosted database already has anything in it. Uploaded files, blockout
dates and sign-in links are not copied. Your login comes across, with the same password.

Afterwards, delete the `WEB_DATABASE_URL` line from `.env`.

## 7. Clearing the sample data

When the app is ready for real use, an admin opens **Account → Sample data → Remove all sample
data**. That deletes every person, song and plan marked as sample. Teams, service types and anyone
with a login are kept. Things created on the web version are not marked as sample.

## Good to know

- The Vercel command-line tool (`vercel link`, `vercel env pull`, adding storage) writes a
  `.env.local` file holding the **hosted** database address. `next dev` reads that file ahead of
  `.env`, so delete or rename it, or local work will run against the live database.

## After it's live

- **Updates:** push to the `master` branch and Vercel redeploys. Database changes in `prisma/migrations` are
  applied during the build.
- **Reminders:** `vercel.json` runs `/api/cron/reminders` once a day at 14:00 UTC.
- **Helpers working on the code** don't need access to Vercel. They follow the README to run the
  app on their own computer with their own local database, and open pull requests. Only people
  you add to the Vercel project can see its settings and secrets.
- **Offline set lists** only work on the hosted site (it needs https), not on `localhost`.
