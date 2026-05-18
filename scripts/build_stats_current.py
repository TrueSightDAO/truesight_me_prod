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
REPOS_INDEX_PATH = REPO_ROOT / "stats" / "repos_index.json"

GITHUB_ORG_REPOS_URL = "https://api.github.com/orgs/TrueSightDAO/repos?per_page=100&type=public"
PROGRAMS_LISTING_URL = "https://api.github.com/repos/TrueSightDAO/lineage-credentials/contents/programs?ref=main"
PARTNERS_INVENTORY_URL = "https://raw.githubusercontent.com/TrueSightDAO/agroverse-inventory/main/partners-inventory.json"

# Known production deploy targets per repo. Hand-maintained because most repos
# have a deploy target that isn't discoverable from the repo metadata alone
# (CNAME files only cover Pages; Edgar lives on EC2; some repos are data-only).
# Update when a new public surface ships. Repos not listed here either don't
# deploy (libraries, CLIs, data caches) or the deploy is intentionally private.
REPO_DEPLOY_TARGETS: dict[str, str] = {
    "truesight_me_beta":       "https://truesight.me",
    "truesight_me_prod":       "https://truesight.me",
    "agroverse_shop_beta":     "https://agroverse.shop",
    "dapp":                    "https://dapp.truesight.me",
    "oracle":                  "https://oracle.truesight.me",
    "iching_oracle":           "https://oracle.truesight.me",
    "capoeira":                "https://capoeira.agroverse.shop",
    "sentiment_importer":      "https://edgar.truesight.me",
    "agroverse-inventory":     "https://raw.githubusercontent.com/TrueSightDAO/agroverse-inventory/main/",
    "treasury-cache":          "https://raw.githubusercontent.com/TrueSightDAO/treasury-cache/main/",
    "lineage-credentials":     "https://raw.githubusercontent.com/TrueSightDAO/lineage-credentials/main/",
    "ecosystem_change_logs":   "https://raw.githubusercontent.com/TrueSightDAO/ecosystem_change_logs/main/",
    "agentic_ai_context":      "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/",
}

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
    """Roll up treasury cache by currency AND surface the per-ledger
    breakdown for each currency. Without the ledger breakdown an LLM
    (or human) only sees totals — they can't tell whether $19k of USD
    is sitting in Kirsten's float, in the Main Ledger, or spread across
    five managed ledgers. The breakdown is what makes the number useful.
    """
    if not treasury or not isinstance(treasury, dict):
        return {"error": "treasury cache unavailable"}
    items = treasury.get("items", []) or []
    by_currency: dict[str, dict] = {}
    for it in items:
        ccy = (it.get("currency") or "?").strip()
        qty = it.get("total_quantity") or 0
        usd = it.get("total_value_usd") or 0
        ledgers = it.get("ledgers") or {}
        bucket = by_currency.setdefault(ccy, {
            "total_quantity": 0.0,
            "total_value_usd": 0.0,
            "items": 0,
            "ledger_breakdown": {},
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
        for lname, lqty in (ledgers.items() if isinstance(ledgers, dict) else []):
            try:
                bucket["ledger_breakdown"][lname] = (
                    bucket["ledger_breakdown"].get(lname, 0.0) + float(lqty or 0)
                )
            except (TypeError, ValueError):
                pass
    return {
        "generated_at": treasury.get("generated_at"),
        "schema_version": treasury.get("schema_version"),
        "trigger": treasury.get("trigger"),
        "currency_totals": {
            ccy: {
                "total_quantity": round(v["total_quantity"], 2),
                "total_value_usd": round(v["total_value_usd"], 2),
                "item_count": v["items"],
                "ledger_breakdown": {
                    lname: round(lqty, 2)
                    for lname, lqty in sorted(
                        v["ledger_breakdown"].items(),
                        key=lambda kv: -kv[1],
                    )
                },
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


def write_programs_index() -> int:
    """Enumerate every credentialing program in lineage-credentials/programs/
    and pull each manifest.json into a single index file. LLM agents asking
    "what programs does the DAO run?" / "what's the lineage for capoeira?" /
    "what kinds of practice events does Y program accept?" can answer in
    one fetch.

    Each entry mirrors the manifest schema (program slug, display_name,
    lineage_root, lineage_root_public_key, authorized_attestors,
    practice_types, attestation_types, source_pages, notes) plus a
    canonical credential viewer URL.
    """
    listing = fetch_json(PROGRAMS_LISTING_URL)
    REPOS_INDEX_PATH_PARENT = REPO_ROOT / "stats"
    out_path = REPOS_INDEX_PATH_PARENT / "programs_index.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not isinstance(listing, list):
        out_path.write_text(
            json.dumps({"error": "programs listing unavailable", "programs": []}, indent=2) + "\n",
            encoding="utf-8",
        )
        return 0

    programs: list[dict] = []
    for entry in listing:
        if not isinstance(entry, dict):
            continue
        if entry.get("type") != "dir":
            continue
        slug = entry.get("name")
        if not slug:
            continue
        manifest_url = f"https://raw.githubusercontent.com/TrueSightDAO/lineage-credentials/main/programs/{slug}/manifest.json"
        manifest = fetch_json(manifest_url)
        if not isinstance(manifest, dict):
            programs.append({
                "slug": slug,
                "manifest_url": manifest_url,
                "error": "manifest unavailable",
            })
            continue
        programs.append({
            "slug": slug,
            "program": manifest.get("program"),
            "display_name": manifest.get("display_name") or slug,
            "lineage_root": manifest.get("lineage_root"),
            "lineage_root_public_key": manifest.get("lineage_root_public_key"),
            "authorized_attestors": manifest.get("authorized_attestors") or [],
            "practice_types": list((manifest.get("practice_types") or {}).keys()),
            "attestation_types": list((manifest.get("attestation_types") or {}).keys()),
            "source_pages": manifest.get("source_pages") or [],
            "notes": manifest.get("notes"),
            "manifest_url": manifest_url,
            "credentials_view_url": f"https://truesight.me/credentials/?program={slug}",
        })

    programs.sort(key=lambda p: (p.get("display_name") or "").lower())

    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "generated_at_utc": now,
        "source_listing": PROGRAMS_LISTING_URL,
        "interpretation_hint": (
            "Every credentialing program registered in lineage-credentials. "
            "Each entry mirrors the program's manifest.json: lineage root, "
            "authorized attestors, practice / attestation type catalog, "
            "source page URLs (the practice surface), notes. Use this to "
            "answer 'what programs does the DAO credential?' / 'what's the "
            "lineage for X?' / 'how do you become a Y in this program?'. "
            "Fetch manifest_url for the full schema reference per program."
        ),
        "total_programs": len(programs),
        "programs": programs,
        "platform_design_doc": "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/CREDENTIALING_PLATFORM.md",
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(programs)


def write_partners_index() -> int:
    """Aggregate the per-partner cacao inventory into a single LLM-friendly
    index. Each entry: partner slug, item count, total inventory units,
    SKUs in stock, top-3 products by inventory, link to upstream inventory.

    Note: agroverse-inventory does NOT carry region/address per partner —
    that lives on the Agroverse Partners sheet in the Main Ledger. A
    "by region" digest would need sheet-API credentials (out of scope
    for this unauthenticated builder). For now we surface what's
    available: which partners are active and what they're carrying.
    """
    inv = fetch_json(PARTNERS_INVENTORY_URL)
    out_path = REPO_ROOT / "stats" / "partners_index.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not isinstance(inv, dict) or "partners" not in inv:
        out_path.write_text(
            json.dumps({"error": "partner inventory unavailable", "partners": {}}, indent=2) + "\n",
            encoding="utf-8",
        )
        return 0

    partners_raw = inv.get("partners") or {}
    partners: list[dict] = []
    for slug, body in partners_raw.items():
        items = (body or {}).get("items") or []
        total_units = 0
        sku_count = 0
        top_items: list[dict] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            sku_count += 1
            qty = it.get("inventory") or 0
            try:
                total_units += int(qty)
            except (TypeError, ValueError):
                pass
            top_items.append({
                "product_id": it.get("productId"),
                "product_name": it.get("productName"),
                "inventory": qty,
                "shipment": it.get("shipment"),
                "farm": it.get("farm"),
            })
        top_items.sort(key=lambda x: -(int(x.get("inventory") or 0) if isinstance(x.get("inventory"), (int, str)) and str(x.get("inventory")).lstrip("-").isdigit() else 0))
        partners.append({
            "slug": slug,
            "active_sku_count": sku_count,
            "total_inventory_units": total_units,
            "top_products": top_items[:3],
        })

    partners.sort(key=lambda p: -(p.get("total_inventory_units") or 0))

    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "generated_at_utc": now,
        "source": PARTNERS_INVENTORY_URL,
        "interpretation_hint": (
            "Active Agroverse partner storage points. Each entry: partner "
            "slug, active SKU count, total inventory units across SKUs, and "
            "the top-3 products by stock. Use this for 'which partners are "
            "currently carrying inventory?' / 'who has the most stock?' / "
            "'where can someone buy product X?'. The full per-item detail "
            "(price, GTIN, image, farm of origin, shipment ID) is at the "
            "source URL above. Partner location / region is NOT carried "
            "here — for region grouping you'd need the Agroverse Partners "
            "sheet, which requires authenticated access."
        ),
        "total_active_partners": len(partners),
        "partners": partners,
        "raw_inventory_url": PARTNERS_INVENTORY_URL,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(partners)


def write_repos_index() -> int:
    """Enumerate every public TrueSightDAO repo via the GitHub Org API and
    write stats/repos_index.json. Gives LLM agents a programmatic map of
    the DAO's code surface so "where is X implemented?" / "what does
    Y repo do?" questions resolve in one fetch instead of scraping
    individual READMEs.

    Each entry includes name, description, primary language, topics,
    default branch, pushed_at timestamp, fork/archived flags, and a
    raw README URL on default branch so the LLM can drill straight to
    the README without another GitHub Contents API call.

    Filters out forks and archived repos by default — keeps the index
    focused on live, owned code.

    Returns the number of entries written (0 on failure)."""
    raw = fetch_json(GITHUB_ORG_REPOS_URL)
    if not isinstance(raw, list):
        REPOS_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPOS_INDEX_PATH.write_text(
            json.dumps({"error": "repos listing unavailable", "repos": []}, indent=2) + "\n",
            encoding="utf-8",
        )
        return 0

    entries: list[dict] = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        if r.get("fork") or r.get("archived"):
            continue
        name = r.get("name")
        default_branch = r.get("default_branch") or "main"
        full = r.get("full_name") or f"TrueSightDAO/{name}"
        entries.append({
            "name": name,
            "full_name": full,
            "html_url": r.get("html_url"),
            "description": r.get("description") or "",
            "primary_language": r.get("language"),
            "topics": r.get("topics") or [],
            "default_branch": default_branch,
            "pushed_at": r.get("pushed_at"),
            "updated_at": r.get("updated_at"),
            "readme_url": f"https://raw.githubusercontent.com/{full}/{default_branch}/README.md",
            "tree_url": f"https://github.com/{full}/tree/{default_branch}",
            "deploy_target": REPO_DEPLOY_TARGETS.get(name),
        })

    # Sort by recency of pushed_at so the most-active repos surface first.
    entries.sort(key=lambda r: (r.get("pushed_at") or ""), reverse=True)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "generated_at_utc": now,
        "source": GITHUB_ORG_REPOS_URL,
        "org": "TrueSightDAO",
        "curated_catalog_url": "https://raw.githubusercontent.com/TrueSightDAO/agentic_ai_context/main/PROJECT_INDEX.md",
        "interpretation_hint": (
            "Every active (non-fork, non-archived) public repo in the "
            "TrueSightDAO org, sorted by most-recent push. Each entry "
            "links to its README and its tree on GitHub. For a curated, "
            "purpose-grouped view of the most load-bearing repos see "
            "curated_catalog_url (PROJECT_INDEX.md in agentic_ai_context). "
            "Use this index when answering 'where is X implemented?' / "
            "'what does Y repo do?' / 'show me everything written in Z language'."
        ),
        "total_active_repos": len(entries),
        "repos": entries,
    }
    REPOS_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPOS_INDEX_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return len(entries)


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

    # Repos index — every public TrueSightDAO repo, for code-surface queries.
    m = write_repos_index()
    print(f"✅ wrote {REPOS_INDEX_PATH.relative_to(REPO_ROOT)} ({m} active repos)")

    # Programs index — every credentialing program (capoeira, butterfly, etc.)
    p = write_programs_index()
    print(f"✅ wrote stats/programs_index.json ({p} programs)")

    # Partners index — active Agroverse partner inventory.
    q = write_partners_index()
    print(f"✅ wrote stats/partners_index.json ({q} partners)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
