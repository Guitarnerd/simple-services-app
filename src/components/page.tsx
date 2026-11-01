import Link from "next/link";
import { Icon, Logo } from "@/components/ui";

// Standard page frame: centered column, title row with optional back link and actions.
export function Page({
  title,
  subtitle,
  back,
  actions,
  wide,
  hideTitleInPrint,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  wide?: boolean;
  // For pages whose printed sheet carries its own heading.
  hideTitleInPrint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-4xl"} px-4 py-5 sm:px-8 sm:py-9 print:max-w-none print:p-0`}>
      {back && (
        <Link
          href={back.href}
          className="muted -ml-1 mb-3 inline-flex items-center gap-0.5 rounded-lg py-0.5 pr-2 text-sm transition-colors hover:text-indigo-600 print:hidden dark:hover:text-indigo-300"
        >
          <Icon name="back" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className={`mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${hideTitleInPrint ? "print:hidden" : ""}`}>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle && <div className="muted mt-1 text-sm">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
      </div>
      <div className="flex flex-col gap-5 sm:gap-6">{children}</div>
    </div>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    // A little above the middle, where the eye lands first.
    <div className="flex flex-1 flex-col items-center px-4 pb-10 pt-[12vh]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Simple Services</span>
        </div>
        <div className="card sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="muted mb-6 mt-1 text-balance text-sm">{subtitle}</p>
          {children}
        </div>
        <p className="muted mt-5 text-center text-xs">Need access? Ask your church admin.</p>
      </div>
    </div>
  );
}
