// The app's top-level tabs, and the merged screens built from them. A merged screen lives at
// /workspace/songs-people (the tabs' slugs, in tab order), so the address itself says what is on it.
export const TABS = [
  { slug: "home", href: "/", label: "Home", icon: "home" },
  { slug: "plans", href: "/plans", label: "Plans", icon: "plans" },
  { slug: "songs", href: "/songs", label: "Songs", icon: "songs" },
  { slug: "people", href: "/people", label: "People", icon: "people" },
  { slug: "teams", href: "/teams", label: "Teams", icon: "teams" },
  { slug: "account", href: "/account", label: "Account", icon: "account" },
] as const;

export type Tab = (typeof TABS)[number];
export type TabSlug = Tab["slug"];

export const MAX_MERGED = 3;

const ORDER = new Map<string, number>(TABS.map((tab, index) => [tab.slug, index]));

export function tabBySlug(slug: string): Tab | undefined {
  return TABS.find((tab) => tab.slug === slug);
}

// Slugs in tab order, no repeats, only real tabs.
export function normalizeTabs(slugs: string[]): TabSlug[] {
  return [...new Set(slugs)]
    .filter((slug): slug is TabSlug => ORDER.has(slug))
    .sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

// "songs-people" -> ["songs", "people"]. Anything unknown is dropped.
export function parseGroupId(id: string): TabSlug[] {
  return normalizeTabs(id.split("-")).slice(0, MAX_MERGED);
}

export function groupId(slugs: TabSlug[]): string {
  return slugs.join("-");
}

export function groupLabel(slugs: TabSlug[]): string {
  return slugs.map((slug) => tabBySlug(slug)!.label).join(" + ");
}
