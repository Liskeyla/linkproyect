/**
 * Puente de autenticación y persistencia remota (API /api/workspace).
 * Cada usuario/rol tiene su propio workspace en base de datos:
 * Detalle → Panorama / Cronograma / Resumen ejecutivo independientes.
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

    const disableIds = ["btnAddReq", "btnResetData", "btnGoDetalle", "btnImportExcel", "btnDownloadExcel"];
    disableIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !write;
    });

    document.querySelectorAll("[data-delete-req]").forEach((btn) => {
      btn.disabled = !write;
      btn.hidden = !write;
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
      reqDecisions: typeof reqDecisions !== "undefined" ? reqDecisions : {},
      reqOrder: typeof reqOrder !== "undefined" ? reqOrder : [],
      customStages: typeof customStages !== "undefined" ? customStages : [],
      decisionGlobal: typeof state !== "undefined" ? state.decisionGlobal : null,
      designSourceSanitized: true,
      userOwnedData: true,
      blankBoard: true,
      detailDriven: true,
      boardEpoch: 2,
    };
  }

  async function persistNow() {
    if (!hydrated) return;
    if (!canWrite() && !canDecide()) return;

    const payload = buildPayload();
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
      const roleLabel = currentUser.role === "admin" ? "admin" : currentUser.role === "editor" ? "editor" : currentUser.role;
      nameEl.textContent = `${currentUser.name || currentUser.email} · ${roleLabel}`;
    }

    const data = json.data || {};

    // Evita que caché local vieja (catálogo incrustado) contamine el tablero
    if (typeof clearAllLinkprojectLocalCache === "function") {
      clearAllLinkprojectLocalCache();
    }

    if (typeof window.__linkprojectApplyRemote === "function") {
      window.__linkprojectApplyRemote(data, { userId: currentUser?.id || currentUser?.email });
    }

    applyReadonlyUi();
    hydrated = true;

    if (canWrite() || canDecide()) {
      schedulePersist();
    }
    return true;
  }

  function clearLocalCache() {
    if (typeof clearAllLinkprojectLocalCache === "function") {
      clearAllLinkprojectLocalCache();
      return;
    }
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith("linkproject-")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) {
      /* ignore */
    }
  }

  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    clearLocalCache();
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
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
