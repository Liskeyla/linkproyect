const BASE_STAGES = [
  { key: "levantamiento", label: "Levantamiento", group: "proyectos" },
  { key: "prototipado", label: "Prototipado", group: "proyectos" },
  { key: "documento", label: "Documento funcional", group: "proyectos" },
  { key: "aprobacion", label: "Aprobación", group: "cliente", clientWait: true },
  { key: "disenoVisual", label: "Diseño visual", group: "diseno" },
  { key: "desarrollo", label: "Desarrollo", group: "diseno" },
  { key: "qa", label: "Etapa QA", group: "proyectos" },
  { key: "procesos", label: "Pruebas QA Usuario Proyecto", group: "proyectos" },
  { key: "pruebasCompletas", label: "Pruebas completas", group: "cliente", clientWait: true },
  { key: "produccion", label: "Etapa producción", group: "produccion", production: true },
];

/** Etapas visibles en detalle = base + columnas personalizadas */
let STAGES = BASE_STAGES.slice();
let customStages = [];

const CUSTOM_STAGES_KEY_BASE = "linkproject-custom-stages-v1";

/** Caché local scoped por usuario (cada login tiene su propio workspace) */
let storageUserId = "anon";

function setStorageUser(userId) {
  storageUserId = String(userId || "anon");
}

function scopedKey(base) {
  return `${base}:${storageUserId}`;
}

function clearAllLinkprojectLocalCache() {
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

function slugStageKey(label) {
  const base = String(label || "etapa")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  let key = `extra_${base || "columna"}`;
  let n = 2;
  while (STAGES.some((s) => s.key === key) || customStages.some((s) => s.key === key)) {
    key = `extra_${base || "columna"}_${n++}`;
  }
  return key;
}

function rebuildStagesList() {
  STAGES = [...BASE_STAGES, ...customStages];
}

function loadCustomStages() {
  try {
    const raw = localStorage.getItem(scopedKey(CUSTOM_STAGES_KEY_BASE));
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return;
    customStages = data
      .filter((s) => s && s.key && s.label)
      .map((s) => ({
        key: String(s.key),
        label: String(s.label),
        group: s.group || "default",
        custom: true,
      }));
  } catch (_) {
    customStages = [];
  }
  rebuildStagesList();
}

function saveCustomStages() {
  localStorage.setItem(scopedKey(CUSTOM_STAGES_KEY_BASE), JSON.stringify(customStages));
  if (typeof window.__linkprojectSchedulePersist === "function") window.__linkprojectSchedulePersist();
}

function ensureCustomStagesOnReqs() {
  customStages.forEach((s) => {
    if (!RESPONSABLES[s.key]) RESPONSABLES[s.key] = "";
    if (!ROLES[s.key]) ROLES[s.key] = "Columna personalizada";
    requerimientos.forEach((r) => {
      if (!r.etapas[s.key]) {
        r.etapas[s.key] = emptyStage(responsableEtapa(s.key), "Columna nueva — sin fechas");
      }
    });
  });
}

function addCustomStageColumn({ label, group }) {
  const name = String(label || "").trim();
  if (!name) return null;
  const stageDef = {
    key: slugStageKey(name),
    label: name,
    group: group || "default",
    custom: true,
  };
  customStages.push(stageDef);
  saveCustomStages();
  rebuildStagesList();
  ensureCustomStagesOnReqs();
  return stageDef;
}

function removeCustomStageColumn(key) {
  customStages = customStages.filter((s) => s.key !== key);
  saveCustomStages();
  rebuildStagesList();
  requerimientos.forEach((r) => {
    if (r.etapas) delete r.etapas[key];
  });
  Object.keys(stageEdits).forEach((reqKey) => {
    if (stageEdits[reqKey]) delete stageEdits[reqKey][key];
  });
  saveStageEdits();
}

const AREAS = []; // se llena desde los requerimientos reales

/**
 * Cumplimiento vs fecha fin planificada:
 * - Si hay fin real: 100% si realFin <= planFin; si se atrasó, baja proporcional.
 * - Si solo hay inicio real: se evalúa contra planFin (en curso).
 * - Si no hay fechas reales: % según días restantes / vencidos vs planFin.
 */
function calcCumplimiento(planFin, realFin, hoy = new Date()) {
  if (!planFin) return null;
  const plan = parseDate(planFin);
  if (!plan) return null;

  if (realFin) {
    const r = parseDate(realFin);
    if (!r) return null;
    if (r <= plan) return 100;
    const delay = daysBetween(plan, r);
    return Math.max(0, Math.round(100 - delay * 5));
  }

  if (hoy <= plan) {
    const totalWindow = 14;
    const remaining = daysBetween(hoy, plan);
    return Math.min(100, Math.round((remaining / totalWindow) * 100));
  }

  const overdue = daysBetween(plan, hoy);
  return Math.max(0, Math.round(100 - overdue * 8));
}

function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = parseDate(iso);
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Fecha corta para celdas densas: 19 jul */
function formatDateShort(iso) {
  if (!iso) return "—";
  if (iso === "hoy") return "hoy";
  const d = parseDate(iso);
  if (!d) return "—";
  const txt = d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
  return txt.replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function formatRange(inicio, fin) {
  if (!inicio && !fin) return "—";
  if (inicio && fin && inicio === fin) return formatDate(inicio);
  return `${formatDate(inicio)} → ${formatDate(fin)}`;
}

/**
 * Rango visual compacto inicio → fin (tooltip con fecha completa).
 * finIso puede ser ISO o "hoy".
 */
function dateRangeHtml(inicioIso, finIso, toneOrOpts = "") {
  const opts = typeof toneOrOpts === "string" ? { tone: toneOrOpts } : toneOrOpts || {};
  const tone = opts.tone || "";
  const label = opts.label || "Fechas";
  const hasAny = !!(inicioIso || (finIso && finIso !== "—"));
  if (!hasAny) {
    return `<span class="date-range stacked muted" title="${label}: sin fechas">
      <span class="d-start">—</span>
      <span class="d-sep" aria-hidden="true">→</span>
      <span class="d-end">—</span>
    </span>`;
  }

  const same = inicioIso && finIso && inicioIso === finIso && finIso !== "hoy";
  const start = formatDateShort(inicioIso) || "—";
  const end = same ? start : finIso === "hoy" ? "hoy" : formatDateShort(finIso) || "—";
  const fullStart = inicioIso ? formatDate(inicioIso) : "—";
  const fullEnd = finIso === "hoy" ? "hoy" : finIso ? formatDate(finIso) : "—";
  const title = same ? `${label}: ${fullStart}` : `${label}: ${fullStart} → ${fullEnd}`;
  const endCls = finIso === "hoy" ? "is-today" : tone || "";

  return `<span class="date-range stacked ${tone}" title="${title}">
    <span class="d-start">${start}</span>
    <span class="d-sep" aria-hidden="true">→</span>
    <span class="d-end ${endCls}">${end}</span>
  </span>`;
}

/** planInicio, planFin, realInicio, realFin, responsable, avance */
function stage(planInicio, planFin, realInicio, realFin, responsable, avance) {
  return { planInicio, planFin, realInicio, realFin, responsable, avance };
}

function emptyStage(responsable, avance = "No aplica en esta vista de planificación") {
  return stage(null, null, null, null, responsable, avance);
}

/** Reparte el rango general en 3 tramos: Levantamiento, Prototipado, Doc. funcional */
function splitPlanningRange(inicio, fin) {
  let a = parseDate(inicio);
  let b = parseDate(fin);
  if (!a || !b) return null;
  if (b < a) [a, b] = [b, a];
  const startIso = toIso(a);
  const total = daysBetween(a, b);

  if (total <= 0) {
    return [
      { inicio: startIso, fin: startIso },
      { inicio: startIso, fin: startIso },
      { inicio: startIso, fin: startIso },
    ];
  }

  const parts = [];
  for (let i = 0; i < 3; i++) {
    const from = Math.round((total * i) / 3);
    const to = Math.round((total * (i + 1)) / 3);
    parts.push({
      inicio: addDaysIso(startIso, from),
      fin: addDaysIso(startIso, to),
    });
  }
  return parts;
}

function prioridadByOrden(index, total) {
  const rank = index / total;
  if (rank < 0.34) return "Alta";
  if (rank < 0.67) return "Media";
  return "Baja";
}

/** Responsables por etapa: vacíos por defecto; el usuario los escribe en Detalle o Excel */
const RESPONSABLES = {};

function sanitizeResponsable(name) {
  return String(name || "").trim();
}

const ROLES = {
  levantamiento: "Área de proyectos — flujo de levantamiento",
  prototipado: "Área de proyectos — continuidad del flujo",
  documento: "Área de proyectos — documento funcional",
  aprobacion: "Cliente — aprobación / demora de firma",
  disenoVisual: "Diseño visual — UI/UX previo a desarrollo",
  desarrollo: "Líder de proyecto — área de desarrollo",
  qa: "Coordinador de proyecto — área de desarrollo",
  pruebasCompletas: "Cliente — pruebas completas tras QA con usuario (pueden tomar semanas)",
  procesos: "Área de proyectos — pruebas QA con usuario",
  produccion: "Aprobación de pases a producción",
};

function responsableEtapa(stageKey) {
  return sanitizeResponsable(RESPONSABLES[stageKey] || "");
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length > 3));
  const tb = nb.split(" ").filter((t) => t.length > 3);
  if (!tb.length) return false;
  const hits = tb.filter((t) => ta.has(t)).length;
  return hits >= Math.min(3, tb.length) && hits / tb.length >= 0.6;
}

function buildEarlyStages(row) {
  // Solo Diseño: reparte inicio→fin del requerimiento en 3 columnas como fechas PLANIFICADAS.
  // Las demás etapas quedan vacías (sin estimación automática).
  const segs = splitPlanningRange(row.inicio, row.fin);
  const labels = ["Levantamiento", "Prototipado", "Documento funcional"];
  const keys = ["levantamiento", "prototipado", "documento"];
  const estado = row.estado || "Pendiente";

  const etapas = {};
  keys.forEach((key, i) => {
    const seg = segs[i];
    const resp = responsableEtapa(key);
    const avance = `${labels[i]} · planificado (${estado}) — completar real en Detalle`;
    etapas[key] = stage(seg.inicio, seg.fin, null, null, resp, avance);
  });

  return etapas;
}

function buildDesarrolloStage(row) {
  // Solo fechas planificadas si el ítem viene de la fuente de desarrollo (sin relleno automático de reales)
  let inicio = row.inicio;
  let fin = row.fin;
  if (parseDate(fin) < parseDate(inicio)) [inicio, fin] = [fin, inicio];
  const resp = responsableEtapa("desarrollo");
  const estado = row.estado || "Pendiente";
  return stage(
    inicio,
    fin,
    null,
    null,
    resp,
    `Desarrollo · planificado (${estado}) — completar real en Detalle`
  );
}

function findDevRow(nombre) {
  return DEV_FUENTE.find((d) => namesMatch(nombre, d.nombre)) || null;
}

function emptyEarlyStages() {
  return {
    levantamiento: emptyStage(responsableEtapa("levantamiento"), "Sin data de documento funcional en esta fuente"),
    prototipado: emptyStage(responsableEtapa("prototipado"), "Sin data de documento funcional en esta fuente"),
    documento: emptyStage(responsableEtapa("documento"), "Sin data de documento funcional en esta fuente"),
  };
}

function rangeDays(inicio, fin) {
  if (!inicio || !fin) return 0;
  const a = parseDate(inicio);
  const b = parseDate(fin);
  if (!a || !b) return 0;
  return Math.max(1, Math.abs(daysBetween(a, b)) + 1);
}

/** Estima dificultad (baja/media/alta) según duración planificada */
function estimateDifficulty(nombre, area, docDays, devDays) {
  let score = 2;
  const span = Math.max(docDays || 0, devDays || 0);

  if (span > 0 && span <= 7) score -= 1;
  else if (span > 21 && span <= 45) score += 1;
  else if (span > 45) score += 2;

  score = Math.max(1, Math.min(5, Math.round(score * 10) / 10));
  const level = score <= 2 ? "baja" : score <= 3.5 ? "media" : "alta";
  return { level, score };
}

function todayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toIso(d);
}

function assembleRequirement({ nombre, area, early, desarrollo, estadoDoc, estadoDev, index, total }) {
  const docDays = rangeDays(early.documento?.planInicio, early.documento?.planFin);
  const devDays = rangeDays(desarrollo?.planInicio, desarrollo?.planFin);
  const difficulty = estimateDifficulty(nombre, area, docDays, devDays);

  // No estimar el resto del flujo: fechas vacías hasta que se completen en Detalle
  const emptyNote = "Sin fechas — completar en Detalle";
  const trailing = {
    aprobacion: emptyStage(responsableEtapa("aprobacion"), emptyNote),
    disenoVisual: emptyStage(responsableEtapa("disenoVisual"), emptyNote),
    desarrollo: desarrollo || emptyStage(responsableEtapa("desarrollo"), emptyNote),
    qa: emptyStage(responsableEtapa("qa"), emptyNote),
    pruebasCompletas: emptyStage(responsableEtapa("pruebasCompletas"), emptyNote),
    procesos: emptyStage(responsableEtapa("procesos"), emptyNote),
    produccion: emptyStage(responsableEtapa("produccion"), emptyNote),
  };

  return {
    id: index + 1,
    nombre,
    prioridad: prioridadByOrden(index, total),
    area,
    estadoFuente: estadoDev || estadoDoc || "Pendiente",
    estadoDoc,
    estadoDev,
    dificultad: difficulty.level,
    decision: "pendiente",
    comentario: "",
    etapas: {
      ...early,
      aprobacion: trailing.aprobacion,
      disenoVisual: trailing.disenoVisual,
      desarrollo: trailing.desarrollo,
      qa: trailing.qa,
      pruebasCompletas: trailing.pruebasCompletas,
      procesos: trailing.procesos,
      produccion: trailing.produccion,
    },
  };
}

let REQ_FUENTE = [];
let DEV_FUENTE = [];
let requerimientos = [];
let stageEdits = {};
/** Decisiones por requerimiento (Resumen / Decisión) — propias de cada usuario */
let reqDecisions = {};
let reqOrder = [];
let activeEditReqId = null;

const STORAGE_KEY_BASE = "linkproject-fuentes-v1";
const STAGE_EDITS_KEY_BASE = "linkproject-stage-edits-v1";
const REQ_ORDER_KEY_BASE = "linkproject-req-order-v1";
const REQ_DECISIONS_KEY_BASE = "linkproject-req-decisions-v1";

function cloneFuente(list) {
  return list.map((r) => ({ ...r }));
}

function loadFuentes() {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY_BASE));
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (Array.isArray(data.doc) && Array.isArray(data.dev)) {
      REQ_FUENTE = data.doc.map((r) => ({ ...r }));
      DEV_FUENTE = data.dev.map((r) => ({ ...r }));
      return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

function saveFuentes() {
  localStorage.setItem(
    scopedKey(STORAGE_KEY_BASE),
    JSON.stringify({
      doc: REQ_FUENTE,
      dev: DEV_FUENTE,
      updatedAt: new Date().toISOString(),
    })
  );
  if (typeof window.__linkprojectSchedulePersist === "function") window.__linkprojectSchedulePersist();
}

function loadStageEdits() {
  try {
    const raw = localStorage.getItem(scopedKey(STAGE_EDITS_KEY_BASE));
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === "object") stageEdits = data;
  } catch (_) {
    stageEdits = {};
  }
}

function saveStageEdits() {
  localStorage.setItem(scopedKey(STAGE_EDITS_KEY_BASE), JSON.stringify(stageEdits));
  if (typeof window.__linkprojectSchedulePersist === "function") window.__linkprojectSchedulePersist();
}

function applyReqDecisions() {
  requerimientos.forEach((r) => {
    const d = reqDecisions[normName(r.nombre)];
    if (!d || typeof d !== "object") return;
    if (d.decision) r.decision = d.decision;
    if (d.comentario != null) r.comentario = String(d.comentario);
  });
}

function saveReqDecisions() {
  localStorage.setItem(scopedKey(REQ_DECISIONS_KEY_BASE), JSON.stringify(reqDecisions));
  if (typeof window.__linkprojectSchedulePersist === "function") window.__linkprojectSchedulePersist();
}

function upsertReqDecision(req) {
  if (!req?.nombre) return;
  reqDecisions[normName(req.nombre)] = {
    decision: req.decision || "pendiente",
    comentario: req.comentario || "",
  };
  saveReqDecisions();
}

function applyStageEdits() {
  requerimientos.forEach((r) => {
    const edits = stageEdits[normName(r.nombre)];
    if (!edits) return;
    STAGES.forEach((s) => {
      const patch = edits[s.key];
      if (!patch || !r.etapas[s.key]) return;
      Object.assign(r.etapas[s.key], {
        planInicio: patch.planInicio,
        planFin: patch.planFin,
        realInicio: patch.realInicio,
        realFin: patch.realFin,
        responsable: sanitizeResponsable(patch.responsable || r.etapas[s.key].responsable),
        avance: patch.avance ?? r.etapas[s.key].avance,
      });
    });
  });
}

function loadReqOrder() {
  try {
    const raw = localStorage.getItem(scopedKey(REQ_ORDER_KEY_BASE));
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) reqOrder = data.map(String);
  } catch (_) {
    reqOrder = [];
  }
}

function saveReqOrder() {
  localStorage.setItem(scopedKey(REQ_ORDER_KEY_BASE), JSON.stringify(reqOrder));
  if (typeof window.__linkprojectSchedulePersist === "function") window.__linkprojectSchedulePersist();
}

function applyReqOrder() {
  const byKey = new Map(requerimientos.map((r) => [normName(r.nombre), r]));
  const ordered = [];
  reqOrder.forEach((k) => {
    const key = normName(k);
    if (byKey.has(key)) {
      ordered.push(byKey.get(key));
      byKey.delete(key);
    }
  });
  byKey.forEach((r) => ordered.push(r));
  requerimientos = ordered.map((r, i) => ({ ...r, id: i + 1 }));
  reqOrder = requerimientos.map((r) => normName(r.nombre));
  saveReqOrder();
}

function reorderRequirement(fromId, toId) {
  if (fromId === toId) return false;
  const fromIdx = requerimientos.findIndex((r) => r.id === fromId);
  const toIdx = requerimientos.findIndex((r) => r.id === toId);
  if (fromIdx < 0 || toIdx < 0) return false;

  const activeName = activeEditReqId
    ? requerimientos.find((r) => r.id === activeEditReqId)?.nombre
    : null;

  const [item] = requerimientos.splice(fromIdx, 1);
  requerimientos.splice(toIdx, 0, item);
  requerimientos = requerimientos.map((r, i) => ({ ...r, id: i + 1 }));
  reqOrder = requerimientos.map((r) => normName(r.nombre));
  saveReqOrder();

  if (activeName) {
    activeEditReqId = requerimientos.find((r) => namesMatch(r.nombre, activeName))?.id ?? null;
  }
  return true;
}

function rebuildRequerimientos() {
  const usedDev = new Set();
  const totalHint = Math.max(1, REQ_FUENTE.length + DEV_FUENTE.length);
  // Fuente documento: solo Levantamiento / Prototipado / Documento funcional (plan).
  // No se enlaza desarrollo automático para no rellenar el resto del flujo.
  const list = REQ_FUENTE.map((row, index) => {
    const early = buildEarlyStages(row);
    const devRow = findDevRow(row.nombre);
    if (devRow) usedDev.add(devRow);

    return assembleRequirement({
      nombre: row.nombre,
      area: row.area,
      early,
      desarrollo: null,
      estadoDoc: row.estado,
      estadoDev: null,
      index,
      total: totalHint,
    });
  });

  // Ítems solo en fuente desarrollo: fechas plan solo en Desarrollo; diseño vacío
  DEV_FUENTE.forEach((devRow) => {
    if (usedDev.has(devRow)) return;
    if (list.some((r) => namesMatch(r.nombre, devRow.nombre))) return;
    list.push(
      assembleRequirement({
        nombre: devRow.nombre,
        area: devRow.area,
        early: emptyEarlyStages(),
        desarrollo: buildDesarrolloStage(devRow),
        estadoDoc: null,
        estadoDev: devRow.estado,
        index: list.length,
        total: totalHint,
      })
    );
  });

  requerimientos = list.map((r, i) => ({ ...r, id: i + 1 }));
  applyStageEdits();
  applyReqDecisions();
  // Sin overlays de código: lo que hay en fuentes + stageEdits (base de datos) es la verdad
  ensureCustomStagesOnReqs();
  requerimientos = requerimientos.map((r, i) => ({ ...r, id: i + 1 }));
  applyReqOrder();
  AREAS.length = 0;
  AREAS.push(...[...new Set(requerimientos.map((r) => r.area))]);
}

function syncWorkspaceUiForUser() {
  const btn = document.getElementById("btnResetData");
  if (!btn) return;
  btn.hidden = false;
  btn.textContent = "Vaciar mi tablero";
  btn.title = "Borra solo tus requerimientos (no afecta al otro usuario)";
}

function upsertReqFuente(item, estado) {
  const inicio = item.inicio || item.docInicio || item.plan || item.fin || item.real;
  const fin = item.fin || item.docFin || item.real || item.plan || inicio;
  let row = REQ_FUENTE.find((r) => namesMatch(r.nombre, item.nombre));
  if (!row) {
    REQ_FUENTE.push({
      nombre: item.nombre,
      area: item.area || "Sin área",
      inicio: inicio || todayIso(),
      fin: fin || inicio || todayIso(),
      estado: estado || item.estado || "Pendiente",
    });
    return;
  }
  if (item.area) row.area = item.area;
  if (estado) row.estado = estado;
}

function snapshotStageEditsFromReqs(list) {
  const out = {};
  list.forEach((req) => {
    const key = normName(req.nombre);
    const stages = {};
    STAGES.forEach((s) => {
      const et = req.etapas?.[s.key];
      if (!et) return;
      if (!et.planInicio && !et.planFin && !et.realInicio && !et.realFin) return;
      stages[s.key] = {
        planInicio: et.planInicio || null,
        planFin: et.planFin || null,
        realInicio: et.realInicio || null,
        realFin: et.realFin || null,
        responsable: et.responsable ? sanitizeResponsable(et.responsable) : "",
        avance: et.avance || "",
      };
    });
    if (Object.keys(stages).length) out[key] = stages;
  });
  return out;
}

function refreshAppFromData() {
  rebuildRequerimientos();
  fillAreaFilter();
  syncAreaSuggestions();
  syncWorkspaceUiForUser();
  renderKpis();
  buildPanorama();
  renderDetail();
  renderDecisionSummary();
  renderCronograma();
  const status = document.getElementById("cargaStatus");
  if (status) {
    const n = buildCronoRows().length;
    status.textContent =
      n === 0
        ? "Cronograma vacío · agrega requerimientos en tu Detalle (se reflejan solos)."
        : `Cronograma: ${n} requerimiento${n === 1 ? "" : "s"} de tu Detalle · ${new Date().toLocaleString("es-EC")}`;
  }
}

function syncAreaSuggestions() {
  const merged = [...new Set(AREAS.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );
  const list = document.getElementById("areaSuggestions");
  if (list) {
    list.innerHTML = merged.map((a) => `<option value="${escapeHtml(a)}"></option>`).join("");
  }
  document.querySelectorAll(".area-pick").forEach((sel) => {
    const current = sel.value;
    sel.innerHTML =
      `<option value="">Elegir sugerida…</option>` +
      merged.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
    if (current && merged.includes(current)) sel.value = current;
  });
}

function earliestDate(...vals) {
  const parsed = vals.map(parseDate).filter(Boolean);
  if (!parsed.length) return null;
  return toIso(new Date(Math.min(...parsed)));
}

function latestDate(...vals) {
  const parsed = vals.map(parseDate).filter(Boolean);
  if (!parsed.length) return null;
  return toIso(new Date(Math.max(...parsed)));
}

function spanFromStages(etapas, keys) {
  const inicios = [];
  const fines = [];
  keys.forEach((key) => {
    const et = etapas?.[key];
    if (!et) return;
    if (et.realInicio || et.planInicio) inicios.push(et.realInicio || et.planInicio);
    if (et.realFin || et.planFin) fines.push(et.realFin || et.planFin);
  });
  const inicio = earliestDate(...inicios);
  const fin = latestDate(...fines) || inicio;
  if (!inicio && !fin) return null;
  return { inicio: inicio || fin, fin: fin || inicio };
}

function formToRow(form) {
  const fd = new FormData(form);
  return {
    nombre: String(fd.get("nombre") || "").trim(),
    area: String(fd.get("area") || "").trim(),
    inicio: String(fd.get("inicio") || ""),
    fin: String(fd.get("fin") || ""),
    estado: String(fd.get("estado") || "Pendiente"),
    aplica: String(fd.get("aplica") || "ambos"),
  };
}

function buildCronoRows() {
  // Solo Detalle: cada requerimiento es una fila del cronograma
  return requerimientos.map((r, i) => {
    const docSpan = spanFromStages(r.etapas, [
      "levantamiento",
      "prototipado",
      "documento",
      "aprobacion",
      "disenoVisual",
    ]);
    const devSpan = spanFromStages(r.etapas, ["desarrollo", "qa", "procesos", "pruebasCompletas"]);
    return {
      key: r.id || `${normName(r.nombre)}-${i}`,
      reqId: r.id,
      nombre: r.nombre,
      area: r.area,
      doc: docSpan
        ? {
            nombre: r.nombre,
            area: r.area,
            inicio: docSpan.inicio,
            fin: docSpan.fin,
            estado: r.estadoDoc || r.estadoFuente || "Pendiente",
          }
        : null,
      docIndex: -1,
      dev: devSpan
        ? {
            nombre: r.nombre,
            area: r.area,
            inicio: devSpan.inicio,
            fin: devSpan.fin,
            estado: r.estadoDev || r.estadoFuente || "Pendiente",
          }
        : null,
      devIndex: -1,
      estado: r.estadoDev || r.estadoDoc || r.estadoFuente || "Pendiente",
    };
  });
}

function cronoRange() {
  const dates = [];
  requerimientos.forEach((r) => {
    Object.values(r.etapas || {}).forEach((et) => {
      if (!et) return;
      [et.planInicio, et.planFin, et.realInicio, et.realFin].forEach((d) => {
        const p = parseDate(d);
        if (p) dates.push(p);
      });
    });
  });
  const valid = dates.filter(Boolean);
  if (!valid.length) {
    const hoy = new Date();
    const start = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const end = new Date(hoy.getFullYear(), hoy.getMonth() + 5, 0);
    return { start, end };
  }
  let min = new Date(Math.min(...valid));
  let max = new Date(Math.max(...valid));
  min = new Date(min.getFullYear(), min.getMonth(), 1);
  max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  return { start: min, end: max };
}

function monthLabels(start, end) {
  const labels = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    labels.push({
      key: `${cur.getFullYear()}-${cur.getMonth()}`,
      label: cur.toLocaleDateString("es-EC", { month: "short", year: "2-digit" }),
      date: new Date(cur),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return labels;
}

function barStyle(inicio, fin, rangeStart, rangeEnd) {
  if (!inicio || !fin) return null;
  let a = parseDate(inicio);
  let b = parseDate(fin);
  if (!a || !b) return null;
  if (b < a) [a, b] = [b, a];
  const total = Math.max(1, daysBetween(rangeStart, rangeEnd));
  const left = Math.max(0, daysBetween(rangeStart, a));
  const right = Math.max(left + 1, daysBetween(rangeStart, b) + 1);
  const width = Math.min(total, right) - Math.min(total, left);
  return {
    left: `${(Math.min(total, left) / total) * 100}%`,
    width: `${(Math.max(1, width) / total) * 100}%`,
  };
}

function todayMarker(rangeStart, rangeEnd) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const total = Math.max(1, daysBetween(rangeStart, rangeEnd));
  if (hoy < rangeStart || hoy > rangeEnd) return null;
  const left = daysBetween(rangeStart, hoy);
  return `${(left / total) * 100}%`;
}

function statusTone(estado) {
  const s = slugEstado(estado || "");
  if (s === "listo" || s === "enviado") return "ok";
  if (s === "detenido") return "bad";
  if (s === "en-proceso") return "run";
  return "warn";
}

function renderCronograma() {
  const head = document.getElementById("cronoHead");
  const body = document.getElementById("cronoBody");
  if (!head || !body) return;

  const rows = buildCronoRows();
  const { start, end } = cronoRange();
  const months = monthLabels(start, end);
  const todayLeft = todayMarker(start, end);

  head.innerHTML = `
    <div class="crono-meta-cols">
      <span>Ítem</span>
      <span>Área</span>
      <span>Estado</span>
    </div>
    <div class="crono-timeline-cols" style="grid-template-columns: repeat(${months.length}, minmax(72px, 1fr))">
      ${months.map((m) => `<span>${m.label}</span>`).join("")}
    </div>
  `;

  if (!rows.length) {
    body.innerHTML = `
      <div class="crono-empty">
        <p><strong>Sin requerimientos aún.</strong></p>
        <p>El cronograma se arma solo con lo que agregues en <strong>Detalle</strong>.</p>
        <button type="button" class="btn primary" id="btnCronoEmptyAdd">Ir a Detalle</button>
      </div>`;
    document.getElementById("btnCronoEmptyAdd")?.addEventListener("click", goToDetalleAdd);
    return;
  }

  body.innerHTML = rows
    .map((row, i) => {
      const estado = row.estado || row.dev?.estado || row.doc?.estado || "Pendiente";
      const docBar = row.doc ? barStyle(row.doc.inicio, row.doc.fin, start, end) : null;
      const devBar = row.dev ? barStyle(row.dev.inicio, row.dev.fin, start, end) : null;
      const req = requerimientos.find((r) => namesMatch(r.nombre, row.nombre));
      const owner =
        sanitizeResponsable(
          req?.etapas?.desarrollo?.responsable ||
            req?.etapas?.documento?.responsable ||
            req?.etapas?.levantamiento?.responsable ||
            ""
        ) || "Sin responsable";
      const noBars = !docBar && !devBar;

      return `
      <div class="crono-row crono-row-link" data-key="${row.key}" data-req-id="${escapeHtml(row.reqId || "")}" title="Abrir en Detalle">
        <div class="crono-meta">
          <div class="crono-item">
            <strong>${i + 1}. ${escapeHtml(row.nombre)}</strong>
            <small>${escapeHtml(owner)}</small>
          </div>
          <div class="crono-area">${escapeHtml(row.area || "—")}</div>
          <div class="crono-status">
            <span class="crono-pill ${statusTone(estado)}">${escapeHtml(estado)}</span>
          </div>
        </div>
        <div class="crono-track" style="grid-template-columns: repeat(${months.length}, minmax(72px, 1fr))">
          ${months.map(() => `<span class="crono-cell"></span>`).join("")}
          ${todayLeft != null ? `<i class="crono-today" style="left:${todayLeft}"></i>` : ""}
          ${
            docBar
              ? `<div class="crono-bar doc" style="left:${docBar.left};width:${docBar.width}" title="Documento: ${formatDate(row.doc.inicio)} → ${formatDate(row.doc.fin)}">
                  <span>Doc · fin ${formatDate(row.doc.fin)}</span>
                </div>`
              : ""
          }
          ${
            devBar
              ? `<div class="crono-bar dev" style="left:${devBar.left};width:${devBar.width};top:${docBar ? "28px" : "10px"}" title="Desarrollo: ${formatDate(row.dev.inicio)} → ${formatDate(row.dev.fin)}">
                  <span>Dev · fin ${formatDate(row.dev.fin)}</span>
                </div>`
              : ""
          }
          ${noBars ? `<div class="crono-bar-empty">Sin fechas aún · edita en Detalle</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const state = {
  decisionGlobal: null,
};

function pctClass(pct) {
  if (pct == null) return "pct-na";
  if (pct >= 90) return "pct-ok";
  if (pct >= 60) return "pct-mid";
  return "pct-low";
}

function dateClass(planFin, realFin) {
  if (!planFin) return "date-pending";
  if (!realFin) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return hoy > parseDate(planFin) ? "date-late" : "date-pending";
  }
  return parseDate(realFin) <= parseDate(planFin) ? "date-ok" : "date-late";
}

function avg(nums) {
  const valid = nums.filter((n) => n != null);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function stagePct(et) {
  const metrics = realStageMetrics(et);
  const finParaPct = metrics.closed ? et.realFin : metrics.effectiveFin;
  return calcCumplimiento(et.planFin, finParaPct);
}

function renderKpis() {
  recomputePanoramaFromDetail();
  const total = PANORAMA_TOTAL.total;
  const enProd = PANORAMA_TOTAL.produccion.count;
  const enDiseno = PANORAMA_TOTAL.diseno.count;
  const enDev = PANORAMA_TOTAL.desarrollo.count;
  const enQa = PANORAMA_TOTAL.qa.count;
  const weightedProd = PANORAMA_TOTAL.produccion.pct ?? 0;

  document.getElementById("kpiGrid").innerHTML = `
    <button type="button" class="kpi kpi-link" data-kpi="total" title="Ver todos en Detalle">
      <span>Total en seguimiento</span>
      <strong>${total}</strong>
      <small>Desde Detalle</small>
    </button>
    <button type="button" class="kpi kpi-link" data-kpi="produccion" title="Ver listos / producción">
      <span>Ya en producción</span>
      <strong>${enProd}</strong>
      <small>Etapa producción</small>
    </button>
    <button type="button" class="kpi kpi-link" data-kpi="diseno" title="Ver en Detalle · Diseño">
      <span>En diseño</span>
      <strong>${enDiseno}</strong>
      <small>Lev. · Proto. · Doc.</small>
    </button>
    <button type="button" class="kpi kpi-link" data-kpi="avance" title="Avance de los que están en producción">
      <span>% avance producción</span>
      <strong>${formatPct(weightedProd)}</strong>
      <small>Dev ${enDev} · QA ${enQa}</small>
    </button>
  `;
}

function weightedStagePct(stageKey) {
  let weight = 0;
  let sum = 0;
  PANORAMA_DATA.forEach((row) => {
    const cell = row[stageKey];
    if (!cell.count) return;
    weight += cell.count;
    sum += cell.count * cell.pct;
  });
  if (!weight) return 0;
  return Math.round((sum / weight) * 10) / 10;
}

/**
 * Columnas del Panorama ↔ etapas del Detalle:
 * - Diseño → Levantamiento, Prototipado, Documento funcional
 * - Desarrollo IT → Diseño visual, Desarrollo
 * - Pruebas QA → Etapa QA, Pruebas QA Usuario Proyecto, Pruebas completas
 * - Producción → Etapa producción
 */
const PANORAMA_STAGES = [
  { key: "diseno", label: "Diseño", stageKeys: ["levantamiento", "prototipado", "documento"] },
  { key: "desarrollo", label: "Desarrollo IT", stageKeys: ["disenoVisual", "desarrollo"] },
  { key: "qa", label: "Pruebas QA", stageKeys: ["qa", "procesos", "pruebasCompletas"] },
  { key: "produccion", label: "Producción", stageKeys: ["produccion"] },
];

/** Se recalcula desde `requerimientos` (detalle) */
let PANORAMA_DATA = [];
let PANORAMA_TOTAL = {
  diseno: { count: 0, pct: null },
  desarrollo: { count: 0, pct: null },
  qa: { count: 0, pct: null },
  produccion: { count: 0, pct: null },
  total: 0,
};

function stageHasActivity(et) {
  if (!et) return false;
  return !!(et.planInicio || et.planFin || et.realInicio || et.realFin);
}

function pickStageForBucket(req, stageKeys) {
  // Última etapa del grupo con fechas (la más avanzada dentro de la columna)
  let found = null;
  for (const key of stageKeys) {
    const et = req.etapas?.[key];
    if (stageHasActivity(et)) found = et;
  }
  return found;
}

/**
 * Cada requerimiento cuenta en UNA sola columna del panorama
 * (la etapa más avanzada con fechas), y se agrupa por su Área del Detalle.
 */
function resolvePanoramaBucket(req) {
  if (isReqListo(req)) {
    return { bucket: "produccion", et: pickStageForBucket(req, ["produccion"]) || req.etapas?.produccion || null };
  }

  // De más avanzada a más temprana, según el mapeo Detalle → Panorama
  for (let i = PANORAMA_STAGES.length - 1; i >= 0; i -= 1) {
    const item = PANORAMA_STAGES[i];
    const et = pickStageForBucket(req, item.stageKeys);
    if (et) return { bucket: item.key, et };
  }
  return { bucket: "diseno", et: null };
}

function recomputePanoramaFromDetail() {
  const byArea = new Map();

  const ensure = (area) => {
    const key = String(area || "").trim() || "Sin área";
    if (!byArea.has(key)) {
      byArea.set(key, {
        area: key,
        diseno: { count: 0, pctSum: 0 },
        desarrollo: { count: 0, pctSum: 0 },
        qa: { count: 0, pctSum: 0 },
        produccion: { count: 0, pctSum: 0 },
        total: 0,
      });
    }
    return byArea.get(key);
  };

  requerimientos.forEach((req) => {
    const row = ensure(req.area);
    row.total += 1;
    const { bucket, et } = resolvePanoramaBucket(req);
    const pct = et ? stagePct(et) : 0;
    row[bucket].count += 1;
    row[bucket].pctSum += pct == null ? 0 : pct;
  });

  PANORAMA_DATA = [...byArea.values()]
    .map((row) => {
      const out = { area: row.area, total: row.total };
      PANORAMA_STAGES.forEach((bucket) => {
        const cell = row[bucket.key];
        out[bucket.key] = {
          count: cell.count,
          pct: cell.count ? Math.round((cell.pctSum / cell.count) * 10) / 10 : 0,
        };
      });
      return out;
    })
    .sort((a, b) => a.area.localeCompare(b.area, "es"));

  const totals = {
    diseno: { count: 0, pctSum: 0 },
    desarrollo: { count: 0, pctSum: 0 },
    qa: { count: 0, pctSum: 0 },
    produccion: { count: 0, pctSum: 0 },
    total: 0,
  };
  PANORAMA_DATA.forEach((row) => {
    totals.total += row.total;
    PANORAMA_STAGES.forEach((bucket) => {
      totals[bucket.key].count += row[bucket.key].count;
      totals[bucket.key].pctSum += row[bucket.key].count * row[bucket.key].pct;
    });
  });

  PANORAMA_TOTAL = {
    total: totals.total,
    diseno: {
      count: totals.diseno.count,
      pct: totals.diseno.count ? Math.round((totals.diseno.pctSum / totals.diseno.count) * 10) / 10 : null,
    },
    desarrollo: {
      count: totals.desarrollo.count,
      pct: totals.desarrollo.count
        ? Math.round((totals.desarrollo.pctSum / totals.desarrollo.count) * 10) / 10
        : null,
    },
    qa: {
      count: totals.qa.count,
      pct: totals.qa.count ? Math.round((totals.qa.pctSum / totals.qa.count) * 10) / 10 : null,
    },
    produccion: {
      count: totals.produccion.count,
      pct: totals.produccion.count
        ? Math.round((totals.produccion.pctSum / totals.produccion.count) * 10) / 10
        : null,
    },
  };
}

function formatPct(pct) {
  if (pct == null || pct === "") return "";
  return `${pct}%`;
}

function buildPanorama() {
  recomputePanoramaFromDetail();
  const tbody = document.querySelector("#panoramaTable tbody");
  const tfoot = document.querySelector("#panoramaTable tfoot");

  if (!PANORAMA_DATA.length) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state">
            <p class="empty-state-title">Panorama vacío</p>
            <p class="empty-state-text">Agrega requerimientos en Detalle: el Panorama se arma solo por Área y etapas.</p>
            <button type="button" class="btn primary" id="btnPanoramaEmptyAdd">Ir a Detalle</button>
          </div>
        </td>
      </tr>`;
    tfoot.innerHTML = "";
    document.getElementById("btnPanoramaEmptyAdd")?.addEventListener("click", goToDetalleAdd);
    return;
  }

  tbody.innerHTML = PANORAMA_DATA.map(
    (row, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="area">${row.area}</td>
        ${PANORAMA_STAGES.map((s) => stageCell(row[s.key])).join("")}
        <td class="total-cell">${row.total}</td>
      </tr>`
  ).join("");

  tfoot.innerHTML = `
    <tr>
      <td colspan="2">TOTAL</td>
      ${PANORAMA_STAGES.map((s) => stageCellTotal(PANORAMA_TOTAL[s.key].count)).join("")}
      <td class="total-cell">${PANORAMA_TOTAL.total}</td>
    </tr>
  `;
}

function stageCell({ count, pct }) {
  return `
    <td class="stage-cell">
      <div class="stage-metric">
        <span class="count">${count}</span>
        <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <span class="pct">${formatPct(pct)}</span>
      </div>
    </td>`;
}

function stageCellTotal(count) {
  return `
    <td class="stage-cell">
      <div class="stage-metric total-only">
        <span class="count">${count}</span>
      </div>
    </td>`;
}

function fillAreaFilter() {
  const sel = document.getElementById("filterArea");
  const current = sel.value;
  sel.innerHTML = `<option value="">Todas</option>`;
  AREAS.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    sel.appendChild(opt);
  });
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  syncAreaSuggestions();
}

/** Completamente listo: todas las etapas base tienen fecha fin real (incluida producción). */
function isReqListo(req) {
  return BASE_STAGES.every((s) => !!req.etapas?.[s.key]?.realFin);
}

let detailBucket = "curso"; // "curso" | "listos"

function filteredReqs() {
  const area = document.getElementById("filterArea").value;
  const prio = document.getElementById("filterPrioridad").value;
  const q = document.getElementById("filterSearch").value.trim().toLowerCase();
  return requerimientos.filter((r) => {
    if (area && r.area !== area) return false;
    if (prio && r.prioridad !== prio) return false;
    if (q && !r.nombre.toLowerCase().includes(q)) return false;
    const listo = isReqListo(r);
    if (detailBucket === "listos") return listo;
    return !listo;
  });
}

function updateDetailBucketUi() {
  const nCurso = requerimientos.filter((r) => !isReqListo(r)).length;
  const nListos = requerimientos.filter((r) => isReqListo(r)).length;
  const countCurso = document.getElementById("countCurso");
  const countListos = document.getElementById("countListos");
  if (countCurso) countCurso.textContent = String(nCurso);
  if (countListos) countListos.textContent = String(nListos);

  document.querySelectorAll(".detail-subtab").forEach((btn) => {
    const on = btn.dataset.bucket === detailBucket;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  const title = document.getElementById("detailTitle");
  const subtitle = document.getElementById("detailSubtitle");
  const hint = document.getElementById("detailHint");
  if (detailBucket === "listos") {
    if (title) title.textContent = "Listos en producción";
    if (subtitle) {
      subtitle.innerHTML =
        "Ya cerraron todas las etapas (incluido fin real de producción). Si abres una etapa, vuelven a <strong>En curso</strong>.";
    }
    if (hint) {
      hint.textContent =
        "Vista de cerrados. Quitar un fin real regresa el ítem a En curso.";
    }
  } else {
    if (title) title.textContent = "En curso y planificados";
    if (subtitle) {
      subtitle.innerHTML =
        "Trabajo activo o planificado. Cuando todas las etapas tengan fin real (incluida producción), pasan a <strong>Listos</strong>.";
    }
    if (hint) {
      hint.textContent =
        "Tip: clic en el nombre abre la edición; arrastra la fila para reordenar; + Agregar suma una fila nueva.";
    }
  }
}

function setDetailBucket(bucket) {
  detailBucket = bucket === "listos" ? "listos" : "curso";
  closeStageDrawer();
  updateDetailBucketUi();
  renderDetail();
}

function durationDays(inicio, fin) {
  if (!inicio || !fin) return null;
  const a = parseDate(inicio);
  const b = parseDate(fin);
  if (!a || !b) return null;
  return Math.max(1, daysBetween(a, b) + 1);
}

function daysOverdue(planFin, effectiveFin) {
  if (!planFin || !effectiveFin) return null;
  const plan = parseDate(planFin);
  const fin = parseDate(effectiveFin);
  if (!plan || !fin || fin <= plan) return null;
  return daysBetween(plan, fin);
}

/**
 * Métrica de fecha real:
 * - Parte del inicio real capturado por el usuario
 * - Si no hay fin real, cuenta días hasta hoy
 * - Si ya pasó el fin planificado, calcula días de retraso
 */
function realStageMetrics(et) {
  const hoy = todayIso();
  const planDays = durationDays(et.planInicio, et.planFin);

  if (!et.realInicio) {
    const planLate = daysOverdue(et.planFin, hoy);
    return {
      planDays,
      realDays: null,
      delayDays: planLate,
      effectiveFin: null,
      closed: false,
      tone: planLate ? "late" : "",
      statusLabel: planLate ? `+${planLate}d retraso` : "sin iniciar",
    };
  }

  const closed = !!et.realFin;
  const effectiveFin = closed ? et.realFin : hoy;
  const realDays = durationDays(et.realInicio, effectiveFin);
  const delayDays = daysOverdue(et.planFin, effectiveFin);

  let tone = "";
  let statusLabel = "en curso";
  if (delayDays) {
    tone = "late";
    statusLabel = `+${delayDays}d retraso`;
  } else if (closed) {
    tone = "ok";
    statusLabel = "a tiempo";
  }

  return {
    planDays,
    realDays,
    delayDays,
    effectiveFin,
    closed,
    tone,
    statusLabel,
  };
}

function delayHtml(metrics) {
  if (!metrics?.delayDays) {
    return `<span class="delay-pill delay-empty" aria-hidden="true">&nbsp;</span>`;
  }
  return `<span class="delay-pill" title="Días de retraso vs fin planificado">+${metrics.delayDays}d</span>`;
}

function daysDelta(planDays, realDays) {
  if (planDays == null || realDays == null) return null;
  return realDays - planDays;
}

function barTone(pct) {
  if (pct == null) return "tone-na";
  if (pct >= 90) return "tone-ok";
  if (pct >= 60) return "tone-mid";
  return "tone-low";
}

function dateTone(planFin, realFin) {
  const cls = dateClass(planFin, realFin);
  if (cls === "date-ok") return "ok";
  if (cls === "date-late") return "late";
  return "";
}

function trackWidth(days, maxDays) {
  if (days == null || !maxDays) return 0;
  return Math.max(12, Math.round((days / maxDays) * 100));
}

function reqStageCell(reqId, stageDef, et) {
  if (stageDef.clientWait) {
    return reqClienteEsperaCell(reqId, stageDef, et);
  }

  const metrics = realStageMetrics(et);
  const pctLabel = stagePct(et);
  const pct = pctLabel ?? 0;
  const planDays = metrics.planDays;
  const realDays = metrics.realDays;
  const tone = metrics.tone;
  const maxDays = Math.max(planDays || 0, realDays || 0, 1);

  const planDaysHtml =
    planDays == null ? `<strong class="duo-days muted">—</strong>` : `<strong class="duo-days">${planDays}<small>d</small></strong>`;
  const realDaysHtml =
    realDays == null
      ? `<strong class="duo-days muted">—</strong>`
      : `<strong class="duo-days ${tone}">${realDays}<small>d</small></strong>`;

  const planRange = dateRangeHtml(et.planInicio, et.planFin, {
    label: stageDef.production ? "Producción planificada" : "Planificado",
  });
  const realRange = dateRangeHtml(et.realInicio, metrics.closed ? et.realFin : et.realInicio ? "hoy" : null, {
    tone,
    label: "Real",
  });

  return `
    <td class="stage-cell">
      <button
        type="button"
        class="stage-hit"
        data-req="${reqId}"
        data-stage="${stageDef.key}"
        title="Ver tarjeta de fechas — ${stageDef.label}"
      >
        <div class="stage-visual group-${stageDef.group || "default"} ${stageDef.production ? "prod" : ""}">
          <div class="stage-metric compact">
            <div class="bar ${barTone(pctLabel)}" aria-hidden="true"><i style="width:${pct}%"></i></div>
            <span class="pct">${pctLabel == null ? "—" : pctLabel + "%"}</span>
          </div>
          <div class="duo" aria-label="Planificado versus real en curso">
            <div class="duo-col">
              <span class="duo-lbl">${stageDef.production ? "Prod" : "Plan"}</span>
              ${planDaysHtml}
              ${planRange}
              <span class="delay-pill delay-empty" aria-hidden="true">&nbsp;</span>
              <div class="duo-track" aria-hidden="true"><i style="width:${trackWidth(planDays, maxDays)}%"></i></div>
            </div>
            <div class="duo-divider" aria-hidden="true"></div>
            <div class="duo-col">
              <span class="duo-lbl">Real</span>
              ${realDaysHtml}
              ${realRange}
              ${delayHtml(metrics)}
              <div class="duo-track real ${tone}" aria-hidden="true"><i style="width:${trackWidth(realDays, maxDays)}%"></i></div>
            </div>
          </div>
          <div class="duo-delta ${tone || "muted"}">${metrics.statusLabel}</div>
          <div class="stage-owner">${escapeHtml(sanitizeResponsable(et.responsable) || "Sin responsable")}</div>
        </div>
      </button>
    </td>`;
}

function clientWaitLabels(stageKey) {
  if (stageKey === "pruebasCompletas") {
    return {
      title: "Días en pruebas completas del cliente",
      aria: "Días desde la entrega a pruebas completas",
      startTitle: "Fecha inicio / entrega",
      endTitle: "Fecha completado",
      drawerStart: "Entrega a pruebas completas",
      drawerEnd: "Completado",
      emptyStatus: "sin entregar",
    };
  }
  return {
    title: "Días desde el envío",
    aria: "Días desde el envío a aprobación",
    startTitle: "Fecha enviado",
    endTitle: "Fecha aprobado",
    drawerStart: "Fecha enviado a aprobar",
    drawerEnd: "Aprobado",
    emptyStatus: "sin enviar",
  };
}

function reqClienteEsperaCell(reqId, stageDef, et) {
  const labels = clientWaitLabels(stageDef.key);
  // Solo fechas reales (sin plan)
  const inicio = et.realInicio || null;
  const fin = et.realFin || null;
  const metrics = realStageMetrics({
    planInicio: null,
    planFin: null,
    realInicio: inicio,
    realFin: fin,
  });
  const realDays = metrics.realDays;
  const done = !!fin;
  const pct = done ? 100 : inicio ? (metrics.delayDays ? 40 : 60) : 0;
  const tone = metrics.tone;
  const statusLabel = !inicio
    ? labels.emptyStatus
    : metrics.statusLabel;

  const realDaysHtml =
    realDays == null
      ? `<strong class="duo-days muted">—</strong>`
      : `<strong class="duo-days ${tone}">${realDays}<small>d</small></strong>`;

  const realRange = dateRangeHtml(inicio, done ? fin : inicio ? "hoy" : null, {
    tone,
    label: labels.title,
  });

  return `
    <td class="stage-cell">
      <button
        type="button"
        class="stage-hit"
        data-req="${reqId}"
        data-stage="${stageDef.key}"
        title="${labels.title}"
      >
        <div class="stage-visual group-cliente">
          <div class="stage-metric compact">
            <div class="bar ${barTone(pct)}" aria-hidden="true"><i style="width:${pct}%"></i></div>
            <span class="pct">${pct}%</span>
          </div>
          <div class="duo duo-solo" aria-label="${labels.aria}">
            <div class="duo-col">
              <span class="duo-lbl">Real</span>
              ${realDaysHtml}
              ${realRange}
              ${delayHtml(metrics)}
              <div class="duo-track real ${tone}" aria-hidden="true"><i style="width:${realDays == null ? 0 : 100}%"></i></div>
            </div>
          </div>
          <div class="duo-delta ${tone || "muted"}">${statusLabel}</div>
          <div class="stage-owner">${escapeHtml(sanitizeResponsable(et.responsable) || "Sin responsable")}</div>
        </div>
      </button>
    </td>`;
}

function slugEstado(estado) {
  return String(estado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function renderDetailHead() {
  const thead = document.querySelector("#detailTable thead tr");
  if (!thead) return;
  const stageHeads = STAGES.map((s) => {
    const cls =
      s.group === "cliente"
        ? "col-cliente"
        : s.group === "diseno"
          ? "col-diseno"
          : s.group === "proyectos"
            ? "col-proyectos"
            : s.custom
              ? "col-extra"
              : "";
    const removeBtn = s.custom
      ? `<button type="button" class="th-remove" data-remove-stage="${s.key}" title="Quitar columna">×</button>`
      : "";
    return `<th class="${cls}">${escapeHtml(s.label)}${removeBtn}</th>`;
  }).join("");
  thead.innerHTML = `
    <th>N°</th>
    <th>Requerimiento</th>
    <th>Prioridad</th>
    <th>Área</th>
    ${stageHeads}
    <th>Cumpl. total</th>
    <th>Decisión</th>
  `;
}

function renderDetail() {
  updateDetailBucketUi();
  renderDetailHead();
  const tbody = document.querySelector("#detailTable tbody");
  const rows = filteredReqs();
  const keepReq = activeEditReqId;
  const colSpan = 6 + STAGES.length;

  if (!rows.length) {
    const hasFilters =
      document.getElementById("filterArea").value ||
      document.getElementById("filterPrioridad").value ||
      document.getElementById("filterSearch").value.trim();
    const isListos = detailBucket === "listos";
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="${colSpan}">
          <div class="empty-state">
            <p class="empty-state-title">${
              isListos
                ? hasFilters
                  ? "Ningún listo coincide con el filtro"
                  : "Aún no hay requerimientos listos"
                : hasFilters
                  ? "Ningún requerimiento coincide con el filtro"
                  : "No hay requerimientos en curso"
            }</p>
            <p class="empty-state-text">${
              isListos
                ? hasFilters
                  ? "Prueba limpiar área, prioridad o búsqueda."
                  : "Cuando un requerimiento cierre todas las etapas con fin real, aparecerá aquí."
                : hasFilters
                  ? "Prueba limpiar área, prioridad o búsqueda, o agrega uno nuevo."
                  : "Agrega una fila con + Agregar. El Panorama y el Cronograma se actualizan solos."
            }</p>
            ${
              hasFilters
                ? `<button type="button" class="btn ghost" data-clear-filters>Limpiar filtros</button>`
                : !isListos
                  ? `<button type="button" class="btn primary" data-open-add-req>+ Agregar requerimiento</button>`
                  : ""
            }
          </div>
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = rows
      .map((r) => {
        const totalPct = avg(STAGES.map((s) => stagePct(r.etapas[s.key])));
        const stageCells = STAGES.map((s) => reqStageCell(r.id, s, r.etapas[s.key])).join("");
        const rowActive = keepReq === r.id ? "req-row-active" : "";
        const listoBadge = isReqListo(r)
          ? `<span class="req-estado estado-prod-listo">Listo · producción</span>`
          : "";

        return `
        <tr data-id="${r.id}" class="req-row ${rowActive}" draggable="true" title="Arrastra la fila para cambiar el orden">
          <td class="num">
            <span class="drag-handle" data-drag-handle title="Arrastrar para reordenar" aria-label="Arrastrar">⋮⋮</span>
            <span class="num-val">${r.id}</span>
          </td>
          <td class="req-cell" data-open-req="${r.id}" title="Editar fechas del requerimiento">
            <div class="req-name">${r.nombre}</div>
            <div class="req-estados">
              <span class="req-estado estado-dif-${r.dificultad || "media"}">Dif: ${(r.dificultad || "media").toUpperCase()}</span>
              ${r.estadoDoc ? `<span class="req-estado estado-${slugEstado(r.estadoDoc)}">Doc: ${r.estadoDoc}</span>` : ""}
              ${r.estadoDev ? `<span class="req-estado estado-${slugEstado(r.estadoDev)}">Dev: ${r.estadoDev}</span>` : ""}
              ${!r.estadoDoc && !r.estadoDev ? `<span class="req-estado estado-${slugEstado(r.estadoFuente)}">${r.estadoFuente}</span>` : ""}
              ${listoBadge}
            </div>
          </td>
          <td class="prio-cell"><span class="badge ${r.prioridad.toLowerCase()}">${r.prioridad}</span></td>
          <td class="area-cell">${r.area}</td>
          ${stageCells}
          <td class="total-cell"><span class="pct-pill ${pctClass(totalPct)}">${totalPct}%</span></td>
          <td>
            <div class="mini-actions">
              <button type="button" class="ok" data-action="aprobado">Aprobar</button>
              <button type="button" class="warn" data-action="mejoras">Mejoras</button>
              <button type="button" class="bad" data-action="rechazado">Rechazar</button>
              <button type="button" class="del" data-delete-req="${r.id}" title="Eliminar requerimiento">Borrar</button>
            </div>
            <div class="req-status ${r.decision}">${labelDecision(r.decision)}</div>
          </td>
        </tr>`;
      })
      .join("");
  }

  if (keepReq) {
    const still = requerimientos.find((r) => r.id === keepReq);
    const visible = rows.some((r) => r.id === keepReq);
    if (still && visible) {
      openReqEditor(keepReq);
    } else if (still) {
      const next = isReqListo(still) ? "listos" : "curso";
      if (next !== detailBucket) {
        detailBucket = next;
        renderDetail();
        return;
      }
      closeStageDrawer();
    } else {
      closeStageDrawer();
    }
  }
}

function dateInputVal(iso) {
  return iso || "";
}

function editStageSection(req, stageDef) {
  const et = req.etapas[stageDef.key];
  const metrics = realStageMetrics(
    stageDef.clientWait
      ? {
          planInicio: null,
          planFin: null,
          realInicio: et.realInicio,
          realFin: et.realFin,
        }
      : et
  );
  const labels = stageDef.clientWait ? clientWaitLabels(stageDef.key) : null;
  const finPlanLabel = stageDef.production ? "Fin / F. producción plan." : "Fin planificado";
  const finRealLabel = stageDef.clientWait
    ? labels.endTitle
    : stageDef.production
      ? "Fin / F. producción real"
      : "Fin real";
  const iniRealLabel = stageDef.clientWait ? labels.startTitle : "Inicio real";
  const iniPlanLabel = "Inicio planificado";

  // Aprobación y Pruebas completas: solo fechas reales (sin plan)
  if (stageDef.clientWait) {
    return `
    <section class="edit-stage group-${stageDef.group || "default"}" id="edit-stage-${stageDef.key}" data-stage="${stageDef.key}">
      <header class="edit-stage-head">
        <div>
          <h4>${stageDef.label}</h4>
          <p class="edit-stage-role">${ROLES[stageDef.key] || ""}</p>
        </div>
        <span class="edit-stage-status ${metrics.tone || "muted"}">${metrics.statusLabel}</span>
      </header>
      <div class="edit-stage-grid edit-stage-real-only">
        <label class="edit-field">
          <span>${iniRealLabel}</span>
          <input type="date" name="${stageDef.key}.realInicio" value="${dateInputVal(et.realInicio)}" />
        </label>
        <label class="edit-field">
          <span>${finRealLabel}</span>
          <input type="date" name="${stageDef.key}.realFin" value="${dateInputVal(et.realFin)}" />
        </label>
        <input type="hidden" name="${stageDef.key}.planInicio" value="" />
        <input type="hidden" name="${stageDef.key}.planFin" value="" />
        <label class="edit-field full">
          <span>Responsable</span>
          <input type="text" name="${stageDef.key}.responsable" value="${escapeHtml(sanitizeResponsable(et.responsable) || "")}" placeholder="Escribe el responsable" />
        </label>
        <label class="edit-field full">
          <span>Avance / nota</span>
          <textarea name="${stageDef.key}.avance" rows="2">${escapeHtml(et.avance || "")}</textarea>
        </label>
      </div>
      <p class="edit-stage-hint">Solo fecha real (sin planificada)</p>
    </section>`;
  }

  return `
    <section class="edit-stage group-${stageDef.group || "default"}" id="edit-stage-${stageDef.key}" data-stage="${stageDef.key}">
      <header class="edit-stage-head">
        <div>
          <h4>${stageDef.label}</h4>
          <p class="edit-stage-role">${ROLES[stageDef.key] || ""}</p>
        </div>
        <span class="edit-stage-status ${metrics.tone || "muted"}">${metrics.statusLabel}</span>
      </header>
      <div class="edit-stage-grid">
        <label class="edit-field">
          <span>${iniPlanLabel}</span>
          <input type="date" name="${stageDef.key}.planInicio" value="${dateInputVal(et.planInicio)}" />
        </label>
        <label class="edit-field">
          <span>${finPlanLabel}</span>
          <input type="date" name="${stageDef.key}.planFin" value="${dateInputVal(et.planFin)}" />
        </label>
        <label class="edit-field">
          <span>${iniRealLabel}</span>
          <input type="date" name="${stageDef.key}.realInicio" value="${dateInputVal(et.realInicio)}" />
        </label>
        <label class="edit-field">
          <span>${finRealLabel}</span>
          <input type="date" name="${stageDef.key}.realFin" value="${dateInputVal(et.realFin)}" />
        </label>
        <label class="edit-field full">
          <span>Responsable</span>
          <input type="text" name="${stageDef.key}.responsable" value="${escapeHtml(sanitizeResponsable(et.responsable) || "")}" placeholder="Escribe el responsable" />
        </label>
        <label class="edit-field full">
          <span>Avance / nota</span>
          <textarea name="${stageDef.key}.avance" rows="2">${escapeHtml(et.avance || "")}</textarea>
        </label>
      </div>
      ${metrics.delayDays ? `<p class="edit-stage-delay">+${metrics.delayDays}d retraso vs fin planificado</p>` : ""}
    </section>`;
}

function openReqEditor(reqId, focusStageKey) {
  const req = requerimientos.find((r) => r.id === reqId);
  if (!req) return;

  activeEditReqId = reqId;
  const totalPct = avg(STAGES.map((s) => stagePct(req.etapas[s.key])));
  const layout = document.querySelector(".detail-layout");
  const drawer = document.getElementById("stageDrawer");

  layout.classList.add("with-drawer");
  drawer.hidden = false;

  document.querySelectorAll("#detailTable tbody tr").forEach((tr) => {
    tr.classList.toggle("req-row-active", Number(tr.dataset.id) === reqId);
  });

  document.getElementById("drawerStage").textContent = isReqListo(req)
    ? "Listo · editar fechas"
    : "Editar fechas por etapa";
  document.getElementById("drawerReq").textContent = req.nombre;
  document.getElementById("drawerMeta").innerHTML = `
    <span class="badge ${req.prioridad.toLowerCase()}">${req.prioridad}</span>
    <span class="pct-pill ${pctClass(totalPct)}">${totalPct}%</span>
    ${isReqListo(req) ? `<span class="badge listo-move">En producción</span>` : ""}
  `;

  document.getElementById("drawerGrid").innerHTML = `
    <form id="reqEditForm" class="req-edit-form">
      <p class="edit-intro">El <strong>Área</strong> agrupa el Panorama. Completa fechas por etapa y guarda: Panorama y Cronograma se actualizan solos.</p>
      <div class="edit-req-basics">
        <label class="edit-field">
          <span>Área</span>
          <div class="area-combo">
            <select class="area-pick" id="editAreaPick" aria-label="Elegir área sugerida">
              <option value="">Elegir sugerida…</option>
            </select>
            <input
              type="text"
              name="reqArea"
              id="editAreaInput"
              required
              list="areaSuggestions"
              value="${escapeHtml(req.area || "")}"
              placeholder="O escribe un área nueva"
              autocomplete="off"
            />
          </div>
        </label>
      </div>
      ${STAGES.map((s) => editStageSection(req, s)).join("")}
    </form>
  `;
  syncAreaSuggestions();
  const areaPick = document.getElementById("editAreaPick");
  const areaInput = document.getElementById("editAreaInput");
  if (areaPick && areaInput) {
    if ([...areaPick.options].some((o) => o.value === req.area)) areaPick.value = req.area;
    areaPick.onchange = () => {
      if (!areaPick.value) return;
      areaInput.value = areaPick.value;
    };
  }

  document.getElementById("drawerActions").innerHTML = `
    <div class="drawer-actions-main">
      <button type="submit" form="reqEditForm" class="btn primary" id="btnSaveEdit">Guardar cambios</button>
      <button type="button" class="btn ghost" id="btnCancelEdit">Cerrar</button>
      <button type="button" class="btn danger" id="btnDeleteReq" data-delete-req="${req.id}">Eliminar requerimiento</button>
    </div>
    <div class="drawer-actions-secondary">
      <button type="button" class="btn ghost" data-action="aprobado" data-req="${req.id}">Aprobar</button>
      <button type="button" class="btn ghost" data-action="mejoras" data-req="${req.id}">Solicitar mejoras</button>
      <button type="button" class="btn ghost" data-action="rechazado" data-req="${req.id}">Rechazar</button>
    </div>
  `;

  const form = document.getElementById("reqEditForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveReqEditor(reqId, form);
  });

  document.getElementById("btnCancelEdit")?.addEventListener("click", closeStageDrawer);
  document.getElementById("btnDeleteReq")?.addEventListener("click", () => deleteRequirement(reqId));


  if (focusStageKey) {
    requestAnimationFrame(() => {
      document.getElementById(`edit-stage-${focusStageKey}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

function blankToNull(v) {
  const s = String(v || "").trim();
  return s || null;
}

function saveReqEditor(reqId, form) {
  const req = requerimientos.find((r) => r.id === reqId);
  if (!req) return;

  const fd = new FormData(form);
  const key = normName(req.nombre);
  if (!stageEdits[key]) stageEdits[key] = {};

  const newArea = String(fd.get("reqArea") || "").trim();
  if (newArea && newArea !== req.area) {
    req.area = newArea;
    REQ_FUENTE.forEach((r) => {
      if (namesMatch(r.nombre, req.nombre)) r.area = newArea;
    });
    DEV_FUENTE.forEach((r) => {
      if (namesMatch(r.nombre, req.nombre)) r.area = newArea;
    });
    saveFuentes();
  }

  STAGES.forEach((s) => {
    const patch = {
      planInicio: blankToNull(fd.get(`${s.key}.planInicio`)),
      planFin: blankToNull(fd.get(`${s.key}.planFin`)),
      realInicio: blankToNull(fd.get(`${s.key}.realInicio`)),
      realFin: blankToNull(fd.get(`${s.key}.realFin`)),
      responsable: sanitizeResponsable(String(fd.get(`${s.key}.responsable`) || "")),
      avance: blankToNull(fd.get(`${s.key}.avance`)) || "",
    };
    // Aprobación y Pruebas completas: nunca guardar fechas plan
    if (s.clientWait) {
      patch.planInicio = null;
      patch.planFin = null;
    }
    Object.assign(req.etapas[s.key], patch);
    stageEdits[key][s.key] = { ...patch };
  });

  saveStageEdits();
  if (typeof window.__linkprojectPersistNow === "function") {
    window.__linkprojectPersistNow();
  }
  const listo = isReqListo(req);
  const wasListos = detailBucket === "listos";
  detailBucket = listo ? "listos" : "curso";
  activeEditReqId = reqId;

  AREAS.length = 0;
  AREAS.push(...[...new Set(requerimientos.map((r) => r.area).filter(Boolean))]);
  fillAreaFilter();
  renderKpis();
  buildPanorama();
  renderDetail();
  renderCronograma();
  renderDecisionSummary();

  const drawer = document.getElementById("stageDrawer");
  if (drawer) {
    drawer.classList.add("is-saved");
    setTimeout(() => drawer.classList.remove("is-saved"), 900);
  }
  const saveBtn = document.getElementById("btnSaveEdit");
  if (saveBtn) {
    const prev = saveBtn.textContent;
    saveBtn.textContent = "Guardado ✓";
    setTimeout(() => {
      if (saveBtn.isConnected) saveBtn.textContent = prev;
    }, 1200);
  }
  showToast(
    listo && !wasListos
      ? `"${req.nombre}" guardado y movido a Listos · Panorama actualizado`
      : `Guardado · Panorama y Cronograma actualizados`,
    "ok"
  );
}

function closeStageDrawer() {
  activeEditReqId = null;
  document.querySelector(".detail-layout")?.classList.remove("with-drawer");
  const drawer = document.getElementById("stageDrawer");
  if (drawer) drawer.hidden = true;
  document.querySelectorAll(".stage-hit.active").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll("#detailTable tbody tr.req-row-active").forEach((el) => el.classList.remove("req-row-active"));
}

function labelDecision(d) {
  return (
    {
      pendiente: "Pendiente",
      aprobado: "Aprobado",
      mejoras: "Con mejoras",
      rechazado: "Rechazado",
    }[d] || d
  );
}

function renderDecisionSummary() {
  const counts = { pendiente: 0, aprobado: 0, mejoras: 0, rechazado: 0 };
  requerimientos.forEach((r) => {
    counts[r.decision] = (counts[r.decision] || 0) + 1;
  });

  const byPrio = ["Alta", "Media", "Baja"].map(
    (p) => `${p}: ${requerimientos.filter((r) => r.prioridad === p).length}`
  );

  document.getElementById("decisionSummary").innerHTML = `
    <h3>Estado de la revisión</h3>
    <div class="stat-list">
      <div class="stat-item"><span>Pendientes</span><strong>${counts.pendiente}</strong></div>
      <div class="stat-item"><span>Aprobados</span><strong>${counts.aprobado}</strong></div>
      <div class="stat-item"><span>Con mejoras</span><strong>${counts.mejoras}</strong></div>
      <div class="stat-item"><span>Rechazados</span><strong>${counts.rechazado}</strong></div>
      <div class="stat-item"><span>Por prioridad</span><strong>${byPrio.join(" · ")}</strong></div>
      <div class="stat-item"><span>Áreas cubiertas</span><strong>${AREAS.length}</strong></div>
      <div class="stat-item"><span>En curso / planificados</span><strong>${requerimientos.filter((r) => !isReqListo(r)).length}</strong></div>
      <div class="stat-item"><span>Listos en producción</span><strong>${requerimientos.filter((r) => isReqListo(r)).length}</strong></div>
      <div class="stat-item"><span>Requerimientos totales</span><strong>${requerimientos.length}</strong></div>
    </div>
  `;
}

/* Tabs */
function activateTab(id) {
  document.querySelectorAll(".tab[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === id);
    b.setAttribute("aria-selected", b.dataset.tab === id ? "true" : "false");
  });

  document.querySelectorAll(".panel").forEach((p) => {
    const match = p.id === `panel-${id}`;
    p.classList.toggle("active", match);
    p.hidden = !match;
  });
  if (id === "decision") renderDecisionSummary();
  if (id === "cronograma") renderCronograma();
}

function openDetalleFromKpi(kind) {
  activateTab("detalle");
  if (kind === "produccion") {
    setDetailBucket("listos");
  } else {
    setDetailBucket("curso");
  }
  clearDetailFilters();
  const hint =
    kind === "diseno"
      ? "Diseño = Levantamiento + Prototipado + Doc. funcional"
      : kind === "produccion"
        ? "Viendo listos en producción"
        : "Totales del Detalle";
  showToast(hint, "ok");
}

document.getElementById("kpiGrid")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-kpi]");
  if (!btn) return;
  openDetalleFromKpi(btn.dataset.kpi);
});

document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

/* Filters */
["filterArea", "filterPrioridad", "filterSearch"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    closeStageDrawer();
    renderDetail();
  });
});

document.querySelectorAll(".detail-subtab").forEach((btn) => {
  btn.addEventListener("click", () => setDetailBucket(btn.dataset.bucket));
});

function addRequirementFromForm(form) {
  const row = formToRow(form);
  if (!row.nombre || !row.area || !row.inicio || !row.fin) return null;
  const payload = {
    nombre: row.nombre,
    area: row.area,
    inicio: row.inicio,
    fin: row.fin,
    estado: row.estado || "Pendiente",
  };
  if (row.aplica === "documento" || row.aplica === "ambos") REQ_FUENTE.push({ ...payload });
  if (row.aplica === "desarrollo" || row.aplica === "ambos") DEV_FUENTE.push({ ...payload });
  saveFuentes();
  refreshAppFromData();
  return requerimientos.find((r) => namesMatch(r.nombre, payload.nombre)) || null;
}

document.getElementById("btnAddReq").addEventListener("click", () => {
  const form = document.getElementById("formNuevoReq");
  const show = form.hidden;
  form.hidden = !show;
  if (show) {
    setDetailBucket("curso");
    if (!form.inicio.value) form.inicio.value = todayIso();
    if (!form.fin.value) form.fin.value = todayIso();
    form.nombre?.focus();
  }
});

document.getElementById("btnCancelAddReq").addEventListener("click", () => {
  const form = document.getElementById("formNuevoReq");
  form.reset();
  form.hidden = true;
});

document.getElementById("formNuevoReq").addEventListener("submit", (e) => {
  e.preventDefault();
  const created = addRequirementFromForm(e.target);
  e.target.reset();
  e.target.hidden = true;
  detailBucket = "curso";
  updateDetailBucketUi();
  renderDetail();
  if (created) {
    openReqEditor(created.id);
    showToast(`"${created.nombre}" agregado. Completa las fechas en el panel.`, "ok");
  } else {
    showToast("No se pudo agregar el requerimiento. Revisa los datos.", "warn");
  }
});

function clearDetailFilters() {
  const area = document.getElementById("filterArea");
  const prio = document.getElementById("filterPrioridad");
  const search = document.getElementById("filterSearch");
  if (area) area.value = "";
  if (prio) prio.value = "";
  if (search) search.value = "";
  renderDetail();
}

document.getElementById("btnClearFilters")?.addEventListener("click", clearDetailFilters);

/* ——— Excel: plantilla + carga masiva ——— */
const EXCEL_HEADERS = [
  "nombre",
  "area",
  "estado",
  "aplica",
  "inicio",
  "fin",
  "clasificacion",
  "responsable",
];

const EXCEL_STAGE_SUFFIXES = ["plan_inicio", "plan_fin", "real_inicio", "real_fin", "responsable"];

function excelStageHeaders() {
  const cols = [];
  BASE_STAGES.forEach((s) => {
    EXCEL_STAGE_SUFFIXES.forEach((suf) => cols.push(`${s.key}_${suf}`));
  });
  return cols;
}

function excelAllHeaders() {
  return [...EXCEL_HEADERS, ...excelStageHeaders()];
}

function ensureXlsx() {
  if (typeof XLSX === "undefined") {
    showToast("No se pudo cargar la librería Excel. Revisa la conexión e inténtalo de nuevo.", "warn");
    return false;
  }
  return true;
}

function excelCellToIso(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIso(value);
  }
  if (typeof value === "number" && typeof XLSX !== "undefined" && XLSX.SSF?.parse_date_code) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) {
      const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
      return toIso(dt);
    }
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const dt = new Date(year, month - 1, day);
    if (!Number.isNaN(dt.getTime())) return toIso(dt);
  }
  const parsed = parseDate(raw);
  return parsed ? toIso(parsed) : null;
}

function normalizeAplica(value) {
  const n = normName(value);
  if (!n || n.includes("ambos") || (n.includes("documento") && n.includes("desarroll"))) return "ambos";
  if (n.includes("desarroll") || n === "dev") return "desarrollo";
  if (n.includes("documento") || n.includes("doc")) return "documento";
  return "ambos";
}

function normalizeEstado(value) {
  const n = normName(value);
  if (!n) return "Pendiente";
  if (n.includes("planific")) return "Planificar";
  if (n.includes("proceso")) return "En Proceso";
  if (n.includes("enviad")) return "Enviado";
  if (n.includes("listo")) return "Listo";
  if (n.includes("detenid")) return "Detenido";
  if (n.includes("pendient")) return "Pendiente";
  return String(value).trim() || "Pendiente";
}

/** diseno | desarrollo | qa | produccion */
function normalizeClasificacion(value) {
  const n = normName(value);
  if (!n) return "diseno";
  if (n.includes("produc") || n.includes("listo")) return "produccion";
  if (n.includes("prueba") || n.includes("qa")) return "qa";
  if (n.includes("desarroll") || n === "it" || n.includes("dev")) return "desarrollo";
  return "diseno";
}

function makeStageEditPatch(planInicio, planFin, realInicio, realFin, stageKey, note, responsable) {
  return {
    planInicio: planInicio || null,
    planFin: planFin || null,
    realInicio: realInicio || null,
    realFin: realFin || null,
    responsable: sanitizeResponsable(responsable || ""),
    avance: note || "",
  };
}

function rowHasExplicitStageDates(row) {
  return BASE_STAGES.some((s) =>
    ["plan_inicio", "plan_fin", "real_inicio", "real_fin"].some((suf) => {
      const v = row[`${s.key}_${suf}`];
      return v != null && String(v).trim() !== "";
    })
  );
}

function resolveStageResponsable(row, stageKey) {
  const perStage = sanitizeResponsable(String(row[`${stageKey}_responsable`] || "").trim());
  if (perStage) return perStage;
  return sanitizeResponsable(String(row.responsable || "").trim());
}

function buildStageEditsFromExplicit(row) {
  const edits = {};
  BASE_STAGES.forEach((s) => {
    const planInicio = excelCellToIso(row[`${s.key}_plan_inicio`]);
    const planFin = excelCellToIso(row[`${s.key}_plan_fin`]);
    const realInicio = excelCellToIso(row[`${s.key}_real_inicio`]);
    const realFin = excelCellToIso(row[`${s.key}_real_fin`]);
    const responsable = resolveStageResponsable(row, s.key);
    if (!planInicio && !planFin && !realInicio && !realFin && !responsable) return;
    if (!planInicio && !planFin && !realInicio && !realFin) {
      // Solo responsable: no crear etapa vacía sin fechas
      return;
    }
    edits[s.key] = makeStageEditPatch(
      planInicio,
      planFin || planInicio,
      realInicio,
      realFin,
      s.key,
      `Importado Excel · ${s.label}`,
      responsable
    );
  });
  return edits;
}

/**
 * Arma fechas por clasificación:
 * - Diseño → plan en Lev/Proto/Doc
 * - Desarrollo IT → etapas de Diseño cerradas + plan en Diseño visual/Desarrollo
 * - Pruebas QA → anteriores cerradas + plan en QA
 * - Producción → todas las etapas con fin real (cae en Listos)
 * responsable (columna global o por etapa) se aplica a las etapas tocadas.
 */
function buildStageEditsFromClasificacion(row) {
  const inicio = excelCellToIso(row.inicio) || todayIso();
  const fin = excelCellToIso(row.fin) || inicio;
  const bucket = normalizeClasificacion(row.clasificacion);
  const estado = normalizeEstado(row.estado);
  const currentDone = estado === "Listo" || estado === "Enviado";
  const edits = {};

  const groups = [
    { key: "diseno", stageKeys: ["levantamiento", "prototipado", "documento"] },
    { key: "desarrollo", stageKeys: ["disenoVisual", "desarrollo"] },
    { key: "qa", stageKeys: ["qa", "procesos", "pruebasCompletas"] },
    { key: "produccion", stageKeys: ["produccion"] },
  ];
  const targetIdx = groups.findIndex((g) => g.key === bucket);

  if (bucket === "produccion") {
    BASE_STAGES.forEach((s) => {
      edits[s.key] = makeStageEditPatch(
        inicio,
        fin,
        inicio,
        fin,
        s.key,
        `Importado Excel · ${s.label} · Listo en producción`,
        resolveStageResponsable(row, s.key)
      );
    });
    return edits;
  }

  groups.forEach((g, idx) => {
    g.stageKeys.forEach((key) => {
      const label = BASE_STAGES.find((s) => s.key === key)?.label || key;
      const responsable = resolveStageResponsable(row, key);
      if (idx < targetIdx) {
        edits[key] = makeStageEditPatch(
          inicio,
          fin,
          inicio,
          fin,
          key,
          `Importado Excel · ${label} · cerrado`,
          responsable
        );
      } else if (idx === targetIdx) {
        edits[key] = makeStageEditPatch(
          inicio,
          fin,
          currentDone ? inicio : null,
          currentDone ? fin : null,
          key,
          `Importado Excel · ${label} · ${g.key}`,
          responsable
        );
      }
    });
  });

  return edits;
}

function normalizeImportHeader(h) {
  return String(h || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();
}

const IMPORT_HEADER_ALIASES = {
  nombre: ["nombre", "requerimiento", "req", "titulo", "name"],
  area: ["area", "área"],
  estado: ["estado", "status"],
  aplica: ["aplica", "aplica_a", "fuente"],
  inicio: ["inicio", "fecha_inicio", "doc_inicio", "start"],
  fin: ["fin", "fecha_fin", "doc_fin", "end"],
  clasificacion: [
    "clasificacion",
    "clasificación",
    "etapa",
    "etapa_actual",
    "fase",
    "bucket",
    "panorama",
  ],
  responsable: ["responsable", "owner", "encargado", "asignado"],
};

function mapImportHeaders(rawHeaders) {
  const map = {};
  rawHeaders.forEach((h, idx) => {
    const norm = normalizeImportHeader(h);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(IMPORT_HEADER_ALIASES)) {
      if (aliases.some((a) => normalizeImportHeader(a) === norm)) {
        map[field] = idx;
        return;
      }
    }
    // stage columns: levantamiento_plan_inicio, desarrollo_responsable, etc.
    if (
      BASE_STAGES.some((s) =>
        EXCEL_STAGE_SUFFIXES.some((suf) => norm === `${s.key}_${suf}`)
      )
    ) {
      map[norm] = idx;
    }
  });
  return map;
}

function upsertFuenteList(list, payload) {
  const existing = list.find((r) => namesMatch(r.nombre, payload.nombre));
  if (existing) {
    Object.assign(existing, payload);
    return "updated";
  }
  list.push({ ...payload });
  return "added";
}

function downloadExcelTemplate() {
  if (!ensureXlsx()) return;
  if (typeof window.__linkprojectCanWrite === "function" && !window.__linkprojectCanWrite()) {
    showToast("No tienes permiso para descargar la plantilla de carga", "warn");
    return;
  }

  const headers = excelAllHeaders();
  const exampleCurso = {
    nombre: "Ejemplo — Portal de despacho",
    area: "Operaciones",
    estado: "En Proceso",
    aplica: "ambos",
    inicio: todayIso(),
    fin: todayIso(),
    clasificacion: "Diseño",
    responsable: "Nombre del responsable",
  };
  const exampleProd = {
    nombre: "Ejemplo — Reporte ya en producción",
    area: "Reportería",
    estado: "Listo",
    aplica: "ambos",
    inicio: todayIso(),
    fin: todayIso(),
    clasificacion: "Producción",
    responsable: "Nombre del responsable",
  };

  const toRow = (obj) => headers.map((h) => obj[h] ?? "");

  const wb = XLSX.utils.book_new();

  const instrucciones = [
    ["LMS Project Manager — Plantilla de carga masiva de requerimientos"],
    [""],
    ["1. Completa la hoja Requerimientos (una fila = un requerimiento)."],
    ["2. Campos obligatorios: nombre, area, inicio, fin."],
    ["3. responsable: escribe aquí el nombre de la persona a cargo (no viene por defecto)."],
    ["   Se aplica a las etapas según clasificacion. Si necesitas uno distinto por etapa,"],
    ["   usa columnas opcionales: levantamiento_responsable, desarrollo_responsable, etc."],
    ["4. clasificacion define en qué columna del Panorama cae y si va a Listos:"],
    ["   - Diseño → Levantamiento / Prototipado / Documento funcional"],
    ["   - Desarrollo IT → Diseño visual / Desarrollo (etapas previas cerradas)"],
    ["   - Pruebas QA → QA / Pruebas usuario / Pruebas completas"],
    ["   - Producción → todas las etapas con fin real → pestaña Listos en producción"],
    ["5. aplica: ambos | documento | desarrollo"],
    ["6. estado: Pendiente | Planificar | En Proceso | Enviado | Listo | Detenido"],
    ["7. Opcional: columnas por etapa (*_plan_inicio, *_plan_fin, *_real_inicio, *_real_fin, *_responsable)."],
    ["   Si las llenas, tienen prioridad sobre clasificacion."],
    ["8. Sube el archivo con el botón Subir Excel en Detalle."],
    ["9. También puedes agregar uno a uno con + Agregar y escribir el responsable en el editor."],
    [""],
    ["Fechas: usa formato YYYY-MM-DD o DD/MM/YYYY."],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInfo["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instrucciones");

  const wsData = XLSX.utils.aoa_to_sheet([headers, toRow(exampleCurso), toRow(exampleProd)]);
  wsData["!cols"] = headers.map((h) => ({ wch: Math.min(28, Math.max(12, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, wsData, "Requerimientos");

  const catalogo = [
    ["Campo", "Valores válidos"],
    ["clasificacion", "Diseño | Desarrollo IT | Pruebas QA | Producción"],
    ["estado", "Pendiente | Planificar | En Proceso | Enviado | Listo | Detenido"],
    ["aplica", "ambos | documento | desarrollo"],
    ["responsable", "Texto libre — nombre de quien lleva la etapa (obligatorio si quieres verlo en Detalle)"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catalogo), "Catalogo");

  XLSX.writeFile(wb, `LMS_Project_Manager_plantilla_requerimientos_${todayIso()}.xlsx`);
  showToast("Plantilla Excel descargada", "ok");
}

function parseExcelWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName =
          wb.SheetNames.find((n) => /requer/i.test(n)) ||
          wb.SheetNames.find((n) => !/instruc|catalog/i.test(n)) ||
          wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsArrayBuffer(file);
  });
}

async function importRequirementsFromExcel(file) {
  if (!ensureXlsx()) return;
  if (typeof window.__linkprojectCanWrite === "function" && !window.__linkprojectCanWrite()) {
    showToast("No tienes permiso para importar", "warn");
    return;
  }

  let matrix;
  try {
    matrix = await parseExcelWorkbook(file);
  } catch (err) {
    console.error(err);
    showToast("Archivo Excel inválido", "warn");
    return;
  }

  if (!matrix?.length) {
    showToast("El Excel está vacío", "warn");
    return;
  }

  // Skip title rows until we find a header with "nombre"
  let headerIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 10); i += 1) {
    const mapped = mapImportHeaders(matrix[i]);
    if (mapped.nombre != null) {
      headerIdx = i;
      break;
    }
  }

  const headerMap = mapImportHeaders(matrix[headerIdx]);
  if (headerMap.nombre == null) {
    showToast('Falta la columna "nombre" en la plantilla', "warn");
    return;
  }

  const get = (row, field) => {
    const idx = headerMap[field];
    if (idx == null) return "";
    return row[idx];
  };

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let listos = 0;

  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const raw = matrix[i];
    if (!raw || !raw.length) continue;

    const nombre = String(get(raw, "nombre") || "").trim();
    const area = String(get(raw, "area") || "").trim();
    if (!nombre) {
      skipped += 1;
      continue;
    }
    if (!area) {
      skipped += 1;
      continue;
    }

    const inicio = excelCellToIso(get(raw, "inicio")) || todayIso();
    const fin = excelCellToIso(get(raw, "fin")) || inicio;
    const estado = normalizeEstado(get(raw, "estado"));
    const aplica = normalizeAplica(get(raw, "aplica"));
    const clasificacion = String(get(raw, "clasificacion") || "").trim();
    const responsable = String(get(raw, "responsable") || "").trim();

    const rowObj = { nombre, area, estado, aplica, inicio, fin, clasificacion, responsable };
    // Attach explicit stage cells (fechas / responsable por etapa)
    Object.keys(headerMap).forEach((field) => {
      if (EXCEL_HEADERS.includes(field)) return;
      rowObj[field] = get(raw, field);
    });

    const payload = { nombre, area, inicio, fin, estado };
    if (aplica === "documento" || aplica === "ambos") {
      const r = upsertFuenteList(REQ_FUENTE, payload);
      if (r === "added") added += 1;
      else updated += 1;
    }
    if (aplica === "desarrollo" || aplica === "ambos") {
      const r = upsertFuenteList(DEV_FUENTE, payload);
      // only count once for dual apply
      if (aplica === "desarrollo") {
        if (r === "added") added += 1;
        else updated += 1;
      }
    }

    const edits = rowHasExplicitStageDates(rowObj)
      ? buildStageEditsFromExplicit(rowObj)
      : buildStageEditsFromClasificacion(rowObj);

    if (Object.keys(edits).length) {
      stageEdits[normName(nombre)] = {
        ...(stageEdits[normName(nombre)] || {}),
        ...edits,
      };
    }

    if (normalizeClasificacion(clasificacion) === "produccion") listos += 1;
  }

  saveFuentes();
  saveStageEdits();
  refreshAppFromData();
  if (typeof window.__linkprojectPersistNow === "function") window.__linkprojectPersistNow();

  const wentListos = requerimientos.filter((r) => isReqListo(r)).length;
  setDetailBucket(wentListos && listos ? "listos" : "curso");
  showToast(
    `Importación: ${added} nuevos, ${updated} actualizados` +
      (skipped ? `, ${skipped} omitidos` : "") +
      (wentListos ? ` · ${wentListos} en producción/Listos` : ""),
    added + updated > 0 ? "ok" : "warn"
  );
}

document.getElementById("btnDownloadExcel")?.addEventListener("click", downloadExcelTemplate);

document.getElementById("btnImportExcel")?.addEventListener("click", () => {
  if (typeof window.__linkprojectCanWrite === "function" && !window.__linkprojectCanWrite()) {
    showToast("No tienes permiso para importar", "warn");
    return;
  }
  document.getElementById("inputImportExcel")?.click();
});

document.getElementById("inputImportExcel")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  await importRequirementsFromExcel(file);
});

function showToast(message, tone = "ok") {
  const host = document.getElementById("toastHost");
  if (!host || !message) return;
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  }, 2800);
}

/* Stage / requirement → editor drawer + drag reorder */
const detailTbody = document.querySelector("#detailTable tbody");
let dragAllowed = false;
let dragReqId = null;
let dragMoved = false;

detailTbody.addEventListener("mousedown", (e) => {
  const interactive = e.target.closest(".stage-hit, button, input, textarea, select, a, .mini-actions");
  dragAllowed = !interactive && !!e.target.closest("tr[data-id]:not(.empty-row)");
  dragMoved = false;
});

detailTbody.addEventListener("dragstart", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr || !dragAllowed || tr.classList.contains("empty-row")) {
    e.preventDefault();
    return;
  }
  dragReqId = Number(tr.dataset.id);
  dragMoved = true;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(dragReqId));
  tr.classList.add("is-dragging");
  detailTbody.classList.add("is-reordering");
});

detailTbody.addEventListener("dragend", () => {
  dragAllowed = false;
  dragReqId = null;
  detailTbody.classList.remove("is-reordering");
  detailTbody.querySelectorAll("tr.is-dragging, tr.drag-over").forEach((el) => {
    el.classList.remove("is-dragging", "drag-over");
  });
});

detailTbody.addEventListener("dragover", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr || !dragReqId || tr.classList.contains("empty-row")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  detailTbody.querySelectorAll("tr.drag-over").forEach((el) => el.classList.remove("drag-over"));
  if (Number(tr.dataset.id) !== dragReqId) tr.classList.add("drag-over");
});

detailTbody.addEventListener("dragleave", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr && !tr.contains(e.relatedTarget)) tr.classList.remove("drag-over");
});

detailTbody.addEventListener("drop", (e) => {
  e.preventDefault();
  const tr = e.target.closest("tr[data-id]");
  if (!tr || !dragReqId) return;
  const toId = Number(tr.dataset.id);
  tr.classList.remove("drag-over");
  if (reorderRequirement(dragReqId, toId)) {
    renderDetail();
  }
});

detailTbody.addEventListener("click", (e) => {
  if (dragMoved) {
    dragMoved = false;
    return;
  }

  if (e.target.closest("[data-clear-filters]")) {
    e.preventDefault();
    clearDetailFilters();
    return;
  }
  if (e.target.closest("[data-open-add-req]")) {
    e.preventDefault();
    document.getElementById("btnAddReq")?.click();
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-req]");
  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    deleteRequirement(Number(deleteBtn.dataset.deleteReq));
    return;
  }

  const decisionBtn = e.target.closest("button[data-action]");
  if (decisionBtn) {
    const tr = decisionBtn.closest("tr");
    const id = Number(tr.dataset.id);
    const req = requerimientos.find((r) => r.id === id);
    pendingAction = { id, action: decisionBtn.dataset.action };
    document.getElementById("modalTitle").textContent = `Marcar como ${labelDecision(decisionBtn.dataset.action)}`;
    document.getElementById("modalReq").textContent = req.nombre;
    document.getElementById("modalComment").value = req.comentario || "";
    modal.showModal();
    return;
  }

  const stageBtn = e.target.closest(".stage-hit");
  if (stageBtn) {
    document.querySelectorAll(".stage-hit.active").forEach((el) => el.classList.remove("active"));
    stageBtn.classList.add("active");
    openReqEditor(Number(stageBtn.dataset.req), stageBtn.dataset.stage);
    return;
  }

  const reqCell = e.target.closest("[data-open-req]");
  if (reqCell) {
    openReqEditor(Number(reqCell.dataset.openReq));
  }
});

document.getElementById("drawerClose").addEventListener("click", closeStageDrawer);

document.getElementById("drawerActions").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.req);
  const req = requerimientos.find((r) => r.id === id);
  pendingAction = { id, action: btn.dataset.action };
  document.getElementById("modalTitle").textContent = `Marcar como ${labelDecision(btn.dataset.action)}`;
  document.getElementById("modalReq").textContent = req.nombre;
  document.getElementById("modalComment").value = req.comentario || "";
  modal.showModal();
});

/* Per-requirement decision modal */
let pendingAction = null;
const modal = document.getElementById("decisionModal");

modal.addEventListener("close", () => {
  if (modal.returnValue !== "confirm" || !pendingAction) return;
  const req = requerimientos.find((r) => r.id === pendingAction.id);
  req.decision = pendingAction.action;
  req.comentario = document.getElementById("modalComment").value.trim();
  pendingAction = null;
  upsertReqDecision(req);
  renderDetail();
  renderDecisionSummary();
  renderKpis();
});

document.getElementById("modalConfirm").addEventListener("click", (e) => {
  e.preventDefault();
  modal.close("confirm");
});

/* Global decision form */
document.getElementById("decisionForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const resolucion = new FormData(e.target).get("resolucion");
  const revisor = document.getElementById("revisor").value.trim();
  const fecha = document.getElementById("fechaDecision").value;
  const obs = document.getElementById("observaciones").value.trim();

  state.decisionGlobal = { resolucion, revisor, fecha, obs, at: new Date().toISOString() };
  if (typeof window.__linkprojectSchedulePersist === "function") window.__linkprojectSchedulePersist();

  const pill = document.getElementById("estadoGeneralPill");
  pill.classList.remove("aprobado", "mejoras", "rechazado");
  const map = {
    aprobar: { cls: "aprobado", text: "Aprobado por gerencia" },
    mejoras: { cls: "mejoras", text: "Aprobado con mejoras" },
    rechazar: { cls: "rechazado", text: "Rechazado por gerencia" },
  };
  const m = map[resolucion];
  pill.classList.add(m.cls);
  pill.querySelector("strong").textContent = m.text;

  const result = document.getElementById("decisionResult");
  result.hidden = false;
  result.textContent = `Decisión registrada: ${m.text} · ${revisor} · ${formatDate(fecha)}${obs ? " — " + obs : ""}`;
  result.style.background =
    resolucion === "aprobar" ? "var(--ok-bg)" : resolucion === "mejoras" ? "var(--warn-bg)" : "var(--danger-bg)";
  result.style.color =
    resolucion === "aprobar" ? "var(--ok)" : resolucion === "mejoras" ? "var(--warn)" : "var(--danger)";
  showToast(m.text, resolucion === "rechazar" ? "warn" : "ok");
});

document.getElementById("btnExport").addEventListener("click", () => {
  const payload = {
    generado: new Date().toISOString(),
    decisionGlobal: state.decisionGlobal,
    fuentes: { doc: REQ_FUENTE, dev: DEV_FUENTE },
    requerimientos: requerimientos.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      prioridad: r.prioridad,
      area: r.area,
      decision: r.decision,
      comentario: r.comentario,
      etapas: Object.fromEntries(
        STAGES.map((s) => {
          const et = r.etapas[s.key];
          return [
            s.key,
            {
              planInicio: et.planInicio,
              planFin: et.planFin,
              realInicio: et.realInicio,
              realFin: et.realFin,
              responsable: et.responsable,
              avance: et.avance,
              cumplimiento: stagePct(et),
              diasRetraso: realStageMetrics(et).delayDays,
              etiquetaFin: s.production ? "fecha_produccion" : "fecha_fin_planificada",
            },
          ];
        })
      ),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lms-project-manager-decision-gerencia.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* Cronograma — solo lectura desde Detalle */
function goToDetalleAdd() {
  activateTab("detalle");
  setDetailBucket("curso");
  const form = document.getElementById("formNuevoReq");
  if (!form) return;
  form.hidden = false;
  if (!form.inicio.value) form.inicio.value = todayIso();
  if (!form.fin.value) form.fin.value = todayIso();
  form.nombre?.focus();
}

document.getElementById("btnGoDetalle")?.addEventListener("click", goToDetalleAdd);

document.getElementById("cronoBody").addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  const row = e.target.closest(".crono-row[data-req-id]");
  const reqId = row?.dataset?.reqId;
  if (!reqId) return;
  activateTab("detalle");
  openReqEditor(reqId);
});

document.querySelectorAll(".area-pick").forEach((sel) => {
  sel.addEventListener("change", () => {
    if (!sel.value) return;
    const input = sel.closest(".area-combo")?.querySelector('input[name="area"]');
    if (input) {
      input.value = sel.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
});

document.getElementById("btnResetData").addEventListener("click", () => {
  if (!confirm("¿Vaciar tu tablero? Solo borra tus requerimientos; el otro usuario no se ve afectado.")) return;
  REQ_FUENTE = [];
  DEV_FUENTE = [];
  stageEdits = {};
  reqDecisions = {};
  reqOrder = [];
  customStages = [];
  window.__linkprojectUserOwnedData = true;
  saveFuentes();
  saveStageEdits();
  saveReqDecisions();
  saveReqOrder();
  saveCustomStages();
  rebuildStagesList();
  closeStageDrawer();
  refreshAppFromData();
  if (typeof window.__linkprojectPersistNow === "function") window.__linkprojectPersistNow();
  showToast("Tu tablero quedó vacío · agrega desde Detalle", "ok");
});

/* Init — espera datos remotos vía auth-bridge (__linkprojectApplyRemote) */
function applyDecisionUi(decision) {
  const pill = document.getElementById("estadoGeneralPill");
  if (!pill) return;
  pill.classList.remove("aprobado", "mejoras", "rechazado");
  const strong = pill.querySelector("strong");
  const result = document.getElementById("decisionResult");

  if (!decision || !decision.resolucion) {
    if (strong) strong.textContent = "Pendiente de gerencia";
    if (result) {
      result.hidden = true;
      result.textContent = "";
    }
    return;
  }

  const map = {
    aprobar: { cls: "aprobado", text: "Aprobado por gerencia" },
    mejoras: { cls: "mejoras", text: "Aprobado con mejoras" },
    rechazar: { cls: "rechazado", text: "Rechazado por gerencia" },
  };
  const m = map[decision.resolucion];
  if (!m) return;
  pill.classList.add(m.cls);
  if (strong) strong.textContent = m.text;
}

window.__linkprojectApplyRemote = function applyRemote(data, meta = {}) {
  const payload = data || {};

  if (meta.userId) setStorageUser(meta.userId);
  window.__linkprojectUserOwnedData = true;
  window.__linkprojectDesignSourceSanitized = true;

  // Solo el workspace de ESTE usuario (nunca datos de otro rol)
  REQ_FUENTE = Array.isArray(payload.doc) ? payload.doc.map((r) => ({ ...r })) : [];
  DEV_FUENTE = Array.isArray(payload.dev) ? payload.dev.map((r) => ({ ...r })) : [];
  stageEdits =
    payload.stageEdits && typeof payload.stageEdits === "object" ? { ...payload.stageEdits } : {};
  reqDecisions =
    payload.reqDecisions && typeof payload.reqDecisions === "object" ? { ...payload.reqDecisions } : {};
  reqOrder = Array.isArray(payload.reqOrder) ? payload.reqOrder.slice() : [];
  customStages = Array.isArray(payload.customStages)
    ? payload.customStages
        .filter((s) => s && s.key && s.label)
        .map((s) => ({
          key: String(s.key),
          label: String(s.label),
          group: s.group || "default",
          custom: true,
        }))
    : [];
  rebuildStagesList();

  if (payload.decisionGlobal) {
    state.decisionGlobal = payload.decisionGlobal;
    applyDecisionUi(payload.decisionGlobal);
  } else {
    state.decisionGlobal = null;
    applyDecisionUi(null);
  }

  try {
    localStorage.setItem(scopedKey(STORAGE_KEY_BASE), JSON.stringify({ doc: REQ_FUENTE, dev: DEV_FUENTE }));
    localStorage.setItem(scopedKey(STAGE_EDITS_KEY_BASE), JSON.stringify(stageEdits));
    localStorage.setItem(scopedKey(REQ_ORDER_KEY_BASE), JSON.stringify(reqOrder));
    localStorage.setItem(scopedKey(CUSTOM_STAGES_KEY_BASE), JSON.stringify(customStages));
    localStorage.setItem(scopedKey(REQ_DECISIONS_KEY_BASE), JSON.stringify(reqDecisions));
  } catch (_) {
    /* ignore */
  }

  refreshAppFromData();
};

function deleteRequirement(reqId) {
  if (typeof window.__linkprojectCanWrite === "function" && !window.__linkprojectCanWrite()) {
    showToast("No tienes permiso para borrar", "warn");
    return;
  }
  const req = requerimientos.find((r) => r.id === reqId);
  if (!req) return;
  if (!confirm(`¿Eliminar el requerimiento "${req.nombre}"? Esta acción se guarda en tu workspace.`)) {
    return;
  }

  const key = normName(req.nombre);
  REQ_FUENTE = REQ_FUENTE.filter((r) => !namesMatch(r.nombre, req.nombre));
  DEV_FUENTE = DEV_FUENTE.filter((r) => !namesMatch(r.nombre, req.nombre));
  if (stageEdits[key]) delete stageEdits[key];
  if (reqDecisions[key]) delete reqDecisions[key];
  reqOrder = reqOrder.filter((k) => k !== key && !namesMatch(k, req.nombre));

  saveFuentes();
  saveStageEdits();
  saveReqDecisions();
  saveReqOrder();
  closeStageDrawer();
  refreshAppFromData();
  if (typeof window.__linkprojectPersistNow === "function") {
    window.__linkprojectPersistNow();
  }
  showToast(`"${req.nombre}" eliminado`, "ok");
}

(function init() {
  const hoy = new Date();
  document.getElementById("fechaCorte").textContent = hoy.toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  document.getElementById("fechaDecision").value = hoy.toISOString().slice(0, 10);
  // Vacío hasta hidratar el workspace del usuario desde el servidor
  rebuildStagesList();
  refreshAppFromData();
})();
