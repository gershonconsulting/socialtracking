// Workspace binding — automatic (Post Verifier 0.1.0, from Social's 0.12.0 bridge).
//
// Runs on socialtracking.gershon.ai pages. Asks Social Tracking, with the
// page's own sign-in, which workspace the signed-in person belongs to
// (/api/extension/bind — internal Gershon team only), and stores that
// workspace's token. From then on what this browser verifies goes to THAT
// workspace and no other. An install that never saw a signed-in Social
// Tracking tab is bound to nothing and verifies nothing. No paste, no step.
//
// Storage keys are namespaced "trk_" (this extension's own storage).

(function () {
  function bind() {
    fetch("/api/extension/bind", { credentials: "include", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.success || !j.data || !j.data.token) return;
        var d = j.data;
        chrome.storage.local.get(["trk_workspaceToken", "trk_workspaceId"], function (cur) {
          var changed = cur.trk_workspaceToken !== d.token || cur.trk_workspaceId !== d.workspaceId;
          chrome.storage.local.set({
            trk_workspaceToken: d.token,
            trk_workspaceId: d.workspaceId,
            trk_workspaceName: d.workspaceName || "",
            trk_workspaceEmail: d.email || "",
            trk_workspaceBoundAt: new Date().toISOString(),
          }, function () {
            try {
              window.postMessage({ type: "TRACKING_BOUND", workspaceName: d.workspaceName, changed: changed }, location.origin);
            } catch (e) {}
          });
        });
      })
      .catch(function () {});
  }
  bind();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") bind();
  });
})();
