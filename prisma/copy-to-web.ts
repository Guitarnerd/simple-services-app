// Copies what is in the local database to the hosted one, once, to get the
// web version started. Everything it brings over that is test material is
// marked as sample data, so an admin can clear it all in one go later
// (Account page -> Sample data).
//
//   1. Deploy first, so the hosted database has its tables.
//   2. Put the hosted database's address in .env as WEB_DATABASE_URL
//      (use the "unpooled" / direct address).
//   3. npm run db:copy-to-web
//
// It refuses to run if the hosted database already has anything in it.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const client = (connectionString: string | undefined) => new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });

async function main() {
  if (!process.env.WEB_DATABASE_URL) throw new Error("Add WEB_DATABASE_URL (the hosted database's address) to .env first.");
  if (process.env.WEB_DATABASE_URL === process.env.DATABASE_URL) throw new Error("WEB_DATABASE_URL is the same as DATABASE_URL. It should be the hosted database.");
  const local = client(process.env.DATABASE_URL);
  const web = client(process.env.WEB_DATABASE_URL);

  try {
    const existing = await web.organization.count().catch(() => {
      throw new Error("The hosted database has no tables yet. Deploy the site once first (that creates them), then run this again.");
    });
    if (existing > 0) throw new Error("The hosted database already has data in it. Nothing was copied.");

    // People who can sign in are real; everyone else, and every song and plan, is test material.
    const people = (await local.person.findMany()).map((person) => ({ ...person, sample: !person.passwordHash && person.role !== "ADMIN" }));
    const songs = (await local.song.findMany()).map((song) => ({ ...song, sample: true }));
    const plans = (await local.plan.findMany()).map((plan) => ({ ...plan, sample: true }));
    // An uploaded file lives on this computer, not in the database, so only links come along.
    const attachments = await local.attachment.findMany();
    const links = attachments.filter((attachment) => attachment.kind === "LINK");

    // Parents before children, and all in one go: if anything fails, nothing is copied.
    const steps = [
      { name: "organization", rows: await local.organization.findMany(), write: (data: never[]) => web.organization.createMany({ data }) },
      { name: "people", rows: people, write: (data: never[]) => web.person.createMany({ data }) },
      { name: "phone numbers", rows: await local.phone.findMany(), write: (data: never[]) => web.phone.createMany({ data }) },
      { name: "teams", rows: await local.team.findMany(), write: (data: never[]) => web.team.createMany({ data }) },
      { name: "positions", rows: await local.position.findMany(), write: (data: never[]) => web.position.createMany({ data }) },
      { name: "people's positions", rows: await local.personPosition.findMany(), write: (data: never[]) => web.personPosition.createMany({ data }) },
      { name: "team leaders", rows: await local.teamLeader.findMany(), write: (data: never[]) => web.teamLeader.createMany({ data }) },
      { name: "service types", rows: await local.serviceType.findMany(), write: (data: never[]) => web.serviceType.createMany({ data }) },
      { name: "template rows", rows: await local.templateItem.findMany(), write: (data: never[]) => web.templateItem.createMany({ data }) },
      { name: "template positions", rows: await local.templatePosition.findMany(), write: (data: never[]) => web.templatePosition.createMany({ data }) },
      { name: "songs", rows: songs, write: (data: never[]) => web.song.createMany({ data }) },
      { name: "arrangements", rows: await local.arrangement.findMany(), write: (data: never[]) => web.arrangement.createMany({ data }) },
      { name: "song links", rows: links, write: (data: never[]) => web.attachment.createMany({ data }) },
      { name: "plans", rows: plans, write: (data: never[]) => web.plan.createMany({ data }) },
      { name: "plan rows", rows: await local.planItem.findMany(), write: (data: never[]) => web.planItem.createMany({ data }) },
      { name: "scheduling", rows: await local.assignment.findMany(), write: (data: never[]) => web.assignment.createMany({ data }) },
    ].filter((step) => step.rows.length > 0);

    await web.$transaction(steps.map((step) => step.write(step.rows as never[])));
    for (const step of steps) console.log(`Copied ${step.rows.length} ${step.name}`);

    const skipped = attachments.length - links.length;
    if (skipped > 0) console.log(`Left behind: ${skipped} uploaded ${skipped === 1 ? "file" : "files"} (upload them again on the web version).`);
    console.log("Left behind: blockout dates and sign-in links.");
    console.log(`Marked as sample data: ${people.filter((p) => p.sample).length} people, ${songs.length} songs, ${plans.length} plans.`);
  } finally {
    await Promise.all([local.$disconnect(), web.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
