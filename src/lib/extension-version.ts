/**
 * Social Tracking's OWN Chrome extension — "Social Tracking by Gershon.AI —
 * Post Verifier" (v0.4.0, 2026-10-26). Single source of truth for its version.
 *
 * Olivier, 2026-10-26: each of the three platforms (Publish, Social, Social
 * Tracking) has its own Dashboard, its own Summary and its own Chrome
 * extension. This one visits the LinkedIn and X pages of our CAMPAIGN and
 * INTERNAL companies in his Chrome and sends what is actually published to
 * Social Tracking, as independent evidence that the agreed work was done. It
 * never publishes anything.
 *
 * Bump EXTENSION_LATEST together with extension-src/manifest.json:
 * scripts/build-extension.mjs refuses to build when they differ, because every
 * download link on the site is built from this constant. Consumed by:
 *   - GET /api/extension/version (the popup's update check)
 *   - the red out-of-date banner on every dashboard page
 *   - the /extension page
 */
export const EXTENSION_LATEST = "0.1.0";

export const EXTENSION_NAME = "Social Tracking by Gershon.AI \u2014 Post Verifier";

/** The download carries its version in the file name, like every Gershon extension. */
export const EXTENSION_ZIP_NAME = `socialtracking-extension-v${EXTENSION_LATEST}.zip`;
export const EXTENSION_ZIP_URL = `/${EXTENSION_ZIP_NAME}`;

/** Where the unpacked copy lives on Olivier's computer ("Load unpacked" install route). */
export const EXTENSION_FOLDER_NAME = "socialtracking-chrome-extension";
export const EXTENSION_FOLDER_PATH =
  "C:\\Users\\oatti\\Documents\\Claude\\Projects\\Social Gershon Consulting\\socialtracking-chrome-extension";

/**
 * Page <-> extension bridge messages. Namespaced for THIS product so the
 * Tracking extension never answers Social's GERSHONAI_* or Publish's messages,
 * and Social's extension never answers ours.
 */
export const BRIDGE = {
  PING: "TRACKING_PING",
  PONG: "TRACKING_PONG",
  HELLO: "TRACKING_HELLO",
  BOUND: "TRACKING_BOUND",
} as const;

/** App version — Social Tracking's own (lib/product.ts, kept in sync with package.json). */
export { PRODUCT_VERSION as APP_VERSION } from "@/lib/product";

/** Numeric dot-segment compare (same rule as the popup). */
export function versionLt(a: string, b: string): boolean {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}
