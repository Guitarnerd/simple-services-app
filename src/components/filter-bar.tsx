"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// How long after the last keystroke the list updates.
const DELAY_MS = 200;

// A search form that filters as you type: its fields go into the address
// (?q=…), so a filtered list can be bookmarked or shared, and the page
// re-renders from that. Put ordinary named inputs inside it.
export function FilterBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function apply(form: HTMLFormElement, wait: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string" && value.trim()) params.set(name, value.trim());
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, wait);
  }

  return (
    <form
      role="search"
      className={className}
      onInput={(e) => apply(e.currentTarget, DELAY_MS)}
      // Enter, or a browser without scripts, still works as a plain form.
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget, 0);
      }}
    >
      {children}
    </form>
  );
}
