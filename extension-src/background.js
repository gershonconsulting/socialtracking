// Social Tracking — Post Verifier background service worker (0.1.0).
// From Social's collector background (0.10.0), pointed at Social Tracking.
//
//   1. Daily verification — chrome.alarms fires about once a day and runs
//      runFullSync() (sync-core.js), which reads the LinkedIn / X pages of the
//      campaign and internal companies and sends the posts to Social Tracking.
//   2. Popup "Verify now" and the page bridge's TRACKING_VERIFY_CLIENT.
//
// When Chrome is closed all day, the alarm fires when Chrome next opens, and
// gx-collect.js catches up at startup if the last good run is > 26 h old.

importScripts("sync-core.js");

const ORIGIN = "https://socialtracking.gershon.ai";
const ALARM_NAME = "tracking-daily-verify";
// ~24 h, drifting 10 min a day so a Chrome only open in the afternoon is still covered.
const DAILY_PERIOD_MIN = 1430;
const FIRST_FIRE_DELAY_MIN = 15;

chrome.runtime.onInstalled.addListener(async function () {
  try { chrome.action.setBadgeBackgroundColor({ color: "#D92D20" }); } catch (e) {}
  try {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: FIRST_FIRE_DELAY_MIN, periodInMinutes: DAILY_PERIOD_MIN });
  } catch (e) {}
});

chrome.runtime.onStartup.addListener(async function () {
  try {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) await chrome.alarms.create(ALARM_NAME, { delayInMinutes: FIRST_FIRE_DELAY_MIN, periodInMinutes: DAILY_PERIOD_MIN });
  } catch (e) {}
});

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name !== ALARM_NAME) return;
  try { chrome.action.setBadgeText({ text: "…" }); } catch (e) {}
  let result = null;
  try {
    result = await self.runFullSync({ origin: ORIGIN, onProgress: function () {}, trigger: "daily" });
  } catch (e) {
    result = { ok: false, totalUpserted: 0, totalFailed: 1, accountCount: 0, badPlatforms: [], ingestErrors: ["background: " + ((e && e.message) || String(e))] };
  }
  if (result && result.paused) { try { chrome.action.setBadgeText({ text: "OFF" }); } catch (e) {} return; }
  try { chrome.action.setBadgeText({ text: result && result.ok && result.accountCount > 0 ? "✓" : "!" }); } catch (e) {}
  setTimeout(function () { try { chrome.action.setBadgeText({ text: "" }); } catch (e) {} }, 60 * 60 * 1000);
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === "tracking-manual-verify") {
    self.runFullSync({
      origin: ORIGIN,
      trigger: "popup",
      onProgress: function (text, kind) {
        try { chrome.runtime.sendMessage({ type: "tracking-progress", text: text, kind: kind }); } catch (e) {}
      }
    }).then(function (result) {
      sendResponse({ ok: true, result: result });
    }).catch(function (e) {
      sendResponse({ ok: false, error: (e && e.message) || String(e) });
    });
    return true;
  }
  // 0.2.0: content.js asks for the OFF badge when the page switches this computer off.
  if (msg && msg.type === "tracking-badge") {
    try { chrome.action.setBadgeText({ text: String(msg.text || "") }); } catch (e) {}
    return false;
  }
  if (msg && msg.type === "tracking-verify-client" && msg.clientId) {
    self.runFullSync({ origin: ORIGIN, clientIdFilter: msg.clientId, trigger: "page", onProgress: function () {} })
      .then(function (result) { sendResponse({ ok: true, result: result }); })
      .catch(function (e) { sendResponse({ ok: false, error: (e && e.message) || String(e) }); });
    return true;
  }
});
