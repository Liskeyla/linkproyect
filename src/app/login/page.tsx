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
          body: JSON.stringify({ email, password, name, role }),
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
          <div className="mark">LP</div>
          <div>
            <h1>LinkProject</h1>
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
            {loading ? "Espera…" : mode === "login" ? "Entrar" : "Registrarme y entrar"}
          </button>
        </form>

        <div className="hint">
          <strong>Usuarios</strong>
          <ul>
            <li>lmacias@awenandwis.com / Liskeyla2026</li>
            <li>mpluas@awenandwis.com / Maria2026</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
