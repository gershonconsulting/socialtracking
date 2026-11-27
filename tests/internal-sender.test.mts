// v0.9.2 (nightly 2026-11-27): GC sender name on internal-only emails; client emails untouched.
// Ported from social tests/internal-sender.test.mts. Run: npx tsx tests/internal-sender.test.mts
import assert from "node:assert/strict";
import * as S from "../src/lib/email/sender.ts";
import * as B from "../src/lib/mail-bcc.ts";
const F = ((S as any).default ?? S) as typeof S;
const M = ((B as any).default ?? B) as typeof B;

const OLD = "Social GershonCRM <social@gershon.ai>";

// Internal recipients -> GC name, address kept.
assert.equal(F.internalSender(OLD, ["social@gershonconsulting.com"]), "GC Social <social@gershon.ai>");
assert.equal(F.internalSender(OLD, "report@gershonconsulting.com, sales@gershonconsulting.com"), "GC Social <social@gershon.ai>");
assert.equal(F.internalSender(F.resolveFrom(), ["Report <report@gershonconsulting.com>"]), "GC Social <social@gershon.ai>");

// Any outside recipient (To or Cc) -> sender unchanged.
assert.equal(F.internalSender(OLD, ["client@wallix.com"]), OLD);
assert.equal(F.internalSender(OLD, ["report@gershonconsulting.com", "anne@altavia.com"]), OLD);
assert.equal(F.internalSender(OLD, ["report@gershonconsulting.com"], ["ceo@valos.com"]), OLD);
assert.equal(F.internalSender(OLD, []), OLD);

// Client-facing brand and already-GC senders never renamed.
assert.equal(F.internalSender("Social · Gershon.AI <reports@gershon.ai>", ["report@gershonconsulting.com"]), "Social · Gershon.AI <reports@gershon.ai>");
assert.equal(F.internalSender("GC Social <reports@gershon.ai>", ["report@gershonconsulting.com"]), "GC Social <reports@gershon.ai>");

// Look-alike domains are not internal.
assert.equal(F.isInternalAddress("x@gershonconsulting.com.evil.io"), false);
assert.equal(F.isInternalAddress("x@notgershon.ai"), false);

// withAuditBcc applies it; the bcc audit copy does not make a client email internal.
const internal = M.withAuditBcc({ from: OLD, to: ["social@gershonconsulting.com"], subject: "s", html: "h" });
assert.equal(internal.from, "GC Social <social@gershon.ai>");
const client = M.withAuditBcc({ from: OLD, to: ["client@wallix.com"], bcc: ["report@gershonconsulting.com"], subject: "s", html: "h" });
assert.equal(client.from, OLD);
console.log("internal-sender: all assertions passed");
