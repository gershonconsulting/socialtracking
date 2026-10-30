"use client";

/**
 * Add company (v0.6.1). The button used to open /admin?tab=clients&action=new —
 * a Social page that does not exist in Social Tracking (it was split out on
 * 2026-10-26), so it went nowhere. The form now lives here and posts to this
 * app's own POST /api/clients. Campaign or Internal only.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";

export function AddCompanyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
        <Plus size={15} /> Add company
      </button>
      {open && <AddCompanyDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function AddCompanyDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"CAMPAIGN" | "INTERNAL">("CAMPAIGN");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [x, setX] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Company name is required."); return; }
    setBusy(true); setError(null);
    try {
      const platformConnections = [
        ...(linkedin.trim() ? [{ platform: "LINKEDIN", externalAccountUrl: linkedin.trim() }] : []),
        ...(x.trim() ? [{ platform: "TWITTER", externalAccountUrl: x.trim() }] : []),
      ];
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), slug: "", clientType: type, status: "ACTIVE",
          website: website.trim() || null,
          campaignStartDate: start ? new Date(`${start}T12:00:00Z`).toISOString() : null,
          platformConnections,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || `HTTP ${r.status}`);
      router.push(`/clients/${j.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the company");
      setBusy(false);
    }
  };

  const field = "w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400";
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-[480px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add company</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Company name *</span>
          <input autoFocus className={field + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
        </label>
        <div className="text-sm">
          <span className="font-medium text-gray-700">Category</span>
          <div className="mt-1 inline-flex rounded-lg border border-gray-200 p-0.5">
            {(["CAMPAIGN", "INTERNAL"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setType(k)}
                className={"px-3 h-8 rounded-md text-sm font-medium " + (type === k ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-50")}>
                {k === "CAMPAIGN" ? "Campaign" : "Internal"}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">LinkedIn page</span>
          <input className={field + " mt-1"} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/company/acme" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">X account</span>
          <input className={field + " mt-1"} value={x} onChange={(e) => setX(e.target.value)} placeholder="x.com/acme" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Website</span>
            <input className={field + " mt-1"} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="acme.com" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Campaign start</span>
            <input type="date" className={field + " mt-1"} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </form>
    </div>
  );
}
