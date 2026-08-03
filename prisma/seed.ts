import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const users = [
  {
    email: "lmacias@awenandwis.com",
    name: "Liskeyla Macías",
    password: "Liskeyla2026",
    role: "admin",
  },
  {
    email: "mpluas@awenandwis.com",
    name: "María Plúas",
    password: "Maria2026",
    role: "editor",
  },
];

async function main() {
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
      },
      update: {
        name: u.name,
        role: u.role,
        passwordHash,
        active: true,
      },
    });
    console.log(`✓ ${u.email} / ${u.password} (${u.role})`);
  }

  const existing = await prisma.workspace.findUnique({ where: { id: "default" } });
  if (!existing) {
    await prisma.workspace.create({
      data: {
        id: "default",
        payload: JSON.stringify({
          doc: [],
          dev: [],
          stageEdits: {},
          reqOrder: [],
          customStages: [],
          decisionGlobal: null,
        }),
      },
    });
    console.log("✓ Workspace default creado");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
