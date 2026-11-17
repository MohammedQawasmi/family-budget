import { state, isAdmin, activeCats, catById, methodById, canEdit, saveTransaction, deleteTransaction,
         getTransaction, myRecent } from "../api.js";
import { t, nameOf } from "../i18n.js";
import { h, clear, money, parseAmount, isoDate, prettyDate, toast, errorText, segmented, field, card } from "../ui.js";

const LAST_METHOD_KEY = "lastMethod";

export async function renderAdd(editId) {
  let tx = { type: "expense", date: isoDate(), amount: "", category_id: null, details: "", payment_method_id: null };
  if (editId) {
    const found = await getTransaction(editId);
    if (!found) return h("p", { class: "error" }, "—");
    tx = { ...found };
  } else {
    try { tx.payment_method_id = localStorage.getItem(LAST_METHOD_KEY) || state.methods[0]?.id || null; } catch {}
  }
  const editable = !editId || canEdit(tx);

  const root = h("div", { class: "stack" });
  const form = h("form", { class: "card entry-form", novalidate: true });

  // --- type -----------------------------------------------------------
  const typeSeg = segmented(
    ["expense", "income", "savings"].map((v) => ({ value: v, label: t(v + "One") })),
    tx.type, (v) => { tx.type = v; tx.category_id = null; drawCats(); }, { name: "type" });

  // --- amount ---------------------------------------------------------
  const amount = h("input", {
    class: "amount-input", inputmode: "decimal", autocomplete: "off", dir: "ltr",
    placeholder: "0.000", "aria-label": t("amount"),
    value: tx.amount ? String(Number(tx.amount)) : "",
  });

  // --- categories -----------------------------------------------------
  const catWrap = h("div", { class: "chips", role: "radiogroup", "aria-label": t("category") });
  function drawCats() {
    clear(catWrap);
    const cats = activeCats(tx.type);
    // keep a since-deactivated category visible when editing an old entry
    const cur = catById(tx.category_id);
    if (cur && !cats.includes(cur)) cats.push(cur);
    for (const c of cats) {
      const on = c.id === tx.category_id;
      catWrap.append(h("button", {
        type: "button", class: `chip ${on ? "on" : ""}`, role: "radio", "aria-checked": String(on),
        onclick: () => { tx.category_id = c.id; drawCats(); },
      }, h("span", { class: "chip-ico", "aria-hidden": "true" }, c.icon), nameOf(c)));
    }
  }
  drawCats();

  // --- payment method -------------------------------------------------
  const methodWrap = h("div", { class: "chips small" });
  function drawMethods() {
    clear(methodWrap);
    for (const m of state.methods.filter((m) => m.active || m.id === tx.payment_method_id)) {
      const on = m.id === tx.payment_method_id;
      methodWrap.append(h("button", {
        type: "button", class: `chip ${on ? "on" : ""}`, "aria-pressed": String(on),
        onclick: () => { tx.payment_method_id = on ? null : m.id; drawMethods(); },
      }, h("span", { class: "chip-ico", "aria-hidden": "true" }, m.icon), nameOf(m)));
    }
  }
  drawMethods();

  const date = h("input", { type: "date", value: tx.date, max: isoDate(new Date(Date.now() + 86400000 * 366)) });
  const details = h("input", { type: "text", maxlength: 200, placeholder: t("notePlaceholder"), value: tx.details || "" });
  const saveBtn = h("button", { type: "submit", class: "btn primary block big" }, t("save"));

  form.append(
    h("h2", {}, editId ? t("editEntry") : t("newEntry")),
    typeSeg,
    h("div", { class: "amount-row" }, amount, h("span", { class: "unit" }, t("currency"))),
    field(t("category"), catWrap),
    field(t("date"), date),
    field(t("paidWith"), methodWrap),
    field(t("note"), details),
    saveBtn,
  );

  if (editId) {
    const actions = h("div", { class: "row gap" },
      h("button", { type: "button", class: "btn ghost", onclick: () => history.back() }, t("back")));
    if (isAdmin()) {
      actions.append(h("button", {
        type: "button", class: "btn danger", onclick: async () => {
          if (!confirm(t("confirmDelete"))) return;
          try { await deleteTransaction(tx.id); toast(t("deleted")); location.hash = "#/history"; }
          catch (err) { toast(errorText(err), "error"); }
        },
      }, t("delete")));
    }
    form.append(actions);
  }

  if (!editable) {
    form.querySelectorAll("input,button[type=submit]").forEach((el) => (el.disabled = true));
    form.querySelectorAll(".chip, .segmented button").forEach((el) => (el.disabled = true));
    form.prepend(h("p", { class: "notice" }, "🔒 ", t("locked")));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = parseAmount(amount.value);
    if (!(value > 0)) { toast(t("enterAmount"), "error"); amount.focus(); return; }
    if (!tx.category_id) { toast(t("pickCategory"), "error"); return; }
    saveBtn.disabled = true; saveBtn.textContent = t("saving");
    try {
      await saveTransaction({ ...tx, amount: value, date: date.value || isoDate(), details: details.value.trim() });
      try { if (tx.payment_method_id) localStorage.setItem(LAST_METHOD_KEY, tx.payment_method_id); } catch {}
      toast(`${t("saved")}  ${money(value)}`);
      if (editId) { history.back(); return; }
      amount.value = ""; details.value = ""; tx.category_id = null; drawCats();
      drawRecent();
      amount.focus();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = t("save");
    }
  });

  root.append(form);

  // --- my recent entries (new-entry screen only) -----------------------
  const recent = h("div");
  async function drawRecent() {
    try {
      const rows = await myRecent(5);
      clear(recent);
      if (!rows.length) return;
      recent.append(card(h("h3", {}, t("myRecent")), h("ul", { class: "tx-list" }, rows.map(txRow))));
    } catch { /* not critical */ }
  }
  if (!editId) { root.append(recent); drawRecent(); }

  setTimeout(() => editable && !editId && amount.focus(), 50);
  return root;
}

// One entry row, shared with the History screen.
export function txRow(tx, { showMember = false, onApprove } = {}) {
  const cat = catById(tx.category_id);
  const method = methodById(tx.payment_method_id);
  const sign = tx.type === "income" ? 1 : -1;
  const editable = canEdit(tx);
  const body = h("div", { class: "tx-main" },
    h("div", { class: "tx-title" }, nameOf(cat),
      !tx.reviewed && h("span", { class: "badge warn" }, t("needsReview"))),
    h("div", { class: "tx-sub" },
      [prettyDate(tx.date), method && nameOf(method), showMember && tx.member, tx.details].filter(Boolean).join(" · ")));
  const amount = h("div", { class: `tx-amount ${tx.type}` },
    tx.type === "savings" ? money(tx.amount) : money(sign * tx.amount, { sign: true }));
  const li = h("li", { class: "tx" },
    h("span", { class: "tx-ico", "aria-hidden": "true" }, cat?.icon || "•"),
    editable ? h("a", { href: `#/edit/${tx.id}`, class: "tx-link" }, body, amount)
             : h("div", { class: "tx-link" }, body, amount, h("span", { class: "lock", title: t("locked") }, "🔒")));
  if (onApprove && !tx.reviewed) {
    li.append(h("button", { class: "btn small ok", type: "button", onclick: () => onApprove(tx) }, "✓ ", t("approve")));
  }
  return li;
}
