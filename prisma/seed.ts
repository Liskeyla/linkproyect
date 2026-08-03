import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMPTY_PAYLOAD = JSON.stringify({
  doc: [],
  dev: [],
  stageEdits: {},
  reqOrder: [],
  customStages: [],
  decisionGlobal: null,
  userOwnedData: true,
  blankBoard: true,
});

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
    const user = await prisma.user.upsert({
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

    // Ambos usuarios: mismo tablero vacío (lógica idéntica)
    const wsId = `user:${user.id}`;
    await prisma.workspace.upsert({
      where: { id: wsId },
      create: { id: wsId, payload: EMPTY_PAYLOAD, updatedBy: u.email },
      update: { payload: EMPTY_PAYLOAD, updatedBy: u.email },
    });
    console.log(`✓ Workspace vacío (igual para todos) · ${u.email}`);
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
