import { state, isAdmin, listTransactions, approve, memberName, catById } from "../api.js";
import { t, nameOf } from "../i18n.js";
import { h, clear, money, isoMonth, monthStart, monthEnd, prettyDate, toast, errorText, card, loading } from "../ui.js";
import { txRow } from "./add.js";

const filters = { month: isoMonth(), type: "", categoryId: "", memberId: "", unreviewed: false };

export async function renderHistory() {
  const admin = isAdmin();
  const root = h("div", { class: "stack" });
  const list = h("div");

  const month = h("input", { type: "month", value: filters.month, onchange: () => { filters.month = month.value || isoMonth(); load(); } });
  const type = select([["", t("allTypes")], ["expense", t("expense")], ["income", t("income")], ["savings", t("savings")]],
    filters.type, (v) => { filters.type = v; filters.categoryId = ""; fillCats(); load(); });
  const cat = select([], filters.categoryId, (v) => { filters.categoryId = v; load(); });
  function fillCats() {
    clear(cat).append(h("option", { value: "" }, t("allCategories")));
    for (const c of state.categories.filter((c) => !filters.type || c.type === filters.type)) {
      cat.append(h("option", { value: c.id }, `${c.icon} ${nameOf(c)}`));
    }
    cat.value = filters.categoryId;
  }
  fillCats();

  const bar = h("div", { class: "filters" }, month, type, cat);
  if (admin) {
    bar.append(select([["", t("allMembers")], ...state.members.map((m) => [m.user_id, m.display_name])],
      filters.memberId, (v) => { filters.memberId = v; load(); }));
    const chk = h("input", { type: "checkbox", checked: filters.unreviewed, onchange: () => { filters.unreviewed = chk.checked; load(); } });
    bar.append(h("label", { class: "check" }, chk, t("onlyUnreviewed")));
  }
  root.append(card(bar), list);

  async function load() {
    clear(list).append(loading());
    try {
      const rows = await listTransactions({
        from: monthStart(filters.month), to: monthEnd(filters.month), type: filters.type,
        categoryId: filters.categoryId, memberId: admin ? filters.memberId : "", unreviewed: admin && filters.unreviewed,
      });
      rows.forEach((r) => (r.member = memberName(r.created_by)));
      draw(rows);
    } catch (err) {
      clear(list).append(h("p", { class: "error" }, errorText(err)));
    }
  }

  function draw(rows) {
    clear(list);
    if (!rows.length) { list.append(h("p", { class: "empty" }, t("noEntries"))); return; }

    const sum = { income: 0, expense: 0, savings: 0 };
    rows.forEach((r) => (sum[r.type] += Number(r.amount)));
    list.append(h("div", { class: "totals" },
      ["income", "expense", "savings"].map((k) => h("div", { class: "total-item" },
        h("span", { class: `dot ${k}`, "aria-hidden": "true" }), h("span", { class: "muted" }, t(k)), h("strong", {}, money(sum[k]))))));

    const pending = rows.filter((r) => !r.reviewed);
    if (admin && pending.length) {
      list.append(h("div", { class: "row between notice" },
        h("span", {}, t("unreviewedCount", pending.length)),
        h("button", { class: "btn small ok", onclick: () => doApprove(pending.map((r) => r.id)) }, "✓ ", t("approveAll"))));
    }

    // group by date
    const groups = new Map();
    for (const r of rows) { if (!groups.has(r.date)) groups.set(r.date, []); groups.get(r.date).push(r); }
    for (const [date, items] of groups) {
      const spent = items.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
      list.append(card(
        h("div", { class: "row between day-head" }, h("h3", {}, prettyDate(date)), spent > 0 && h("span", { class: "muted" }, money(-spent))),
        h("ul", { class: "tx-list" }, items.map((r) => txRow(r, { showMember: admin, onApprove: admin ? (tx) => doApprove([tx.id]) : null })))));
    }
  }

  async function doApprove(ids) {
    try { await approve(ids); toast(t("approved")); load(); }
    catch (err) { toast(errorText(err), "error"); }
  }

  load();
  return root;
}

function select(options, value, onChange) {
  const s = h("select", { onchange: () => onChange(s.value) }, options.map(([v, label]) => h("option", { value: v }, label)));
  s.value = value;
  return s;
}
