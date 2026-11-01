// A template, unlike a layout, is created afresh on every navigation, so each page it wraps
// fades and rises into place. The motion is in `.page-enter` (globals.css) and is switched off
// for anyone who has asked their device for less motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex min-w-0 flex-1 flex-col">{children}</div>;
}
