export const MARIA_EMAIL = "mpluas@awenandwis.com";
export const LMS_EMAIL = "aordosgoitia@atcotrans.com";

export const LMS_STAGE_KEYS = ["levantamiento", "prototipado", "documento"] as const;

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
  incoming: Record<string, unknown>
) {
  const out: Record<string, unknown> = { ...current };
  for (const [reqKey, stages] of Object.entries(incoming || {})) {
    if (!stages || typeof stages !== "object") continue;
    const prev =
      out[reqKey] && typeof out[reqKey] === "object"
        ? { ...(out[reqKey] as Record<string, unknown>) }
        : {};
    for (const key of LMS_STAGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(stages, key)) {
        prev[key] = (stages as Record<string, unknown>)[key];
      }
    }
    out[reqKey] = prev;
  }
  return out;
}
