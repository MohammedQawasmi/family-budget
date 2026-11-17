// Arabic / English text. Add a key to BOTH languages.
const STR = {
  en: {
    appName: "Family Budget",
    currency: "JOD",
    // auth
    username: "Username", password: "Password", signIn: "Sign in", signOut: "Sign out",
    signingIn: "Signing in…", loginFailed: "Wrong username or password.",
    notMember: "This account is not linked to the family, or it was disabled.",
    // nav
    navAdd: "Add", navHistory: "History", navBudget: "Budget", navDashboard: "Dashboard", navSettings: "Settings",
    // types
    income: "Income", expense: "Expenses", savings: "Savings",
    incomeOne: "Income", expenseOne: "Expense", savingsOne: "Savings",
    // add / edit
    amount: "Amount", category: "Category", date: "Date", paidWith: "Paid with", note: "Note (optional)",
    notePlaceholder: "e.g. bread and milk", save: "Save", saving: "Saving…", saved: "Saved ✓",
    editEntry: "Edit entry", newEntry: "New entry", delete: "Delete", cancel: "Cancel", back: "Back",
    confirmDelete: "Delete this entry? This cannot be undone.", deleted: "Deleted",
    enterAmount: "Enter an amount greater than 0.", pickCategory: "Pick a category.",
    myRecent: "My recent entries", locked: "Approved: only a full-access member can change it",
    offline: "No internet connection: the entry was not saved. Try again when you're online.",
    // history
    month: "Month", allTypes: "All types", allCategories: "All categories", allMembers: "Everyone",
    needsReview: "Needs review", onlyUnreviewed: "Only needs review", approve: "Approve", approveAll: "Approve all",
    approved: "Approved", noEntries: "No entries for this month yet.", by: "by", total: "Total",
    // budget
    planned: "Planned", actual: "Actual", difference: "Difference", left: "Left",
    toAllocate: "To be allocated", allocatedOk: "Every dinar has a job ✔",
    copyPrev: "Copy last month's plan", confirmCopy: "Replace this month's plan with last month's?",
    copied: "Copied", budgetHint: "Plan this month: income minus expenses and savings should reach 0.",
    // dashboard
    year: "Year", period: "Period", totalYear: "Whole year",
    monthByMonth: "Month by month", plannedVsActual: "Expenses: planned vs actual",
    byMember: "Expenses by family member", details: "Details by category",
    lastEntry: "Last entry", daysAgo: (n) => n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`,
    entriesThisYear: (n) => `${n} entries this year`, unreviewedCount: (n) => `${n} need review`,
    over: "over", under: "under", noData: "No data for this period yet.",
    plannedLabel: (v) => `Planned ${v}`, tableView: "Show as table", chartView: "Show as chart",
    // settings
    language: "Language", theme: "Theme", themeAuto: "Automatic", themeLight: "Light", themeDark: "Dark",
    signedInAs: "Signed in as", roleadmin: "Full access", rolecontributor: "Entries only",
    household: "Household", name: "Name", startYear: "Starting year",
    shiftIncome: "Count late income toward next month", shiftDay: "Starting on day",
    shiftHelp: "Example: a salary paid on the 25th counts for next month's budget.",
    categories: "Categories", paymentMethods: "Payment methods", members: "Family members",
    nameEn: "Name (English)", nameAr: "Name (Arabic)", icon: "Icon", active: "Active", add: "Add",
    role: "Role", membersHelp: "To add a new account, run: python tools/manage_members.py add",
    errorGeneric: "Something went wrong:",
    pending: "unreviewed",
    changePassword: "Change my password", newPassword: "New password", repeatPassword: "Repeat new password",
    passwordShort: "Password must be at least 8 characters.", passwordMismatch: "Passwords do not match.",
  },
  ar: {
    appName: "ميزانية العائلة",
    currency: "د.أ",
    username: "اسم المستخدم", password: "كلمة المرور", signIn: "تسجيل الدخول", signOut: "تسجيل الخروج",
    signingIn: "جارٍ الدخول…", loginFailed: "اسم المستخدم أو كلمة المرور غير صحيحة.",
    notMember: "هذا الحساب غير مرتبط بالعائلة أو تم إيقافه.",
    navAdd: "إضافة", navHistory: "السجل", navBudget: "الميزانية", navDashboard: "لوحة التحكم", navSettings: "الإعدادات",
    income: "الدخل", expense: "المصاريف", savings: "الادخار",
    incomeOne: "دخل", expenseOne: "مصروف", savingsOne: "ادخار",
    amount: "المبلغ", category: "الفئة", date: "التاريخ", paidWith: "طريقة الدفع", note: "ملاحظة (اختياري)",
    notePlaceholder: "مثال: خبز وحليب", save: "حفظ", saving: "جارٍ الحفظ…", saved: "تم الحفظ ✓",
    editEntry: "تعديل القيد", newEntry: "قيد جديد", delete: "حذف", cancel: "إلغاء", back: "رجوع",
    confirmDelete: "حذف هذا القيد؟ لا يمكن التراجع.", deleted: "تم الحذف",
    enterAmount: "أدخل مبلغًا أكبر من صفر.", pickCategory: "اختر فئة.",
    myRecent: "آخر قيودي", locked: "تمت الموافقة: التعديل لأصحاب الصلاحية الكاملة فقط",
    offline: "لا يوجد اتصال بالإنترنت: لم يتم حفظ القيد. حاول مرة أخرى عند الاتصال.",
    month: "الشهر", allTypes: "كل الأنواع", allCategories: "كل الفئات", allMembers: "الجميع",
    needsReview: "بحاجة لمراجعة", onlyUnreviewed: "بحاجة لمراجعة فقط", approve: "موافقة", approveAll: "موافقة على الكل",
    approved: "تمت الموافقة", noEntries: "لا توجد قيود لهذا الشهر بعد.", by: "بواسطة", total: "المجموع",
    planned: "المخطط", actual: "الفعلي", difference: "الفرق", left: "المتبقي",
    toAllocate: "غير مخصص", allocatedOk: "كل دينار له مهمة ✔",
    copyPrev: "نسخ خطة الشهر الماضي", confirmCopy: "استبدال خطة هذا الشهر بخطة الشهر الماضي؟",
    copied: "تم النسخ", budgetHint: "خطط لهذا الشهر: الدخل ناقص المصاريف والادخار يجب أن يساوي صفرًا.",
    year: "السنة", period: "الفترة", totalYear: "السنة كاملة",
    monthByMonth: "شهرًا بشهر", plannedVsActual: "المصاريف: المخطط مقابل الفعلي",
    byMember: "المصاريف حسب فرد العائلة", details: "التفاصيل حسب الفئة",
    lastEntry: "آخر قيد", daysAgo: (n) => n === 0 ? "اليوم" : n === 1 ? "أمس" : `قبل ${n} يوم`,
    entriesThisYear: (n) => `${n} قيد هذه السنة`, unreviewedCount: (n) => `${n} بحاجة لمراجعة`,
    over: "زيادة", under: "أقل", noData: "لا توجد بيانات لهذه الفترة بعد.",
    plannedLabel: (v) => `المخطط ${v}`, tableView: "عرض كجدول", chartView: "عرض كرسم",
    language: "اللغة", theme: "المظهر", themeAuto: "تلقائي", themeLight: "فاتح", themeDark: "داكن",
    signedInAs: "مسجل الدخول باسم", roleadmin: "صلاحية كاملة", rolecontributor: "إدخال فقط",
    household: "العائلة", name: "الاسم", startYear: "سنة البداية",
    shiftIncome: "احتساب الدخل المتأخر للشهر التالي", shiftDay: "ابتداءً من يوم",
    shiftHelp: "مثال: الراتب المدفوع يوم 25 يُحتسب لميزانية الشهر التالي.",
    categories: "الفئات", paymentMethods: "طرق الدفع", members: "أفراد العائلة",
    nameEn: "الاسم (إنجليزي)", nameAr: "الاسم (عربي)", icon: "الرمز", active: "مفعّل", add: "إضافة",
    role: "الدور", membersHelp: "لإضافة حساب جديد شغّل: python tools/manage_members.py add",
    errorGeneric: "حدث خطأ:",
    pending: "غير مراجع",
    changePassword: "تغيير كلمة المرور", newPassword: "كلمة المرور الجديدة", repeatPassword: "أعد كتابة كلمة المرور",
    passwordShort: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.", passwordMismatch: "كلمتا المرور غير متطابقتين.",
  },
};

const MONTHS = {
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  // Levant month names, as used in Jordan
  ar: ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"],
};

let lang = "ar";
try { lang = localStorage.getItem("lang") || "ar"; } catch {}

export function getLang() { return lang; }

export function setLang(l) {
  lang = l === "en" ? "en" : "ar";
  try { localStorage.setItem("lang", lang); } catch {}
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.title = t("appName");
}

export function t(key, ...args) {
  const v = STR[lang][key] ?? STR.en[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

export function monthName(i) { return MONTHS[lang][i]; }
export function monthShort(i) { return lang === "en" ? MONTHS.en[i].slice(0, 3) : MONTHS.ar[i]; }

// Category / payment method display name in the current language.
export function nameOf(item) {
  if (!item) return "—";
  return (lang === "ar" ? item.name_ar : item.name_en) || item.name_en || item.name_ar;
}
