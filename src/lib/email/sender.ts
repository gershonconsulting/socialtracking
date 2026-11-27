/**
 * Central sender / recipient resolution for every outbound email this app sends.
 *
 * WHY THIS EXISTS
 * ---------------
 * 1. Resend refuses `onboarding@resend.dev` as a sender for any recipient other
 *    than the account owner (403 validation_error). `gershon.ai` is the only
 *    VERIFIED sending domain on the account, so every email that leaves this app
 *    must come from it.
 * 2. `.github/workflows/deploy.yml` re-writes the Cloudflare Pages secrets
 *    DIGEST_TO / DIGEST_FROM on EVERY deploy, hard-coding the old
 *    `oattia@gmail.com` / `onboarding@resend.dev` values as its fallbacks. The
 *    deploy PAT has no `workflow` scope, so that file cannot be changed from a
 *    session. Therefore the code treats those two specific legacy values as
 *    "unset" — a real override still wins, but the stale ones can't drag the
 *    digest back to the old address.
 *
 * To retire the legacy handling later: set repo variables DIGEST_TO and
 * DIGEST_FROM on gershonconsulting/social (Settings → Secrets and variables →
 * Actions → Variables) to the values below; deploy.yml already prefers
 * `vars.*` over its hard-coded fallbacks.
 */

/** The app's outbound identity. Must stay on the verified gershon.ai domain. */
export const SOCIAL_FROM = "Social GershonCRM <social@gershon.ai>";

/** Who gets the daily "what was collected" digest. */
export const DIGEST_RECIPIENTS = [
  "report@gershonconsulting.com",
  "aina.rama@gershonconsulting.com",
];

/** Values that deploy.yml still injects; treated as if the env var were empty. */
const LEGACY_FROM = new Set(["onboarding@resend.dev", "digest@notifications.gershoncrm.com"]);
const LEGACY_TO = new Set(["oattia@gmail.com"]);

/** Pull the bare address out of `Name <a@b.c>` and normalize it. */
function bareAddress(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase();
}

/**
 * Resolve the From header. First non-empty, non-legacy candidate wins:
 * an explicit override (e.g. HEALTH_ALERT_FROM), then DIGEST_FROM, then
 * the verified default.
 */
export function resolveFrom(override?: string | null): string {
  for (const candidate of [override, process.env.DIGEST_FROM]) {
    const value = (candidate || "").trim();
    if (value && !LEGACY_FROM.has(bareAddress(value))) return value;
  }
  return SOCIAL_FROM;
}

/** Split a comma-separated recipient string into a clean list. */
export function parseRecipients(value?: string | null): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the digest recipients. A real DIGEST_TO override wins; the legacy
 * `oattia@gmail.com` value deploy.yml keeps re-injecting is ignored.
 */
export function resolveDigestTo(): string[] {
  const explicit = parseRecipients(process.env.DIGEST_TO).filter(
    (addr) => !LEGACY_TO.has(addr.toLowerCase()),
  );
  return explicit.length ? explicit : [...DIGEST_RECIPIENTS];
}

/**
 * v0.9.2 (nightly 2026-11-27) — GC prefix on INTERNAL emails only (ported from
 * social v4.80.1, src/lib/email/sender.ts internalSender).
 * Olivier's sender rule: a Gershon-internal report/alert shows a display name
 * starting with "GC ". An email gets the GC name ONLY when every To/Cc address
 * is a Gershon address (gershonconsulting.com / gershon.ai). As soon as one
 * recipient is outside Gershon (a client), the sender is left exactly as the
 * caller set it. Only the display name changes; the address is never touched.
 * Applied to every Resend payload through withAuditBcc() (lib/mail-bcc.ts).
 */
export const INTERNAL_DOMAINS = ["gershonconsulting.com", "gershon.ai"];
export const INTERNAL_SENDER_NAMES: Record<string, string> = {
  "social gershoncrm": "GC Social",
  "social.gershon.ai": "GC Social",
};

function addrList(v: unknown): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : String(v).split(","))
    .map((x) => bareAddress(String(x)))
    .filter(Boolean);
}

export function isInternalAddress(addr: string): boolean {
  const a = bareAddress(addr);
  const at = a.lastIndexOf("@");
  return at > 0 && INTERNAL_DOMAINS.includes(a.slice(at + 1));
}

/** All To + Cc recipients are Gershon addresses (Bcc is ignored: it is the audit copy). */
export function isInternalOnly(to: unknown, cc?: unknown): boolean {
  const all = [...addrList(to), ...addrList(cc)];
  return all.length > 0 && all.every(isInternalAddress);
}

/** "Social GershonCRM <x@gershon.ai>" -> "GC Social <x@gershon.ai>" when the email is internal-only. */
export function internalSender(from: string, to: unknown, cc?: unknown): string {
  if (typeof from !== "string" || !isInternalOnly(to, cc)) return from;
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return from;
  const gc = INTERNAL_SENDER_NAMES[m[1].trim().toLowerCase()];
  return gc ? `${gc} <${m[2].trim()}>` : from;
}
