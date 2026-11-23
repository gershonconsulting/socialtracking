import { test } from "node:test";
import assert from "node:assert/strict";
import * as u from "../src/lib/related-people/url.ts";
const { cleanProfileUrl, cleanXUrl } = ((u as any).cleanProfileUrl ? u : (u as any).default) as typeof import("../src/lib/related-people/url.ts");

test("LinkedIn profile links are normalised", () => {
  assert.equal(cleanProfileUrl("https://ca.linkedin.com/in/anne-bougel-123/?trk=x"), "https://www.linkedin.com/in/anne-bougel-123/");
  assert.equal(cleanProfileUrl("linkedin.com/in/arouleau"), "https://www.linkedin.com/in/arouleau/");
  assert.equal(cleanProfileUrl("https://www.linkedin.com/company/altavia/"), null);
  assert.equal(cleanProfileUrl(""), null);
});

test("X handles and links are normalised", () => {
  assert.equal(cleanXUrl("@altaviagroup"), "https://x.com/altaviagroup");
  assert.equal(cleanXUrl("https://twitter.com/altaviagroup/status/1"), "https://x.com/altaviagroup");
  assert.equal(cleanXUrl(""), null);
  assert.equal(cleanXUrl("not a handle!"), null);
});
