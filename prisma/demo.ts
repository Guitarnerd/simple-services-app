// Adds made-up things to try the app with: four public-domain hymns, each with
// a chord chart and a YouTube link; three "Demo service" plans on the coming
// Sundays; and three pretend volunteers scheduled on them. The first admin is
// scheduled on the demo plans too, so their own calendar has something on it.
//   npm run db:demo            add them (skips any already there)
//   npm run db:demo -- remove  take them out again
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// How the demo songs are told apart from real ones.
const NOTE = "Demo song (public-domain hymn). Safe to archive or change.";
const PLAN_TITLE = "Demo service";
// How the pretend volunteers are told apart from real people.
const PERSON_NOTE = "Demo volunteer. Safe to archive or remove.";
const VOLUNTEERS = [
  { firstName: "Alex", lastName: "Demo", email: "alex.demo@example.com" },
  { firstName: "Jordan", lastName: "Demo", email: "jordan.demo@example.com" },
  { firstName: "Sam", lastName: "Demo", email: "sam.demo@example.com" },
];

// Charts are written here with the chord in brackets before its syllable, and
// stored the way a person would type them: a line of chords over the lyric.
function chart(source: string) {
  return source
    .trim()
    .split("\n")
    .flatMap((raw) => {
      const line = raw.trim();
      if (!line.includes("[")) return [line];
      let chords = "";
      let lyric = "";
      for (const part of line.split(/(\[[^\]]+\])/)) {
        if (part.startsWith("[")) {
          chords = chords.padEnd(chords === "" ? lyric.length : Math.max(lyric.length, chords.length + 1)) + part.slice(1, -1);
        } else {
          lyric += part;
        }
      }
      return [chords, lyric];
    })
    .join("\n");
}

const SONGS = [
  {
    title: "Amazing Grace",
    author: "John Newton",
    key: "G",
    bpm: 80,
    meter: "3/4",
    lengthSeconds: 240,
    sequence: "Verse 1, Verse 2, Verse 3, Verse 4",
    video: { name: "Amazing Grace by Reawaken (Acoustic Easter Hymn)", url: "https://www.youtube.com/watch?v=GmoBJS9FJuc" },
    chart: `
VERSE 1
A[G]mazing [G7]grace, how [C]sweet the [G]sound
That saved a wretch like [D]me
I [G]once was [G7]lost, but [C]now am [G]found
Was [Em]blind, but [D]now I [G]see

VERSE 2
'Twas [G]grace that [G7]taught my [C]heart to [G]fear
And grace my fears re[D]lieved
How [G]precious [G7]did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved

VERSE 3
Through [G]many [G7]dangers, [C]toils and [G]snares
I have already [D]come
'Tis [G]grace hath [G7]brought me [C]safe thus [G]far
And [Em]grace will [D]lead me [G]home

VERSE 4
When [G]we've been [G7]there ten [C]thousand [G]years
Bright shining as the [D]sun
We've [G]no less [G7]days to [C]sing God's [G]praise
Than [Em]when we'd [D]first be[G]gun`,
  },
  {
    title: "Come Thou Fount",
    author: "Robert Robinson, John Wyeth",
    key: "D",
    bpm: 92,
    meter: "3/4",
    lengthSeconds: 225,
    sequence: "Intro, Verse 1, Verse 2, Instrumental, Verse 3, Ending",
    video: { name: "JJ Heller - Come Thou Fount Of Every Blessing (Official Lyric Video)", url: "https://www.youtube.com/watch?v=Eh9LP6y3SU0" },
    chart: `
INTRO: D  A  G  D

VERSE 1
[D]Come, Thou Fount of [A]every blessing
[G]Tune my [D]heart to [A]sing Thy [D]grace
[D]Streams of mercy, [A]never ceasing
[G]Call for [D]songs of [A]loudest [D]praise
[D]Teach me [Bm]some me[G]lodious [D]sonnet
[D]Sung by [Bm]flaming [G]tongues a[A]bove
[D]Praise the mount, I'm [A]fixed upon it
[G]Mount of [D]Thy re[A]deeming [D]love

VERSE 2
[D]Here I raise my [A]Ebenezer
[G]Hither [D]by Thy [A]help I'm [D]come
[D]And I hope, by [A]Thy good pleasure
[G]Safely [D]to ar[A]rive at [D]home
[D]Jesus [Bm]sought me [G]when a [D]stranger
[D]Wandering [Bm]from the [G]fold of [A]God
[D]He, to rescue [A]me from danger
[G]Inter[D]posed His [A]precious [D]blood

VERSE 3
[D]O to grace how [A]great a debtor
[G]Daily [D]I'm con[A]strained to [D]be
[D]Let Thy goodness, [A]like a fetter
[G]Bind my [D]wandering [A]heart to [D]Thee
[D]Prone to [Bm]wander, [G]Lord, I [D]feel it
[D]Prone to [Bm]leave the [G]God I [A]love
[D]Here's my heart, O [A]take and seal it
[G]Seal it [D]for Thy [A]courts a[D]bove`,
  },
  {
    title: "It Is Well with My Soul",
    author: "Horatio Spafford, Philip Bliss",
    key: "C",
    bpm: 72,
    meter: "4/4",
    lengthSeconds: 270,
    sequence: "Verse 1, Chorus, Verse 2, Chorus, Verse 3, Chorus, Verse 4, Chorus, Tag",
    video: { name: "It Is Well With My Soul | Lyric Video | Lydia Walker", url: "https://www.youtube.com/watch?v=a9fvByuWsv8" },
    chart: `
VERSE 1
When [C]peace like a [F]river at[C]tendeth my [G]way
When [Am]sorrows like [D]sea billows [G]roll
What[C]ever my [F]lot, Thou hast [Dm]taught me to [G]say
It is [C]well, it is [F]well [G]with my [C]soul

CHORUS
It is [C]well (it is [G]well)
With my [G]soul (with my [C]soul)
It is [F]well, it is [C]well [G]with my [C]soul

VERSE 2
Though [C]Satan should [F]buffet, though [C]trials should [G]come
Let [Am]this blest as[D]surance con[G]trol
That [C]Christ has re[F]garded my [Dm]helpless e[G]state
And hath [C]shed His own [F]blood [G]for my [C]soul

VERSE 3
My [C]sin, oh the [F]bliss of this [C]glorious [G]thought
My [Am]sin, not in [D]part, but the [G]whole
Is [C]nailed to the [F]cross, and I [Dm]bear it no [G]more
Praise the [C]Lord, praise the [F]Lord, [G]O my [C]soul

VERSE 4
And [C]Lord, haste the [F]day when my [C]faith shall be [G]sight
The [Am]clouds be rolled [D]back as a [G]scroll
The [C]trump shall re[F]sound and the [Dm]Lord shall de[G]scend
Even [C]so, it is [F]well [G]with my [C]soul

TAG: F  C  G  C (x2)`,
  },
  {
    title: "Be Thou My Vision",
    author: "Traditional Irish, Mary Byrne, Eleanor Hull",
    key: "D",
    bpm: 88,
    meter: "3/4",
    lengthSeconds: 210,
    sequence: "Verse 1, Verse 2, Verse 3, Instrumental, Verse 4",
    video: { name: "Be Thou My Vision (Hymn 176) - Hymnology (Official Video)", url: "https://www.youtube.com/watch?v=DL_XkaB-Pyw" },
    chart: `
VERSE 1
[D]Be Thou my [G]vision, O [A]Lord of my [D]heart
[A]Naught be all [G]else to me, [D]save that Thou [A]art
[G]Thou my best [D]thought, by [Bm]day or by [A]night
[Bm]Waking or [G]sleeping, Thy [A]presence my [D]light

VERSE 2
[D]Be Thou my [G]wisdom, and [A]Thou my true [D]Word
[A]I ever [G]with Thee and [D]Thou with me, [A]Lord
[G]Thou my great [D]Father, [Bm]I Thy true [A]son
[Bm]Thou in me [G]dwelling, and [A]I with Thee [D]one

VERSE 3
[D]Riches I [G]heed not, nor [A]man's empty [D]praise
[A]Thou mine in[G]heritance, [D]now and al[A]ways
[G]Thou and Thou [D]only, [Bm]first in my [A]heart
[Bm]High King of [G]heaven, my [A]treasure Thou [D]art

INSTRUMENTAL: D  G  A  D

VERSE 4
[D]High King of [G]heaven, my [A]victory [D]won
[A]May I reach [G]heaven's joys, O [D]bright heaven's [A]Sun
[G]Heart of my [D]own heart, what[Bm]ever be[A]fall
[Bm]Still be my [G]vision, O [A]Ruler of [D]all`,
  },
];

async function main() {
  if (process.argv[2] === "remove") {
    // Deleting a demo plan or person takes their scheduling with it.
    const plans = await prisma.plan.deleteMany({ where: { title: { startsWith: PLAN_TITLE } } });
    const people = await prisma.person.deleteMany({ where: { notes: PERSON_NOTE } });
    const removed = await prisma.song.deleteMany({ where: { notes: NOTE } });
    console.log(`Removed ${removed.count} demo songs, ${plans.count} demo plans and ${people.count} demo volunteers.`);
    return;
  }

  const org = await prisma.organization.findFirstOrThrow();
  // Demo things made before there was a sample mark get it now.
  await prisma.song.updateMany({ where: { notes: NOTE }, data: { sample: true } });
  await prisma.plan.updateMany({ where: { title: { startsWith: PLAN_TITLE } }, data: { sample: true } });
  await prisma.person.updateMany({ where: { notes: PERSON_NOTE }, data: { sample: true } });
  for (const song of SONGS) {
    const exists = await prisma.song.findFirst({ where: { organizationId: org.id, title: song.title } });
    if (exists) {
      console.log(`Already there: ${song.title}`);
      continue;
    }
    await prisma.song.create({
      data: {
        organizationId: org.id,
        title: song.title,
        author: song.author,
        notes: NOTE,
        sample: true,
        arrangements: {
          create: {
            name: "Default",
            key: song.key,
            bpm: song.bpm,
            meter: song.meter,
            lengthSeconds: song.lengthSeconds,
            sequence: song.sequence,
            chart: chart(song.chart),
            chartKey: song.key,
          },
        },
        attachments: { create: { organizationId: org.id, kind: "LINK", name: song.video.name, url: song.video.url } },
      },
    });
    console.log(`Added: ${song.title} (${song.key})`);
  }

  const type = await prisma.serviceType.findFirst({ where: { organizationId: org.id }, orderBy: { sortOrder: "asc" } });
  if (!type) {
    console.log("No service type yet, so no demo plans were made.");
    return;
  }

  const library = await prisma.song.findMany({ where: { organizationId: org.id, notes: NOTE }, include: { arrangements: true } });
  const song = (title: string, key: string, notes?: string) => {
    const found = library.find((s) => s.title === title);
    const arrangement = found?.arrangements[0];
    return found && arrangement
      ? [{ type: "SONG" as const, title, songId: found.id, arrangementId: arrangement.id, key, lengthSeconds: arrangement.lengthSeconds, notes }]
      : [];
  };

  // Three services, on the three Sundays after the coming one.
  const sunday = new Date();
  sunday.setUTCHours(0, 0, 0, 0);
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7));
  const SERVICES = [
    {
      title: PLAN_TITLE,
      weeks: 1,
      rows: [
        { type: "HEADER" as const, title: "Gathering" },
        { type: "ITEM" as const, title: "Welcome and announcements", lengthSeconds: 180 },
        { type: "HEADER" as const, title: "Worship" },
        ...song("Come Thou Fount", "D", "Full band from the top"),
        ...song("Be Thou My Vision", "E"),
        ...song("It Is Well with My Soul", "C", "Drop out for the last chorus"),
        { type: "HEADER" as const, title: "Message" },
        { type: "ITEM" as const, title: "Sermon", lengthSeconds: 1800 },
        { type: "HEADER" as const, title: "Response" },
        ...song("Amazing Grace", "G"),
        { type: "ITEM" as const, title: "Benediction", lengthSeconds: 60 },
      ],
    },
    {
      title: `${PLAN_TITLE} 2`,
      weeks: 2,
      rows: [
        { type: "HEADER" as const, title: "Worship" },
        ...song("Amazing Grace", "G"),
        ...song("Come Thou Fount", "D"),
        { type: "HEADER" as const, title: "Message" },
        { type: "ITEM" as const, title: "Sermon", lengthSeconds: 1800 },
        ...song("It Is Well with My Soul", "C"),
      ],
    },
    {
      title: `${PLAN_TITLE} 3`,
      weeks: 3,
      rows: [
        { type: "HEADER" as const, title: "Worship" },
        ...song("Be Thou My Vision", "D"),
        { type: "SONG" as const, title: "Song 2" },
        { type: "HEADER" as const, title: "Message" },
        { type: "ITEM" as const, title: "Sermon", lengthSeconds: 1800 },
      ],
    },
  ];

  const plans = [];
  for (const service of SERVICES) {
    let plan = await prisma.plan.findFirst({ where: { organizationId: org.id, title: service.title } });
    if (plan) {
      console.log(`Already there: ${service.title} plan`);
    } else {
      const date = new Date(sunday);
      date.setUTCDate(date.getUTCDate() + service.weeks * 7);
      plan = await prisma.plan.create({
        data: {
          organizationId: org.id,
          serviceTypeId: type.id,
          date,
          startTime: type.defaultTime ?? "10:30",
          title: service.title,
          sample: true,
          notes: "A made-up service for trying things out. Delete it whenever you like.",
          items: { create: service.rows.map((row, position) => ({ ...row, position })) },
        },
      });
      console.log(`Added: ${service.title} plan on ${date.toISOString().slice(0, 10)}`);
    }
    plans.push(plan);
  }

  // Pretend volunteers, each able to fill a couple of positions.
  const positions = await prisma.position.findMany({ where: { team: { organizationId: org.id } }, orderBy: [{ team: { sortOrder: "asc" } }, { sortOrder: "asc" }] });
  if (positions.length === 0) {
    console.log("No team positions yet, so no demo volunteers were scheduled.");
    return;
  }
  const volunteers = [];
  for (const [n, volunteer] of VOLUNTEERS.entries()) {
    let person = await prisma.person.findFirst({ where: { organizationId: org.id, email: volunteer.email } });
    if (person) {
      console.log(`Already there: ${volunteer.firstName} ${volunteer.lastName}`);
    } else {
      person = await prisma.person.create({
        data: {
          ...volunteer,
          organizationId: org.id,
          notes: PERSON_NOTE,
          sample: true,
          positions: { create: [...new Set([positions[(n + 1) % positions.length].id, positions[(n + 2) % positions.length].id])].map((positionId) => ({ positionId })) },
        },
      });
      console.log(`Added: ${volunteer.firstName} ${volunteer.lastName}`);
    }
    volunteers.push(person);
  }

  // Who is on which demo service, with a mix of answers. No emails are sent.
  const admin = await prisma.person.findFirst({ where: { organizationId: org.id, role: "ADMIN", archived: false }, orderBy: { createdAt: "asc" } });
  const at = (n: number) => positions[n % positions.length].id;
  const [alex, jordan, sam] = volunteers;
  const schedule = [
    { plan: plans[0], person: alex, positionId: at(1), status: "CONFIRMED" as const },
    { plan: plans[0], person: jordan, positionId: at(2), status: "PENDING" as const },
    { plan: plans[0], person: sam, positionId: at(3), status: "DECLINED" as const },
    { plan: plans[1], person: alex, positionId: at(1), status: "PENDING" as const },
    { plan: plans[1], person: sam, positionId: at(3), status: "CONFIRMED" as const },
    { plan: plans[2], person: jordan, positionId: at(2), status: "CONFIRMED" as const },
    { plan: plans[2], person: alex, positionId: at(2), status: "CONFIRMED" as const },
    ...(admin
      ? [
          { plan: plans[0], person: admin, positionId: at(0), status: "CONFIRMED" as const },
          { plan: plans[1], person: admin, positionId: at(0), status: "PENDING" as const },
          { plan: plans[2], person: admin, positionId: at(0), status: "DECLINED" as const },
        ]
      : []),
  ];
  let scheduled = 0;
  for (const { plan, person, positionId, status } of schedule) {
    const where = { planId_personId_positionId: { planId: plan.id, personId: person.id, positionId } };
    if (await prisma.assignment.findUnique({ where })) continue;
    await prisma.assignment.create({ data: { planId: plan.id, personId: person.id, positionId, status, respondedAt: status === "PENDING" ? null : new Date() } });
    scheduled++;
  }
  console.log(`Scheduled ${scheduled} demo assignments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
