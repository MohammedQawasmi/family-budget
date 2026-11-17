import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { CONFIG } from "../config.js";

export const sb = createClient(CONFIG.supabaseUrl, CONFIG.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Everything the screens need about the signed-in person and the household.
export const state = {
  session: null,
  me: null,            // members row
  household: null,
  categories: [],
  methods: [],
  members: [],         // admins: all members; kids: only themselves
};

export const isAdmin = () => state.me?.role === "admin";

export function toLogin(username) {
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@${CONFIG.loginDomain}`;
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function signIn(username, password) {
  check(await sb.auth.signInWithPassword({ email: toLogin(username), password }));
}

export async function signOut() {
  await sb.auth.signOut();
  Object.assign(state, { session: null, me: null, household: null, categories: [], methods: [], members: [] });
}

export async function loadContext() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  if (!session) return false;
  const uid = session.user.id;
  const [me, hh, cats, methods, members] = await Promise.all([
    sb.from("members").select("*").eq("user_id", uid).maybeSingle(),
    sb.from("household").select("*").limit(1).maybeSingle(),
    sb.from("categories").select("*").order("type").order("sort_order"),
    sb.from("payment_methods").select("*").order("sort_order"),
    sb.from("members").select("user_id,display_name,role,lang,active").order("display_name"),
  ]);
  state.me = check(me);
  if (!state.me || !state.me.active) throw new Error("not-member");
  state.household = check(hh);
  state.categories = check(cats);
  state.methods = check(methods);
  state.members = check(members);
  return true;
}

export async function refreshLists() {
  const [cats, methods, members, hh] = await Promise.all([
    sb.from("categories").select("*").order("type").order("sort_order"),
    sb.from("payment_methods").select("*").order("sort_order"),
    sb.from("members").select("user_id,display_name,role,lang,active").order("display_name"),
    sb.from("household").select("*").limit(1).maybeSingle(),
  ]);
  state.categories = check(cats);
  state.methods = check(methods);
  state.members = check(members);
  state.household = check(hh);
}

export const catById = (id) => state.categories.find((c) => c.id === id);
export const methodById = (id) => state.methods.find((m) => m.id === id);
export const memberName = (uid) => state.members.find((m) => m.user_id === uid)?.display_name || "—";
export const activeCats = (type) => state.categories.filter((c) => c.type === type && c.active);

export function canEdit(tx) {
  return isAdmin() || (tx.created_by === state.me?.user_id && !tx.reviewed);
}

// ---- transactions ------------------------------------------------------
export async function listTransactions({ from, to, type, categoryId, memberId, unreviewed, limit = 1000 }) {
  let q = sb.from("transactions").select("*").gte("date", from).lte("date", to)
    .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (type) q = q.eq("type", type);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (memberId) q = q.eq("created_by", memberId);
  if (unreviewed) q = q.eq("reviewed", false);
  return check(await q);
}

export async function myRecent(limit = 5) {
  return check(await sb.from("transactions").select("*").eq("created_by", state.me.user_id)
    .order("created_at", { ascending: false }).limit(limit));
}

export async function getTransaction(id) {
  return check(await sb.from("transactions").select("*").eq("id", id).maybeSingle());
}

export async function saveTransaction(tx) {
  const row = {
    date: tx.date, type: tx.type, category_id: tx.category_id, amount: tx.amount,
    details: tx.details || null, payment_method_id: tx.payment_method_id || null,
  };
  if (tx.id) {
    const data = check(await sb.from("transactions").update(row).eq("id", tx.id).select());
    if (!data.length) throw new Error("This entry can no longer be edited.");
    return data[0];
  }
  // household_id / created_by / reviewed are filled in by the database itself.
  row.household_id = state.household.id;
  row.created_by = state.me.user_id;
  return check(await sb.from("transactions").insert(row).select())[0];
}

export async function deleteTransaction(id) {
  check(await sb.from("transactions").delete().eq("id", id));
}

export async function approve(ids) {
  if (!ids.length) return;
  check(await sb.from("transactions").update({ reviewed: true }).in("id", ids));
}

export async function unreviewedCount() {
  const { count, error } = await sb.from("transactions").select("id", { count: "exact", head: true }).eq("reviewed", false);
  if (error) throw error;
  return count || 0;
}

export async function lastEntryDate() {
  const data = check(await sb.from("transactions").select("date").order("date", { ascending: false }).limit(1));
  return data[0]?.date || null;
}

// ---- reporting -----------------------------------------------------------
export async function monthlyTotals(year) {
  return check(await sb.rpc("monthly_totals", { p_year: year }));
}

export async function budgetsForYear(year) {
  return check(await sb.from("budgets").select("*").gte("month", `${year}-01-01`).lte("month", `${year}-12-01`));
}

export async function budgetsForMonth(month) {
  return check(await sb.from("budgets").select("*").eq("month", month));
}

export async function upsertBudgets(rows) {
  if (!rows.length) return;
  check(await sb.from("budgets").upsert(
    rows.map((r) => ({ household_id: state.household.id, category_id: r.category_id, month: r.month, amount: r.amount })),
    { onConflict: "category_id,month" }));
}

// ---- settings ------------------------------------------------------------
export async function updateHousehold(fields) {
  check(await sb.from("household").update(fields).eq("id", state.household.id));
}

export async function saveListItem(table, item) {
  const row = { ...item, household_id: state.household.id };
  if (item.id) return check(await sb.from(table).update(row).eq("id", item.id).select())[0];
  delete row.id;
  return check(await sb.from(table).insert(row).select())[0];
}

export async function updateMember(userId, fields) {
  check(await sb.from("members").update(fields).eq("user_id", userId));
}

export async function changePassword(password) {
  check(await sb.auth.updateUser({ password }));
}

export async function setMyLang(lang) {
  await sb.rpc("set_my_lang", { p_lang: lang });
}
