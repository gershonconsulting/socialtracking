// Social Tracking by Gershon.AI — Post Verifier (0.1.0). Service-worker entry point.
//
// Built from Social's collector (extension 0.25.1) WITHOUT any publishing code:
// no gx-publish.js, no gx-personal.js, no sign-out watchdog. It only reads the
// LinkedIn and X pages of Gershon's CAMPAIGN and INTERNAL companies and sends
// what it sees to socialtracking.gershon.ai as independent evidence.
//
// Order matters: gx-token.js wraps fetch first; background.js loads sync-core.js
// (the page readers, unchanged from Social so post ids/fingerprints match and
// nothing is ever counted twice); gx-linkedin.js replaces the LinkedIn reader for
// LinkedIn's new layout; gx-collect.js wraps runFullSync (own minimized window,
// one run at a time); gx-remote.js takes verifications queued on the dashboard;
// gx-update.js reloads the extension when its folder holds a newer version.
importScripts("gx-token.js", "background.js", "gx-linkedin.js", "gx-collect.js", "gx-remote.js", "gx-update.js");
