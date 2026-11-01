# Simple Services

Service planning, volunteer scheduling and song charts for a church, in the browser. A self-owned
replacement for Planning Center Services. Each church runs its own copy, on its own accounts.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Logins, permission levels, people directory, teams and positions | Built |
| 2 | Service types, plan editor, song library, file uploads | Built |
| 3 | Scheduling: requests by email, confirm/decline, blackout dates, reminders | Built |
| 4 | Media player (YouTube + MP3), swipeable set list viewer, offline cache | Built |
| 5 | Templates, calendar feed, CSV import | Service type templates built; calendar feed and CSV import not started |

Typed chord charts with transposing (originally phase 5) were built early; see below.

Out of scope for now: text messages, check-ins, giving, native apps.

To put it on the web, see [DEPLOY.md](DEPLOY.md). The plan for letting other churches install it is in [docs/INSTALL-HELPER.md](docs/INSTALL-HELPER.md).

## What phase 1 does

- **People directory**: name, email, any number of phone numbers, address, birthday, planner-only
  notes. Search by name, email or phone; filter by team. People are archived, never deleted.
- **Logins**: email + password. An admin sends an invitation link (valid 7 days); the person sets their
  own password. "Forgot password" emails a reset link (valid 1 hour). A person can be in the directory
  without a login.
- **Permission levels**:

  | Level | Can do |
  |---|---|
  | Admin | Everything, including invitations and permission levels |
  | Planner | Add and edit all people and teams |
  | Team leader | Add and remove people and positions on the teams they lead |
  | Member | See the directory (names, email, phone, teams) and edit their own profile |

  Members never see other people's address, birthday or notes.
- **Teams and positions**: e.g. Band → Drums, Keys; Tech → Sound, Slides.

## What phase 2 does

- **Service types**: the kinds of service you plan (Sunday Morning, Midweek), each with a usual start time.
- **Plans**: one service on one date. An ordered list of songs, items and headers with lengths,
  notes and running clock times. Drag to reorder (mouse, touch or keyboard).
- **Song library**: title, authors, notes. Each song has one or more
  arrangements (key, BPM, meter, length, sequence). Songs are archived, never deleted.
- **Files and links**: upload PDFs, images, audio, text/ChordPro or Word files (25 MB each) and add
  YouTube or other links, per song or per arrangement. Files are private: they are only served to
  signed-in people through `/files/[id]`.
- A song row in a plan shows that song's charts and links, and has its own key for that service.

Planners and admins edit plans and songs. Everyone signed in can view the song library.

## What phase 3 does

- **Scheduling**: each plan has a Team section. Planners, admins and the leaders of a team add
  people to that team's positions. The picker lists people who hold the position first and flags
  anyone who is blocked out or already on another plan that day.
- **Team pane**: a plan lists only the teams its service uses. "Add Needed Positions" changes what
  that one plan needs, without touching the service type.
- **Requests by email**: "Email requests" asks everyone on the plan who hasn't been asked yet, one
  email per person covering all their positions. "Remind those waiting" re-asks people who haven't
  answered. From Multi View, and in the automatic reminders, someone asked about several services
  gets one email listing them all, with a button to a page where they answer each one.
- **Answering**: the email's Yes / No buttons open a page that needs no sign-in, where one more
  press records the answer (and an optional reason for a no). That extra press is deliberate: mail
  scanners that open links automatically must not be able to answer for someone. People can also
  answer from "Your schedule" on their home page, and a scheduler can set an answer by hand.
- **Auto-schedule**: the button in a plan's Team panel and on Multi View fills open spots, taking
  turns fairly. A service type's positions are needed or optional, and it asks whether to fill just
  the needed ones or both, then says how many positions across how many services before doing
  anything. It keeps to blackout dates, each person's serving preferences (how often, which weeks of
  the month) and serving partners ("always together" for family, "prefer together" for people who
  work well together, set on a person's page). "Review who first" shows the list to tick through.
  Undo takes the last run back off, leaving anyone already asked. Nobody is emailed until you send
  requests, from the plan or, for every service in view, from Multi View.
- **Blackout dates**: people add dates they can't serve on their Account page; planners can add
  them for anyone on the person's page.
- **Who sees what**: members see only the plans they are scheduled on. Team leaders, planners and
  admins see every plan, with a count of confirmed / waiting / declined in the plan list.
- **Automatic reminders**: a daily job (`/api/cron/reminders`, scheduled in `vercel.json`) nudges
  people who haven't answered three days after being asked, and reminds confirmed people three
  days before the service. Each is sent once.

## What phase 4 does

- **Player**: a play button on each song row of a plan (and on each recording or video on a song's
  page) starts it in a player docked at the bottom of the window. It keeps playing while you move
  around the app, has previous / next through the plan's songs, and moves on by itself when a song
  ends. Uploaded recordings are used first; YouTube is the fallback, and a song with both lets you
  switch.
- **Set list**: "Open set list" on a plan shows every song as a full-screen page in that service's
  key. Swipe, use the arrow buttons, or the arrow / Page Up / Page Down keys (what page-turner
  pedals send). Chords, numbers, numerals or lyrics; four text sizes; the plan's note for each song;
  a play button. The screen is kept awake while it's open.
- **Offline**: in the deployed app, "Save for offline" on a set list keeps that set list, its
  uploaded charts and its recordings on the device. It then opens, pages and plays with no
  connection. Logging out removes the saved copies.
- **Install**: the app can be added to a phone or tablet's home screen and opens full-screen.

## Typed chord charts

Each arrangement can have a chord chart typed straight into the app (song page → "Type a chord chart").

- **Three ways to write chords, freely mixed**: a line of chords above its lyric line, ChordPro
  brackets (`[G]Amazing [C]grace`), or Nashville numbers (`1 4 6m 5/7 b7`).
- **Automatic bold**: chords, numbers and section headings (`Verse 1`, `Chorus`, `Bridge x2`,
  anything ending in a colon) turn bold as you type, with a live preview beside the editor.
- **Transposing**: view the chart in any key. Chords keep their role in the key, so the right
  sharps and flats are chosen (F in G becomes D in E, Ab in Bb) and double sharps/flats are avoided.
- **Nashville numbers and Roman numerals**: any chart can be shown as numbers (`1 4 6m`) or
  numerals (`I IV vi`), and a chart typed in numbers can be shown as chords in any key.
- **Capo**, lyrics-only view, text size, one or two columns, and print.
- **Sheet layout**: charts are set in a fixed-width typewriter face in exactly the columns they were
  typed in, so guitar tab lines work. The first page has a grey band with the song title, its
  writers in small type and the key; then text to the margins with no boxes, and a page number.
- **Two views**: "Pages" (the default) shows the chart on Letter pages exactly as it will print,
  with the page count and a warning about lines too wide for the page. The app lays the pages out
  itself (`src/lib/chart-pages.ts`), so what you see is what prints. "Screen" is one continuous
  column at a readable size, for playing from a phone or tablet. Printing always uses the pages.
- **Headings on a line with other things**: a section name and colon at the start of a line is
  always bold, whether chords (`Intro: G C D`) or lyrics (`Verse: words here`) follow it.
- **On a chord line** a bass note on its own (`/E`), bars and repeats (`| G / / / | x2`) and remarks
  in parentheses (`(Intro)`, `(to Chorus)`) are all fine. One unrecognised word makes the whole
  line count as lyrics, which shows as not-bold in the editor.
- A song row in a plan links to the chart already in that service's key.

The chart is stored in the key it was typed in ("Written in the key of"); other keys are worked
out when it is shown. The logic is in `src/lib/chords.ts`, with tests in `src/lib/chords.test.ts`
(`npm test`).

## Stack

Next.js 16 (App Router, Server Actions) · Prisma 7 · PostgreSQL · Tailwind 4 · iron-session cookies ·
Resend for email · Vercel Blob for files · dnd-kit for drag and drop. Intended host: Vercel + a hosted Postgres.

## Running locally

```bash
npm install
cp .env.example .env      # then fill in SESSION_SECRET and SEED_ADMIN_PASSWORD
npm run db:start          # local Postgres via `prisma dev`; put the URL it prints in DATABASE_URL
                          # (and the same URL with the port + 1 in SHADOW_DATABASE_URL)
npm run db:migrate
npm run db:seed           # creates the organization, the first admin, and Band/Tech teams
npm run db:demo           # optional: demo hymns, three "Demo service" plans and three pretend volunteers
                          # (take them out again with: npm run db:demo -- remove)
npm run dev -- --port 3100
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

With no `RESEND_API_KEY`, emails are not sent: they're printed to the server log, and the invitation
link is shown on screen for the admin to copy.

With no `BLOB_READ_WRITE_TOKEN`, uploaded files are written to `./uploads` (git-ignored).

## Open items

- **Finding the way back to a plan** (wants a clever solution): a song or
  chart page opened from a plan links back to that plan, but only one level deep. The plan's id
  rides in the address (`?plan=`), so going further (song page -> Edit chord chart) drops it and the
  way back is lost. Ideas to weigh: carry `?plan=` through every song sub-page; remember the last
  plan viewed (session storage) and offer "Back to <plan>" anywhere under /songs; or open the song
  editor as a panel over the plan so the plan never leaves the screen.

- **UI pass**: a design pass (2026-10-11) and a UI review (2026-10-12) are done. From the review,
  two items were held back because they undo deliberate choices: lighter plan section headers
  (2.3) and replacing the sequence buttons with a menu (4.4). Still plain: the person page, team
  page and chord chart editor.
- **Uploaded PDF charts in the set list** are shown in the browser's own PDF viewer (an embedded
  frame). That works on computers; on iPhones and iPads it may show only the first page, so there's
  an "open in a new tab" link beside it. Typed charts don't have this limit.
- **YouTube can't be saved for offline** and stops when a phone's screen locks. Upload a recording
  for songs that need either.
- **Offline is off in development**: the service worker (`public/sw.js`) only registers in a
  production build, so "Save for offline" doesn't appear on the dev server.
- **App icon** is the order of service on Ember (`public/icon-192.png`, `icon-512.png`, `src/app/icon.png`, `src/app/apple-icon.png`); the drawing is in the commit that added it.
- **Nobody is told when someone declines**: it shows on the plan and in the plan list counts, but
  no email goes to the scheduler yet.
- **Copying a plan**: phase 5. Service type templates are built (each service type has template rows
  and needed positions); applying a template to a plan that already exists is not.
- **Profile photos**: not built yet.
- **More than one church**: every top-level table has `organizationId`, but there is no sign-up or
  organization switcher; the app assumes one organization.

## CCLI and SongSelect

- **SongSelect:** Songs → Import songs takes ChordPro files downloaded from SongSelect, which takes a
  Premium subscription. A song's page links to it on SongSelect.
- **Reporting:** Songs → CCLI report counts usage and exports a spreadsheet to enter on CCLI's site.
- **Not possible yet:** signing in to SongSelect from the app, and automatic reporting. CCLI opens
  those only to approved partner companies.

## Licence and support

MIT licensed: free to use, change and share, with no warranty. See [LICENSE](LICENSE). There's no
promised support. Questions and bugs go in GitHub Issues, and are answered as time allows.
