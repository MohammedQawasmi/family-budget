"""Download all budget data into one Excel file (a sheet per table, plus a
readable 'Entries' sheet with category/member names filled in).

    python tools/export_backup.py                 -> .tmp/backups/budget_backup_YYYY-MM-DD.xlsx
    python tools/export_backup.py --out D:/Backups
"""
import argparse
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.utils import get_column_letter

from supa import ROOT, Client

TABLES = ["household", "members", "categories", "payment_methods", "transactions", "budgets"]


def fetch_all(admin, table):
    order = {"members": "user_id", "budgets": "category_id,month"}.get(table, "id")
    rows, start, step = [], 0, 1000
    while True:
        r = admin.rest("GET", table, params={"select": "*", "order": order, "offset": start, "limit": step})
        r.raise_for_status()
        batch = r.json()
        rows += batch
        if len(batch) < step:
            return rows
        start += step


def write_sheet(wb, title, rows, columns=None):
    ws = wb.create_sheet(title)
    columns = columns or (list(rows[0].keys()) if rows else ["(empty)"])
    ws.append(columns)
    for row in rows:
        ws.append([row.get(c) for c in columns])
    for i, c in enumerate(columns, 1):
        ws.column_dimensions[get_column_letter(i)].width = max(12, min(40, len(c) + 4))
    ws.freeze_panes = "A2"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(ROOT / ".tmp" / "backups"))
    args = p.parse_args()

    admin = Client.admin()
    data = {t: fetch_all(admin, t) for t in TABLES}
    cats = {c["id"]: c for c in data["categories"]}
    pms = {m["id"]: m for m in data["payment_methods"]}
    names = {m["user_id"]: m["display_name"] for m in data["members"]}

    entries = [{
        "date": t["date"], "type": t["type"],
        "category": cats.get(t["category_id"], {}).get("name_en"),
        "category_ar": cats.get(t["category_id"], {}).get("name_ar"),
        "amount": float(t["amount"]), "details": t["details"],
        "payment_method": pms.get(t["payment_method_id"], {}).get("name_en"),
        "added_by": names.get(t["created_by"], "(removed)"), "reviewed": t["reviewed"],
    } for t in sorted(data["transactions"], key=lambda t: (t["date"], t["created_at"]))]

    wb = Workbook()
    wb.remove(wb.active)
    write_sheet(wb, "Entries", entries, ["date", "type", "category", "category_ar", "amount",
                                         "details", "payment_method", "added_by", "reviewed"])
    for t in TABLES:
        write_sheet(wb, t, data[t])

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"budget_backup_{date.today().isoformat()}.xlsx"
    wb.save(path)
    print(f"Saved {len(entries)} entries -> {path}")


if __name__ == "__main__":
    main()
