"use client";

/**
 * Is the Post Verifier installed in THIS browser? (v0.6.0 — one hook for the
 * banner and the /extension page.) TRACKING_HELLO on load, TRACKING_PONG to a
 * TRACKING_PING. Extension 0.2.0+ also says which install it is (agentId) and
 * whether this computer is switched OFF (paused); 0.1.0 sends neither.
 */
import { useCallback, useEffect, useState } from "react";
import { BRIDGE } from "@/lib/extension-version";

export type TrackingExt =
  | { state: "checking" }
  | { state: "missing" }
  | { state: "found"; version: string; agentId: string | null; paused: boolean };

export function useTrackingExtension(timeoutMs = 1800): [TrackingExt, () => void, (paused: boolean) => void] {
  const [ext, setExt] = useState<TrackingExt>({ state: "checking" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const pingId = `ext-${Date.now()}-${nonce}`;
    let found = false;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as { type?: string; version?: string; requestId?: string; agentId?: string | null; paused?: boolean };
      if (!d || typeof d !== "object") return;
      if (d.type === BRIDGE.HELLO || (d.type === BRIDGE.PONG && d.requestId === pingId)) {
        found = true;
        setExt({ state: "found", version: String(d.version || "0"), agentId: d.agentId ? String(d.agentId) : null, paused: !!d.paused });
      }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: BRIDGE.PING, requestId: pingId }, location.origin);
    const t = setTimeout(() => { if (!found) setExt({ state: "missing" }); }, timeoutMs);
    return () => { clearTimeout(t); window.removeEventListener("message", onMsg); };
  }, [nonce, timeoutMs]);

  const recheck = useCallback(() => { setExt({ state: "checking" }); setNonce((n) => n + 1); }, []);

  /** Tell the extension in this browser to switch ON/OFF at once (the server keeps the same switch). */
  const setLocalPaused = useCallback((paused: boolean) => {
    window.postMessage({ type: BRIDGE.SET_PAUSED, paused }, location.origin);
    setExt((x) => (x.state === "found" ? { ...x, paused } : x));
  }, []);

  return [ext, recheck, setLocalPaused];
}
