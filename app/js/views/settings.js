import { state, isAdmin, signOut, setMyLang, updateHousehold, saveListItem, updateMember, refreshLists, changePassword } from "../api.js";
import { t, nameOf, getLang, setLang } from "../i18n.js";
import { h, clear, toast, errorText, segmented, field, card, applyTheme, getTheme } from "../ui.js";

export async function renderSettings() {
  const root = h("div", { class: "stack" });

  // ---- everyone: language, theme, account ---------------------------------
  root.append(card(
    h("h2", {}, t("navSettings")),
    field(t("language"), segmented([{ value: "ar", label: "العربية" }, { value: "en", label: "English" }], getLang(), async (v) => {
      setLang(v);
      setMyLang(v).catch(() => {});
      window.dispatchEvent(new Event("rerender"));
    })),
    field(t("theme"), segmented([{ value: "auto", label: t("themeAuto") }, { value: "light", label: t("themeLight") }, { value: "dark", label: t("themeDark") }],
      getTheme(), (v) => applyTheme(v))),
    h("p", { class: "muted" }, `${t("signedInAs")}: ${state.me.display_name} (${t("role" + state.me.role)})`),
    passwordForm(),
    h("button", { class: "btn ghost block", onclick: () => signOut() }, t("signOut")),
  ));

  if (!isAdmin()) return root;

  // ---- household ----------------------------------------------------------
  const hh = state.household;
  const name = h("input", { value: hh.name });
  const startYear = h("input", { type: "number", min: 2000, max: 2100, value: hh.start_year, dir: "ltr" });
  const shift = h("input", { type: "checkbox", checked: hh.shift_late_income });
  const shiftDay = h("input", { type: "number", min: 1, max: 31, value: hh.shift_day, dir: "ltr" });
  root.append(card(
    h("h2", {}, t("household")),
    field(t("name"), name), field(t("startYear"), startYear),
    h("label", { class: "check" }, shift, t("shiftIncome")),
    field(t("shiftDay"), shiftDay, t("shiftHelp")),
    h("button", { class: "btn primary", onclick: async () => {
      try {
        await updateHousehold({ name: name.value.trim() || hh.name, start_year: Number(startYear.value) || hh.start_year,
          shift_late_income: shift.checked, shift_day: Math.min(31, Math.max(1, Number(shiftDay.value) || 20)) });
        await refreshLists(); toast(t("saved"));
      } catch (err) { toast(errorText(err), "error"); }
    } }, t("save"))));

  // ---- categories & payment methods ---------------------------------------
  root.append(listEditor(t("categories"), "categories", () => state.categories, true));
  root.append(listEditor(t("paymentMethods"), "payment_methods", () => state.methods, false));

  // ---- members ------------------------------------------------------------
  const membersCard = card(h("h2", {}, t("members")));
  for (const m of state.members) {
    const dn = h("input", { value: m.display_name, "aria-label": t("name") });
    const role = h("select", { "aria-label": t("role") },
      h("option", { value: "admin" }, t("roleadmin")), h("option", { value: "contributor" }, t("rolecontributor")));
    role.value = m.role;
    const active = h("input", { type: "checkbox", checked: m.active });
    const isMe = m.user_id === state.me.user_id;
    if (isMe) { role.disabled = true; active.disabled = true; }   // can't lock yourself out
    membersCard.append(h("div", { class: "member-row" }, dn, role, h("label", { class: "check" }, active, t("active")),
      h("button", { class: "btn small", onclick: async () => {
        try { await updateMember(m.user_id, { display_name: dn.value.trim() || m.display_name, role: role.value, active: active.checked });
              await refreshLists(); toast(t("saved")); }
        catch (err) { toast(errorText(err), "error"); }
      } }, t("save"))));
  }
  membersCard.append(h("p", { class: "hint", dir: "ltr" }, t("membersHelp")));
  root.append(membersCard);
  return root;
}

function passwordForm() {
  const p1 = h("input", { type: "password", autocomplete: "new-password", minlength: 8, dir: "ltr", "aria-label": t("newPassword") });
  const p2 = h("input", { type: "password", autocomplete: "new-password", minlength: 8, dir: "ltr", "aria-label": t("repeatPassword") });
  const details = h("details", { class: "pw" },
    h("summary", {}, t("changePassword")),
    h("div", { class: "stack small" },
      field(t("newPassword"), p1), field(t("repeatPassword"), p2),
      h("button", { class: "btn", onclick: async () => {
        if (p1.value.length < 8) { toast(t("passwordShort"), "error"); return; }
        if (p1.value !== p2.value) { toast(t("passwordMismatch"), "error"); return; }
        try { await changePassword(p1.value); p1.value = p2.value = ""; details.open = false; toast(t("saved")); }
        catch (err) { toast(errorText(err), "error"); }
      } }, t("save"))));
  return details;
}

function listEditor(title, table, getItems, withType) {
  const wrap = card(h("h2", {}, title));
  const list = h("div", { class: "stack small" });
  wrap.append(list);

  function row(item) {
    const icon = h("input", { value: item.icon || "", class: "icon-input", maxlength: 4, "aria-label": t("icon") });
    const en = h("input", { value: item.name_en || "", placeholder: t("nameEn"), dir: "ltr", "aria-label": t("nameEn") });
    const ar = h("input", { value: item.name_ar || "", placeholder: t("nameAr"), dir: "rtl", "aria-label": t("nameAr") });
    const type = withType && h("select", { "aria-label": t("category") },
      ["expense", "income", "savings"].map((v) => h("option", { value: v }, t(v))));
    if (type) { type.value = item.type || "expense"; if (item.id) type.disabled = true; }  // type is fixed once used
    const active = h("input", { type: "checkbox", checked: item.active !== false });
    const btn = h("button", { class: "btn small" + (item.id ? "" : " primary"), onclick: async () => {
      if (!en.value.trim() && !ar.value.trim()) return;
      const rec = { id: item.id, icon: icon.value.trim() || "•", name_en: en.value.trim() || ar.value.trim(),
                    name_ar: ar.value.trim() || en.value.trim(), active: active.checked };
      if (withType) rec.type = type.value;
      try { await saveListItem(table, rec); await refreshLists(); toast(t("saved")); draw(); }
      catch (err) { toast(errorText(err), "error"); }
    } }, item.id ? t("save") : t("add"));
    return h("div", { class: `list-row ${item.id ? "" : "new"}` }, icon, en, ar, type,
      item.id && h("label", { class: "check" }, active, t("active")), btn);
  }

  function draw() {
    clear(list);
    let lastType = null;
    for (const item of getItems()) {
      if (withType && item.type !== lastType) { lastType = item.type; list.append(h("h3", {}, t(item.type))); }
      list.append(row(item));
    }
    list.append(h("h3", {}, "＋ ", t("add")), row({}));
  }
  draw();
  return wrap;
}
