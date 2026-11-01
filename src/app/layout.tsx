import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { getOptionalUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Nav, ThemeToggle } from "@/components/nav";
import { PlayerProvider } from "@/components/player";
import { ServiceWorker } from "@/components/service-worker";
import { FrameBridge } from "@/components/frame-bridge";
import { ToastProvider } from "@/components/toast";
import { DEFAULT_PALETTE, PALETTES } from "@/lib/palettes";

// Outfit for headings, Inter for text, JetBrains Mono for small-caps labels.
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

// Runs before first paint so the page never flashes the wrong theme: the saved choice,
// else the device's setting. Also notes when the page is a pane inside a merged screen
// (see components/workspace.tsx), where the sidebar and bars are left to the outer page.
// The colour theme (src/lib/palettes.ts) is set the same way, and follows a change made in
// another tab or pane through the storage event.
const PALETTE_IDS = JSON.stringify(PALETTES.map((p) => p.id));
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t}catch(e){}var ids=${PALETTE_IDS};function pal(v){d.dataset.palette=ids.indexOf(v)>=0?v:'${DEFAULT_PALETTE}'}try{pal(localStorage.getItem('palette'))}catch(e){pal(null)}try{addEventListener('storage',function(e){if(e.key==='palette')pal(e.newValue);if(e.key==='theme'&&(e.newValue==='light'||e.newValue==='dark'))d.dataset.theme=e.newValue})}catch(e){}try{if(window.top!==window.self)document.documentElement.dataset.embedded='1'}catch(e){document.documentElement.dataset.embedded='1'}})()`;

export const metadata: Metadata = {
  title: { default: "Simple Services", template: "%s · Simple Services" },
  description: "Service planning, scheduling and song charts.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The colour of a phone's address bar while the app is open.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121314" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getOptionalUser();
  const org = user
    ? await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, logoUpdatedAt: true } })
    : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col md:flex-row">
        <ServiceWorker />
        <FrameBridge />
        {/* Signed-out pages (sign in, reset, a schedule reply) have no sidebar, so the theme switch floats. */}
        {!user && (
          <div className="fixed right-4 top-4 z-40 print:hidden">
            <ThemeToggle className="icon-btn" />
          </div>
        )}
        {user && <Nav userName={`${user.firstName} ${user.lastName}`} orgName={org?.name ?? ""} logoVersion={org?.logoUpdatedAt ? String(org.logoUpdatedAt.getTime()) : null} />}
        <main className={`flex min-w-0 flex-1 flex-col ${user ? "pb-20 md:pb-0" : ""}`}>
          <ToastProvider>
            <PlayerProvider>{children}</PlayerProvider>
          </ToastProvider>
        </main>
      </body>
    </html>
  );
}
