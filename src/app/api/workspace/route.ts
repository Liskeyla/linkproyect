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

const LISKEYLA_EMAIL = "lmacias@awenandwis.com";

function workspaceIdFor(userId: string) {
  return `user:${userId}`;
}

function parsePayload(raw: string) {
  try {
    return { ...EMPTY_PAYLOAD, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PAYLOAD };
  }
}

function hasFuenteData(data: typeof EMPTY_PAYLOAD) {
  return (data.doc?.length || 0) + (data.dev?.length || 0) > 0;
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
 * Cada usuario tiene su propio workspace.
 * - Liskeyla: base completa.
 * - María: vacío total para armar desde cero.
 */
async function getOrCreateUserWorkspace(user: {
  id: string;
  email: string;
}) {
  const id = workspaceIdFor(user.id);
  let workspace = await prisma.workspace.findUnique({ where: { id } });
  let seedDefaults = false;

  if (!workspace) {
    let payload = { ...EMPTY_PAYLOAD };

    if (user.email === LISKEYLA_EMAIL) {
      const shared = await prisma.workspace.findUnique({ where: { id: "default" } });
      if (shared) {
        const sharedData = parsePayload(shared.payload);
        if (hasFuenteData(sharedData)) {
          payload = sharedData;
        } else {
          seedDefaults = true;
        }
      } else {
        seedDefaults = true;
      }
    }

    workspace = await prisma.workspace.create({
      data: {
        id,
        payload: JSON.stringify(payload),
        updatedBy: user.email || null,
      },
    });
  }

  return { workspace, seedDefaults };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { workspace, seedDefaults } = await getOrCreateUserWorkspace(user);
  const data = parsePayload(workspace.payload);

  return NextResponse.json({
    data,
    seedDefaults,
    /** María no debe recibir el catálogo automático de producción */
    includeProdCatalog: user.email === LISKEYLA_EMAIL,
    updatedAt: workspace.updatedAt,
    updatedBy: workspace.updatedBy,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
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

  const id = workspaceIdFor(user.id);
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
