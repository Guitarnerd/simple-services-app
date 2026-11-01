import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { Page } from "@/components/page";
import { PlanningCenterForm } from "./planning-center-form";

export const metadata: Metadata = { title: "Planning Center" };

const COMES_ACROSS = ["Everyone in Planning Center Services", "Their email address, phone numbers, street address and birthday"];
const STAYS_BEHIND = ["Teams and positions, songs, plans and service types", "These can be set up here by hand, and songs can be imported from files", "Uploaded files, team leaders and blockout dates"];

export default async function PlanningCenterPage() {
  await requireRole("ADMIN");

  return (
    <Page title="Planning Center" subtitle="Bring your people across from Planning Center. It only reads from Planning Center, and nobody is emailed." back={{ href: "/getting-started", label: "Getting started" }}>
      <section className="panel">
        <h2 className="panel-head">Connect</h2>
        <div className="panel-body flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              Sign in to Planning Center as an administrator, then open{" "}
              <a href="https://api.planningcenteronline.com/oauth/applications" target="_blank" rel="noopener noreferrer" className="link">
                its developer page
              </a>
              .
            </li>
            <li>Under Personal Access Tokens, choose New Personal Access Token and give it a name.</li>
            <li>Copy the Application ID and Secret it shows into the boxes below.</li>
          </ol>
          <PlanningCenterForm />
          <p className="muted text-xs">Your token stays on this page while it&apos;s open and isn&apos;t saved. You can delete it in Planning Center when you&apos;re finished.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-head">What comes across</h2>
        <div className="panel-body grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Comes across</h3>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
              {COMES_ACROSS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Doesn&apos;t</h3>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
              {STAYS_BEHIND.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </Page>
  );
}
