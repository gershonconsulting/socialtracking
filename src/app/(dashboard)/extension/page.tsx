// Thin server shell — the page talks to the extension in THIS browser, so it is client-side.
import { ExtensionPageClient } from "./page-client";
import { EXTENSION_LATEST } from "@/lib/extension-version";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function ExtensionPage() {
  return <ExtensionPageClient latest={EXTENSION_LATEST} />;
}
