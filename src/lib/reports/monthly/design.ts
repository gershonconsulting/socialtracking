/**
 * Monthly reports in the client.gershoncrm.com design (lib/reports/gershon-design.ts).
 * The data rules stay in model.ts (one page, positives only for the company
 * report, campaigns measured against their posting objective); this file only
 * maps those models onto the shared design.
 */
import { designHtml, designPdf, GOOD, INK, RED, bandColor, type DReport, type DTile } from "../gershon-design";
import type { CategoryModel, CompanyModel, MonthWindow, Tile } from "./model";
import { clipText } from "./model";
import { PRODUCT_NAME } from "@/lib/product";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pad = (n: number) => String(n).padStart(2, "0");
const tileColor = (t: Tile) => (t.color === "good" ? GOOD : t.color === "red" ? RED : INK);
const toTile = (t: Tile): DTile => ({ label: t.label, value: t.value, sub: t.sub, color: tileColor(t) });
const period = (win: MonthWindow) => `${win.name} ${win.y}`;
const daily = (win: MonthWindow, perDay: number[]) =>
  perDay.map((posts, i) => ({ date: `${win.y}-${pad(win.m + 1)}-${pad(i + 1)}`, posts }));

export function categoryReport(win: MonthWindow, m: CategoryModel, build: string): DReport {
  const sections: DReport["sections"] = [];
  if (m.objective) {
    sections.push({
      title: "Posting objective by company",
      bars: m.rows.filter((r) => r.target).map((r) => ({
        label: r.name,
        value: `${r.posts} / ${r.target} · ${r.pct ?? 0}%`,
        pct: r.pct ?? 0,
        color: bandColor(r.pct),
      })),
    });
  }
  sections.push({
    title: m.objective ? "Detail by company" : "Companies",
    table: {
      head: ["#", "Company", "Posts", "Days", "Engagement", m.objective ? "Objective" : "Per post"],
      rows: m.rows.map((r, i) => [
        String(i + 1), r.name, fmt(r.posts), fmt(r.days), fmt(r.eng),
        m.objective ? (r.target ? `${r.pct ?? 0}% of ${r.target}` : "—") : fmt(r.perPost),
      ]),
      align: ["l", "l", "r", "r", "r", "r"],
    },
  });
  if (m.highlights.length) sections.push({ title: "Highlights", lines: m.highlights.map(([k, who, what]) => `${titleCase(k)}: ${who} — ${what}`) });
  if (m.top.length) sections.push({ title: "Best posts", lines: m.top.slice(0, 4).map((p) => `${p.company} · ${p.net} · ${p.date} — ${fmt(p.eng)} engagements: "${clipText(p.text, 90)}"`) });
  if (m.delivered?.length) sections.push({ title: "Company reports sent", lines: [m.delivered.join(", ")] });
  return {
    eyebrow: `GC · ${PRODUCT_NAME} · Monthly report`,
    title: m.title,
    period: period(win),
    headline: m.head,
    subline: m.lead,
    tiles: m.tiles.map(toTile),
    daily: daily(win, m.perDay),
    dailyCaption: "Posts published per day",
    sections,
    footer: `${PRODUCT_NAME} by Gershon.AI · ${build}`,
    attachmentNote: "PDF attached.",
  };
}

export function companyReport(win: MonthWindow, m: CompanyModel, build: string): DReport {
  const sections: DReport["sections"] = [];
  if (m.momentum.length) sections.push({ title: "Highlights", lines: m.momentum.map(([a, b]) => `${a} — ${b}`) });
  if (m.top.length) sections.push({ title: "Your best posts", lines: m.top.map((p) => `${p.net} · ${p.date} — ${fmt(p.eng)} engagements: "${clipText(p.text, 100)}"`) });
  if (m.themes.length) sections.push({ title: "What you talked about", lines: [m.themes.map(([t, n]) => `${t} (${n})`).join(" · ")] });
  if (m.ideas.length) sections.push({ title: `Next month`, lines: m.ideas.map(([a, b]) => `${a} — ${b}`) });
  return {
    eyebrow: "Gershon Consulting · Monthly report",
    title: m.name,
    period: period(win),
    headline: m.head,
    subline: m.lead,
    tiles: m.tiles.map(toTile),
    daily: m.perDay.some((v) => v > 0) ? daily(win, m.perDay) : undefined,
    dailyCaption: "Posts published per day",
    sections,
    footer: "Gershon Consulting · US market entry · gershonconsulting.com",
    attachmentNote: "The full one-page report is attached as a PDF.",
  };
}

export function renderDesign(r: DReport, subject: string) {
  return { html: designHtml(r, subject), pdf: designPdf(r) };
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
