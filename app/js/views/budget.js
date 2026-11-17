import { state, budgetsForMonth, upsertBudgets, monthlyTotals } from "../api.js";
import { t, nameOf, monthName } from "../i18n.js";
import { h, clear, money, num, parseAmount, isoMonth, addMonths, toast, errorText, card, loading } from "../ui.js";

let currentMonth = isoMonth();
const TYPES = ["income", "expense", "savings"];

export async function renderBudget() {
  const root = h("div", { class: "stack" });
  const body = h("div", { class: "stack" });

  const monthInput = h("input", { type: "month", value: currentMonth, onchange: () => { currentMonth = monthInput.value || isoMonth(); load(); } });
  const prev = h("button", { class: "btn ghost small", "aria-label": "previous month", onclick: () => step(-1) }, "‹");
  const next = h("button", { class: "btn ghost small", "aria-label": "next month", onclick: () => step(1) }, "›");
  function step(n) { currentMonth = addMonths(currentMonth, n); monthInput.value = currentMonth; load(); }

  const copyBtn = h("button", { class: "btn ghost small", onclick: copyPrevious }, "⧉ ", t("copyPrev"));
  root.append(card(h("div", { class: "row gap wrap" }, h("div", { class: "row gap month-step" }, prev, monthInput, next), copyBtn),
                   h("p", { class: "hint" }, t("budgetHint"))), body);

  let planned = {};   // category_id -> amount
  let actual = {};    // category_id -> amount

  async function load() {
    clear(body).append(loading());
    try {
      const month = `${currentMonth}-01`;
      const [rows, totals] = await Promise.all([budgetsForMonth(month), monthlyTotals(Number(currentMonth.slice(0, 4)))]);
      planned = Object.fromEntries(rows.map((r) => [r.category_id, Number(r.amount)]));
      actual = {};
      for (const r of totals.filter((r) => r.month === month)) actual[r.category_id] = (actual[r.category_id] || 0) + Number(r.total);
      draw();
    } catch (err) {
      clear(body).append(h("p", { class: "error" }, errorText(err)));
    }
  }

  const summary = h("div");
  function sums(map, type) {
    return state.categories.filter((c) => c.type === type).reduce((s, c) => s + (map[c.id] || 0), 0);
  }
  function drawSummary() {
    const toAlloc = sums(planned, "income") - sums(planned, "expense") - sums(planned, "savings");
    const leftActual = sums(actual, "income") - sums(actual, "expense") - sums(actual, "savings");
    const ok = Math.abs(toAlloc) < 0.0005 && sums(planned, "income") > 0;
    clear(summary).append(h("div", { class: `alloc ${ok ? "ok" : toAlloc < 0 ? "neg" : ""}` },
      h("div", {}, h("span", { class: "muted" }, t("toAllocate")), h("strong", {}, ok ? t("allocatedOk") : money(toAlloc))),
      h("div", {}, h("span", { class: "muted" }, `${t("left")} (${t("actual")})`), h("strong", {}, money(leftActual)))));
  }

  function draw() {
    clear(body).append(card(h("h2", {}, monthName(Number(currentMonth.slice(5)) - 1), " ", currentMonth.slice(0, 4)), summary));
    drawSummary();
    for (const type of TYPES) {
      const cats = state.categories.filter((c) => c.type === type && (c.active || planned[c.id] || actual[c.id]));
      const totalRow = h("tr", { class: "total" });
      const drawTotal = () => {
        const p = sums(planned, type), a = sums(actual, type);
        clear(totalRow).append(h("th", {}, t("total")), h("td", {}, num(p)), h("td", {}, num(a)), diffCell(type, p, a));
      };
      const table = h("table", { class: "budget-table" },
        h("thead", {}, h("tr", {}, h("th", {}, t(type)), h("th", {}, t("planned")), h("th", {}, t("actual")), h("th", {}, t("difference")))),
        h("tbody", {}, cats.map((c) => {
          const input = h("input", {
            inputmode: "decimal", dir: "ltr", class: "num-input", "aria-label": `${t("planned")} ${nameOf(c)}`,
            value: planned[c.id] ? String(planned[c.id]) : "", placeholder: "0",
          });
          const diff = h("td");
          const drawDiff = () => {
            const n = diffCell(type, planned[c.id] || 0, actual[c.id] || 0);
            diff.className = n.className; diff.textContent = n.textContent;
          };
          input.addEventListener("change", async () => {
            const v = input.value.trim() === "" ? 0 : parseAmount(input.value);
            if (!(v >= 0)) { input.value = planned[c.id] || ""; toast(t("enterAmount"), "error"); return; }
            const old = planned[c.id];
            planned[c.id] = v; drawDiff(); drawTotal(); drawSummary();
            try { await upsertBudgets([{ category_id: c.id, month: `${currentMonth}-01`, amount: v }]); input.classList.add("saved"); setTimeout(() => input.classList.remove("saved"), 900); }
            catch (err) { planned[c.id] = old; input.value = old || ""; drawDiff(); drawTotal(); drawSummary(); toast(errorText(err), "error"); }
          });
          const row = h("tr", {}, h("th", { scope: "row" }, h("span", { "aria-hidden": "true" }, c.icon, " "), nameOf(c)),
            h("td", {}, input), h("td", {}, num(actual[c.id] || 0)), diff);
          drawDiff();
          return row;
        })),
        h("tfoot", {}, totalRow));
      drawTotal();
      body.append(card(h("div", { class: "table-scroll" }, table)));
    }
  }

  async function copyPrevious() {
    const prevMonth = `${addMonths(currentMonth, -1)}-01`;
    try {
      const rows = await budgetsForMonth(prevMonth);
      if (!rows.length) { toast("—", "error"); return; }
      if (Object.values(planned).some((v) => v > 0) && !confirm(t("confirmCopy"))) return;
      await upsertBudgets(rows.map((r) => ({ category_id: r.category_id, month: `${currentMonth}-01`, amount: r.amount })));
      toast(t("copied"));
      load();
    } catch (err) { toast(errorText(err), "error"); }
  }

  load();
  return root;
}

// For expenses/savings, spending more than planned is "over" (bad for expenses).
// For income, receiving less than planned is the shortfall.
function diffCell(type, planned, actual) {
  const d = type === "income" ? actual - planned : planned - actual;
  const bad = d < -0.0005 && type !== "savings";
  return h("td", { class: bad ? "bad" : "" },
    planned === 0 && actual === 0 ? "—" : `${bad ? "▲ " : ""}${num(d)}`);
}
