// Content script — runs on https://socialtracking.gershon.ai/* only.
//
// Bridges window.postMessage from the page <-> the service worker. Every
// message is namespaced TRACKING_* so this extension never answers Social's
// GERSHONAI_* messages (or Publish's), and their extensions never answer ours.
//
//   page → TRACKING_PING {requestId}            ← TRACKING_PONG {version, requestId}
//   on load                                     → TRACKING_HELLO {version}
//   page → TRACKING_VERIFY_CLIENT {clientId, requestId}
//                                               ← TRACKING_VERIFY_RESULT {requestId, ok, error?, result?}

(function () {
  var version = chrome.runtime.getManifest().version;
  window.postMessage({ type: "TRACKING_HELLO", version: version }, location.origin);

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "TRACKING_PING") {
      window.postMessage({ type: "TRACKING_PONG", version: version, requestId: data.requestId }, location.origin);
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
