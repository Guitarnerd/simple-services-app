"use client";

import { useSyncExternalStore } from "react";
import { MAX_MERGED, normalizeTabs, type TabSlug } from "@/lib/workspace";

// Which tabs have been merged, kept on this computer (localStorage) so it is the same each visit.
const KEY = "nav-groups";
const EVENT = "nav-groups-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

// Whatever is stored, a tab belongs to at most one group and a group has at least two tabs.
function parse(raw: string): TabSlug[][] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const used = new Set<string>();
  const groups: TabSlug[][] = [];
  for (const entry of data) {
    if (!Array.isArray(entry)) continue;
    const slugs = normalizeTabs(entry.filter((s): s is string => typeof s === "string" && !used.has(s))).slice(0, MAX_MERGED);
    if (slugs.length < 2) continue;
    slugs.forEach((s) => used.add(s));
    groups.push(slugs);
  }
  return groups;
}

export function useNavGroups(): TabSlug[][] {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  return parse(raw);
}

function save(groups: TabSlug[][]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(groups));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// Drop `dragged` onto `target`: onto a lone tab they become a new group, onto a group it joins.
export function mergeTabs(groups: TabSlug[][], dragged: TabSlug, target: TabSlug | { group: TabSlug[] }) {
  if (groups.some((g) => g.includes(dragged))) return;
  if (typeof target === "string") {
    if (target === dragged || groups.some((g) => g.includes(target))) return;
    save([...groups, normalizeTabs([dragged, target])]);
    return;
  }
  if (target.group.length >= MAX_MERGED) return;
  save(groups.map((g) => (g === target.group || g.join() === target.group.join() ? normalizeTabs([...g, dragged]) : g)));
}

export function splitGroup(groups: TabSlug[][], group: TabSlug[]) {
  save(groups.filter((g) => g.join() !== group.join()));
}
