"use client";

/**
 * "This computer" — ON / OFF (v0.6.0, Olivier 2026-10-29: "we need the option
 * to OFF the Chrome extension on some computer").
 *
 * Two cases, one switch:
 *   - the Post Verifier IS installed in this browser → the switch turns that
 *     install ON or OFF: saved on the server (/api/collect/agent, so it sticks
 *     and can be changed from any browser) and passed to the extension at once
 *     (TRACKING_SET_PAUSED). OFF = no automatic verification on this computer.
 *   - it is NOT installed → the switch makes this computer a viewer: no
 *     "install the extension" notice here any more (stored per browser, never
 *     on the account, so the computer that verifies is never silenced).
 * Every Chrome that checked in also has its own switch in the list below.
 */
import { useState } from "react";
import { Laptop, Loader2, Power } from "lucide-react";
import { useTrackingExtension } from "@/lib/use-tracking-extension";
import { useCollectingMode } from "@/lib/collecting-mode";

export async function setAgentOn(agentId: string, on: boolean): Promise<void> {
  const r = await fetch("/api/collect/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, on }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) throw new Error(j?.error || `HTTP ${r.status}`);
}

export function OnOffSwitch({ on, busy, onChange, label }: { on: boolean; busy?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={"inline-flex items-center gap-2 rounded-full pl-1 pr-3 h-8 text-xs font-bold transition-colors disabled:opacity-60 " +
        (on ? "bg-[#CC3333] text-white" : "bg-gray-200 text-gray-700")}
    >
      <span className={"h-6 w-6 rounded-full bg-white shadow flex items-center justify-center transition-transform " + (on ? "" : "")}>
        {busy ? <Loader2 size={13} className="animate-spin text-gray-500" /> : <Power size={13} className={on ? "text-[#CC3333]" : "text-gray-400"} />}
      </span>
      {on ? "ON" : "OFF"}
    </button>
  );
}

export function ThisComputerCard({ onChanged }: { onChanged?: () => void }) {
  const [ext, recheck, setLocalPaused] = useTrackingExtension();
  const [collecting, setCollecting] = useCollectingMode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installed = ext.state === "found";
  const canSwitchInstall = installed && !!ext.agentId;
  const on = installed ? !ext.paused && collecting : collecting;

  const change = async (next: boolean) => {
    setError(null);
    setBusy(true);
    try {
      if (canSwitchInstall) {
        await setAgentOn(ext.agentId!, next);
        setLocalPaused(!next);
      }
      setCollecting(next);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="this-computer" className="bg-white rounded-xl border border-gray-200 p-5 scroll-mt-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className={"h-11 w-11 rounded-xl flex items-center justify-center shrink-0 " + (on ? "bg-[#fdf2f2] text-[#CC3333]" : "bg-gray-100 text-gray-500")}>
          <Laptop size={22} />
        </span>
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-[15px] font-semibold text-gray-900">This computer</h2>
          {ext.state === "checking" && <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking this browser…</p>}
          {ext.state !== "checking" && (
            <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
              {installed
                ? on
                  ? <>The Post Verifier (v{ext.version}) <b>verifies from this computer</b>: daily runs, catch-up runs and the requests from the dashboard.</>
                  : <>The Post Verifier (v{ext.version}) is <b>OFF on this computer</b>: no automatic verification here, no update alarm. “Verify now” in the extension still works by hand.</>
                : on
                  ? <>No Post Verifier in this browser. If this computer is not meant to verify (a laptop, a viewer, the client), switch it <b>OFF</b>: the install notice disappears here.</>
                  : <>This computer is a <b>viewer</b>: no extension needed here, no install notice. Verification runs on the other Chromes listed below.</>}
            </p>
          )}
          {installed && !ext.agentId && (
            <p className="text-xs text-amber-700 mt-1">This browser runs v{ext.version}, which cannot be switched from here yet — update it to v0.2.0, or use the switch next to it in the list below.</p>
          )}
          {error && <p className="text-xs text-[#CC3333] mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          {ext.state !== "checking" && <OnOffSwitch on={on} busy={busy} onChange={change} label="Post Verifier on this computer" />}
          <button onClick={recheck} className="text-xs font-medium text-gray-500 hover:text-gray-900 underline">Check again</button>
        </div>
      </div>
    </section>
  );
}
