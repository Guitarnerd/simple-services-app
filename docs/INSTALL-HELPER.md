# Install helper: scope

Lets another church run Simple Services instead of Planning Center without a developer: get a site
of their own, set it up, and bring their Planning Center data across.

## The model

Each church runs its own copy, on accounts it owns. There is no shared site.

| Account | What it holds | Cost for one church |
|---|---|---|
| GitHub | The church's copy of the code | Free |
| Vercel | The website, plus Neon (database) and Blob (uploaded files), both added from inside Vercel | Free tier |
| Resend | Sending email, once the church's domain is verified with DNS records | Free tier |
| Planning Center | Only during the move: a Personal Access Token, read-only use | Their current plan |

Why not one shared site: the church owns its data, nobody else pays its bills, and one church's
problem can't reach another. It also matches the code: `Person.email` is unique across the whole
database, so someone serving at two churches couldn't exist on a shared site.

## The journey

1. **Before there is a site:** a public guide, then a Deploy button that clones the code into their
   Vercel account, adds the database and file storage, and asks for the settings.
2. **First visit:** `/setup` makes the church and its first admin. This replaces `npm run db:seed`,
   which needs a developer. A setup code stops a stranger claiming a new site.
3. **Setup checklist:** `/getting-started` shows what's done, with steps for each thing left: email,
   their own address, file storage, reminders, logo, teams, service types.
4. **Planning Center:** connect with a token, see what's there, bring it across, check it, and run
   it again just before switching over. It never emails anyone.
5. **Going live:** invite the team, stop using Planning Center.

## Parts

| Part | State |
|---|---|
| `/setup`: first church and admin, guarded by `SETUP_CODE` | Built |
| `/getting-started`: checklist, with steps and a test email | Built |
| Planning Center connection and preview of what's there | Built |
| Bringing people and their details across from a page | Built |
| Importing SongSelect ChordPro files, and saving the CCLI licence number | Built |
| Teams, songs and plans from a page | Not planned for now: `npm run db:import-pco` does them |
| Public guide and Deploy button | Next, once the code is public |
| Works out its own address, so `APP_URL` needn't be typed in | Next |
| Bulk invite after importing | Next |
| Keeping a church's copy up to date | See below |

## Bringing Planning Center across from a page

People come across a page of 100 at a time, driven from the browser, so a large church can't outlast
a web request. The token stays in that page and goes with each step. It is never saved. Running again
fills in blanks rather than doubling anyone, through the `pcoId` on each person.

## CCLI and SongSelect

Sign-in and automatic reporting need CCLI's approval. Its API is for approved partner companies, and
it publishes [a list of them](https://songselect.ccli.com/about/apipartners). Approval could also be
awkward for this project: a partner's key is a secret, and each church runs its own copy, so a shared
key can't simply sit in public code. It would probably need a small service in the middle.

Until then: importing downloaded ChordPro files, a link to each song on SongSelect, and the report.

## Decided

- The code goes public under the MIT licence, with anything specific to one church taken out.
- Published as a new repository with a fresh history, because the old history holds those details
  and contributors' email addresses. The private repository keeps running the live site.
- No promised support: GitHub Issues, answered as time allows.

## Still open

- **How do churches get updates?** Each church's copy needs "Sync fork" on GitHub, after which Vercel
  redeploys and applies database changes. A check in the app that says an update is available would
  make that visible.
