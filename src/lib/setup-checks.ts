// What's done and what's left in setting up a church's site. Pure, so it can be tested
// without a database; /getting-started gathers the facts.

export type SetupFacts = {
  emailKey: boolean;
  emailFrom: boolean;
  appUrl: string | null;
  fileStorage: boolean;
  reminders: boolean;
  logo: boolean;
  ccliLicense: boolean;
  teamsWithPositions: number;
  serviceTypesWithPositions: number;
  songs: number;
  plans: number;
  // From Planning Center: anything carrying its id.
  imported: number;
  people: number;
  logins: number;
};

export type SetupCheck = {
  id: string;
  title: string;
  done: boolean;
  // Not needed to run the church's services; it doesn't count towards being finished.
  optional?: boolean;
  summary: string;
  steps?: string[];
  link?: { href: string; label: string };
};

function realAddress(url: string | null) {
  return Boolean(url) && /^https:\/\//.test(url as string) && !/localhost|127\.0\.0\.1/.test(url as string);
}

// The site's own settings, changed in Vercel. Each needs a redeploy to take effect.
export function siteChecks(facts: SetupFacts): SetupCheck[] {
  return [
    {
      id: "address",
      title: "Your address",
      done: realAddress(facts.appUrl),
      summary: realAddress(facts.appUrl) ? `Links in emails go to ${facts.appUrl}.` : "Links in emails need this site's address.",
      steps: [
        "In Vercel, open your project, then Settings → Domains, and add an address such as services.yourchurch.org. You can skip this and keep the .vercel.app address.",
        "Vercel shows one DNS record. Add it wherever your church's domain is managed.",
        "In Settings → Environment Variables, set APP_URL to that address, starting https:// with no slash on the end.",
        "Redeploy.",
      ],
    },
    {
      id: "email",
      title: "Email",
      done: facts.emailKey && facts.emailFrom,
      summary: facts.emailKey && facts.emailFrom ? "Invitations, requests and reminders can be sent." : "Until this is set up, nothing is emailed: no invitations, requests or password resets.",
      steps: [
        "Create a free account at resend.com and choose Add Domain, using your church's domain.",
        "Resend lists DNS records. Add them wherever your domain is managed, then press Verify. This can take a few minutes.",
        "Create an API key in Resend.",
        "In Vercel, under Settings → Environment Variables, set RESEND_API_KEY to that key, and EMAIL_FROM to the sender, such as: Your Church <services@yourchurch.org>",
        "Redeploy, then come back here and send a test email.",
      ],
    },
    {
      id: "files",
      title: "File storage",
      done: facts.fileStorage,
      summary: facts.fileStorage ? "Charts and recordings can be uploaded." : "Uploading charts and recordings needs file storage.",
      steps: ["In Vercel, open your project, then Storage → Create Database → Blob.", "Choose private access and connect it to the project.", "Redeploy."],
    },
    {
      id: "reminders",
      title: "Daily reminders",
      done: facts.reminders,
      summary: facts.reminders ? "Reminders go out once a day." : "Reminders to answer, and before a service, need a secret setting.",
      steps: ["In Vercel, under Settings → Environment Variables, set CRON_SECRET to a long random password.", "Redeploy."],
    },
  ];
}

// What the church does in the app itself.
export function churchChecks(facts: SetupFacts): SetupCheck[] {
  return [
    {
      id: "planning-center",
      title: "Bring in Planning Center",
      done: facts.imported > 0,
      optional: true,
      summary: facts.imported > 0 ? "Your people are here from Planning Center." : "Moving from Planning Center? Bring your people across. If not, skip this.",
      link: { href: "/getting-started/planning-center", label: "Connect Planning Center" },
    },
    {
      id: "ccli",
      title: "CCLI and SongSelect",
      done: facts.ccliLicense,
      optional: true,
      summary: "Save your CCLI licence number, then import charts downloaded from SongSelect.",
      link: { href: "/songs/ccli", label: "Open the CCLI report" },
    },
    {
      id: "teams",
      title: "Teams and positions",
      done: facts.teamsWithPositions > 0,
      summary: "The roles people serve in, such as Band → Keys.",
      link: { href: "/teams", label: "Open Teams" },
    },
    {
      id: "service-types",
      title: "Service types",
      done: facts.serviceTypesWithPositions > 0,
      summary: "Each kind of service, its usual order, and which positions it needs.",
      link: { href: "/plans/types", label: "Open Service types" },
    },
    {
      id: "logo",
      title: "Church logo",
      done: facts.logo,
      optional: true,
      summary: "Shows in the corner of every page.",
      link: { href: "/account", label: "Open Account" },
    },
    {
      id: "invite",
      title: "Invite your team",
      done: facts.logins > 1,
      summary: "Add people, then send each an invitation from their page. Sending needs Email set up first.",
      link: { href: "/people", label: "Open People" },
    },
  ];
}

export function stepsLeft(checks: SetupCheck[]) {
  return checks.filter((check) => !check.done && !check.optional).length;
}
