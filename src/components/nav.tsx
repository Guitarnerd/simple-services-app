"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { logout } from "@/lib/actions/auth";
import { Avatar, ChurchMark, Icon } from "@/components/ui";
import { mergeTabs, splitGroup, useNavGroups } from "@/components/nav-groups";
import { groupId, groupLabel, TABS, type Tab, type TabSlug } from "@/lib/workspace";

// Set lists saved for offline use belong to whoever was signed in, so they
// leave the device with them.
function clearOfflineCopies() {
  if ("caches" in window) caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
}

// Light or dark, saved on this device. The page's starting theme is set by the script in layout.tsx.
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function ThemeToggle({ className, label }: { className: string; label?: boolean }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {}
      }}
      className={className}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} className="h-[18px] w-[18px]" />
      {label && (theme === "dark" ? "Light mode" : "Dark mode")}
    </button>
  );
}

// What the nav lists: each tab, except that tabs merged into a group appear once, as the group,
// where the group's first tab was.
type Entry = { kind: "tab"; tab: Tab } | { kind: "group"; slugs: TabSlug[] };

function buildEntries(groups: TabSlug[][]): Entry[] {
  const entries: Entry[] = [];
  for (const tab of TABS) {
    const group = groups.find((g) => g.includes(tab.slug));
    if (!group) entries.push({ kind: "tab", tab });
    else if (group[0] === tab.slug) entries.push({ kind: "group", slugs: group });
  }
  return entries;
}

const ROW = "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors";
const ROW_ACTIVE = "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200";
const ROW_IDLE = "text-neutral-600 hover:bg-black/[0.04] hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100";
// Where a dragged tab would land: it takes on the active colour and a ring.
const ROW_DROP = "bg-indigo-500/10 text-indigo-700 ring-2 ring-indigo-500 dark:text-indigo-200";

// A tab in the sidebar: it can be picked up, and other tabs can be dropped on it.
function TabRow({ tab, active, dragging, onLinkClick }: { tab: Tab; active: boolean; dragging: string | null; onLinkClick: (e: React.MouseEvent) => void }) {
  const drag = useDraggable({ id: tab.slug });
  const drop = useDroppable({ id: tab.slug });
  const hot = drop.isOver && dragging !== null && dragging !== tab.slug;
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      style={{ transform: CSS.Translate.toString(drag.transform), zIndex: drag.isDragging ? 40 : undefined }}
      className={drag.isDragging ? "relative opacity-80 shadow-xl" : "relative"}
    >
      <Link
        href={tab.href}
        onClick={onLinkClick}
        draggable={false}
        aria-current={active ? "page" : undefined}
        title="Drag onto another tab to see them together"
        className={`${ROW} ${hot ? ROW_DROP : active ? ROW_ACTIVE : ROW_IDLE}`}
      >
        <Icon name={tab.icon} />
        {tab.label}
      </Link>
    </div>
  );
}

// Tabs merged into one screen. Another tab can still be dropped on it (up to three), and the
// x puts them back as separate tabs.
function GroupRow({ slugs, active, dragging, onSplit, onLinkClick }: { slugs: TabSlug[]; active: boolean; dragging: string | null; onSplit: () => void; onLinkClick: (e: React.MouseEvent) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${groupId(slugs)}` });
  const hot = isOver && dragging !== null;
  const first = TABS.find((t) => t.slug === slugs[0])!;
  const label = groupLabel(slugs);
  return (
    <div ref={setNodeRef} className="group/merged relative">
      <Link href={`/workspace/${groupId(slugs)}`} onClick={onLinkClick} draggable={false} aria-current={active ? "page" : undefined} title={label} className={`${ROW} pr-10 ${hot ? ROW_DROP : active ? ROW_ACTIVE : ROW_IDLE}`}>
        <Icon name={first.icon} />
        <span className="line-clamp-2 min-w-0 break-words leading-tight">{label}</span>
      </Link>
      <button
        type="button"
        onClick={onSplit}
        aria-label={`Split ${label} into separate tabs`}
        title="Split into separate tabs"
        className="icon-btn absolute right-1.5 top-1/2 !h-7 !w-7 -translate-y-1/2 opacity-60 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover/merged:opacity-100 md:focus-visible:opacity-100"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Nav({ userName, orgName, logoVersion }: { userName: string; orgName: string; logoVersion: string | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const groups = useNavGroups();
  const entries = buildEntries(groups);
  // The tab being dragged, and whether a drag has only just ended (so its release isn't a click).
  const [dragging, setDragging] = useState<string | null>(null);
  const justDragged = useRef(false);
  // A few pixels of movement before a press counts as a drag, so ordinary clicks still navigate.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const swallowDragClick = (e: React.MouseEvent) => {
    if (justDragged.current) e.preventDefault();
  };
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    if (!over) return;
    const dragged = String(active.id) as TabSlug;
    const target = String(over.id);
    if (target.startsWith("group:")) {
      const group = groups.find((g) => groupId(g) === target.slice(6));
      if (group) mergeTabs(groups, dragged, { group });
      return;
    }
    mergeTabs(groups, dragged, target as TabSlug);
  }
  // Splitting the screen you are looking at would leave you on an address with nothing to show.
  function split(group: TabSlug[]) {
    splitGroup(groups, group);
    if (pathname === `/workspace/${groupId(group)}`) router.replace(TABS.find((t) => t.slug === group[0])!.href);
  }
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: sidebar */}
      <aside className="app-chrome sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-black/[0.06] bg-chrome md:flex print:!hidden dark:border-white/[0.07]">
        <Link href="/" className="flex items-center gap-3 px-5 pb-5 pt-6">
          <ChurchMark logoVersion={logoVersion} className="h-9 w-9" />
          <span className="min-w-0">
            {/* The church's wordmark, with the app's name as a small caps line under it. */}
            <span className="font-heading block text-[13px] uppercase leading-tight tracking-[0.06em]">{orgName || "Simple Services"}</span>
            <span className="eyebrow block truncate !text-xs">Services</span>
          </span>
        </Link>

        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e) => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <nav className="flex flex-1 flex-col gap-0.5 px-3">
            {entries.map((entry) =>
              entry.kind === "tab" ? (
                <TabRow key={entry.tab.slug} tab={entry.tab} active={isActive(entry.tab.href)} dragging={dragging} onLinkClick={swallowDragClick} />
              ) : (
                <GroupRow key={groupId(entry.slugs)} slugs={entry.slugs} active={pathname === `/workspace/${groupId(entry.slugs)}` || entry.slugs.some((slug) => isActive(TABS.find((t) => t.slug === slug)!.href))} dragging={dragging} onSplit={() => split(entry.slugs)} onLinkClick={swallowDragClick} />
              ),
            )}
          </nav>
        </DndContext>

        <p className="mx-3 mb-2 px-3 text-xs leading-snug text-neutral-500 dark:text-neutral-400">Drag one tab onto another to see them on one screen.</p>

        <ThemeToggle label className="mx-3 mb-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-black/[0.05] hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100" />

        {/* Your name opens a small menu; logging out is inside it, not one stray click away. */}
        <div
          className="relative m-3"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
        >
          {menuOpen && (
            <div role="menu" className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-0.5 rounded-xl border border-black/[0.08] bg-surface-raised p-1.5 shadow-xl dark:border-white/10">
              <Link
                href="/account"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-black/[0.05] dark:text-neutral-200 dark:hover:bg-white/[0.08]"
              >
                <Icon name="account" className="h-[18px] w-[18px]" />
                Account
              </Link>
              <form action={logout} onSubmit={clearOfflineCopies}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-black/[0.05] dark:text-neutral-200 dark:hover:bg-white/[0.08]"
                >
                  <Icon name="logout" className="h-[18px] w-[18px]" />
                  Log out
                </button>
              </form>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`${userName}: account menu`}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-black/[0.06] p-2.5 text-left transition-colors hover:bg-black/[0.04] dark:border-white/[0.07] dark:hover:bg-white/[0.06]"
          >
            <Avatar name={userName} className="h-9 w-9 text-xs" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</span>
            <Icon name="chevron" className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${menuOpen ? "rotate-90" : "-rotate-90"}`} />
          </button>
        </div>
      </aside>

      {/* Phone: top bar and bottom tabs */}
      <header className="app-chrome sticky top-0 z-30 flex items-center justify-between border-b border-black/[0.06] bg-chrome/90 px-4 py-2.5 backdrop-blur md:hidden print:hidden dark:border-white/[0.07]">
        <Link href="/" className="flex items-center gap-2.5">
          <ChurchMark logoVersion={logoVersion} className="h-8 w-8" />
          <span className="min-w-0">
            <span className="font-heading block text-[13px] uppercase leading-tight tracking-[0.06em]">{orgName || "Simple Services"}</span>
            <span className="eyebrow block truncate !text-xs">Services</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
        <ThemeToggle className="icon-btn" />
        {/* Logging out is on the Account page, where a stray tap can't reach it. */}
        <Link href="/account" aria-label="Account" className={`icon-btn ${isActive("/account") ? "!text-indigo-600 dark:!text-indigo-300" : ""}`}>
          <Icon name="account" />
        </Link>
        </div>
      </header>

      <nav className="app-chrome fixed inset-x-0 bottom-0 z-30 flex border-t border-black/[0.06] bg-chrome/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden dark:border-white/[0.07]">
        {/* Merging tabs is for a larger window: the phone bar always lists the plain tabs. */}
        {buildEntries([])
          .filter((entry) => entry.kind === "group" || entry.tab.slug !== "account")
          .map((entry) => {
            const href = entry.kind === "tab" ? entry.tab.href : `/workspace/${groupId(entry.slugs)}`;
            const label = entry.kind === "tab" ? entry.tab.label : groupLabel(entry.slugs);
            const icon = entry.kind === "tab" ? entry.tab.icon : TABS.find((t) => t.slug === entry.slugs[0])!.icon;
            const active = entry.kind === "tab" ? isActive(entry.tab.href) : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-medium ${active ? "text-indigo-600 dark:text-indigo-300" : "text-neutral-500"}`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-lg transition-colors ${active ? "bg-indigo-50 dark:bg-indigo-400/15" : ""}`}>
                  <Icon name={icon} />
                </span>
                <span className="max-w-full truncate px-0.5">{entry.kind === "tab" ? label : label.replaceAll(" + ", "+")}</span>
              </Link>
            );
          })}
      </nav>
    </>
  );
}

// The Account page's way out, and the only one on a phone.
export function LogoutButton() {
  return (
    <form action={logout} onSubmit={clearOfflineCopies}>
      <button type="submit" className="btn btn-secondary">
        <Icon name="logout" className="h-[18px] w-[18px]" />
        Log out
      </button>
    </form>
  );
}
