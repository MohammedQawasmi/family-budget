"""Shared Supabase helpers for the tools in this folder.

Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from the
project's .env and talks to the Supabase REST and Auth APIs with `requests`.
The secret key gives full database access: use it only here, never in app/.
"""
import os
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
LOGIN_DOMAIN = "family.local"   # username "sara" -> login "sara@family.local"; must match app/config.js

if hasattr(sys.stdout, "reconfigure"):      # Windows console: print Arabic safely
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_env():
    env = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith("SUPABASE_")})
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY") if not env.get(k)]
    if missing:
        sys.exit(f"Missing in .env: {', '.join(missing)}")
    # Accept URLs copied with a trailing /rest/v1/ or /auth/v1/ (a common copy-paste).
    env["SUPABASE_URL"] = re.sub(r"/(rest|auth)/v1/?$", "", env["SUPABASE_URL"].rstrip("/")).rstrip("/")
    return env


ENV = load_env()
URL = ENV["SUPABASE_URL"]
PUBLISHABLE = ENV["SUPABASE_PUBLISHABLE_KEY"]
SECRET = ENV["SUPABASE_SECRET_KEY"]


def to_login(username):
    """'sara' -> 'sara@family.local'. Full e-mails are passed through unchanged."""
    username = username.strip().lower()
    return username if "@" in username else f"{username}@{LOGIN_DOMAIN}"


class Client:
    """Tiny REST client. Admin client uses the secret key (bypasses RLS);
    a user client signs in with the publishable key and is subject to RLS."""

    def __init__(self, key, token=None):
        self.key = key
        self.token = token

    @classmethod
    def admin(cls):
        return cls(SECRET)

    @classmethod
    def sign_in(cls, login, password):
        r = requests.post(f"{URL}/auth/v1/token?grant_type=password",
                          headers={"apikey": PUBLISHABLE},
                          json={"email": to_login(login), "password": password}, timeout=30)
        if r.status_code != 200:
            raise RuntimeError(f"Sign-in failed for {login}: {r.status_code} {r.text}")
        return cls(PUBLISHABLE, r.json()["access_token"])

    @classmethod
    def anonymous(cls):
        return cls(PUBLISHABLE)

    def headers(self, extra=None):
        h = {"apikey": self.key, "Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        elif self.key == SECRET:
            h["Authorization"] = f"Bearer {SECRET}"
        if extra:
            h.update(extra)
        return h

    # --- PostgREST ---
    def rest(self, method, table, params=None, json=None, prefer="return=representation"):
        r = requests.request(method, f"{URL}/rest/v1/{table}", params=params, json=json,
                             headers=self.headers({"Prefer": prefer}), timeout=60)
        return r

    def select(self, table, **params):
        params.setdefault("select", "*")
        r = self.rest("GET", table, params=params)
        r.raise_for_status()
        return r.json()

    def rpc(self, fn, args=None):
        return requests.post(f"{URL}/rest/v1/rpc/{fn}", json=args or {}, headers=self.headers(), timeout=60)

    # --- Auth admin (secret key only) ---
    def auth_admin(self, method, path, json=None, params=None):
        r = requests.request(method, f"{URL}/auth/v1/admin/{path}", json=json, params=params,
                             headers=self.headers(), timeout=30)
        return r

    def list_users(self):
        users, page = [], 1
        while True:
            r = self.auth_admin("GET", "users", params={"page": page, "per_page": 200})
            r.raise_for_status()
            batch = r.json().get("users", [])
            users += batch
            if len(batch) < 200:
                return users
            page += 1


def household_id(admin):
    rows = admin.select("household", select="id", order="created_at.asc", limit=1)
    if not rows:
        sys.exit("No household found. Run supabase/schema.sql in the Supabase SQL editor first.")
    return rows[0]["id"]
