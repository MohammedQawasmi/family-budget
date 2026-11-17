"""Security test for the database permissions (Row Level Security).

Creates temporary test accounts (1 admin, 2 kids), checks what each one can
and cannot do, then deletes the test accounts and their data.
Run after every change to supabase/schema.sql:

    python tools/test_rls.py
"""
import secrets
import sys
import uuid
from datetime import date

import requests

from supa import URL, PUBLISHABLE, Client, household_id, to_login

PREFIX = "rlstest-"
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not ok else ""))


def make_user(admin, hid, tag, role):
    username = f"{PREFIX}{tag}-{uuid.uuid4().hex[:6]}"
    pw = secrets.token_urlsafe(12)
    r = admin.auth_admin("POST", "users", json={"email": to_login(username), "password": pw, "email_confirm": True})
    r.raise_for_status()
    uid = r.json()["id"]
    admin.rest("POST", "members", json={"user_id": uid, "household_id": hid, "display_name": username,
                                        "role": role}).raise_for_status()
    return {"id": uid, "username": username, "pw": pw}


def cleanup(admin):
    for u in admin.list_users():
        if (u.get("email") or "").startswith(PREFIX):
            admin.rest("DELETE", "transactions", params={"created_by": f"eq.{u['id']}"})
            admin.auth_admin("DELETE", f"users/{u['id']}")


def main():
    admin = Client.admin()
    hid = household_id(admin)
    cleanup(admin)   # leftovers from an interrupted run

    cats = admin.select("categories", select="id,type", household_id=f"eq.{hid}")
    exp_cat = next(c["id"] for c in cats if c["type"] == "expense")
    inc_cat = next(c["id"] for c in cats if c["type"] == "income")

    users = {}
    try:
        users["parent"] = make_user(admin, hid, "parent", "admin")
        users["kidA"] = make_user(admin, hid, "kida", "contributor")
        users["kidB"] = make_user(admin, hid, "kidb", "contributor")
        parent = Client.sign_in(users["parent"]["username"], users["parent"]["pw"])
        kid_a = Client.sign_in(users["kidA"]["username"], users["kidA"]["pw"])
        kid_b = Client.sign_in(users["kidB"]["username"], users["kidB"]["pw"])
        anon = Client.anonymous()

        print("Anonymous visitor (no login):")
        for table in ("transactions", "members", "budgets", "household", "categories"):
            r = anon.rest("GET", table, params={"select": "*"})
            check(f"cannot read {table}", r.status_code in (401, 403) or r.json() == [], f"{r.status_code} {r.text[:80]}")
        r = requests.post(f"{URL}/auth/v1/signup", headers={"apikey": PUBLISHABLE},
                          json={"email": f"{PREFIX}stranger@example.com", "password": secrets.token_urlsafe(12)}, timeout=30)
        check("public sign-up is disabled", r.status_code >= 400,
              "anyone can create an account. Turn OFF 'Allow new users to sign up' in Supabase → Authentication")

        print("Kid A:")
        r = kid_a.rest("POST", "transactions", json={
            "type": "expense", "category_id": exp_cat, "amount": 1.250, "details": "rls test",
            "created_by": users["kidB"]["id"], "reviewed": True, "date": date.today().isoformat()})
        check("can add an entry", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
        tx = r.json()[0] if r.status_code == 201 else {}
        check("entry is owned by kid A even when spoofing created_by", tx.get("created_by") == users["kidA"]["id"])
        check("entry cannot self-approve (reviewed=false)", tx.get("reviewed") is False)
        tx_id = tx.get("id")

        r = kid_a.rest("POST", "transactions", json={"type": "expense", "category_id": inc_cat, "amount": 5})
        check("category type must match entry type", r.status_code >= 400)

        r = kid_a.rest("PATCH", "transactions", params={"id": f"eq.{tx_id}"}, json={"amount": 2.5})
        check("can edit own unreviewed entry", r.status_code == 200 and r.json() and float(r.json()[0]["amount"]) == 2.5)
        r = kid_a.rest("PATCH", "transactions", params={"id": f"eq.{tx_id}"}, json={"reviewed": True})
        check("cannot approve own entry", r.status_code >= 400 or (r.json() and r.json()[0]["reviewed"] is False))
        r = kid_a.rest("DELETE", "transactions", params={"id": f"eq.{tx_id}"})
        check("cannot delete entries", r.status_code >= 400 or r.json() == [])

        r = parent.rest("POST", "transactions", json={"type": "expense", "category_id": exp_cat, "amount": 9})
        parent_tx = r.json()[0]["id"] if r.status_code == 201 else None
        check("(parent adds an entry, auto-approved)", r.status_code == 201 and r.json()[0]["reviewed"] is True)

        rows = kid_a.select("transactions", select="id,created_by")
        check("sees only own entries", rows and all(x["created_by"] == users["kidA"]["id"] for x in rows))
        r = kid_a.rest("PATCH", "transactions", params={"id": f"eq.{parent_tx}"}, json={"amount": 1})
        check("cannot edit someone else's entry", r.status_code >= 400 or r.json() == [])

        check("cannot read budgets", kid_a.select("budgets") == [])
        r = kid_a.rest("POST", "budgets", json={"household_id": hid, "category_id": exp_cat,
                                                "month": date.today().replace(day=1).isoformat(), "amount": 1})
        check("cannot write budgets", r.status_code >= 400)
        members = kid_a.select("members", select="user_id")
        check("sees only own member row", [m["user_id"] for m in members] == [users["kidA"]["id"]])
        r = kid_a.rest("PATCH", "members", params={"user_id": f"eq.{users['kidA']['id']}"}, json={"role": "admin"})
        check("cannot make self admin", r.status_code >= 400 or r.json() == [])
        r = kid_a.rest("PATCH", "household", params={"id": f"eq.{hid}"}, json={"name": "hacked"})
        check("cannot change household settings", r.status_code >= 400 or r.json() == [])
        r = kid_a.rest("POST", "categories", json={"household_id": hid, "type": "expense", "name_en": "x", "name_ar": "x"})
        check("cannot add categories", r.status_code >= 400)
        check("can read categories (needed for the add form)", len(kid_a.select("categories")) > 0)
        r = kid_a.rpc("monthly_totals", {"p_year": date.today().year})
        check("report function returns only own totals", r.status_code == 200 and
              all(x["created_by"] == users["kidA"]["id"] for x in r.json()), r.text[:120])
        r = kid_a.rpc("set_my_lang", {"p_lang": "en"})
        check("can change own language", r.status_code in (200, 204), r.text[:120])

        print("Kid B:")
        check("cannot see kid A's entry", kid_b.select("transactions", id=f"eq.{tx_id}") == [])
        r = kid_b.rest("PATCH", "transactions", params={"id": f"eq.{tx_id}"}, json={"amount": 99})
        check("cannot edit kid A's entry", r.status_code >= 400 or r.json() == [])

        print("Parent (admin):")
        check("sees everyone's entries", len(parent.select("transactions", id=f"in.({tx_id},{parent_tx})")) == 2)
        r = parent.rest("PATCH", "transactions", params={"id": f"eq.{tx_id}"}, json={"reviewed": True})
        check("can approve a kid's entry", r.status_code == 200 and r.json()[0]["reviewed"] is True
              and r.json()[0]["reviewed_by"] == users["parent"]["id"])
        check("sees all members", len(parent.select("members")) >= 3)
        check("can read budgets", parent.rest("GET", "budgets", params={"select": "*"}).status_code == 200)

        print("Kid A after approval:")
        r = kid_a.rest("PATCH", "transactions", params={"id": f"eq.{tx_id}"}, json={"amount": 3})
        check("approved entry is locked", r.status_code >= 400 or r.json() == [])

        print("Disabled member:")
        admin.rest("PATCH", "members", params={"user_id": f"eq.{users['kidB']['id']}"}, json={"active": False})
        r = kid_b.rest("POST", "transactions", json={"type": "expense", "category_id": exp_cat, "amount": 1})
        check("cannot add entries", r.status_code >= 400)
        check("cannot read categories", kid_b.select("categories") == [])

        r = parent.rest("DELETE", "transactions", params={"id": f"eq.{tx_id}"})
        check("parent can delete entries", r.status_code == 200 and len(r.json()) == 1)
    finally:
        cleanup(admin)
        stray = [u for u in admin.list_users() if (u.get("email") or "").startswith(PREFIX)]
        print(f"Cleanup: {'done' if not stray else f'{len(stray)} test users left!'}")

    passed = sum(results)
    print(f"\n{passed}/{len(results)} checks passed.")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
