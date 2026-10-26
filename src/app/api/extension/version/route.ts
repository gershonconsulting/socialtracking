export const runtime = 'edge';
import { NextResponse } from "next/server";
import { EXTENSION_LATEST, EXTENSION_ZIP_URL, EXTENSION_NAME, EXTENSION_FOLDER_PATH } from "@/lib/extension-version";

/**
 * GET /api/extension/version  (public, no token needed)
 *
 * The latest shipped version of Social Tracking's own extension, "Social
 * Tracking by Gershon.AI — Post Verifier". Its popup compares this with its
 * installed version and shows an "Update available" banner when older.
 * EXTENSION_LATEST (src/lib/extension-version.ts) is the single source of truth.
 */
const RELEASE_NOTES: Record<string, string> = {
  "0.1.0":
    "First release. Visits the LinkedIn and X pages of our campaign and internal companies in this Chrome, in its own minimized window, and sends the posts it sees to Social Tracking as independent evidence that the agreed work was done. Collects once a day, catches up after a missed day, and runs any verification asked for on socialtracking.gershon.ai/extension within a minute. Never publishes.",
};

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: EXTENSION_NAME,
      latest: EXTENSION_LATEST,
      downloadUrl: EXTENSION_ZIP_URL,
      releaseNotes: RELEASE_NOTES[EXTENSION_LATEST] ?? "",
      updateInstructions:
        `Put the new files in ${EXTENSION_FOLDER_PATH} (the extension reloads itself within 20 minutes), or open chrome://extensions and press ↻ on the Social Tracking card.`,
    },
  });
}
