import { prisma } from "@/lib/prisma";
import { formatPlanDate, todayInZone } from "@/lib/format";
import { deleteBlackout } from "@/lib/actions/schedule";
import { BlackoutForm } from "@/components/schedule-forms";

// A person's upcoming blackout dates, with a form to add more.
export async function Blackouts({ personId, timezone, canEdit }: { personId: string; timezone: string; canEdit: boolean }) {
  const blackouts = await prisma.blackout.findMany({
    where: { personId, endDate: { gte: todayInZone(timezone) } },
    orderBy: { startDate: "asc" },
  });

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Blackout dates</h2>
        <p className="muted text-sm">Dates you can&apos;t serve. Schedulers see these when they&apos;re filling a plan.</p>
      </div>

      {blackouts.length === 0 ? (
        <p className="muted text-sm">None coming up.</p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {blackouts.map((blackout) => {
            const oneDay = blackout.startDate.getTime() === blackout.endDate.getTime();
            return (
              <li key={blackout.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">
                    {formatPlanDate(blackout.startDate, "short")}
                    {!oneDay && ` to ${formatPlanDate(blackout.endDate, "short")}`}
                  </span>
                  {blackout.reason && <span className="muted"> · {blackout.reason}</span>}
                </div>
                {canEdit && (
                  <form action={deleteBlackout}>
                    <input type="hidden" name="blackoutId" value={blackout.id} />
                    <button type="submit" className="muted cursor-pointer hover:text-red-600">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && <BlackoutForm personId={personId} />}
    </section>
  );
}
