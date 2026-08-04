# LMS Project Manager — Seguimiento de requerimientos

App web con **login**, **roles** y **datos compartidos en base de datos**, lista para publicar en **Vercel** (similar al Agente de Procesos).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 14 + UI actual (`/app`) |
| Auth | NextAuth (credenciales) |
| API | Route Handlers `/api/workspace` |
| DB local | SQLite (`prisma/dev.db`) |
| DB producción | Neon PostgreSQL |

## Roles

| Rol | Permisos |
|-----|----------|
| `admin` | Todo |
| `editor` | Editar fechas, requerimientos, cronograma |
| `gerencia` | Ver + registrar decisión global |
| `viewer` | Solo lectura |

## Inicio local

```bash
cd linkproject
npm install
npm run db:setup
npm run dev
```

Abre http://localhost:3000 → login.

### Usuarios demo

| Email | Clave | Rol |
|-------|-------|-----|
| admin@linkproject.local | admin1234 | admin |
| editor@linkproject.local | editor1234 | editor |
| gerencia@linkproject.local | gerencia1234 | gerencia |
| viewer@linkproject.local | viewer1234 | viewer |

## Despliegue en Vercel + Neon

Ver guía completa: **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**

Resumen:
1. Crea una base **Neon** (Postgres gratis)
2. Cambia Prisma a `postgresql`
3. Sube el repo a GitHub
4. Importa en Vercel y configura variables de entorno
5. Ejecuta `prisma db push` + seed contra Neon

## Estructura

```
linkproject/
├── public/app/          # Pantalla de seguimiento (HTML/CSS/JS)
├── src/app/login/       # Login / registro
├── src/app/api/         # Auth + workspace
├── prisma/              # Schema + seed
└── docs/DEPLOY-VERCEL.md
```
