"""Create and manage family member accounts.

Examples (run from the project folder):
  python tools/manage_members.py list
  python tools/manage_members.py add --username dad  --name "Mohammed" --role admin
  python tools/manage_members.py add --username sara --name "Sara" --role contributor --lang ar
  python tools/manage_members.py reset-password --username sara
  python tools/manage_members.py set-role --username sara --role admin
  python tools/manage_members.py disable --username sara      (blocks access, keeps her entries)
  python tools/manage_members.py enable  --username sara

If --password is left out you are asked for it (hidden), or a random one is
generated and printed once with --generate.
"""
import argparse
import getpass
import secrets
import string
import sys

from supa import Client, household_id, to_login


def ask_password(args):
    if args.password:
        return args.password
    if args.generate:
        alphabet = "abcdefghjkmnpqrstuvwxyz23456789"   # no look-alikes (l/1, o/0) for easy typing on phones
        pw = "".join(secrets.choice(alphabet) for _ in range(10))
        if getattr(args, "save_to", None):
            # Write to a local file instead of the screen, so the password never shows in logs or chat.
            with open(args.save_to, "a", encoding="utf-8") as f:
                f.write(f"{args.username:15} {pw}\n")
            print(f"Generated password saved to {args.save_to}")
        else:
            print(f"Generated password (shown once): {pw}")
        return pw
    pw = getpass.getpass("Password (min 8 chars): ")
    if pw != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match.")
    return pw


def find_user(admin, username):
    login = to_login(username)
    for u in admin.list_users():
        if (u.get("email") or "").lower() == login:
            return u
    sys.exit(f"No account for '{username}' ({login}).")


def cmd_list(admin, args):
    members = {m["user_id"]: m for m in admin.select("members")}
    users = admin.list_users()
    if not users:
        print("No accounts yet.")
    for u in users:
        m = members.get(u["id"])
        login = u.get("email", "")
        if m:
            status = "active" if m["active"] else "DISABLED"
            print(f"{login:30} {m['display_name']:15} {m['role']:12} {m['lang']}  {status}")
        else:
            print(f"{login:30} (auth user without member row)")


def cmd_add(admin, args):
    if len(args.username) < 2 or not all(c.isalnum() or c in "._-" for c in args.username.split("@")[0]):
        sys.exit("Username: letters, digits, . _ - only.")
    pw = ask_password(args)
    if len(pw) < 8:
        sys.exit("Password must be at least 8 characters.")
    hid = household_id(admin)
    r = admin.auth_admin("POST", "users", json={
        "email": to_login(args.username), "password": pw, "email_confirm": True,
        "user_metadata": {"display_name": args.name},
    })
    if r.status_code not in (200, 201):
        sys.exit(f"Could not create account: {r.status_code} {r.text}")
    uid = r.json()["id"]
    r = admin.rest("POST", "members", json={
        "user_id": uid, "household_id": hid, "display_name": args.name,
        "role": args.role, "lang": args.lang,
    })
    if r.status_code >= 300:
        admin.auth_admin("DELETE", f"users/{uid}")   # roll back so no orphan login exists
        sys.exit(f"Could not create member row: {r.status_code} {r.text}")
    print(f"Created {args.role} '{args.name}'. Login with username: {args.username}")


def cmd_reset_password(admin, args):
    u = find_user(admin, args.username)
    pw = ask_password(args)
    if len(pw) < 8:
        sys.exit("Password must be at least 8 characters.")
    r = admin.auth_admin("PUT", f"users/{u['id']}", json={"password": pw})
    r.raise_for_status()
    print(f"Password updated for {args.username}.")


def update_member(admin, username, fields):
    u = find_user(admin, username)
    r = admin.rest("PATCH", "members", params={"user_id": f"eq.{u['id']}"}, json=fields)
    r.raise_for_status()
    if not r.json():
        sys.exit("Member row not found.")
    return u


def cmd_set_role(admin, args):
    update_member(admin, args.username, {"role": args.role})
    print(f"{args.username} is now {args.role}.")


def cmd_disable(admin, args):
    u = update_member(admin, args.username, {"active": False})
    # Also ban the login so existing sessions stop refreshing.
    admin.auth_admin("PUT", f"users/{u['id']}", json={"ban_duration": "876000h"})
    print(f"{args.username} disabled. Their entries are kept.")


def cmd_enable(admin, args):
    u = update_member(admin, args.username, {"active": True})
    admin.auth_admin("PUT", f"users/{u['id']}", json={"ban_duration": "none"})
    print(f"{args.username} enabled.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    a = sub.add_parser("add")
    a.add_argument("--username", required=True)
    a.add_argument("--name", required=True, help="Name shown in the app")
    a.add_argument("--role", choices=["admin", "contributor"], default="contributor")
    a.add_argument("--lang", choices=["ar", "en"], default="ar")
    for name in ("reset-password", "set-role", "disable", "enable"):
        s = sub.add_parser(name)
        s.add_argument("--username", required=True)
        if name == "set-role":
            s.add_argument("--role", choices=["admin", "contributor"], required=True)
    for s in (a, sub.choices["reset-password"]):
        s.add_argument("--password")
        s.add_argument("--generate", action="store_true", help="Generate a random password")
        s.add_argument("--save-to", dest="save_to", help="With --generate: append 'username password' to this file instead of printing it")
    args = p.parse_args()
    admin = Client.admin()
    {"list": cmd_list, "add": cmd_add, "reset-password": cmd_reset_password,
     "set-role": cmd_set_role, "disable": cmd_disable, "enable": cmd_enable}[args.cmd](admin, args)


if __name__ == "__main__":
    main()
