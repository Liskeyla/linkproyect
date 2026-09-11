import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth";
import { workspaceIdForUser } from "@/lib/profiles";

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim();
  const projectName = String(body?.projectName || "").trim();
  const company = String(body?.company || "").trim();
  const projectArea = String(body?.projectArea || "").trim();
  const role = String(body?.role || "editor");

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Nombre, email y contraseña son obligatorios." }, { status: 400 });
  }
  if (!projectName) {
    return NextResponse.json({ error: "El nombre del proyecto es obligatorio." }, { status: 400 });
  }
  if (projectName.length > 80) {
    return NextResponse.json({ error: "El nombre del proyecto es demasiado largo." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }
  if (role === "admin" || !ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: "Elige un rol válido (editor, gerencia o solo lectura)." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Ese email ya está registrado. Usa Iniciar sesión." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role,
      projectName,
      company,
      projectArea,
    },
  });

  const workspaceId = workspaceIdForUser(user);
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      payload: JSON.stringify({
        ...EMPTY_PAYLOAD,
        projectMeta: {
          name: projectName,
          company,
          area: projectArea,
        },
      }),
      updatedBy: user.email,
    },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    projectName: user.projectName,
  });
}
