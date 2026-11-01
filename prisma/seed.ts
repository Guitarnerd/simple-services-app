import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { STARTER_SERVICE_TYPE, STARTER_TEAMS } from "../src/lib/starter";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env`);
  return value;
}

async function main() {
  const email = required("SEED_ADMIN_EMAIL").toLowerCase();
  const password = required("SEED_ADMIN_PASSWORD");

  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: process.env.SEED_ORG_NAME || "My Church" },
    });
  }

  await prisma.person.upsert({
    where: { email },
    update: {},
    create: {
      organizationId: org.id,
      firstName: process.env.SEED_ADMIN_FIRST_NAME || "Admin",
      lastName: process.env.SEED_ADMIN_LAST_NAME || "User",
      email,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  for (const [teamIndex, team] of STARTER_TEAMS.entries()) {
    const existing = await prisma.team.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: team.name } },
    });
    if (existing) continue;
    await prisma.team.create({
      data: {
        organizationId: org.id,
        name: team.name,
        sortOrder: teamIndex,
        positions: {
          create: team.positions.map((name, sortOrder) => ({ name, sortOrder })),
        },
      },
    });
  }

  const serviceTypes = await prisma.serviceType.count({ where: { organizationId: org.id } });
  if (serviceTypes === 0) {
    await prisma.serviceType.create({ data: { organizationId: org.id, name: STARTER_SERVICE_TYPE } });
  }

  console.log(`Seed complete. Admin login: ${email} (password is SEED_ADMIN_PASSWORD in .env)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
