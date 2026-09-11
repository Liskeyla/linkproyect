"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("editor");
  const [projectName, setProjectName] = useState("");
  const [company, setCompany] = useState("");
  const [projectArea, setProjectArea] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            name,
            role,
            projectName,
            company,
            projectArea,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo registrar");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Credenciales inválidas");
      }

      router.push("/app/index.html");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">
          <div className="mark">LMS</div>
          <div>
            <h1>LMS Project Manager</h1>
            <p>Seguimiento de requerimientos · acceso seguro</p>
          </div>
        </div>

        <div className="tabs">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
            Iniciar sesión
          </button>
          <button type="button" className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={onSubmit}>
          {mode === "register" && (
            <>
              <p className="section-label">Tu usuario</p>
              <label>
                Nombre
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Tu nombre" />
              </label>
              <label>
                Rol
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="editor">Editor (edita fechas)</option>
                  <option value="gerencia">Gerencia (decide)</option>
                  <option value="viewer">Solo lectura</option>
                </select>
              </label>

              <p className="section-label">Nuevo proyecto · lienzo en blanco</p>
              <label>
                Nombre del proyecto
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="Ej. Atcotrans, TMS 2.0, Portal clientes"
                />
              </label>
              <label>
                Empresa / cliente
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Empresa dueña del tablero"
                />
              </label>
              <label>
                Área o módulo principal
                <input
                  value={projectArea}
                  onChange={(e) => setProjectArea(e.target.value)}
                  placeholder="Ej. Operaciones, Liquidaciones, Reefer"
                />
              </label>
              <p className="field-hint">
                Se crea un tablero vacío, independiente. Luego agregas los requerimientos desde Detalle.
              </p>
            </>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@empresa.com"
              autoComplete="username"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Espera…" : mode === "login" ? "Entrar" : "Crear proyecto y entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
