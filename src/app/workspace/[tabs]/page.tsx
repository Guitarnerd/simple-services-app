import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { groupLabel, parseGroupId, tabBySlug } from "@/lib/workspace";
import { Workspace } from "@/components/workspace";

export async function generateMetadata({ params }: PageProps<"/workspace/[tabs]">): Promise<Metadata> {
  const slugs = parseGroupId((await params).tabs);
  return { title: slugs.length > 1 ? groupLabel(slugs) : "Workspace" };
}

// Several tabs on one screen. Each pane is the real page, so permissions and data are exactly
// what they are on the tab's own screen; this page only decides which addresses to show.
export default async function WorkspacePage({ params }: PageProps<"/workspace/[tabs]">) {
  await getCurrentUser();
  const slugs = parseGroupId((await params).tabs);
  if (slugs.length < 2) notFound();
  const panes = slugs.map((slug) => {
    const tab = tabBySlug(slug)!;
    return { href: tab.href, label: tab.label };
  });
  return <Workspace panes={panes} />;
}
