import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { LMS_EMAIL, MARIA_EMAIL } from "../src/lib/profiles";

const prisma = new PrismaClient();

const EMPTY_PAYLOAD = JSON.stringify({
  doc: [],
  dev: [],
  stageEdits: {},
  reqDecisions: {},
  reqOrder: [],
  customStages: [],
  decisionGlobal: null,
  userOwnedData: true,
  blankBoard: true,
  detailDriven: true,
  boardEpoch: 2,
});

const users = [
  {
    email: "lmacias@awenandwis.com",
    name: "Liskeyla Macías",
    password: "Liskeyla2026",
    role: "admin",
  },
  {
    email: MARIA_EMAIL,
    name: "María Plúas",
    password: "Maria2026",
    role: "editor",
  },
  {
    email: LMS_EMAIL,
    name: "Andrea Ordosgoitia",
    password: "Andrea2026",
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

    const personalId = `user:${user.id}`;
    const existingPersonal = await prisma.workspace.findUnique({ where: { id: personalId } });
    if (!existingPersonal) {
      await prisma.workspace.create({
        data: { id: personalId, payload: EMPTY_PAYLOAD, updatedBy: u.email },
      });
      console.log(`✓ Workspace vacío · ${u.email}`);
    } else if (u.email === LMS_EMAIL) {
      await prisma.workspace.update({
        where: { id: personalId },
        data: { payload: EMPTY_PAYLOAD, updatedBy: u.email },
      });
      console.log(`✓ Tablero LMS vacío para que Andrea agregue · ${u.email}`);
    }
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
