import { sb, state, isAdmin, loadContext, signIn } from "./api.js";
import { t, setLang, getLang } from "./i18n.js";
import { h, clear, toast, errorText, loading, applyTheme } from "./ui.js";
import { renderAdd } from "./views/add.js";
import { renderHistory } from "./views/history.js";
import { renderBudget } from "./views/budget.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderSettings } from "./views/settings.js";

const app = document.getElementById("app");

// ---- routes ---------------------------------------------------------------
const ROUTES = {
  add:       { view: renderAdd,       icon: "＋", label: "navAdd" },
  history:   { view: renderHistory,   icon: "☰", label: "navHistory" },
  budget:    { view: renderBudget,    icon: "◎", label: "navBudget", admin: true },
  dashboard: { view: renderDashboard, icon: "▤", label: "navDashboard", admin: true },
  settings:  { view: renderSettings,  icon: "⚙", label: "navSettings" },
};

function parseHash() {
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  if (name === "edit" && arg) return { name: "add", arg };
  return { name: ROUTES[name] ? name : "add", arg };
}

function navBar(current) {
  return h("nav", { class: "tabbar", "aria-label": "Main" },
    Object.entries(ROUTES).filter(([, r]) => !r.admin || isAdmin()).map(([key, r]) =>
      h("a", { href: `#/${key}`, class: key === current ? "on" : "", "aria-current": key === current ? "page" : false },
        h("span", { class: "ico", "aria-hidden": "true" }, r.icon), h("span", {}, t(r.label)))));
}

let renderToken = 0;
export async function route() {
  if (!state.me) return renderLogin();
  let { name, arg } = parseHash();
  if (ROUTES[name].admin && !isAdmin()) name = "add";
  const token = ++renderToken;
  const main = h("main", { class: "view", id: "view" }, loading());
  clear(app).append(
    h("header", { class: "topbar" },
      h("h1", {}, t("appName")),
      h("span", { class: "who" }, state.me.display_name)),
    main, navBar(name));
  try {
    const content = await ROUTES[name].view(arg);
    if (token !== renderToken) return;           // user already navigated away
    clear(main).append(content);
  } catch (err) {
    console.error(err);
    if (token === renderToken) clear(main).append(h("p", { class: "error" }, errorText(err)));
  }
}

// ---- login -----------------------------------------------------------------
function renderLogin(message) {
  const user = h("input", { name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, dir: "ltr" });
  const pass = h("input", { name: "password", type: "password", autocomplete: "current-password", required: true, dir: "ltr" });
  const btn = h("button", { class: "btn primary block", type: "submit" }, t("signIn"));
  const msg = h("p", { class: "error", role: "alert" }, message || "");
  const form = h("form", {
    class: "login card", onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; btn.textContent = t("signingIn"); msg.textContent = "";
      try {
        await signIn(user.value, pass.value);
        await boot();
      } catch (err) {
        msg.textContent = err.message === "not-member" ? t("notMember")
          : /invalid/i.test(err.message) ? t("loginFailed") : errorText(err);
        btn.disabled = false; btn.textContent = t("signIn");
      }
    },
  },
    h("div", { class: "brand" }, h("img", { src: "icons/icon-192.png", alt: "", width: 64, height: 64 }), h("h1", {}, t("appName"))),
    h("label", { class: "field" }, h("span", { class: "label" }, t("username")), user),
    h("label", { class: "field" }, h("span", { class: "label" }, t("password")), pass),
    msg, btn,
    h("button", { type: "button", class: "btn ghost block", onclick: () => { setLang(getLang() === "ar" ? "en" : "ar"); renderLogin(); } },
      getLang() === "ar" ? "English" : "العربية"));
  clear(app).append(h("div", { class: "login-wrap" }, form));
  user.focus();
}

// ---- boot --------------------------------------------------------------------
async function boot() {
  clear(app).append(loading());
  try {
    const ok = await loadContext();
    if (!ok) return renderLogin();
    let savedLang = null;
    try { savedLang = localStorage.getItem("lang"); } catch {}
    if (state.me.lang && !savedLang) setLang(state.me.lang);
    route();
  } catch (err) {
    if (err.message === "not-member") { await sb.auth.signOut(); return renderLogin(t("notMember")); }
    renderLogin(errorText(err));
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("rerender", route);       // fired after a language change
let lastStamp = 0;                                 // re-check login + reload lists when the app comes back to the screen
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !state.me || Date.now() - lastStamp < 60000) return;
  lastStamp = Date.now();
  try { await loadContext(); } catch (err) { if (err.message === "not-member") { await sb.auth.signOut(); } }
});
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") { state.me = null; renderLogin(); }
});
window.addEventListener("online", () => toast("✓ online"));

setLang(getLang());
applyTheme();
boot();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  // When a new version takes over, reload once so the new code runs.
  const hadOldVersion = !!navigator.serviceWorker.controller;   // first visit: nothing to replace, no reload
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadOldVersion) return;
    reloaded = true; location.reload();
  });
}
