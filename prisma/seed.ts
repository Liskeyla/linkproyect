import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { LMS_EMAIL, MARIA_EMAIL, TMS_SHARED_WORKSPACE_ID } from "../src/lib/profiles";

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
  const created: { email: string; id: string }[] = [];

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
    created.push({ email: user.email, id: user.id });
    console.log(`✓ ${u.email} / ${u.password} (${u.role})`);

    const personalId = `user:${user.id}`;
    const existingPersonal = await prisma.workspace.findUnique({ where: { id: personalId } });
    if (!existingPersonal && u.email !== MARIA_EMAIL && u.email !== LMS_EMAIL) {
      await prisma.workspace.create({
        data: { id: personalId, payload: EMPTY_PAYLOAD, updatedBy: u.email },
      });
      console.log(`✓ Workspace vacío · ${u.email}`);
    }
  }

  const maria = created.find((u) => u.email === MARIA_EMAIL);
  const shared = await prisma.workspace.findUnique({ where: { id: TMS_SHARED_WORKSPACE_ID } });
  if (!shared) {
    const mariaWs = maria
      ? await prisma.workspace.findUnique({ where: { id: `user:${maria.id}` } })
      : null;
    await prisma.workspace.create({
      data: {
        id: TMS_SHARED_WORKSPACE_ID,
        payload: mariaWs?.payload || EMPTY_PAYLOAD,
        updatedBy: LMS_EMAIL,
      },
    });
    console.log("✓ Workspace TMS 2.0 compartido María + LMS");
  } else {
    console.log("✓ Workspace TMS 2.0 ya existía (no se tocó)");
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
