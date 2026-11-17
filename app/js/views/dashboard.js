/* global Chart */
import { state, monthlyTotals, budgetsForYear, lastEntryDate, unreviewedCount, memberName } from "../api.js";
import { t, nameOf, monthName, monthShort, getLang } from "../i18n.js";
import { h, clear, money, num, isoDate, daysBetween, errorText, card, loading } from "../ui.js";

const TYPES = ["income", "expense", "savings"];
const view = { year: new Date().getFullYear(), period: new Date().getMonth() + 1 };   // period 0 = whole year
let charts = [];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }

export async function renderDashboard() {
  destroyCharts();
  const root = h("div", { class: "stack dashboard" });
  const body = h("div", { class: "stack" });

  const first = Math.min(state.household?.start_year || view.year, view.year);
  const years = []; for (let y = first; y <= new Date().getFullYear() + 1; y++) years.push(y);
  const yearSel = h("select", { "aria-label": t("year"), onchange: () => { view.year = Number(yearSel.value); load(); } },
    years.map((y) => h("option", { value: y }, y)));
  yearSel.value = view.year;
  const periodSel = h("select", { "aria-label": t("period"), onchange: () => { view.period = Number(periodSel.value); load(); } },
    h("option", { value: 0 }, t("totalYear")), Array.from({ length: 12 }, (_, i) => h("option", { value: i + 1 }, monthName(i))));
  periodSel.value = view.period;

  root.append(h("div", { class: "filters card" }, yearSel, periodSel), body);

  let data = null;
  async function load() {
    destroyCharts();
    clear(body).append(loading());
    try {
      const [totals, budgets, last, pending] = await Promise.all([
        monthlyTotals(view.year), budgetsForYear(view.year), lastEntryDate(), unreviewedCount()]);
      data = { totals, budgets, last, pending };
      draw();
    } catch (err) {
      clear(body).append(h("p", { class: "error" }, errorText(err)));
    }
  }

  // Redraw charts with the new colors when light/dark changes.
  const onTheme = () => { if (data && document.body.contains(root)) draw(); };
  window.addEventListener("themechange", onTheme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onTheme);

  function draw() {
    destroyCharts();
    const { totals, budgets, last, pending } = data;
    const inPeriod = (monthIso) => view.period === 0 || Number(monthIso.slice(5, 7)) === view.period;
    const monthIdx = (monthIso) => Number(monthIso.slice(5, 7)) - 1;

    // ---- aggregate ----------------------------------------------------
    const actualCat = {}, plannedCat = {}, byMember = {};
    const actualType = { income: 0, expense: 0, savings: 0 }, plannedType = { income: 0, expense: 0, savings: 0 };
    const monthly = TYPES.reduce((o, k) => ({ ...o, [k]: Array(12).fill(0) }), {});
    let entries = 0;
    for (const r of totals) {
      const v = Number(r.total);
      entries += Number(r.entries);
      monthly[r.type][monthIdx(r.month)] += v;
      if (!inPeriod(r.month)) continue;
      actualCat[r.category_id] = (actualCat[r.category_id] || 0) + v;
      actualType[r.type] += v;
      if (r.type === "expense") byMember[r.created_by] = (byMember[r.created_by] || 0) + v;
    }
    const catType = Object.fromEntries(state.categories.map((c) => [c.id, c.type]));
    for (const b of budgets) {
      if (!inPeriod(b.month)) continue;
      const v = Number(b.amount);
      plannedCat[b.category_id] = (plannedCat[b.category_id] || 0) + v;
      if (catType[b.category_id]) plannedType[catType[b.category_id]] += v;
    }
    const left = actualType.income - actualType.expense - actualType.savings;
    const plannedLeft = plannedType.income - plannedType.expense - plannedType.savings;
    const periodLabel = view.period === 0 ? `${t("totalYear")} ${view.year}` : `${monthName(view.period - 1)} ${view.year}`;

    clear(body);

    // ---- stat tiles -----------------------------------------------------
    const tile = (label, value, plannedV, key) => h("div", { class: "stat" },
      h("div", { class: "stat-label" }, key && h("span", { class: `dot ${key}`, "aria-hidden": "true" }), label),
      h("div", { class: "stat-value" }, money(value)),
      h("div", { class: "stat-sub" }, t("plannedLabel", money(plannedV))));
    body.append(h("h2", { class: "period-title" }, periodLabel),
      h("div", { class: "stats" },
        tile(t("income"), actualType.income, plannedType.income, "income"),
        tile(t("expense"), actualType.expense, plannedType.expense, "expense"),
        tile(t("savings"), actualType.savings, plannedType.savings, "savings"),
        tile(t("left"), left, plannedLeft, null)));

    const info = [
      last ? `${t("lastEntry")}: ${t("daysAgo", Math.max(0, daysBetween(last, isoDate())))}` : null,
      t("entriesThisYear", entries),
    ].filter(Boolean);
    const infoLine = h("p", { class: "muted info-line" }, info.join(" · "));
    if (pending) infoLine.append(" · ", h("a", { href: "#/history" }, "⚠ ", t("unreviewedCount", pending)));
    body.append(infoLine);

    if (!totals.length && !budgets.length) { body.append(h("p", { class: "empty" }, t("noData"))); return; }

    const rtl = getLang() === "ar";
    const colors = { income: css("--series-income"), expense: css("--series-expense"), savings: css("--series-savings") };
    const grid = css("--grid"), ink2 = css("--text-2"), track = css("--track");
    const font = { family: css("--font"), size: 12 };
    const base = {
      responsive: true, maintainAspectRatio: false, animation: false,
      locale: rtl ? "ar-JO-u-nu-latn" : "en-US",
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { rtl, labels: { color: ink2, font, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
        tooltip: { rtl, textDirection: rtl ? "rtl" : "ltr", callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } },
      },
    };
    const axis = (extra = {}) => ({
      grid: { color: grid, lineWidth: 1, drawTicks: false }, border: { display: false },
      ticks: { color: ink2, font, padding: 6 }, ...extra,
    });
    const bar = { maxBarThickness: 22, borderRadius: 4, borderSkipped: "start", borderWidth: 0 };

    // ---- 1. month by month (columns, 3 series) ----------------------------
    const months = Array.from({ length: 12 }, (_, i) => monthShort(i));
    const c1 = h("canvas", { role: "img", "aria-label": t("monthByMonth") });
    body.append(card(h("h3", {}, t("monthByMonth"), " ", view.year), h("div", { class: "chart tall" }, c1)));
    charts.push(new Chart(c1, {
      type: "bar",
      data: { labels: months, datasets: TYPES.map((k) => ({ label: t(k), data: monthly[k], backgroundColor: colors[k], ...bar })) },
      options: { ...base,
        datasets: { bar: { categoryPercentage: 0.8, barPercentage: 0.9 } },
        scales: { x: axis({ reverse: rtl, grid: { display: false } }), y: axis({ position: rtl ? "right" : "left", beginAtZero: true, ticks: { color: ink2, font, callback: (v) => num(v).replace(/\.0+$|(\.\d*?)0+$/, "$1") } }) } },
    }));

    // ---- 2. expenses planned vs actual (horizontal; planned = track behind) --
    const expCats = state.categories.filter((c) => c.type === "expense" && ((actualCat[c.id] || 0) || (plannedCat[c.id] || 0)))
      .sort((a, b) => Math.max(actualCat[b.id] || 0, plannedCat[b.id] || 0) - Math.max(actualCat[a.id] || 0, plannedCat[a.id] || 0));
    if (expCats.length) {
      const c2 = h("canvas", { role: "img", "aria-label": t("plannedVsActual") });
      body.append(card(h("h3", {}, t("plannedVsActual")), h("div", { class: "chart", style: { height: `${70 + expCats.length * 34}px` } }, c2)));
      charts.push(new Chart(c2, {
        type: "bar",
        data: {
          labels: expCats.map((c) => `${c.icon} ${nameOf(c)}`),
          datasets: [
            { label: t("actual"), data: expCats.map((c) => actualCat[c.id] || 0), backgroundColor: colors.expense, ...bar, maxBarThickness: 14, grouped: false, order: 1 },
            { label: t("planned"), data: expCats.map((c) => plannedCat[c.id] || 0), backgroundColor: track, ...bar, grouped: false, order: 2 },
          ],
        },
        options: { ...base, indexAxis: "y",
          interaction: { mode: "index", intersect: false, axis: "y" },
          scales: { x: axis({ reverse: rtl, beginAtZero: true }), y: axis({ position: rtl ? "right" : "left", grid: { display: false } }) } },
      }));
    }

    // ---- 3. expenses by member (single series → no legend) -----------------
    const memberRows = Object.entries(byMember).sort((a, b) => b[1] - a[1]);
    if (memberRows.length) {
      const c3 = h("canvas", { role: "img", "aria-label": t("byMember") });
      body.append(card(h("h3", {}, t("byMember")), h("div", { class: "chart", style: { height: `${60 + memberRows.length * 34}px` } }, c3)));
      charts.push(new Chart(c3, {
        type: "bar",
        data: { labels: memberRows.map(([uid]) => memberName(uid)),
                datasets: [{ label: t("expense"), data: memberRows.map(([, v]) => v), backgroundColor: colors.expense, ...bar }] },
        options: { ...base, indexAxis: "y", plugins: { ...base.plugins, legend: { display: false } },
          scales: { x: axis({ reverse: rtl, beginAtZero: true }), y: axis({ position: rtl ? "right" : "left", grid: { display: false } }) } },
      }));
    }

    // ---- 4. table view (every number, so nothing depends on color) ----------
    const tbody = h("tbody");
    for (const type of TYPES) {
      const cats = state.categories.filter((c) => c.type === type && ((actualCat[c.id] || 0) || (plannedCat[c.id] || 0)));
      if (!cats.length) continue;
      tbody.append(h("tr", { class: "group" }, h("th", { colspan: 4 }, h("span", { class: `dot ${type}`, "aria-hidden": "true" }), t(type))));
      for (const c of cats) {
        const p = plannedCat[c.id] || 0, a = actualCat[c.id] || 0;
        const d = type === "income" ? a - p : p - a;
        const bad = d < -0.0005 && type === "expense";
        tbody.append(h("tr", {}, h("th", { scope: "row" }, c.icon, " ", nameOf(c)), h("td", {}, num(p)), h("td", {}, num(a)),
          h("td", { class: bad ? "bad" : "" }, bad ? `▲ ${num(-d)} ${t("over")}` : num(d))));
      }
    }
    body.append(card(h("h3", {}, t("details")), h("div", { class: "table-scroll" },
      h("table", { class: "budget-table" },
        h("thead", {}, h("tr", {}, h("th", {}, t("category")), h("th", {}, t("planned")), h("th", {}, t("actual")), h("th", {}, t("difference")))),
        tbody))));
  }

  load();
  return root;
}
