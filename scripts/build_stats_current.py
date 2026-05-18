"""build_stats_current.py — aggregate public TrueSight DAO data into a single
self-contained `stats/current.json` for LLM agents (and any HTTP client) that
need headline numbers without executing the landing page's JavaScript.

Reads only public raw.github URLs — no credentials, no service-account JSON,
no rate-limit-prone APIs. Safe to run from any environment.

Output: `<repo-root>/stats/current.json` (overwrites in place).

Schema: pre-aggregated headline numbers (members, governors, treasury totals,
inventory counts, managed-ledger names) + canonical-source URLs so an LLM
can drill deeper. Designed to be the single fetch a curious agent makes
after reading `llms.txt`.

Refreshed by `.github/workflows/stats-refresh.yml` every 6 hours.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = REPO_ROOT / "stats" / "current.json"
BEERHALL_ARCHIVE_PATH = REPO_ROOT / "stats" / "beerhall_archive.json"

SOURCES = {
    "treasury_cache": "https://raw.githubusercontent.com/TrueSightDAO/treasury-cache/main/dao_offchain_treasury.json",
    "members_index": "https://raw.githubusercontent.com/TrueSightDAO/lineage-credentials/main/_cache/index.json",
    "store_inventory": "https://raw.githubusercontent.com/TrueSightDAO/agroverse-inventory/main/store-inventory.json",
    "partner_inventory": "https://raw.githubusercontent.com/TrueSightDAO/agroverse-inventory/main/partners-inventory.json",
    "beerhall_listing": "https://api.github.com/repos/TrueSightDAO/ecosystem_change_logs/contents/beer_hall/entries?ref=main",
}

BEERHALL_RAW_BASE = "https://raw.githubusercontent.com/TrueSightDAO/ecosystem_change_logs/main/beer_hall/entries"


def fetch_json(url: str) -> dict | list | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "truesight-stats-builder/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[warn] failed to fetch {url}: {e}", file=sys.stderr)
        return None


def summarize_treasury(treasury: dict | None) -> dict:
    if not treasury or not isinstance(treasury, dict):
        return {"error": "treasury cache unavailable"}
    items = treasury.get("items", []) or []
    by_currency: dict[str, dict] = {}
    for it in items:
        ccy = (it.get("currency") or "?").strip()
        qty = it.get("total_quantity") or 0
        usd = it.get("total_value_usd") or 0
        ledger_count = len((it.get("ledgers") or {}))
        bucket = by_currency.setdefault(ccy, {
            "total_quantity": 0.0,
            "total_value_usd": 0.0,
            "items": 0,
            "ledger_breakdown_keys": 0,
        })
        try:
            bucket["total_quantity"] += float(qty)
        except (TypeError, ValueError):
            pass
        try:
            bucket["total_value_usd"] += float(usd)
        except (TypeError, ValueError):
            pass
        bucket["items"] += 1
        bucket["ledger_breakdown_keys"] = max(bucket["ledger_breakdown_keys"], ledger_count)
    return {
        "generated_at": treasury.get("generated_at"),
        "schema_version": treasury.get("schema_version"),
        "trigger": treasury.get("trigger"),
        "currency_totals": {
            ccy: {
                "total_quantity": round(v["total_quantity"], 2),
                "total_value_usd": round(v["total_value_usd"], 2),
                "item_count": v["items"],
            }
            for ccy, v in sorted(by_currency.items())
        },
    }


def summarize_members(members_idx: dict | None) -> dict:
    if not members_idx or not isinstance(members_idx, dict):
        return {"error": "members index unavailable"}
    members = members_idx.get("members") or []
    governors = [m for m in members if m.get("is_governor")]
    governors_sorted = sorted(governors, key=lambda m: -(m.get("voting_rights") or 0))
    total_tdg_controlled = 0.0
    for m in members:
        try:
            total_tdg_controlled += float(m.get("total_tdg_controlled") or 0)
        except (TypeError, ValueError):
            pass
    return {
        "generated_at": members_idx.get("generated_at"),
        "total_contributors": members_idx.get("count") or len(members),
        "total_tdg_controlled_sum": round(total_tdg_controlled, 2),
        "governors_count": len(governors),
        "governors": [
            {
                "display_name": g.get("display_name"),
                "slug": g.get("slug"),
                "voting_power_pct": g.get("voting_rights"),
                "tdg_controlled": g.get("total_tdg_controlled"),
                "contribution_count": g.get("total_contributions"),
                "profile_url": f"https://truesight.me/credentials/#{g.get('slug')}",
            }
            for g in governors_sorted
        ],
        "directory_url": "https://truesight.me/members.html",
    }


def parse_beerhall_listing(listing: list | None) -> list[dict]:
    """Parse GitHub Contents API directory listing into a flat list of
    {date, slug, filename, raw_url} sorted newest-first. Returns empty
    list on any failure so downstream callers can degrade gracefully.

    Filename convention: beer-hall_YYYY-MM-DDTHHMMSSZ_<slug>.md
    """
    import re
    if not isinstance(listing, list):
        return []
    pat = re.compile(r"^beer-hall_(\d{4}-\d{2}-\d{2})T(\d{6})Z_(.+)\.md$")
    entries: list[dict] = []
    for f in listing:
        name = (f or {}).get("name") or ""
        m = pat.match(name)
        if not m:
            continue
        entries.append({
            "date": m.group(1),
            "slug": m.group(3),
            "filename": name,
            "raw_url": f"{BEERHALL_RAW_BASE}/{name}",
        })
    entries.sort(key=lambda e: (e["date"], e["filename"]), reverse=True)
    return entries


def summarize_beerhall(listing: list | None, top_n: int = 10) -> dict:
    """Headline view: 10 most recent Beer Hall digests for the
    single-fetch case. Includes a pointer to the full archive for
    historical lookups.
    """
    entries = parse_beerhall_listing(listing)
    if not entries:
        return {"error": "beerhall listing unavailable"}
    return {
        "total_entries": len(entries),
        "recent": entries[:top_n],
        "full_archive_url": "https://truesight.me/stats/beerhall_archive.json",
        "directory_url": "https://github.com/TrueSightDAO/ecosystem_change_logs/tree/main/beer_hall/entries",
        "raw_url_pattern": f"{BEERHALL_RAW_BASE}/<filename>",
        "human_index_url": "https://truesight.me/beerhall/updates.html",
        "interpretation_hint": (
            "Each entry is a community digest summarizing recent shipped work. "
            "The slug encodes the headline themes; the date is when the digest "
            "was published. Fetch raw_url for the full markdown body. "
            "For digests older than the 10 most-recent shown here, fetch "
            "full_archive_url for the complete historical index."
        ),
    }


def write_beerhall_archive(listing: list | None) -> int:
    """Write the full Beer Hall archive index to stats/beerhall_archive.json
    so LLM agents asking historical questions ('what shipped in March?',
    'how did the credentialing arc start?') can walk back through every
    digest without hitting the GitHub Contents API directly. Returns the
    number of entries written (0 on failure)."""
    entries = parse_beerhall_listing(listing)
    if not entries:
        BEERHALL_ARCHIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        BEERHALL_ARCHIVE_PATH.write_text(
            json.dumps({"error": "beerhall listing unavailable", "entries": []}, indent=2) + "\n",
            encoding="utf-8",
        )
        return 0
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "generated_at_utc": now,
        "source": "https://api.github.com/repos/TrueSightDAO/ecosystem_change_logs/contents/beer_hall/entries?ref=main",
        "interpretation_hint": (
            "Every Beer Hall digest ever published, sorted newest-first. "
            "Each entry: date, slug, filename, raw_url. Use the slug as "
            "a quick topic hint; fetch raw_url for the full markdown body. "
            "For headline numbers + the 10 most-recent entries, fetch "
            "https://truesight.me/stats/current.json instead."
        ),
        "total_entries": len(entries),
        "entries": entries,
    }
    BEERHALL_ARCHIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BEERHALL_ARCHIVE_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return len(entries)


def summarize_inventory(store_inv: dict | None, partner_inv: dict | None) -> dict:
    out: dict = {}
    if store_inv and isinstance(store_inv, dict):
        items = store_inv.get("inventory") or []
        out["stores"] = {
            "generated_at": store_inv.get("generatedAt"),
            "store_count": len({(i.get("store_name") or i.get("storeName") or "") for i in items if isinstance(i, dict)}),
            "line_items": len(items),
        }
    if partner_inv and isinstance(partner_inv, dict):
        partners = partner_inv.get("partners") or []
        out["partners"] = {
            "generated_at": partner_inv.get("generatedAt"),
            "partner_count": len(partners),
        }
    return out or {"error": "inventory snapshots unavailable"}


def build_stats() -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    treasury = fetch_json(SOURCES["treasury_cache"])
    members_idx = fetch_json(SOURCES["members_index"])
    store_inv = fetch_json(SOURCES["store_inventory"])
    partner_inv = fetch_json(SOURCES["partner_inventory"])
    beerhall = fetch_json(SOURCES["beerhall_listing"])

    return {
        "generated_at_utc": now,
        "regenerated_by": "https://github.com/TrueSightDAO/truesight_me_beta/blob/main/.github/workflows/stats-refresh.yml",
        "source_script": "https://github.com/TrueSightDAO/truesight_me_beta/blob/main/scripts/build_stats_current.py",
        "llms_orientation": "https://truesight.me/llms.txt",
        "north_star": {
            "purpose": "Heal the world with love.",
            "mission": "Restore 10,000 hectares of Amazon rainforest.",
        },
        "members": summarize_members(members_idx),
        "treasury": summarize_treasury(treasury),
        "inventory": summarize_inventory(store_inv, partner_inv),
        "recent_beerhall_digests": summarize_beerhall(beerhall),
        "canonical_sources": SOURCES,
        "canonical_context_docs": {
            "advisory_base":      "https://raw.githubusercontent.com/TrueSightDAO/ecosystem_change_logs/main/advisory/BASE.md",
            "advisory_snapshot":  "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/ADVISORY_SNAPSHOT.md",
            "project_index":      "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/PROJECT_INDEX.md",
            "credentialing_platform": "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/CREDENTIALING_PLATFORM.md",
            "workspace_context":  "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/WORKSPACE_CONTEXT.md",
            "context_updates":    "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/CONTEXT_UPDATES.md",
        },
        "public_web_surfaces": {
            "landing":      "https://truesight.me/",
            "whitepaper":   "https://truesight.me/whitepaper/",
            "members":      "https://truesight.me/members.html",
            "credentials":  "https://truesight.me/credentials/",
            "programs":     "https://truesight.me/programs.html",
            "blog":         "https://truesight.me/blog/",
            "beerhall":     "https://truesight.me/beerhall/updates.html",
            "dapp":         "https://dapp.truesight.me/",
        },
    }


def main() -> int:
    # Stats (headline + 10 recent digests)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    stats = build_stats()
    OUT_PATH.write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"✅ wrote {OUT_PATH.relative_to(REPO_ROOT)}")

    # Full Beer Hall archive (historical lookups). Reuse the listing fetched
    # for stats to avoid a duplicate API hit.
    beerhall_listing = fetch_json(SOURCES["beerhall_listing"])
    n = write_beerhall_archive(beerhall_listing)
    print(f"✅ wrote {BEERHALL_ARCHIVE_PATH.relative_to(REPO_ROOT)} ({n} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
