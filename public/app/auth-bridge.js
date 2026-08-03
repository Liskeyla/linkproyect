/**
 * Puente de autenticación y persistencia remota (API /api/workspace).
 * Reemplaza localStorage por base de datos compartida entre usuarios.
 */
(function () {
  let currentUser = null;
  let saveTimer = null;
  let hydrated = false;

  function canWrite() {
    const role = currentUser?.role;
    return role === "admin" || role === "editor";
  }

  function canDecide() {
    const role = currentUser?.role;
    return role === "admin" || role === "editor" || role === "gerencia";
  }

  function applyReadonlyUi() {
    const banner = document.getElementById("readonlyBanner");
    const write = canWrite();
    if (banner) banner.hidden = write;

    document.body.classList.toggle("is-readonly", !write);

    const disableIds = ["btnAddReq", "btnApplyData", "btnResetData", "btnToggleItemForm"];
    disableIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !write;
    });

    if (!canDecide()) {
      document.querySelectorAll(".mini-actions button, #decisionForm button[type='submit']").forEach((btn) => {
        btn.disabled = true;
      });
    }
  }

  function buildPayload() {
    return {
      doc: typeof REQ_FUENTE !== "undefined" ? REQ_FUENTE : [],
      dev: typeof DEV_FUENTE !== "undefined" ? DEV_FUENTE : [],
      stageEdits: typeof stageEdits !== "undefined" ? stageEdits : {},
      reqOrder: typeof reqOrder !== "undefined" ? reqOrder : [],
      customStages: typeof customStages !== "undefined" ? customStages : [],
      decisionGlobal: typeof state !== "undefined" ? state.decisionGlobal : null,
    };
  }

  async function persistNow() {
    if (!hydrated) return;
    if (!canWrite() && !canDecide()) return;

    const payload = buildPayload();
    // Gerencia: el API solo aplica decisionGlobal
    const body =
      currentUser?.role === "gerencia" && !canWrite()
        ? { decisionGlobal: payload.decisionGlobal }
        : payload;

    try {
      const res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof showToast === "function") {
          showToast(data.error || "No se pudo guardar en el servidor", "warn");
        }
      }
    } catch (_) {
      if (typeof showToast === "function") {
        showToast("Error de red al guardar", "warn");
      }
    }
  }

  function schedulePersist() {
    if (!hydrated) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistNow();
    }, 450);
  }

  // Parchea las funciones de guardado locales para que también sincronicen al servidor
  function patchSavers() {
    const wrap = (name) => {
      const original = window[name];
      if (typeof original !== "function") return;
      window[name] = function patchedSaver() {
        const result = original.apply(this, arguments);
        schedulePersist();
        return result;
      };
    };

    // Las funciones viven en scope de app.js (no window). Se sobreescriben vía hooks internos.
  }

  async function hydrateFromServer() {
    const res = await fetch("/api/workspace");
    if (res.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!res.ok) throw new Error("No se pudo cargar el workspace");

    const json = await res.json();
    currentUser = json.user || null;

    const nameEl = document.getElementById("userNameLabel");
    if (nameEl && currentUser) {
      nameEl.textContent = `${currentUser.name || currentUser.email} · ${currentUser.role}`;
    }

    const data = json.data || {};

    // Inyecta en las variables globales del app (declaradas con let en app.js → no están en window)
    // Por eso app.js expone __linkprojectApplyRemote
    if (typeof window.__linkprojectApplyRemote === "function") {
      window.__linkprojectApplyRemote(data);
    }

    applyReadonlyUi();
    hydrated = true;

    // Primera vez: si el servidor está vacío, sube los datos de ejemplo locales
    const empty = !(data.doc && data.doc.length) && !(data.dev && data.dev.length);
    if (empty && canWrite()) {
      schedulePersist();
    }
    return true;
  }

  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    // next-auth también acepta GET a signout; usamos form POST estándar
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/signout";
    const csrf = await fetch("/api/auth/csrf").then((r) => r.json()).catch(() => null);
    if (csrf?.csrfToken) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "csrfToken";
      input.value = csrf.csrfToken;
      form.appendChild(input);
    }
    const cb = document.createElement("input");
    cb.type = "hidden";
    cb.name = "callbackUrl";
    cb.value = "/login";
    form.appendChild(cb);
    document.body.appendChild(form);
    form.submit();
  });

  window.__linkprojectSchedulePersist = schedulePersist;
  window.__linkprojectPersistNow = persistNow;
  window.__linkprojectCanWrite = canWrite;
  window.__linkprojectGetUser = () => currentUser;

  // Espera a que app.js registre el apply hook
  function boot() {
    if (typeof window.__linkprojectApplyRemote !== "function") {
      setTimeout(boot, 30);
      return;
    }
    hydrateFromServer().catch((err) => {
      console.error(err);
      alert("No se pudo cargar los datos del servidor. Revisa tu sesión.");
      window.location.href = "/login";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
