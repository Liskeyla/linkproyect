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

async function main() {
  const passwordHash = await bcrypt.hash("Andrea2026", 10);
  const lms = await prisma.user.upsert({
    where: { email: LMS_EMAIL },
    create: {
      email: LMS_EMAIL,
      name: "Andrea Ordosgoitia",
      role: "editor",
      passwordHash,
      active: true,
    },
    update: {
      name: "Andrea Ordosgoitia",
      role: "editor",
      passwordHash,
      active: true,
    },
  });
  console.log(`✓ LMS ${lms.email} / Andrea2026 (${lms.role})`);

  let shared = await prisma.workspace.findUnique({ where: { id: TMS_SHARED_WORKSPACE_ID } });
  if (!shared) {
    const maria = await prisma.user.findUnique({ where: { email: MARIA_EMAIL } });
    const mariaWs = maria
      ? await prisma.workspace.findUnique({ where: { id: `user:${maria.id}` } })
      : null;
    shared = await prisma.workspace.create({
      data: {
        id: TMS_SHARED_WORKSPACE_ID,
        payload: mariaWs?.payload || EMPTY_PAYLOAD,
        updatedBy: LMS_EMAIL,
      },
    });
    const nDoc = (() => {
      try {
        return JSON.parse(shared.payload)?.doc?.length || 0;
      } catch {
        return 0;
      }
    })();
    console.log(`✓ Workspace compartido TMS 2.0 creado (${nDoc} requerimientos de María)`);
  } else {
    console.log("✓ Workspace compartido TMS 2.0 ya existía");
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
