// Public settings for the app. These are SAFE to publish: the publishable key
// only works together with the database permission rules (Row Level Security).
// NEVER put the secret key (sb_secret_...) in this file or anywhere in app/.
export const CONFIG = {
  supabaseUrl: "https://haloclddkmlotfrtustu.supabase.co",
  publishableKey: "sb_publishable_muCjC3x_rN9ibZtJNjq31A_qVnwqmvE",
  loginDomain: "family.local",   // username "sara" logs in as sara@family.local (must match tools/supa.py)
  currency: "JOD",
};
