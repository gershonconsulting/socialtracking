"use client";

/**
 * /extension — Social Tracking's own Chrome extension, "Social Tracking by
 * Gershon.AI — Post Verifier" (v0.4.0):
 *   - is it installed in THIS browser, and up to date (TRACKING_PING/PONG);
 *   - BOTH install routes side by side (Gershon convention): download the zip
 *     from this domain, or "Load unpacked" from the folder on Olivier's computer;
 *   - which Chromes are listening, the last verification run, and a button that
 *     queues a verification of every campaign and internal company.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, FolderOpen, Loader2, Puzzle, XCircle, AlertTriangle } from "lucide-react";
import {
  BRIDGE, EXTENSION_FOLDER_NAME, EXTENSION_FOLDER_PATH, EXTENSION_NAME, EXTENSION_ZIP_NAME, EXTENSION_ZIP_URL, versionLt,
} from "@/lib/extension-version";
import { BackgroundCollectorCard } from "@/components/extension/background-collector";

type Detect = { state: "checking" } | { state: "missing" } | { state: "found"; version: string };

export function ExtensionPageClient({ latest }: { latest: string }) {
  const [detect, setDetect] = useState<Detect>({ state: "checking" });
  const [copied, setCopied] = useState(false);

  const check = useCallback(() => {
    setDetect({ state: "checking" });
    const pingId = `ping-${Date.now()}`;
    let found = false;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as { type?: string; version?: string; requestId?: string };
      if (!d || typeof d !== "object") return;
      if (d.type === BRIDGE.HELLO || (d.type === BRIDGE.PONG && d.requestId === pingId)) {
        found = true;
        setDetect({ state: "found", version: String(d.version || "?") });
        window.removeEventListener("message", onMsg);
      }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: BRIDGE.PING, requestId: pingId }, location.origin);
    setTimeout(() => {
      if (!found) {
        window.removeEventListener("message", onMsg);
        setDetect({ state: "missing" });
      }
    }, 1500);
  }, []);
  useEffect(() => { check(); }, [check]);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(EXTENSION_FOLDER_PATH);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the path is on screen */ }
  };

  const old = detect.state === "found" && versionLt(detect.version, latest);

  return (
    <div className="space-y-4 max-w-[1100px]">
      <div>
        <div className="text-[13px] font-medium text-red-700 mb-1">Social Tracking · Chrome extension</div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-gray-900 flex items-center gap-2"><Puzzle size={22} /> {EXTENSION_NAME}</h1>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">
          Visits the LinkedIn and X pages of our campaign and internal companies in this Chrome — in its own minimized window — and
          sends the posts it sees to Social Tracking as independent evidence that the agreed work was done. It never publishes.
          Separate from the Social and Publish extensions; they can all be installed side by side.
        </p>
      </div>

      {/* This browser */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">In this browser</h2>
        <div className="flex items-center gap-2 text-sm">
          {detect.state === "checking" && (<><Loader2 size={16} className="animate-spin text-gray-500" /> Checking…</>)}
          {detect.state === "missing" && (<><XCircle size={16} className="text-[#FE1B04]" /> Not installed in this browser. Latest version: v{latest}.</>)}
          {detect.state === "found" && !old && (<><CheckCircle2 size={16} className="text-green-600" /> Installed, v{detect.version} — up to date.</>)}
          {detect.state === "found" && old && (<><AlertTriangle size={16} className="text-[#FE1B04]" /> <span className="text-[#FE1B04] font-semibold">Installed v{detect.version} is out of date — latest v{latest}.</span></>)}
          <button onClick={check} className="ml-2 text-xs font-medium text-gray-500 hover:text-gray-900 underline">Check again</button>
        </div>
      </section>

      {/* Two install routes */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Route A</div>
          <h2 className="text-base font-semibold text-gray-900 mt-0.5 flex items-center gap-2"><Download size={16} /> Download from socialtracking.gershon.ai</h2>
          <ol className="mt-3 text-sm text-gray-700 space-y-1.5 list-decimal pl-5">
            <li>Download <span className="font-mono text-xs bg-gray-100 rounded px-1">{EXTENSION_ZIP_NAME}</span> and unzip it into a folder.</li>
            <li>Open <span className="font-mono text-xs bg-gray-100 rounded px-1">chrome://extensions</span>, turn on <b>Developer mode</b>.</li>
            <li>Press <b>Load unpacked</b> and pick the unzipped folder.</li>
            <li>Open socialtracking.gershon.ai once, signed in: the extension connects itself to the workspace.</li>
          </ol>
          <a href={EXTENSION_ZIP_URL} download={EXTENSION_ZIP_NAME}
            className="mt-4 self-start inline-flex items-center gap-2 rounded-lg bg-[#FE1B04] text-white text-sm font-semibold px-4 py-2">
            <Download size={16} /> Download v{latest}
          </a>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Route B</div>
          <h2 className="text-base font-semibold text-gray-900 mt-0.5 flex items-center gap-2"><FolderOpen size={16} /> Load unpacked from the project folder</h2>
          <p className="mt-2 text-xs text-gray-500">Folder <b>{EXTENSION_FOLDER_NAME}</b> on Olivier&apos;s computer:</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="flex-1 text-xs bg-gray-100 rounded-md px-2 py-1.5 break-all">{EXTENSION_FOLDER_PATH}</code>
            <button onClick={copyPath} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50">
              <Copy size={12} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-700">
            <span className="font-mono text-xs bg-gray-100 rounded px-1">chrome://extensions</span> → <b>Load unpacked</b> → pick this folder; <b>↻</b> to update.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            When newer files are put in that folder the extension also reloads itself within 20 minutes, once nothing is running.
          </p>
        </section>
      </div>

      <BackgroundCollectorCard latest={latest} />
    </div>
  );
}
