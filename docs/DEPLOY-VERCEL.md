# Despliegue LinkProject en Vercel + Neon

| Componente | Plataforma |
|------------|------------|
| Frontend + API (Next.js) | **Vercel** |
| Base de datos | **Neon** (PostgreSQL) |

> Prisma ya está configurado con `provider = "postgresql"`. Necesitas una `DATABASE_URL` de Neon.

---

## Paso 1 — Crear Postgres en Neon (5 min)

1. Entra a [https://console.neon.tech](https://console.neon.tech) y crea cuenta / inicia sesión.
2. **New Project** → nombre `linkproject` → región cercana (p. ej. US East).
3. En el dashboard, abre **Connection details** / **Connection string**.
4. Elige **URI** y copia algo como:
   ```
   postgresql://neondb_owner:xxxx@ep-xxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
5. Guárdala: la usarás en local (`.env`) y en Vercel.

> Si Neon muestra `channel_binding=require`, puedes dejarlo o quitarlo; con `sslmode=require` suele bastar.

---

## Paso 2 — Configurar `.env` local y crear tablas

En `linkproject/.env`:

```env
DATABASE_URL="postgresql://...tu-string-de-neon..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="de9f38817c8d31b6e64c6052698847d7b11bd49cbf31feb6"
ALLOW_PUBLIC_REGISTER="true"
```

Luego:

```bash
cd linkproject
npx prisma db push
npm run db:seed
npm run dev
```

Usuarios demo: `editor@linkproject.local` / `editor1234`

---

## Paso 3 — Subir a GitHub

```bash
cd linkproject
git add .
git commit -m "LinkProject listo para Vercel + Neon"
git branch -M main
# Crea un repo vacío en GitHub llamado linkproject, luego:
git remote add origin https://github.com/TU_USUARIO/linkproject.git
git push -u origin main
```

No subas `.env` (está en `.gitignore`).

---

## Paso 4 — Importar en Vercel

1. [vercel.com/new](https://vercel.com/new) → Importa el repo `linkproject`.
2. Framework: **Next.js** (Root Directory = `.` si el repo es solo esta carpeta).
3. **Environment Variables** (Production + Preview):

| Nombre | Valor |
|--------|--------|
| `DATABASE_URL` | La misma URI de Neon |
| `NEXTAUTH_URL` | `https://TU-PROYECTO.vercel.app` (la URL que te dé Vercel; puedes actualizarla tras el 1er deploy) |
| `NEXTAUTH_SECRET` | `de9f38817c8d31b6e64c6052698847d7b11bd49cbf31feb6` (o genera otro) |
| `ALLOW_PUBLIC_REGISTER` | `false` |

4. **Deploy**.

Tras el primer deploy, si la URL real es distinta, actualiza `NEXTAUTH_URL` y haz **Redeploy**.

---

## Paso 5 — Probar en producción

1. Abre tu URL de Vercel.
2. Login: `editor@linkproject.local` / `editor1234`
3. Edita una fecha, cierra sesión, entra con otro usuario y verifica que se ve el mismo dato.

---

## Checklist rápido

- [ ] Proyecto Neon creado + `DATABASE_URL` copiada
- [ ] `prisma db push` + `db:seed` OK
- [ ] Repo en GitHub
- [ ] Variables en Vercel
- [ ] Deploy verde + login funciona

## Problemas comunes

| Síntoma | Solución |
|---------|----------|
| Error Prisma / P1001 | `DATABASE_URL` mal pegada o sin `?sslmode=require` |
| Loop en `/login` | `NEXTAUTH_URL` no coincide con la URL de Vercel |
| 500 en login | Falta `NEXTAUTH_SECRET` o no corriste el seed |
| Build OK pero sin tablas | Ejecutar `npx prisma db push` contra Neon desde tu PC |
