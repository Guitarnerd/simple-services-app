@AGENTS.md

# Simple Services

Church service planning app (Planning Center Services replacement). See README.md for the phase plan
and what is built.

## Conventions

- Every query is scoped by `organizationId` from `getCurrentUser()`; never trust an id from the client
  without that scope.
- Every Server Action re-checks permission itself (`getCurrentUser`, `requireRole`, `canManageTeam`,
  `canEditPerson` in `src/lib/dal.ts`). Hiding a button is not a permission check.
- Roles are ordered MEMBER < LEADER < PLANNER < ADMIN (`src/lib/roles.ts`). Leaders are scoped to the
  teams in `TeamLeader`.
- Forms use `useActionState` with the `FormState` shape and `SubmitButton` / `FormMessage` from
  `src/components/form.tsx`. Shared styles are the `.card`, `.input`, `.btn*`, `.badge`, `.muted`,
  `.link` classes in `globals.css`.
- The song page saves itself: song details and each arrangement use `useAutosave` and show
  `<SaveStatus>` ("Changes saved"). Adding things (a new arrangement, a link, an upload) keeps a
  button. Follow the same split on new edit screens. Page order is song details, arrangement,
  files and links.
- An arrangement's sequence is stored as comma-separated section names ("Intro, Verse 1, Chorus")
  and edited with `SequenceEditor`. On song sheets (the chart's heading and the set list) it is
  shown short, "Intro V1 Ch×2", by `abbreviateSequence` in `src/lib/sequence.ts`.
- A plan row keeps its own copy of a song's title (`PlanItem.title`). `saveSong` updates those
  copies on a rename; anything else that changes a song's title must do the same.
- A service type's template is two things. `TemplateItem` rows are copied into a plan when it is
  created (`createPlan`), so editing the template never changes existing plans. `TemplatePosition`
  (needed positions) is read live by `PlanTeam`, so it does. A plan's own differences are
  `PlanPosition` rows ("Add Needed Positions"), 0 meaning this service doesn't use it. Only people who
  manage the team see that a position is optional; the maintainer doesn't want anyone feeling unnecessary. Read a plan's
  needs with `planNeeds`, never from `TemplatePosition` alone.
- A plan row's time is worked out by `itemStarts` in `src/lib/format.ts`: rows run one after another
  from the start time, except the rows under a header ticked "Pre-service" (`preService` on a
  HEADER row, read through `preServiceRows`), which are timed backwards so the last of them ends at
  the start time. Only headers carry the flag; template headers can too. The maintainer tried minutes, then a
  tick on each row, and settled on the header.
- A SONG plan row with no `songId` is an empty slot from a template: it keeps its own title and is
  filled with `setPlanItemSong`.
- Multi View (`/plans/multi-view`, `PlanMatrix`) shows upcoming plans as columns. The maintainer renamed it from
  Matrix to set it apart from Planning Center, so never say Matrix on screen; the code still does, and
  `/plans/matrix` redirects. Each row has a pencil (`ItemEditForm` and `SongPicker` from the plan, in
  a pop-up) and an ✕ with Undo. `?past=N` adds past ones
  on the left, which auto-schedule and bulk email leave out, and a plan's Matrix button (leaders and
  up) opens `?around=<plan>`: that plan, the one before and the two after, of its service type. Its New service button stays on the
  matrix (`stay` on `createPlan`). Each column lists its positions, needed and optional, and pressing
  one opens the sheet of people (`AssignPerson` with `load`). A person dragged to another column asks
  Move or Copy (`placeOnPlan`), keeps their position and starts as not asked. A position dragged across
  copies the need, not its people (`copyPlanPosition`); onto a service that already has it, it asks
  "Add another Guitar?" and adds Guitar 2, a real position held by the same people
  (`addAnotherPosition`). Its ✕ takes it and them off that service.
  A person's pencil swaps someone else in (`swapAssignment`, `AssignPerson` with `replace`). Dragging a row within
  a plan reorders it (`arrangePlans`); dragging it across to another plan copies it there and
  leaves the original (`copyPlanItem`). The maintainer asked for copy, not move.
- `PersonCalendar` shows the services one person is scheduled on (home, and a person's page for
  leaders and up). The page using it decides who may see it.
- A song's time signature is the arrangement's `meter` field; it is labelled "Time signature".
- Hosting is described in `DEPLOY.md` (Vercel, Neon, Vercel Blob, Resend). The Vercel build runs
  `vercel-build`, which applies migrations before building.
- `sample` on Person, Song and Plan marks test material. `removeSampleData` (Account page, admins)
  deletes all of it at once. The demo script and `db:copy-to-web` set it; nothing else does.
- Sign-in counts wrong passwords per email in `LoginAttempt` and pauses after 8 in 15 minutes.
- The set list shows one song at a time in a single up-and-down scroller; the others stay laid
  out but `inert` and invisible. Songs change by the arrows, the arrow keys, or a firm sideways
  swipe (the thresholds are constants at the top of `setlist-viewer.tsx`). Don't bring back a
  sideways-scrolling strip of songs: nested scrollers made touch scrolling unreliable.
- Drag-to-reorder lists (plan items, the plan matrix, song sequences) use `MouseSensor` plus a
  `TouchSensor` that waits `HOLD_MS` (`src/lib/drag.ts`), so a finger has to rest before a row moves
  and a swipe scrolls. Don't use `PointerSensor` there: it also answers touches and skips the hold.
- Pushing to `master` publishes to the live site. Verify first. When the dev server can't be used,
  build and run `next start -p 3101` against the local database.
- In development the database client refuses any address that isn't on this computer
  (`src/lib/prisma.ts`), because the Vercel tool's `.env.local` once pointed `next dev` at the
  live database.
- `npm run db:import-pco` (`prisma/import-planning-center.ts`) imports from Planning Center's API.
  Rows it makes carry `pcoId`, so it can be run again without duplicating. It marks imported
  scheduling as already asked and reminded, so an import never causes an email.
- SongSelect has no sign-in here: CCLI opens its API only to approved partners, and scraping is
  against its terms. `/songs/import` reads downloaded ChordPro or text files (`parseSongFile`, and
  `importSongFiles`, which skips a song already here). `Organization.ccliLicense` is the church's number.
- The CCLI report (`/songs/ccli`, `src/lib/ccli.ts`) counts a song once per service it was in.
  CCLI takes automatic reports only from partner companies, so the app counts and exports; a
  person enters the numbers on reporting.ccli.com.
- A plan's other times (rehearsal, arrival, setup) are `PlanTime` rows, each with its own date. A
  service type's `TemplateTime` rows are copied onto a new plan, dated back from the service by
  `daysBefore`. One with no date and time is still to be decided and reads "Rehearsal: TBD"; the
  pencil on a plan's time changes it (`updatePlanTime`). Word them with `describePlanTime` in `src/lib/format.ts`; they appear on the plan,
  in "Your schedule" and in schedule emails.
- A song in the song list opens on `/songs/[id]/sheet`: the set list viewer showing that one song,
  with "Edit song sheet", "Edit song details" and "Print or change key" under it. The chart page
  (`/songs/[id]/chart/[arrangementId]`) is for printing and transposing; its paged view is labelled
  "Print". Chord display is offered as numerals, chords, numbers, lyrics, numerals by default.
- Song search also looks in lyrics (`src/lib/lyrics.ts`): the sung lines of each typed chart, compared
  without punctuation. It is done in memory, which is fine for a church's song list.
- A plan's Team panel can add to the church's lists without leaving the plan: "New person" in the
  Add sheet (planners; `addNewPersonToPlan` makes the person, gives them the position and schedules
  them) and "New position" under each team (`addPlanPosition`, which sends the plan `?position=` so
  the new position shows even when the template doesn't ask for it).
- The service type page is laid out like a plan (`PlanSections`), and `TemplateItemsEditor` follows
  `PlanEditor`'s rows (`rowClasses`, grip, clock from the usual start time, edit and remove on hover).
  It keeps the autosave: a change saves the whole list. A template row's `notes` ("Description")
  are copied to the plan row.
- The plan's Team panel lists only teams the service uses or someone is on, and reads top down: totals for the plan, then one foldable `TeamBlock` per team
  (its header says "3 of 5 filled"), then positions as quiet small-caps labels with the people under
  them. People are the loudest thing in it; keep per-position controls quiet, since they repeat.
- Auto-schedule (leaders and up, only the teams they manage) fills open spots on plans that already
  exist. The maintainer wants its button only in a plan's Team panel and on the matrix, not the Plans page.
  `AutoScheduleButton` opens a dialog that asks needed or needed and optional, says "About to
  auto-schedule N positions across M services. This can be undone." (`aboutToSchedule`), and applies
  those exact picks (`applyAutoSchedule`). `/plans/auto-schedule` is the longer review list, reached
  from that dialog. `autoSchedule` in `src/lib/auto-schedule.ts` is pure and tested;
  `autoScheduleProposal` in `src/lib/schedule.ts` gathers its facts. Each apply is an
  `AutoScheduleRun`, and `UndoAutoSchedule` offers the latest run with anything left to take off
  (`undoableAssignments`): unanswered, not yet asked, and on a service still to come. Anyone asked
  stays, because they're expecting to serve. Nobody is emailed until requests are sent, from the plan
  or across the matrix's plans (`sendUnaskedRequests`). Open spots come
  from `TemplatePosition`, so a service type needs its positions set. A template position ticked
  `optional` never counts as unfilled, and needed positions always go first. Hard
  limits: blackouts, `Person.maxPerMonth` and `preferredWeeks` (Serving preferences, editable by the
  person), and `ServingPartner.always`. Scheduling by hand can go outside all but blackouts. Serving
  partners are set on a person's page by planners; a pair is one row, lower id first. "Always
  together" is ignored for a partner whose positions that service doesn't use.
- The Claude connection is an MCP server at `/api/mcp` (`src/app/api/mcp/route.ts`, tools in
  `src/lib/mcp/tools.ts`). A token from the Account page (`ApiToken`, hash only) signs Claude in as
  that person: `runAsUser` makes `getCurrentUser()` return them, so tools call the same Server
  Actions as the pages and every permission check applies. Write tools go through actions, never
  straight to the database. Tools that email (`send_schedule_requests`, `invite_person`) and
  `delete_plan` say in their descriptions to confirm with the user first. Edit tools fill in every
  field the action's form expects from the current record (`keep`), because the actions overwrite
  any field that is missing.
- claude.ai and the Claude phone app connect through OAuth (`src/lib/oauth.ts`): discovery at
  `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`, dynamic
  client registration at `/oauth/register`, the Allow page at `/oauth/authorize`, PKCE (S256) at
  `/oauth/token`. The tokens it issues are `ApiToken` rows that expire (30 days) and are renewed with
  a rotating refresh token. Sign-in returns to `?next=` (same-site paths only).
- Colour themes: `src/lib/palettes.ts` lists them, `globals.css` has a `:root[data-palette="…"]` block
  per theme (light and dark), and Account → Appearance picks one, saved per device in localStorage
  like light/dark. Ember is the default. A new
  theme needs its 600 shade to carry white text at 4.5:1 and its links to read at 4.5:1.
- The app's mark (`Logo` in `ui.tsx`) is the home-screen icon's drawing, three rows of a service
  order, in the theme's colours; it shows on sign-in pages. The top-left corner shows `ChurchMark`:
  the church's own logo when an admin has uploaded one on the Account page (`ChurchLogo`, served by
  `/logo?v=<logoUpdatedAt>`), else the app's mark. Logos are shrunk to 512px in the browser and
  checked by their first bytes (PNG, JPEG, WebP; never SVG). Read `Organization` with a `select`
  where it matters; the image itself lives only in `ChurchLogo`.
- Each church runs its own copy on its own accounts; there's no shared site (`Person.email` is unique
  across the database). `/setup` makes the first church and admin on an empty database, guarded by
  `SETUP_CODE`, and `/login` sends there. `/getting-started` is the admin's checklist, worked out
  afresh from `setup-checks.ts`. `/getting-started/planning-center` previews a church's account with a
  pasted token (`src/lib/pco.ts`), which is never saved or logged, and brings its people across page
  by page (`importPlanningCenterPeople`, `readContact`): Services people by name, then details from
  the directory. It fills only blanks and can run again. Everything else stays with
  `npm run db:import-pco`. `PCO_API_URL` exists only so tests
  can stand in for Planning Center. See `docs/INSTALL-HELPER.md`.
- People and songs are archived, not deleted.
- Plan dates are calendar dates (`@db.Date`, UTC midnight) and start times are "HH:MM" strings; format
  them with `src/lib/format.ts` and never convert them through a timezone.
- Uploaded files go through `src/lib/storage.ts` and are only served by the signed-in `/files/[id]`
  route. The allowed-extension list there is the upload allow list; never serve HTML or SVG.
- Chord chart parsing/transposing lives in `src/lib/chords.ts` (pure, no dependencies). Change it
  test-first: add a case to `src/lib/chords.test.ts` and run `npm test`.
- Chart output is deliberately plain: `.chart-font` (Courier), `white-space: pre`, chords bold, no
  colour or boxes, and as much on a printed page as possible. The maintainer chose this; don't "prettify" it.
- A plan's Print button opens `/plans/[id]/print`: the service order on one Letter sheet
  (`OrderSheet` in `service-print.tsx`, smaller type when the order is long, with the team), then
  every song with a typed sheet as `PrintedChart` pages, numerals in the plan's key. "Save as PDF"
  in the print dialog is the download; there is no server-side PDF. `.service-print` in
  `globals.css` starts each sheet on a new page.
- The chart viewer has two views: "pages" (default, and what prints) and "screen" (continuous, for
  band members playing from a device). The maintainer wants the screen view kept for a future on-device
  music view; don't remove it.
- On a screen, chords are bold black in light mode and bold blue in dark mode (`Row.chords`).
  Printed pages stay black. The future song-sheet viewer for band members must do the same.
- Printed chart pages are laid out by `src/lib/chart-pages.ts` (Letter, points, fixed line height)
  and rendered as `.chart-page` sheets; the on-screen "Pages" view is those same sheets zoomed down.
  Anything that changes a sheet's height (header, margins, line height) must change `PAGE` there too.
- The chart editor is a transparent textarea over a highlighted copy of its text; both must stay in
  the same monospace font and box so bold never shifts the characters.
- Plan queries for anyone below team leader must go through `visiblePlans(user)` in
  `src/lib/schedule.ts`, so members only reach plans they're scheduled on.
- Schedule email links are an assignment id plus an HMAC of it (`responseUrl` / `verifyResponseLink`).
  The response page must never change anything on a plain GET; answering is a form POST.
- Requests and reminders are one email per person (`sendScheduleEmails`), so nobody gets several at
  once. One service keeps its Yes/No buttons; several use `scheduleListEmail`, whose one button opens
  `/respond/person/[id]` (`serviceListUrl`, signed for the person, no sign-in, since most of the team
  have no password). It lists their upcoming services, each answered on its own. Heads-ups before a
  service stay one per service.
- The player is one `PlayerProvider` in the root layout (`src/components/player.tsx`); start
  playback with `usePlayer().play(tracks, index)` or `<PlayButton>`. Build tracks with
  `sourcesFor` in `src/lib/tracks.ts` so recordings are preferred over YouTube everywhere.
- `public/sw.js` caches only set list pages, `/files/*` and `/_next/static/*`. Anything else added
  to it must be safe to keep on a shared device; log out clears every cache (`nav.tsx`).
- To test offline behaviour, build and run `next start` on another port and drive it with a
  headless browser; the dev server has no service worker.
- All email goes through `sendEmail` in `src/lib/email.ts`, which logs instead of sending when
  `RESEND_API_KEY` is unset.
- The look is a squared-off, dark-first interface with a light twin (replaced an earlier look on the
  `ui-improvements` branch). Outfit for headings, Inter for text, JetBrains Mono for small-caps
  labels (`.eyebrow`, `.panel-head`, plan section headers). Ember
  (burnt orange-red) is the primary colour and Amber the small highlight (the logo's lit row, `.badge-key`). In
  `globals.css` the `indigo` scale holds Ember and `neutral` holds warm greys, so existing `indigo-*`
  classes are the primary colour. Corners are small: the radius scale is overridden in `@theme`, so
  `rounded-xl` is 6px; keep `rounded-full` for dots and avatars only.
- Light or dark is `data-theme` on `<html>`, set before first paint by the script in `layout.tsx` (saved
  choice, else the device) and switched by `ThemeToggle` in `nav.tsx`. `dark:` classes follow that attribute
  (`@custom-variant` in `globals.css`), not the device setting. Surfaces use `bg-surface`,
  `bg-surface-raised` and `bg-chrome`, hairlines use `border-line`. Muted text is `neutral-500` or darker
  on light surfaces so it stays readable; don't go below 12px for text people need to read.
  Chord charts keep their own plain look.
- Look and feel lives in `src/app/globals.css` (`.card`, `.list` + `.list-row`, `.btn*`, `.icon-btn`,
  `.icon-btn-accent`, `.badge`, `.badge-key`, `.empty`) and `src/components/ui.tsx` (`Icon`,
  `Logo`, `Avatar`, `DateTile`). Build new screens from these rather than one-off styles. One
  accent colour (indigo, which holds Slate); keys use `.badge-key`; a list of things is a `.list`, not a table.
- A page that stacks several big sections (the plan page) uses `.panel` with a `.panel-head` title
  bar and `.panel-body`, so the sections are easy to tell apart.
- Small removals that can be put back (a plan row, a song link) happen at once and show an Undo
  toast (`useToast` in `src/components/toast.tsx`); things that can't be put back (a plan, an
  uploaded file) ask first with `SubmitButton confirm`.
- Lists are searched with `FilterBar` (`src/components/filter-bar.tsx`): it filters as you type by
  putting the form's fields in the address, and the page re-renders from `searchParams`.
- The plan page's sections are laid out by `PlanSections`: side by side on a wide screen, tabs on
  a phone. People are scheduled through `AssignPerson`; someone blocked out that day is shown but
  can't be picked, and `addAssignment` refuses them too.
- Plan section headers are grey bands and rows alternate two shades. The maintainer asked for that; the UI
  review's "lighter headers" item was deliberately not applied. Likewise the sequence editor's
  row of section buttons is the maintainer's design.
- Against a database on this computer (and always outside production) the database client uses a single connection (`src/lib/prisma.ts`), because
  the local `prisma dev` database crosses its wires when two connections talk at once.
- If the dev server doesn't pick up a change to `globals.css`, re-save the file.
- Every page must work at phone width: sidebar on desktop, bottom tab bar on phones.
- `cacheComponents` is deliberately off (see next.config.ts).

## Commands

- `npm run db:start` starts local Postgres; `npm run db:migrate` after schema changes; `npm run db:seed`.
- Dev server runs on port 3100. The maintainer often has it running in their own terminal already; use that one.
- `prisma migrate dev` needs `SHADOW_DATABASE_URL` (local DB port + 1) or it fails with "type already exists".
- Run `npx next typegen` before `npx tsc --noEmit` when routes change.
