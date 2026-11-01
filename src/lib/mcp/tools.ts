import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasRole } from "@/lib/roles";
import { autoScheduleProposal, undoableAutoRun, visiblePlans } from "@/lib/schedule";
import { formatLength, toDateInput } from "@/lib/format";
import { addLink, createSong, saveArrangement, saveChart, saveSong, setSongArchived } from "@/lib/actions/songs";
import { addPlanItem, addPlanTime, createPlan, deletePlan, deletePlanItem, removePlanTime, reorderPlanItems, savePlanDetails, setPlanItemSong, updatePlanItem } from "@/lib/actions/plans";
import { addAssignment, addBlackout, addServingPartner, applyAutoSchedule, deleteBlackout, removeAssignment, removeServingPartner, saveServingPreferences, sendRequests, sendUnaskedRequests, setAssignmentStatus, undoAutoSchedule } from "@/lib/actions/schedule";
import { savePerson, savePositions, sendInvite, setArchived } from "@/lib/actions/people";
import { addPosition, createTeam, setTeamLeader } from "@/lib/actions/teams";
import type { FormState } from "@/components/form";

// The things Claude can do in the app. Each one runs as the person who made the
// connection token, through the same Server Actions the pages use, so the same
// permission checks and validation apply. Reads go straight to the database,
// scoped the same way the pages scope them.

export class ToolError extends Error {}

type Tool = {
  description: string;
  input: z.ZodObject;
  run: (args: never) => Promise<unknown>;
};

// Form fields for an action. A list becomes the same field repeated, as a form with several inputs of one name sends it.
function form(fields: Record<string, string | number | boolean | null | undefined | (string | number)[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(name, String(v));
    else if (value != null) data.set(name, String(value));
  }
  return data;
}

// For edits: what was asked for, or else what's there now. The app's forms send
// every field, so an edit that names one field must send the others unchanged.
// `null` clears a field; leaving it out keeps it.
function keep<T>(given: T | null | undefined, current: T | null | undefined) {
  return given === undefined ? current : given;
}

// Runs a Server Action. Actions that make something end by redirecting to it;
// that redirect is caught here and its address returned. A redirect to the home
// or sign-in page means the person isn't allowed to do it.
async function act(run: () => Promise<FormState | void | { error?: string }>) {
  try {
    const result = await run();
    if (result && "error" in result && result.error) throw new ToolError(result.error);
    return { result: result ?? undefined, redirectedTo: null as string | null };
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const to = digest.split(";")[2] ?? "";
      if (to === "/" || to === "/login") throw new ToolError("You don't have permission to do that.");
      return { result: undefined, redirectedTo: to };
    }
    throw error;
  }
}

const idFrom = (path: string | null, prefix: string) => (path?.startsWith(prefix) ? path.slice(prefix.length).split(/[/?]/)[0] : null);

const CHART_HELP =
  "A chord chart is plain text: section headings on their own line (Verse 1, Chorus, Bridge), chords on a line above the lyric they go over, " +
  "spaced so each chord sits over its syllable. Inline [G]chords and bar lines like | G - - - | C - - - | are also understood.";

export const TOOLS: Record<string, Tool> = {
  whoami: {
    description: "Who this connection is signed in as, their permission level, and the church.",
    input: z.object({}),
    run: async () => {
      const user = await getCurrentUser();
      const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
      return { name: `${user.firstName} ${user.lastName}`, role: user.role, church: org?.name };
    },
  },

  list_service_types: {
    description: "The kinds of service (e.g. Sunday Morning) with their ids and usual start time. Needed to create a plan.",
    input: z.object({}),
    run: async () => {
      const user = await getCurrentUser();
      const types = await prisma.serviceType.findMany({ where: { organizationId: user.organizationId }, orderBy: { sortOrder: "asc" } });
      return types.map((t) => ({ id: t.id, name: t.name, defaultTime: t.defaultTime }));
    },
  },

  search_songs: {
    description: "Find songs in the library by title or author. Leave query empty to list them all. Returns ids, keys and whether a chord chart is typed.",
    input: z.object({ query: z.string().optional(), includeArchived: z.boolean().optional() }),
    run: async ({ query, includeArchived }: { query?: string; includeArchived?: boolean }) => {
      const user = await getCurrentUser();
      const q = query?.trim();
      const songs = await prisma.song.findMany({
        where: {
          organizationId: user.organizationId,
          ...(includeArchived ? {} : { archived: false }),
          ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { author: { contains: q, mode: "insensitive" } }] } : {}),
        },
        orderBy: { title: "asc" },
        take: 100,
        include: { arrangements: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, key: true, chart: true } } },
      });
      return songs.map((s) => ({
        id: s.id,
        title: s.title,
        author: s.author,
        ccliNumber: s.ccliNumber,
        archived: s.archived,
        arrangements: s.arrangements.map((a) => ({ id: a.id, name: a.name, key: a.key, hasChart: Boolean(a.chart) })),
      }));
    },
  },

  get_song: {
    description: "One song with all its arrangements, including each typed chord chart.",
    input: z.object({ songId: z.string() }),
    run: async ({ songId }: { songId: string }) => {
      const user = await getCurrentUser();
      const song = await prisma.song.findFirst({
        where: { id: songId, organizationId: user.organizationId },
        include: { arrangements: { orderBy: { sortOrder: "asc" } }, attachments: { orderBy: { createdAt: "asc" } } },
      });
      if (!song) throw new ToolError("No song with that id.");
      return {
        id: song.id,
        title: song.title,
        author: song.author,
        ccliNumber: song.ccliNumber,
        notes: song.notes,
        archived: song.archived,
        linksAndFiles: song.attachments.map((a) => ({ id: a.id, kind: a.kind, name: a.name, url: a.kind === "LINK" ? a.url : null, arrangementId: a.arrangementId })),
        arrangements: song.arrangements.map((a) => ({
          id: a.id,
          name: a.name,
          key: a.key,
          bpm: a.bpm,
          timeSignature: a.meter,
          length: formatLength(a.lengthSeconds) || null,
          sequence: a.sequence,
          chartKey: a.chartKey,
          chart: a.chart,
        })),
      };
    },
  },

  create_song: {
    description: `Add a song to the library (planners and admins). Optionally include its chord chart. ${CHART_HELP} Check search_songs first so you don't add a song twice.`,
    input: z.object({
      title: z.string(),
      author: z.string().optional().describe("Writers, comma separated."),
      ccliNumber: z.string().optional(),
      key: z.string().optional().describe("The key it's usually played in, e.g. G or Bb."),
      bpm: z.number().int().optional(),
      timeSignature: z.string().optional().describe("e.g. 4/4 or 6/8."),
      length: z.string().optional().describe("Minutes and seconds, e.g. 4:30."),
      sequence: z.string().optional().describe("Section order, comma separated, e.g. Intro, Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus."),
      chart: z.string().optional().describe("The chord chart text."),
      chartKey: z.string().optional().describe("The key the chart is written in, if it has chords. Defaults to key."),
    }),
    run: async (args: { title: string; author?: string; ccliNumber?: string; key?: string; bpm?: number; timeSignature?: string; length?: string; sequence?: string; chart?: string; chartKey?: string }) => {
      const { redirectedTo } = await act(() =>
        createSong(undefined, form({ title: args.title, author: args.author, ccliNumber: args.ccliNumber, key: args.key, bpm: args.bpm, meter: args.timeSignature, length: args.length, sequence: args.sequence }))
      );
      const songId = idFrom(redirectedTo, "/songs/");
      if (!songId) throw new ToolError("The song wasn't created.");
      const arrangement = await prisma.arrangement.findFirst({ where: { songId }, orderBy: { sortOrder: "asc" } });
      if (args.chart && arrangement) {
        await act(() => saveChart(undefined, form({ songId, arrangementId: arrangement.id, chart: args.chart, chartKey: args.chartKey ?? args.key })));
      }
      return { songId, arrangementId: arrangement?.id, chartSaved: Boolean(args.chart) };
    },
  },

  set_song_chart: {
    description: `Replace the chord chart of one of a song's arrangements (planners and admins). ${CHART_HELP}`,
    input: z.object({
      songId: z.string(),
      arrangementId: z.string().optional().describe("Defaults to the song's first arrangement."),
      chart: z.string(),
      chartKey: z.string().optional().describe("The key the chart is written in, e.g. G."),
    }),
    run: async ({ songId, arrangementId, chart, chartKey }: { songId: string; arrangementId?: string; chart: string; chartKey?: string }) => {
      const id = arrangementId ?? (await prisma.arrangement.findFirst({ where: { songId }, orderBy: { sortOrder: "asc" } }))?.id;
      if (!id) throw new ToolError("That song has no arrangement.");
      await act(() => saveChart(undefined, form({ songId, arrangementId: id, chart, chartKey })));
      return { saved: true, arrangementId: id };
    },
  },

  list_plans: {
    description: "Service plans between two dates (YYYY-MM-DD). Defaults to the next 8 weeks.",
    input: z.object({ from: z.string().optional(), to: z.string().optional() }),
    run: async ({ from, to }: { from?: string; to?: string }) => {
      const user = await getCurrentUser();
      const start = from ? new Date(`${from}T00:00:00Z`) : new Date(`${toDateInput(new Date())}T00:00:00Z`);
      const end = to ? new Date(`${to}T00:00:00Z`) : new Date(start.getTime() + 56 * 86_400_000);
      const plans = await prisma.plan.findMany({
        where: { ...visiblePlans(user), date: { gte: start, lte: end } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 100,
        include: { serviceType: { select: { name: true } } },
      });
      return plans.map((p) => ({ id: p.id, date: toDateInput(p.date), startTime: p.startTime, serviceType: p.serviceType.name, title: p.title }));
    },
  },

  get_plan: {
    description: "One plan: its order of service (with item ids), other times, and who is scheduled in which position with their answers.",
    input: z.object({ planId: z.string() }),
    run: async ({ planId }: { planId: string }) => {
      const user = await getCurrentUser();
      const plan = await prisma.plan.findFirst({
        where: { id: planId, ...visiblePlans(user) },
        include: {
          serviceType: { select: { name: true } },
          items: { orderBy: { position: "asc" } },
          times: true,
          assignments: { include: { person: { select: { firstName: true, lastName: true } }, position: { include: { team: { select: { name: true } } } } } },
        },
      });
      if (!plan) throw new ToolError("No plan with that id that you can see.");
      return {
        id: plan.id,
        date: toDateInput(plan.date),
        startTime: plan.startTime,
        serviceType: plan.serviceType.name,
        title: plan.title,
        notes: plan.notes,
        items: plan.items.map((i) => ({ id: i.id, type: i.type, title: i.title, key: i.key, length: formatLength(i.lengthSeconds) || null, preService: i.preService, tag: i.tag, notes: i.notes, songId: i.songId })),
        otherTimes: plan.times.map((t) => ({ id: t.id, label: t.label, date: t.date ? toDateInput(t.date) : null, time: t.time })),
        team: plan.assignments.map((a) => ({
          assignmentId: a.id,
          person: `${a.person.firstName} ${a.person.lastName}`,
          personId: a.personId,
          team: a.position.team.name,
          position: a.position.name,
          answer: a.status,
          asked: Boolean(a.notifiedAt),
        })),
      };
    },
  },

  create_plan: {
    description: "Create a plan for a date (planners and admins). It starts from the service type's template. Returns the new plan's id.",
    input: z.object({
      serviceTypeId: z.string(),
      date: z.string().describe("YYYY-MM-DD"),
      startTime: z.string().optional().describe("24-hour HH:MM. Defaults to the service type's usual time."),
      title: z.string().optional().describe("e.g. Easter Sunday"),
    }),
    run: async ({ serviceTypeId, date, startTime, title }: { serviceTypeId: string; date: string; startTime?: string; title?: string }) => {
      const { redirectedTo } = await act(() => createPlan(undefined, form({ serviceTypeId, date, startTime, title })));
      const planId = idFrom(redirectedTo, "/plans/");
      if (!planId) throw new ToolError("The plan wasn't created.");
      return { planId };
    },
  },

  add_to_plan: {
    description: "Add a song, an item (e.g. Sermon, Offering) or a header to the end of a plan's order of service (planners and admins).",
    input: z.object({
      planId: z.string(),
      type: z.enum(["SONG", "ITEM", "HEADER"]),
      songId: z.string().optional().describe("For a SONG."),
      title: z.string().optional().describe("For an ITEM or HEADER."),
    }),
    run: async ({ planId, type, songId, title }: { planId: string; type: "SONG" | "ITEM" | "HEADER"; songId?: string; title?: string }) => {
      if (type === "SONG" && !songId) throw new ToolError("Give the songId to add.");
      if (type !== "SONG" && !title) throw new ToolError("Give a title.");
      await act(() => addPlanItem(planId, type === "SONG" ? { type, songId: songId! } : { type, title: title! }));
      return { added: true };
    },
  },

  list_people: {
    description: "People in the church's list, optionally filtered by name, with the team positions each one holds.",
    input: z.object({ query: z.string().optional() }),
    run: async ({ query }: { query?: string }) => {
      const user = await getCurrentUser();
      const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
      const people = await prisma.person.findMany({
        where: {
          organizationId: user.organizationId,
          archived: false,
          AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })),
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 200,
        include: { positions: { include: { position: { include: { team: { select: { name: true } } } } } } },
      });
      const leader = hasRole(user.role, "LEADER");
      return people.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        ...(leader ? { email: p.email } : {}),
        positions: p.positions.map((pp) => ({ positionId: pp.positionId, team: pp.position.team.name, position: pp.position.name })),
      }));
    },
  },

  list_teams: {
    description: "Teams and their positions, with ids. Needed to schedule someone.",
    input: z.object({}),
    run: async () => {
      const user = await getCurrentUser();
      const teams = await prisma.team.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { sortOrder: "asc" },
        include: { positions: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
      });
      return teams.map((t) => ({ id: t.id, name: t.name, positions: t.positions }));
    },
  },

  schedule_person: {
    description:
      "Put a person on a plan in a position (team leaders for their teams, planners and admins for any). They are not emailed until send_schedule_requests is used. Someone blocked out that day can't be scheduled.",
    input: z.object({ planId: z.string(), personId: z.string(), positionId: z.string() }),
    run: async ({ planId, personId, positionId }: { planId: string; personId: string; positionId: string }) => {
      await act(() => addAssignment(form({ planId, personId, positionId })));
      const made = await prisma.assignment.findFirst({ where: { planId, personId, positionId } });
      if (!made) {
        const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { date: true } });
        const out = plan && (await prisma.blackout.findFirst({ where: { personId, startDate: { lte: plan.date }, endDate: { gte: plan.date } } }));
        throw new ToolError(out ? "They're blocked out that day, so they can't be scheduled." : "They couldn't be scheduled. Check the ids and that you manage that team.");
      }
      return { assignmentId: made.id, answer: made.status };
    },
  },

  unschedule: {
    description: "Take someone off a plan, by the assignmentId from get_plan.",
    input: z.object({ assignmentId: z.string() }),
    run: async ({ assignmentId }: { assignmentId: string }) => {
      await act(() => removeAssignment(form({ assignmentId })));
      const still = await prisma.assignment.findUnique({ where: { id: assignmentId } });
      if (still) throw new ToolError("That couldn't be removed. You may not manage that team.");
      return { removed: true };
    },
  },

  preview_auto_schedule: {
    description:
      "See who auto-schedule would put in the open spots on plans between two dates (team leaders and up, for the teams they manage). Changes nothing. It takes turns fairly and keeps to blackouts, serving preferences and serving partners; open spots come with the reasons. Needed positions only, unless includeOptional is true; ask the user which they want. Use apply_auto_schedule to keep suggestions.",
    input: z.object({ from: z.string().describe("YYYY-MM-DD"), to: z.string().describe("YYYY-MM-DD"), serviceTypeId: z.string().optional(), includeOptional: z.boolean().optional() }),
    run: async ({ from, to, serviceTypeId, includeOptional }: { from: string; to: string; serviceTypeId?: string; includeOptional?: boolean }) => {
      const user = await getCurrentUser();
      if (!hasRole(user.role, "LEADER")) throw new ToolError("You don't have permission to do that.");
      const plans = await autoScheduleProposal(user, { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T00:00:00Z`), serviceTypeId, includeOptional });
      return plans.map((plan) => ({
        planId: plan.id,
        plan: plan.heading,
        suggested: plan.placed.map((p) => ({ personId: p.personId, positionId: p.positionId, person: p.personName, position: p.positionName, with: p.with })),
        stillOpen: plan.open,
      }));
    },
  },

  apply_auto_schedule: {
    description: "Put suggestions from preview_auto_schedule on their plans. Nobody is emailed until send_schedule_requests is used. Show the user the suggestions and confirm first.",
    input: z.object({ picks: z.array(z.object({ planId: z.string(), positionId: z.string(), personId: z.string() })) }),
    run: async ({ picks }: { picks: { planId: string; positionId: string; personId: string }[] }) => {
      const { result } = await act(() => applyAutoSchedule(undefined, form({ pick: picks.map((p) => `${p.planId}:${p.positionId}:${p.personId}`) })));
      return { message: (result as FormState)?.ok ?? "Done." };
    },
  },

  undo_auto_schedule: {
    description: "Take the latest auto-schedule back off its plans (team leaders and up). Anyone already asked or answered stays on. Confirm with the user first.",
    input: z.object({}),
    run: async () => {
      const user = await getCurrentUser();
      if (!hasRole(user.role, "LEADER")) throw new ToolError("You don't have permission to do that.");
      const run = await undoableAutoRun(user);
      if (!run) throw new ToolError("There's nothing left to undo.");
      const { result } = await act(() => undoAutoSchedule(undefined, form({ runId: run.id })));
      return { message: (result as FormState)?.ok ?? "Done." };
    },
  },

  set_serving_preferences: {
    description: "Set how often someone serves (themselves, or anyone for planners and admins). Auto-schedule keeps to this. maxPerMonth null is no limit; weeks are weeks of the month, 1 to 5, and empty means any. Only the fields given change.",
    input: z.object({ personId: z.string(), maxPerMonth: z.number().int().nullable().optional(), weeks: z.array(z.number().int()).optional() }),
    run: async ({ personId, maxPerMonth, weeks }: { personId: string; maxPerMonth?: number | null; weeks?: number[] }) => {
      const user = await getCurrentUser();
      const person = await prisma.person.findFirst({ where: { id: personId, organizationId: user.organizationId } });
      if (!person) throw new ToolError("No person with that id.");
      await act(() => saveServingPreferences(undefined, form({ personId, maxPerMonth: keep(maxPerMonth, person.maxPerMonth), week: keep(weeks, person.preferredWeeks) ?? [] })));
      return { saved: true };
    },
  },

  add_serving_partner: {
    description:
      "Link two people so auto-schedule puts them on the same services (planners and admins). always true means neither is scheduled without the other, for family; false means it leans that way, for people who work well together. Adding an existing pair changes its kind.",
    input: z.object({ personId: z.string(), partnerId: z.string(), always: z.boolean().optional() }),
    run: async ({ personId, partnerId, always }: { personId: string; partnerId: string; always?: boolean }) => {
      await act(() => addServingPartner(undefined, form({ personId, partnerId, always: always ?? false })));
      return { added: true };
    },
  },

  remove_serving_partner: {
    description: "Unlink two serving partners (planners and admins).",
    input: z.object({ personId: z.string(), partnerId: z.string() }),
    run: async ({ personId, partnerId }: { personId: string; partnerId: string }) => {
      await act(() => removeServingPartner(form({ personId, partnerId })));
      return { removed: true };
    },
  },

  send_schedule_requests: {
    description:
      "Email the people on a plan. kind 'request' asks everyone not yet asked; 'reminder' nudges those who were asked and haven't answered. This sends real email, so confirm with the user first.",
    input: z.object({ planId: z.string(), kind: z.enum(["request", "reminder"]).optional() }),
    run: async ({ planId, kind }: { planId: string; kind?: "request" | "reminder" }) => {
      const { result } = await act(() => sendRequests(undefined, form({ planId, kind: kind ?? "request" })));
      return { message: (result as FormState)?.ok ?? "Done." };
    },
  },

  send_unasked_requests: {
    description: "Email everyone not yet asked across several plans. Each person gets one email listing all of their services. This sends real email, so confirm with the user first.",
    input: z.object({ planIds: z.array(z.string()) }),
    run: async ({ planIds }: { planIds: string[] }) => {
      const { result } = await act(() => sendUnaskedRequests(undefined, form({ planId: planIds })));
      return { message: (result as FormState)?.ok ?? "Done." };
    },
  },

  // ----- Songs: details, arrangements, links -----

  update_song: {
    description:
      "Change a song's details (planners and admins): title, authors, CCLI number, notes. Only the fields given change; null clears one. " +
      "Good for filling in authors and CCLI numbers you've looked up.",
    input: z.object({
      songId: z.string(),
      title: z.string().optional(),
      author: z.string().nullable().optional().describe("Writers, comma separated."),
      ccliNumber: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
    run: async (args: { songId: string; title?: string; author?: string | null; ccliNumber?: string | null; notes?: string | null }) => {
      const user = await getCurrentUser();
      const song = await prisma.song.findFirst({ where: { id: args.songId, organizationId: user.organizationId } });
      if (!song) throw new ToolError("No song with that id.");
      await act(() =>
        saveSong(
          undefined,
          form({ songId: song.id, title: keep(args.title, song.title), author: keep(args.author, song.author), ccliNumber: keep(args.ccliNumber, song.ccliNumber), notes: keep(args.notes, song.notes) })
        )
      );
      return { saved: true };
    },
  },

  update_arrangement: {
    description:
      "Change an arrangement's details (planners and admins): name, key, BPM, time signature, length, section order, notes. Only the fields given change; null clears one. " +
      "Defaults to the song's first arrangement. Good for filling in BPMs and time signatures you've looked up.",
    input: z.object({
      songId: z.string(),
      arrangementId: z.string().optional(),
      name: z.string().optional(),
      key: z.string().nullable().optional(),
      bpm: z.number().int().nullable().optional(),
      timeSignature: z.string().nullable().optional().describe("e.g. 4/4, 6/8."),
      length: z.string().nullable().optional().describe("Minutes and seconds, e.g. 4:30."),
      sequence: z.string().nullable().optional().describe("Section order, comma separated, e.g. Intro, Verse 1, Chorus, Bridge, Chorus."),
      notes: z.string().nullable().optional(),
    }),
    run: async (args: { songId: string; arrangementId?: string; name?: string; key?: string | null; bpm?: number | null; timeSignature?: string | null; length?: string | null; sequence?: string | null; notes?: string | null }) => {
      const user = await getCurrentUser();
      const arrangement = await prisma.arrangement.findFirst({
        where: { songId: args.songId, song: { organizationId: user.organizationId }, ...(args.arrangementId ? { id: args.arrangementId } : {}) },
        orderBy: { sortOrder: "asc" },
      });
      if (!arrangement) throw new ToolError("No arrangement found for that song.");
      await act(() =>
        saveArrangement(
          undefined,
          form({
            songId: args.songId,
            arrangementId: arrangement.id,
            name: keep(args.name, arrangement.name),
            key: keep(args.key, arrangement.key),
            bpm: keep(args.bpm, arrangement.bpm),
            meter: keep(args.timeSignature, arrangement.meter),
            length: args.length === undefined ? formatLength(arrangement.lengthSeconds) : args.length,
            sequence: keep(args.sequence, arrangement.sequence),
            arrangementNotes: keep(args.notes, arrangement.notes),
          })
        )
      );
      return { saved: true, arrangementId: arrangement.id };
    },
  },

  add_arrangement: {
    description: "Add another arrangement to a song, e.g. 'Acoustic' or 'Christmas' (planners and admins).",
    input: z.object({
      songId: z.string(),
      name: z.string(),
      key: z.string().optional(),
      bpm: z.number().int().optional(),
      timeSignature: z.string().optional(),
      length: z.string().optional(),
      sequence: z.string().optional(),
    }),
    run: async (args: { songId: string; name: string; key?: string; bpm?: number; timeSignature?: string; length?: string; sequence?: string }) => {
      await act(() => saveArrangement(undefined, form({ songId: args.songId, name: args.name, key: args.key, bpm: args.bpm, meter: args.timeSignature, length: args.length, sequence: args.sequence })));
      const made = await prisma.arrangement.findFirst({ where: { songId: args.songId, name: args.name }, orderBy: { sortOrder: "desc" } });
      return { arrangementId: made?.id };
    },
  },

  add_song_link: {
    description: "Attach a web link to a song, such as a YouTube recording or a chart site (planners and admins). A YouTube link is named after its video if no label is given.",
    input: z.object({ songId: z.string(), url: z.string(), label: z.string().optional(), arrangementId: z.string().optional() }),
    run: async ({ songId, url, label, arrangementId }: { songId: string; url: string; label?: string; arrangementId?: string }) => {
      await act(() => addLink(undefined, form({ songId, url, name: label, arrangementId })));
      return { added: true };
    },
  },

  archive_song: {
    description: "Archive a song so it drops out of the song list and pickers (or bring it back with archived false). Songs are never deleted.",
    input: z.object({ songId: z.string(), archived: z.boolean() }),
    run: async ({ songId, archived }: { songId: string; archived: boolean }) => {
      await act(() => setSongArchived(form({ songId, archived: String(archived) })));
      return { archived };
    },
  },

  // ----- Plans: details, rows, times -----

  update_plan: {
    description: "Change a plan's details (planners and admins): date, start time, service type, title, notes for the team. Only the fields given change; null clears title or notes.",
    input: z.object({
      planId: z.string(),
      date: z.string().optional().describe("YYYY-MM-DD"),
      startTime: z.string().nullable().optional().describe("24-hour HH:MM"),
      serviceTypeId: z.string().optional(),
      title: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
    run: async (args: { planId: string; date?: string; startTime?: string | null; serviceTypeId?: string; title?: string | null; notes?: string | null }) => {
      const user = await getCurrentUser();
      const plan = await prisma.plan.findFirst({ where: { id: args.planId, organizationId: user.organizationId } });
      if (!plan) throw new ToolError("No plan with that id.");
      await act(() =>
        savePlanDetails(
          undefined,
          form({
            planId: plan.id,
            date: args.date ?? toDateInput(plan.date),
            startTime: keep(args.startTime, plan.startTime),
            serviceTypeId: args.serviceTypeId ?? plan.serviceTypeId,
            title: keep(args.title, plan.title),
            notes: keep(args.notes, plan.notes),
          })
        )
      );
      return { saved: true };
    },
  },

  update_plan_item: {
    description:
      "Change one row of a plan's order (planners and admins): title (not for a library song), length, key (songs), notes, pre-service (headers only), tag (songs: played as just its tag in this plan), arrangement. " +
      "Everything under a pre-service header, up to the next header, is timed back from the start time. Only the fields given change.",
    input: z.object({
      itemId: z.string(),
      title: z.string().optional(),
      length: z.string().nullable().optional().describe("e.g. 4:30"),
      key: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      preService: z.boolean().optional(),
      tag: z.boolean().optional(),
      arrangementId: z.string().optional(),
    }),
    run: async (args: { itemId: string; title?: string; length?: string | null; key?: string | null; notes?: string | null; preService?: boolean; tag?: boolean; arrangementId?: string }) => {
      const user = await getCurrentUser();
      const item = await prisma.planItem.findFirst({ where: { id: args.itemId, plan: { organizationId: user.organizationId } } });
      if (!item) throw new ToolError("No plan row with that id.");
      await act(() =>
        updatePlanItem(item.id, {
          title: args.title ?? item.title,
          length: args.length === undefined ? formatLength(item.lengthSeconds) : (args.length ?? ""),
          key: keep(args.key, item.key) ?? "",
          notes: keep(args.notes, item.notes) ?? "",
          preService: args.preService ?? item.preService,
          tag: args.tag ?? item.tag,
          arrangementId: args.arrangementId ?? item.arrangementId ?? "",
        })
      );
      return { saved: true };
    },
  },

  remove_plan_item: {
    description: "Take one row out of a plan's order (planners and admins).",
    input: z.object({ itemId: z.string() }),
    run: async ({ itemId }: { itemId: string }) => {
      await act(() => deletePlanItem(itemId));
      return { removed: true };
    },
  },

  reorder_plan: {
    description: "Put a plan's rows in a new order (planners and admins). Give every row's id from get_plan, in the order wanted.",
    input: z.object({ planId: z.string(), itemIds: z.array(z.string()) }),
    run: async ({ planId, itemIds }: { planId: string; itemIds: string[] }) => {
      await act(() => reorderPlanItems(planId, itemIds));
      return { reordered: true };
    },
  },

  fill_song_slot: {
    description: "Put a library song into an empty song slot that came from the service's template (planners and admins).",
    input: z.object({ itemId: z.string(), songId: z.string() }),
    run: async ({ itemId, songId }: { itemId: string; songId: string }) => {
      await act(() => setPlanItemSong(itemId, songId));
      return { filled: true };
    },
  },

  add_plan_time: {
    description: "Add another time to a plan, such as Rehearsal, Arrival or Setup (planners and admins). Leave date and time out, with tbd true, if it isn't decided yet.",
    input: z.object({ planId: z.string(), label: z.string(), date: z.string().optional().describe("YYYY-MM-DD"), time: z.string().optional().describe("24-hour HH:MM"), tbd: z.boolean().optional() }),
    run: async ({ planId, label, date, time, tbd }: { planId: string; label: string; date?: string; time?: string; tbd?: boolean }) => {
      await act(() => addPlanTime(undefined, form({ planId, label, date, time, tbd: tbd ? "on" : undefined })));
      return { added: true };
    },
  },

  remove_plan_time: {
    description: "Remove one of a plan's other times, by its id from get_plan.",
    input: z.object({ timeId: z.string() }),
    run: async ({ timeId }: { timeId: string }) => {
      await act(() => removePlanTime(form({ timeId })));
      return { removed: true };
    },
  },

  delete_plan: {
    description: "Delete a whole plan, with its order and scheduling (planners and admins). This can't be undone: always confirm with the user first.",
    input: z.object({ planId: z.string() }),
    run: async ({ planId }: { planId: string }) => {
      await act(() => deletePlan(form({ planId })));
      return { deleted: true };
    },
  },

  // ----- People -----

  get_person: {
    description: "One person: contact details (for leaders and up), positions, serving preferences and partners, blackout dates and upcoming services.",
    input: z.object({ personId: z.string() }),
    run: async ({ personId }: { personId: string }) => {
      const user = await getCurrentUser();
      const person = await prisma.person.findFirst({
        where: { id: personId, organizationId: user.organizationId },
        include: {
          phones: true,
          positions: { include: { position: { include: { team: { select: { name: true } } } } } },
          blackouts: { where: { endDate: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { startDate: "asc" } },
          partnersA: { include: { personB: { select: { id: true, firstName: true, lastName: true } } } },
          partnersB: { include: { personA: { select: { id: true, firstName: true, lastName: true } } } },
          assignments: { where: { plan: { date: { gte: new Date(Date.now() - 86_400_000) } } }, include: { plan: true, position: true } },
        },
      });
      if (!person) throw new ToolError("No person with that id.");
      const leader = hasRole(user.role, "LEADER") || user.id === person.id;
      return {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        role: person.role,
        archived: person.archived,
        canSignIn: Boolean(person.passwordHash),
        ...(leader
          ? { email: person.email, phones: person.phones.map((p) => ({ number: p.number, label: p.label, primary: p.isPrimary })), address: [person.street, person.city, person.state, person.postalCode].filter(Boolean).join(", ") || null }
          : {}),
        ...(hasRole(user.role, "PLANNER") ? { notes: person.notes } : {}),
        positions: person.positions.map((pp) => ({ positionId: pp.positionId, team: pp.position.team.name, position: pp.position.name })),
        ...(leader
          ? {
              servingPreferences: { maxPerMonth: person.maxPerMonth, weeks: person.preferredWeeks },
              servingPartners: [...person.partnersA.map((p) => ({ other: p.personB, always: p.always })), ...person.partnersB.map((p) => ({ other: p.personA, always: p.always }))].map(({ other, always }) => ({
                personId: other.id,
                name: `${other.firstName} ${other.lastName}`,
                always,
              })),
            }
          : {}),
        blackouts: person.blackouts.map((b) => ({ id: b.id, from: toDateInput(b.startDate), to: toDateInput(b.endDate), reason: b.reason })),
        upcoming: person.assignments.map((a) => ({ assignmentId: a.id, planId: a.planId, date: toDateInput(a.plan.date), position: a.position.name, answer: a.status })),
      };
    },
  },

  create_person: {
    description: "Add someone to the church's People list (planners and admins). They can't sign in until invited.",
    input: z.object({ firstName: z.string(), lastName: z.string(), email: z.string().optional(), phone: z.string().optional() }),
    run: async ({ firstName, lastName, email, phone }: { firstName: string; lastName: string; email?: string; phone?: string }) => {
      const { redirectedTo } = await act(() => savePerson(undefined, form({ firstName, lastName, email: email ?? "", birthday: "", street: "", city: "", state: "", postalCode: "", notes: "", phoneNumber: phone ? [phone] : [], phoneLabel: phone ? ["Mobile"] : [], phonePrimary: 0 })));
      const personId = idFrom(redirectedTo, "/people/");
      if (!personId) throw new ToolError("The person wasn't added.");
      return { personId };
    },
  },

  update_person: {
    description:
      "Change someone's details (planners and admins, or yourself): name, email, phones, birthday, address, notes. Only the fields given change; null clears one. " +
      "phones replaces the whole list.",
    input: z.object({
      personId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().nullable().optional(),
      phones: z.array(z.object({ number: z.string(), label: z.string().optional(), primary: z.boolean().optional() })).optional(),
      birthday: z.string().nullable().optional().describe("YYYY-MM-DD"),
      street: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
      postalCode: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
    run: async (args: {
      personId: string;
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phones?: { number: string; label?: string; primary?: boolean }[];
      birthday?: string | null;
      street?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      notes?: string | null;
    }) => {
      const user = await getCurrentUser();
      const person = await prisma.person.findFirst({ where: { id: args.personId, organizationId: user.organizationId }, include: { phones: true } });
      if (!person) throw new ToolError("No person with that id.");
      const phones = args.phones ?? person.phones.map((p) => ({ number: p.number, label: p.label, primary: p.isPrimary }));
      await act(() =>
        savePerson(
          undefined,
          form({
            id: person.id,
            firstName: args.firstName ?? person.firstName,
            lastName: args.lastName ?? person.lastName,
            email: keep(args.email, person.email) ?? "",
            birthday: (args.birthday === undefined ? (person.birthday ? toDateInput(person.birthday) : null) : args.birthday) ?? "",
            street: keep(args.street, person.street) ?? "",
            city: keep(args.city, person.city) ?? "",
            state: keep(args.state, person.state) ?? "",
            postalCode: keep(args.postalCode, person.postalCode) ?? "",
            notes: keep(args.notes, person.notes) ?? "",
            phoneNumber: phones.map((p) => p.number),
            phoneLabel: phones.map((p) => p.label ?? "Mobile"),
            phonePrimary: Math.max(0, phones.findIndex((p) => p.primary)),
          })
        )
      );
      return { saved: true };
    },
  },

  set_person_positions: {
    description:
      "Set which team positions someone holds, e.g. Bass and Vocals (leaders for their teams, planners and admins for all). Positions on teams you don't manage are left as they are.",
    input: z.object({ personId: z.string(), positionIds: z.array(z.string()) }),
    run: async ({ personId, positionIds }: { personId: string; positionIds: string[] }) => {
      await act(() => savePositions(undefined, form({ personId, positionId: positionIds })));
      return { saved: true };
    },
  },

  archive_person: {
    description: "Archive someone who no longer serves (or restore them with archived false). People are never deleted (planners and admins).",
    input: z.object({ personId: z.string(), archived: z.boolean() }),
    run: async ({ personId, archived }: { personId: string; archived: boolean }) => {
      await act(() => setArchived(form({ personId, archived: String(archived) })));
      return { archived };
    },
  },

  invite_person: {
    description: "Email someone an invitation to sign in to Simple Services (admins). This sends real email: confirm with the user first.",
    input: z.object({ personId: z.string() }),
    run: async ({ personId }: { personId: string }) => {
      const { result } = await act(() => sendInvite(undefined, form({ personId })));
      return { message: (result as FormState)?.ok ?? "Done.", link: (result as FormState)?.link };
    },
  },

  add_blackout: {
    description: "Block out dates when someone can't serve (themselves, or anyone for planners and admins). Leave endDate out for a single day.",
    input: z.object({ personId: z.string(), startDate: z.string().describe("YYYY-MM-DD"), endDate: z.string().optional(), reason: z.string().optional() }),
    run: async ({ personId, startDate, endDate, reason }: { personId: string; startDate: string; endDate?: string; reason?: string }) => {
      await act(() => addBlackout(undefined, form({ personId, startDate, endDate, reason })));
      return { added: true };
    },
  },

  remove_blackout: {
    description: "Remove a blackout, by its id from get_person.",
    input: z.object({ blackoutId: z.string() }),
    run: async ({ blackoutId }: { blackoutId: string }) => {
      await act(() => deleteBlackout(form({ blackoutId })));
      return { removed: true };
    },
  },

  set_answer: {
    description: "Record someone's answer for a plan, given in person or by text (team leaders and up): PENDING (waiting), CONFIRMED or DECLINED.",
    input: z.object({ assignmentId: z.string(), answer: z.enum(["PENDING", "CONFIRMED", "DECLINED"]) }),
    run: async ({ assignmentId, answer }: { assignmentId: string; answer: "PENDING" | "CONFIRMED" | "DECLINED" }) => {
      await act(() => setAssignmentStatus(form({ assignmentId, status: answer })));
      const now = await prisma.assignment.findUnique({ where: { id: assignmentId } });
      if (now?.status !== answer) throw new ToolError("That answer couldn't be recorded. You may not manage that team.");
      return { answer };
    },
  },

  // ----- Teams -----

  create_team: {
    description: "Add a team, e.g. Greeters or Tech (planners and admins). Returns its id.",
    input: z.object({ name: z.string() }),
    run: async ({ name }: { name: string }) => {
      const { redirectedTo } = await act(() => createTeam(undefined, form({ name })));
      return { teamId: idFrom(redirectedTo, "/teams/") };
    },
  },

  add_position: {
    description: "Add a position to a team, e.g. Bass on the Band (leaders for their teams, planners and admins).",
    input: z.object({ teamId: z.string(), name: z.string() }),
    run: async ({ teamId, name }: { teamId: string; name: string }) => {
      await act(() => addPosition(undefined, form({ teamId, name })));
      const made = await prisma.position.findFirst({ where: { teamId, name: name.trim() } });
      return { positionId: made?.id };
    },
  },

  set_team_leader: {
    description: "Make someone a leader of a team, or stop them leading it (planners and admins). Leaders can schedule their team.",
    input: z.object({ teamId: z.string(), personId: z.string(), leads: z.boolean() }),
    run: async ({ teamId, personId, leads }: { teamId: string; personId: string; leads: boolean }) => {
      await act(() => setTeamLeader(form({ teamId, personId, leads: String(leads) })));
      return { leads };
    },
  },
};

export const toolList = () =>
  Object.entries(TOOLS).map(([name, tool]) => {
    const { $schema: _schema, ...inputSchema } = z.toJSONSchema(tool.input) as Record<string, unknown>;
    void _schema;
    return { name, description: tool.description, inputSchema };
  });

