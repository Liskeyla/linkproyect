import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  LMS_STAGE_KEYS,
  isLmsEmail,
  mergeLmsStageEdits,
  profileForEmail,
  projectNameForEmail,
  workspaceIdForUser,
} from "@/lib/profiles";

const EMPTY_PAYLOAD = {
  doc: [] as unknown[],
  dev: [] as unknown[],
  stageEdits: {} as Record<string, unknown>,
  reqDecisions: {} as Record<string, unknown>,
  reqOrder: [] as unknown[],
  customStages: [] as unknown[],
  decisionGlobal: null as unknown,
  userOwnedData: true,
  blankBoard: true,
  detailDriven: true,
  designSourceSanitized: true,
  boardEpoch: 2,
};

function parsePayload(raw: string) {
  try {
    return { ...EMPTY_PAYLOAD, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PAYLOAD };
  }
}

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const email = session.user.email.toLowerCase();
  let id = (session.user as { id?: string }).id;
  if (!id) {
    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return null;
    id = dbUser.id;
  }

  return {
    id,
    email,
    name: session.user.name,
    role: (session.user as { role?: string }).role || "viewer",
  };
}

/**
 * Cada usuario tiene su propio tablero.
 * LMS (Andrea) ve proyecto Atcotrans; María ve TMS 2.0. Los datos no se mezclan.
 */
async function getOrCreateUserWorkspace(user: {
  id: string;
  email: string;
}) {
  const id = workspaceIdForUser(user);
  let workspace = await prisma.workspace.findUnique({ where: { id } });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        id,
        payload: JSON.stringify(EMPTY_PAYLOAD),
        updatedBy: user.email || null,
      },
    });
    return { workspace };
  }

  // LMS siempre parte de tablero propio; no hereda el TMS de María.
  if (isLmsEmail(user.email)) {
    return { workspace };
  }

  let raw: {
    detailDriven?: boolean;
    boardEpoch?: number;
  } = {};
  try {
    raw = JSON.parse(workspace.payload) || {};
  } catch {
    raw = {};
  }

  const BOARD_EPOCH = 2;
  const needsWipe = !raw.detailDriven || raw.boardEpoch !== BOARD_EPOCH;

  if (needsWipe) {
    workspace = await prisma.workspace.update({
      where: { id },
      data: {
        payload: JSON.stringify({ ...EMPTY_PAYLOAD, boardEpoch: BOARD_EPOCH }),
        updatedBy: user.email || null,
      },
    });
  }

  return { workspace };
}

function publicUser(user: { id: string; email: string; name?: string | null; role: string }) {
  const profile = profileForEmail(user.email);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profile,
    projectName: projectNameForEmail(user.email),
    sharedBoard: false,
    detailStageKeys: profile === "lms" ? [...LMS_STAGE_KEYS] : null,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { workspace } = await getOrCreateUserWorkspace(user);
  const data = parsePayload(workspace.payload);

  return NextResponse.json({
    data: { ...data, userOwnedData: true, blankBoard: true, detailDriven: true, boardEpoch: 2 },
    updatedAt: workspace.updatedAt,
    updatedBy: workspace.updatedBy,
    user: publicUser(user),
  });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canWrite(user.role) && user.role !== "gerencia") {
    return NextResponse.json(
      { error: "Tu rol solo permite lectura. Pide acceso de editor o gerencia." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const id = workspaceIdForUser(user);
  const existing = await prisma.workspace.findUnique({ where: { id } });
  let current = EMPTY_PAYLOAD;
  if (existing) {
    current = parsePayload(existing.payload);
  }

  let next = { ...current };

  if (user.role === "gerencia" && !canWrite(user.role)) {
    next = {
      ...current,
      decisionGlobal: body.decisionGlobal ?? current.decisionGlobal,
    };
  } else {
    const incomingEdits =
      body.stageEdits && typeof body.stageEdits === "object" ? body.stageEdits : current.stageEdits;
    next = {
      doc: Array.isArray(body.doc) ? body.doc : current.doc,
      dev: Array.isArray(body.dev) ? body.dev : current.dev,
      stageEdits: isLmsEmail(user.email)
        ? mergeLmsStageEdits(
            (current.stageEdits || {}) as Record<string, unknown>,
            incomingEdits as Record<string, unknown>,
            Array.isArray(body.doc) ? body.doc : current.doc
          )
        : incomingEdits,
      reqDecisions:
        body.reqDecisions && typeof body.reqDecisions === "object" ? body.reqDecisions : current.reqDecisions,
      reqOrder: Array.isArray(body.reqOrder) ? body.reqOrder : current.reqOrder,
      customStages: Array.isArray(body.customStages) ? body.customStages : current.customStages,
      decisionGlobal: body.decisionGlobal !== undefined ? body.decisionGlobal : current.decisionGlobal,
      designSourceSanitized: true,
      userOwnedData: true,
      blankBoard: true,
      detailDriven: true,
      boardEpoch: 2,
    };
  }

  const workspace = await prisma.workspace.upsert({
    where: { id },
    create: {
      id,
      payload: JSON.stringify(next),
      updatedBy: user.email || user.name || null,
    },
    update: {
      payload: JSON.stringify(next),
      updatedBy: user.email || user.name || null,
    },
  });

  return NextResponse.json({
    ok: true,
    updatedAt: workspace.updatedAt,
    updatedBy: workspace.updatedBy,
  });
}
