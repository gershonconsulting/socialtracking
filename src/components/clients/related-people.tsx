"use client";

/**
 * Related people (v0.9.0) — the people whose own LinkedIn / X accounts are
 * tracked with this company (e.g. Altavia North America → Anne Bougel,
 * Alexandre Rouleau). Each person's posts are collected like a company page's.
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { formatRelative } from "@/lib/utils";

type Person = {
  id: string;
  name: string;
  role: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  lastCollectedAt: string | null;
  lastError: string | null;
  posts30d: number;
  lastPostAt: string | null;
  latest: Array<{ id: string; platform: string; url: string | null; text: string | null; publishedAt: string; engagement: number }>;
};

export function RelatedPeople({ clientId }: { clientId: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", linkedinUrl: "", xUrl: "" });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${clientId}/people`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Could not load");
      setPeople(j.data.people);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
      setPeople([]);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/clients/${clientId}/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Could not add");
      setForm({ name: "", role: "", linkedinUrl: "", xUrl: "" });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Person) {
    if (!window.confirm(`Stop tracking ${p.name}? Posts already collected are kept.`)) return;
    await fetch(`/api/clients/${clientId}/people?personId=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Related people</h2>
          <p className="text-sm text-gray-500">Their own LinkedIn / X posts are collected with the company page.</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FE1B04] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#d11200]"
          >
            <Plus size={16} /> Add person
          </button>
        )}
      </div>

      {adding && (
        <div className="border-t border-gray-100 px-5 py-4 grid gap-2 sm:grid-cols-2">
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Name (e.g. Anne Bougel)"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Role (e.g. CEO North America)"
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="LinkedIn profile — linkedin.com/in/…"
            value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="X account (optional)"
            value={form.xUrl} onChange={(e) => setForm({ ...form, xUrl: e.target.value })} />
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" onClick={add} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FE1B04] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#d11200] disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="px-5 pb-3 text-sm text-[#d11200]">{error}</p>}

      <div className="border-t border-gray-100">
        {people === null ? (
          <p className="px-5 py-4 text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : people.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No related people yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {people.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-full bg-[#fff5f5] p-2 text-[#FE1B04]"><UserRound size={16} /></span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {p.name}
                        {p.role && <span className="ml-2 text-sm font-normal text-gray-500">{p.role}</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-3 text-sm">
                        {p.linkedinUrl && (
                          <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#FE1B04] hover:underline">
                            LinkedIn <ExternalLink size={12} />
                          </a>
                        )}
                        {p.xUrl && (
                          <a href={p.xUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#FE1B04] hover:underline">
                            X <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <strong>{p.posts30d}</strong> post{p.posts30d === 1 ? "" : "s"} in 30 days
                        {" · "}last post {p.lastPostAt ? formatRelative(p.lastPostAt) : "—"}
                        {" · "}{p.lastCollectedAt ? `read ${formatRelative(p.lastCollectedAt)}` : "not read yet"}
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(p)} title="Stop tracking"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#d11200]">
                    <Trash2 size={16} />
                  </button>
                </div>
                {p.latest.length > 0 && (
                  <ul className="mt-3 ml-11 space-y-1.5">
                    {p.latest.map((post) => (
                      <li key={post.id} className="text-sm text-gray-700">
                        <span className="text-gray-400">{new Date(post.publishedAt).toLocaleDateString()} · </span>
                        {post.url ? (
                          <a href={post.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {(post.text || "(no text)").slice(0, 140)}
                          </a>
                        ) : (
                          (post.text || "(no text)").slice(0, 140)
                        )}
                        <span className="text-gray-400"> · {post.engagement} interactions</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
