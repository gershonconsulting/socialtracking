/** Link normalisers for related people (no imports, so tests can load them). */

/** Normalise a LinkedIn personal profile URL; null when it is not one. */
export function cleanProfileUrl(raw: unknown): string | null {
  const m = String(raw ?? "").trim().match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1]}/` : null;
}

/** Normalise an X / Twitter profile URL or @handle; null when it is not one. */
export function cleanXUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,20})/i) || s.match(/^@?([A-Za-z0-9_]{1,20})$/);
  return m ? `https://x.com/${m[1]}` : null;
}
