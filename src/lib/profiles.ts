export const MARIA_EMAIL = "mpluas@awenandwis.com";
export const LMS_EMAIL = "aordosgoitia@atcotrans.com";

export const LMS_STAGE_KEYS = ["levantamiento", "prototipado", "documento", "aprobacion"] as const;

export type UserProfile = "lms" | "maria" | "default";

export function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

export function isMariaEmail(email?: string | null) {
  return normalizeEmail(email) === MARIA_EMAIL;
}

export function isLmsEmail(email?: string | null) {
  return normalizeEmail(email) === LMS_EMAIL;
}

export function profileForEmail(email?: string | null): UserProfile {
  if (isLmsEmail(email)) return "lms";
  if (isMariaEmail(email)) return "maria";
  return "default";
}

export function projectNameForEmail(email?: string | null) {
  if (isLmsEmail(email)) return "Atcotrans";
  if (isMariaEmail(email)) return "TMS 2.0";
  return "DMS Operaciones";
}

export function workspaceIdForUser(user: { id: string }) {
  return `user:${user.id}`;
}

export function mergeLmsStageEdits(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  docs: unknown[] = []
) {
  const incomingObj = incoming || {};
  const currentObj = current || {};
  const docKeys = new Set(
    (Array.isArray(docs) ? docs : [])
      .map((row) =>
        String((row as { nombre?: string })?.nombre || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
      )
      .filter(Boolean)
  );

  const keys = new Set([...Object.keys(currentObj), ...Object.keys(incomingObj)]);
  const out: Record<string, unknown> = {};
  for (const reqKey of keys) {
    const inIncoming = Object.prototype.hasOwnProperty.call(incomingObj, reqKey);
    if (!inIncoming && docKeys.size > 0 && !docKeys.has(reqKey)) continue;

    const stages = incomingObj[reqKey];
    const prev =
      currentObj[reqKey] && typeof currentObj[reqKey] === "object"
        ? { ...(currentObj[reqKey] as Record<string, unknown>) }
        : {};
    if (stages && typeof stages === "object") {
      for (const key of LMS_STAGE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(stages, key)) {
          prev[key] = (stages as Record<string, unknown>)[key];
        }
      }
    }
    out[reqKey] = prev;
  }
  return out;
}
