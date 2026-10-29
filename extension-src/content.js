// Content script — runs on https://socialtracking.gershon.ai/* only.
//
// Bridges window.postMessage from the page <-> the service worker. Every
// message is namespaced TRACKING_* so this extension never answers Social's
// GERSHONAI_* messages (or Publish's), and their extensions never answer ours.
//
//   page → TRACKING_PING {requestId}            ← TRACKING_PONG {version, requestId, agentId, paused}
//   on load                                     → TRACKING_HELLO {version, agentId, paused}
//   page → TRACKING_SET_PAUSED {paused}         (0.2.0 — this computer ON/OFF, applied at once;
//                                                the server keeps the same switch, so it sticks)
//   page → TRACKING_VERIFY_CLIENT {clientId, requestId}
//                                               ← TRACKING_VERIFY_RESULT {requestId, ok, error?, result?}

(function () {
  var version = chrome.runtime.getManifest().version;
  // 0.2.0: say which install this is (trk_agentId, created by gx-remote.js) and
  // whether it is switched OFF, so the /extension page can show "This computer".
  function state(cb) {
    try {
      chrome.storage.local.get(["trk_agentId", "trk_paused"], function (r) {
        cb({ agentId: (r && r.trk_agentId) || null, paused: !!(r && r.trk_paused) });
      });
    } catch (e) { cb({ agentId: null, paused: false }); }
  }
  state(function (st) {
    window.postMessage({ type: "TRACKING_HELLO", version: version, agentId: st.agentId, paused: st.paused }, location.origin);
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "TRACKING_PING") {
      state(function (st) {
        window.postMessage({ type: "TRACKING_PONG", version: version, requestId: data.requestId, agentId: st.agentId, paused: st.paused }, location.origin);
      });
      return;
    }

    if (data.type === "TRACKING_SET_PAUSED") {
      try {
        chrome.storage.local.set({ trk_paused: !!data.paused }, function () {
          try { chrome.runtime.sendMessage({ type: "tracking-badge", text: data.paused ? "OFF" : "" }); } catch (e) {}
        });
      } catch (e) {}
      return;
    }

    if (data.type === "TRACKING_VERIFY_CLIENT" && data.clientId) {
      var requestId = data.requestId;
      chrome.runtime.sendMessage({ type: "tracking-verify-client", clientId: data.clientId }, function (response) {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: "TRACKING_VERIFY_RESULT", requestId: requestId, ok: false, error: chrome.runtime.lastError.message || "Extension messaging error" }, location.origin);
          return;
        }
        window.postMessage({
          type: "TRACKING_VERIFY_RESULT",
          requestId: requestId,
          ok: !!(response && response.ok),
          error: response && response.error,
          result: response && response.result,
        }, location.origin);
      });
    }
  });
})();
