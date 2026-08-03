import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EMPTY_PAYLOAD = {
  doc: [],
  dev: [],
  stageEdits: {},
  reqOrder: [],
  customStages: [],
  decisionGlobal: null,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let workspace = await prisma.workspace.findUnique({ where: { id: "default" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        id: "default",
        payload: JSON.stringify(EMPTY_PAYLOAD),
      },
    });
  }

  let data = EMPTY_PAYLOAD;
  try {
    data = { ...EMPTY_PAYLOAD, ...JSON.parse(workspace.payload) };
  } catch {
    data = EMPTY_PAYLOAD;
  }

  return NextResponse.json({
    data,
    updatedAt: workspace.updatedAt,
    updatedBy: workspace.updatedBy,
    user: {
      name: session.user.name,
      email: session.user.email,
      role: (session.user as { role?: string }).role || "viewer",
    },
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  if (!canWrite(role) && role !== "gerencia") {
    return NextResponse.json(
      { error: "Tu rol solo permite lectura. Pide acceso de editor o gerencia." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Viewer no escribe; gerencia solo puede decidir; editor/admin todo
  const existing = await prisma.workspace.findUnique({ where: { id: "default" } });
  let current = EMPTY_PAYLOAD;
  if (existing) {
    try {
      current = { ...EMPTY_PAYLOAD, ...JSON.parse(existing.payload) };
    } catch {
      current = EMPTY_PAYLOAD;
    }
  }

  let next = { ...current };

  if (role === "gerencia") {
    // Solo decisión global y (opcional) stageEdits si queremos; limitamos a decision
    next = {
      ...current,
      decisionGlobal: body.decisionGlobal ?? current.decisionGlobal,
    };
  } else {
    next = {
      doc: Array.isArray(body.doc) ? body.doc : current.doc,
      dev: Array.isArray(body.dev) ? body.dev : current.dev,
      stageEdits: body.stageEdits && typeof body.stageEdits === "object" ? body.stageEdits : current.stageEdits,
      reqOrder: Array.isArray(body.reqOrder) ? body.reqOrder : current.reqOrder,
      customStages: Array.isArray(body.customStages) ? body.customStages : current.customStages,
      decisionGlobal: body.decisionGlobal !== undefined ? body.decisionGlobal : current.decisionGlobal,
    };
  }

  const workspace = await prisma.workspace.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payload: JSON.stringify(next),
      updatedBy: session.user.email || session.user.name || null,
    },
    update: {
      payload: JSON.stringify(next),
      updatedBy: session.user.email || session.user.name || null,
    },
  });

  return NextResponse.json({
    ok: true,
    updatedAt: workspace.updatedAt,
    updatedBy: workspace.updatedBy,
  });
}
