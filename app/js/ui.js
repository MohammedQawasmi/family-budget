import { t, getLang } from "./i18n.js";

// h("div", {class: "x", onclick: fn}, child, "text", ...): builds DOM safely
// (text is always inserted as text, never as HTML, so user notes can't inject code).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// ---- numbers & money -------------------------------------------------
const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const nfShort = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function money(v, { sign = false, short = false } = {}) {
  const n = Number(v) || 0;
  const s = (short ? nfShort : nf).format(Math.abs(n));
  const pre = n < 0 ? "−" : sign && n > 0 ? "+" : "";
  return `${pre}${s} ${t("currency")}`;
}

export function num(v) { return nf.format(Number(v) || 0); }

// Accepts Arabic-Indic digits (٠-٩), Arabic decimal sign and commas.
export function parseAmount(str) {
  if (str == null) return NaN;
  const s = String(str).trim()
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٫,]/g, ".").replace(/[^\d.]/g, "");
  if (!s || (s.match(/\./g) || []).length > 1) return NaN;
  return Math.round(parseFloat(s) * 1000) / 1000;
}

// ---- dates (always local time: Jordan is UTC+3) ----------------------
const pad = (n) => String(n).padStart(2, "0");
export function isoDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function isoMonth(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
export function monthStart(ym) { return `${ym}-01`; }
export function monthEnd(ym) {
  const [y, m] = ym.split("-").map(Number);
  return isoDate(new Date(y, m, 0));
}
export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  return isoMonth(new Date(y, m - 1 + n, 1));
}
export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00"), b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
export function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(getLang() === "ar" ? "ar-JO-u-nu-latn" : "en-GB",
    { weekday: "short", day: "numeric", month: "short" });
}

// ---- theme (auto / light / dark), remembered per device -------------
export function getTheme() { try { return localStorage.getItem("theme") || "auto"; } catch { return "auto"; } }
export function applyTheme(mode) {
  const m = mode || getTheme();
  if (m === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", m);
  try { localStorage.setItem("theme", m); } catch {}
  window.dispatchEvent(new Event("themechange"));
}

// ---- feedback ---------------------------------------------------------
let toastTimer;
export function toast(msg, kind = "ok") {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status", "aria-live": "polite" }); document.body.append(el); }
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), kind === "error" ? 5000 : 2200);
}

export function errorText(err) {
  if (!navigator.onLine) return t("offline");
  return `${t("errorGeneric")} ${err?.message || err}`;
}

export function segmented(options, value, onChange, { name = "seg" } = {}) {
  const wrap = h("div", { class: "segmented", role: "radiogroup" });
  for (const o of options) {
    const btn = h("button", {
      type: "button", role: "radio", class: o.value === value ? "on" : "",
      "aria-checked": String(o.value === value), "data-v": o.value, name,
      onclick: () => {
        wrap.querySelectorAll("button").forEach((b) => { b.className = ""; b.setAttribute("aria-checked", "false"); });
        btn.className = "on"; btn.setAttribute("aria-checked", "true");
        onChange(o.value);
      },
    }, o.label);
    wrap.append(btn);
  }
  return wrap;
}

export function field(label, control, hint) {
  return h("label", { class: "field" }, h("span", { class: "label" }, label), control, hint && h("small", { class: "hint" }, hint));
}

export function card(...children) { return h("section", { class: "card" }, ...children); }

export function loading() { return h("div", { class: "loading", "aria-busy": "true" }, h("span", { class: "spinner" })); }
