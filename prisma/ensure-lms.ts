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

const SHARED_ID = "shared:tms-2";

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

  const maria = await prisma.user.findUnique({ where: { email: MARIA_EMAIL } });
  const shared = await prisma.workspace.findUnique({ where: { id: SHARED_ID } });
  if (maria && shared) {
    const personalId = `user:${maria.id}`;
    const mariaWs = await prisma.workspace.findUnique({ where: { id: personalId } });
    if (!mariaWs || shared.updatedAt > mariaWs.updatedAt) {
      await prisma.workspace.upsert({
        where: { id: personalId },
        create: {
          id: personalId,
          payload: shared.payload,
          updatedBy: maria.email,
        },
        update: {
          payload: shared.payload,
          updatedBy: maria.email,
        },
      });
      console.log("✓ Tablero TMS de María restaurado desde el workspace compartido (ya no se comparte)");
    }
  }

  const lmsWsId = `user:${lms.id}`;
  await prisma.workspace.upsert({
    where: { id: lmsWsId },
    create: { id: lmsWsId, payload: EMPTY_PAYLOAD, updatedBy: LMS_EMAIL },
    update: { payload: EMPTY_PAYLOAD, updatedBy: LMS_EMAIL },
  });
  console.log("✓ Tablero de Andrea vacío e independiente del TMS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
