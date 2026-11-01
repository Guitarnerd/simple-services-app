import "server-only";
import type { PcoResource } from "@/lib/pco-contact";

// Reads a church's Planning Center account, with a Personal Access Token they paste in.
// The token is only ever passed through here for one request: it isn't saved or logged.

export type PcoLogin = { appId: string; secret: string };

export type PcoPreview = {
  church: string;
  people: number;
  teams: number;
  songs: number;
  upcomingPlans: number;
  pastPlans: number;
  serviceTypes: string[];
};

// Something to say to the person, rather than a crash.
export class PcoError extends Error {}

type Page = { data?: PcoResource | PcoResource[]; included?: PcoResource[]; meta?: { total_count?: number; next?: { offset?: number } } };

// Set only by tests, to stand in for Planning Center.
const api = () => process.env.PCO_API_URL ?? "https://api.planningcenteronline.com";

async function get(login: PcoLogin, path: string, retries = 3): Promise<Page | null> {
  let response: Response;
  try {
    response = await fetch(api() + path, { headers: { Authorization: `Basic ${Buffer.from(`${login.appId}:${login.secret}`).toString("base64")}` }, cache: "no-store" });
  } catch {
    throw new PcoError("Planning Center couldn't be reached. Check your connection and try again.");
  }
  // Planning Center allows about 100 requests every 20 seconds, and says how long to wait.
  if (response.status === 429 && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, (Number(response.headers.get("Retry-After")) || 5) * 1000 + 250));
    return get(login, path, retries - 1);
  }
  if (response.status === 401) throw new PcoError("Planning Center refused that. Check the Application ID and Secret, and that they haven't been deleted.");
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new PcoError(`Planning Center answered with an error (${response.status}). Try again in a moment.`);
  return (await response.json()) as Page;
}

async function count(login: PcoLogin, path: string) {
  return (await get(login, `${path}${path.includes("?") ? "&" : "?"}per_page=1`))?.meta?.total_count ?? 0;
}

// How much there is, in a few requests. Reads only, and nothing is kept.
export async function pcoPreview(login: PcoLogin): Promise<PcoPreview> {
  const home = await get(login, "/services/v2");
  if (!home) throw new PcoError("That account doesn't have Planning Center Services, or this token can't see it.");

  const types = await get(login, "/services/v2/service_types?per_page=100");
  const serviceTypes = (Array.isArray(types?.data) ? types.data : []).filter((type) => !type.attributes.archived_at && !type.attributes.deleted_at);

  const [people, teams, songs] = [await count(login, "/services/v2/people"), await count(login, "/services/v2/teams"), await count(login, "/services/v2/songs")];
  let upcomingPlans = 0;
  let pastPlans = 0;
  for (const type of serviceTypes) {
    upcomingPlans += await count(login, `/services/v2/service_types/${type.id}/plans?filter=future`);
    pastPlans += await count(login, `/services/v2/service_types/${type.id}/plans?filter=past`);
  }

  const church = !Array.isArray(home.data) && typeof home.data?.attributes.name === "string" ? home.data.attributes.name : "Your church";
  return { church, people, teams, songs, upcomingPlans, pastPlans, serviceTypes: serviceTypes.map((type) => String(type.attributes.name ?? "Service")) };
}

export const PEOPLE_PAGE = 100;

// One page of a list, its records, and where the next page starts (null at the end).
export async function pcoPage(login: PcoLogin, path: string, offset: number) {
  const page = await get(login, `${path}${path.includes("?") ? "&" : "?"}per_page=${PEOPLE_PAGE}&offset=${offset}`);
  const rows = Array.isArray(page?.data) ? page.data : [];
  const total = page?.meta?.total_count ?? 0;
  const reached = offset + rows.length;
  return {
    rows,
    included: new Map((page?.included ?? []).map((row) => [`${row.type}:${row.id}`, row])),
    total,
    // Worked out from the total if it isn't said, so a list can't stop short.
    next: page?.meta?.next?.offset ?? (rows.length > 0 && reached < total ? reached : null),
  };
}
