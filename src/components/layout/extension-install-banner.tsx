"use client";

/**
 * Red strip on EVERY Social Tracking page (shared dashboard layout) when the
 * Post Verifier extension is not installed in this browser, or is older than
 * EXTENSION_LATEST — with the download right in it (Gershon versioning
 * convention, 2026-10-13).
 *
 * Detection is Tracking's own content-script bridge: TRACKING_HELLO on load,
 * TRACKING_PONG {version} to a TRACKING_PING. Social's GERSHONAI_* messages
 * are ignored on purpose — Social's extension is a different product.
 */
import Link from "next/link";
import { AlertOctagon, Download, Info } from "lucide-react";
import { EXTENSION_ZIP_URL, EXTENSION_ZIP_NAME, versionLt } from "@/lib/extension-version";
import { useTrackingExtension } from "@/lib/use-tracking-extension";
import { useCollectingMode } from "@/lib/collecting-mode";

export { versionLt };

/**
 * v0.6.0 — "This computer" ON/OFF (/extension):
 *   - a computer switched to VIEWER (no extension wanted here) gets no notice;
 *   - an installed extension switched OFF on this computer gets no update alarm
 *     either: it is not verifying here, so its version does not matter today.
 */
export function ExtensionInstallBanner({ latest }: { latest: string }) {
  const [ext] = useTrackingExtension(2000);
  const [collecting] = useCollectingMode();
  const state =
    ext.state === "checking" ? { kind: "checking" as const }
    : ext.state === "missing" ? { kind: "missing" as const }
    : { kind: "found" as const, version: ext.version, paused: ext.paused };

  if (state.kind === "checking") return null;
  if (!collecting) return null;
  if (state.kind === "found" && (state.paused || !versionLt(state.version, latest))) return null;

  if (state.kind === "missing") {
    // Not installed in THIS browser: a notice, not an alarm — another Chrome
    // (Olivier's dedicated computer) may be the one verifying.
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
        <Info size={18} className="shrink-0" />
        <div className="flex-1 text-sm">
          <strong>The Social Tracking extension (Post Verifier) is not installed in this browser.</strong>{" "}
          It is what checks the LinkedIn and X pages of our companies for the monthly evidence.{" "}
          <Link href="/extension" className="underline font-semibold">See which Chromes are verifying</Link>
          {" · "}
          <Link href="/extension#this-computer" className="underline font-semibold">This computer doesn&apos;t verify? Switch it OFF</Link>
        </div>
        <a href={EXTENSION_ZIP_URL} download={EXTENSION_ZIP_NAME}
          className="shrink-0 inline-flex items-center gap-2 bg-white border border-amber-300 text-amber-900 text-sm font-semibold rounded-lg px-3 py-1.5">
          <Download size={15} /> Download v{latest}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-[#CC3333] text-white rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
      <AlertOctagon size={18} className="shrink-0" />
      <div className="flex-1 text-sm">
        <strong>Your Social Tracking extension is out of date (v{state.version}, latest v{latest}).</strong>{" "}
        Update it so the post verification keeps working.{" "}
        <Link href="/extension" className="underline font-semibold">How to update</Link>
      </div>
      <a href={EXTENSION_ZIP_URL} download={EXTENSION_ZIP_NAME}
        className="shrink-0 inline-flex items-center gap-2 bg-white text-[#CC3333] text-sm font-semibold rounded-lg px-3 py-1.5">
        <Download size={15} /> Download v{latest}
      </a>
    </div>
  );
}
