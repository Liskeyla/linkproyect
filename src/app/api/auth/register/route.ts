import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth";

export async function POST(req: Request) {
  if (process.env.ALLOW_PUBLIC_REGISTER !== "true") {
    return NextResponse.json(
      { error: "El registro público está deshabilitado. Pide acceso a un administrador." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim();
  const role = String(body?.role || "editor");

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Nombre, email y contraseña son obligatorios." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }
  if (!ROLES.includes(role as (typeof ROLES)[number]) || role === "admin") {
    // No permitir auto-crear admin por registro público
    if (role === "admin") {
      return NextResponse.json({ error: "No se puede registrar como admin." }, { status: 400 });
    }
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Ese email ya está registrado." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: ROLES.includes(role as (typeof ROLES)[number]) ? role : "editor",
    },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
}
