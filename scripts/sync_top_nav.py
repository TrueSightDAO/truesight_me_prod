"""sync_top_nav.py — enforce a consistent <nav class="site-header"> across every
HTML page in the truesight_me site.

The canonical nav lives in index.html. This script:

  1. Computes a path prefix per page based on its directory depth so relative
     links (index.html, about-us.html, blog/index.html, ...) resolve from each
     page's location.
  2. Finds the <nav class="site-header">...</nav> block in each page.
  3. Replaces it with the canonical nav, prefix-adjusted.
  4. (--check) Exits non-zero with a diff if any page's nav diverges. Used by
     CI / pre-commit to keep the nav consistent without re-running this sync.

Pages with NO existing <nav class="site-header"> are skipped (they are likely
fragments, error pages, or 404s). The first run prints the count of touched
files; subsequent runs are idempotent.

CLI:
  python3 scripts/sync_top_nav.py            # rewrite all pages
  python3 scripts/sync_top_nav.py --check    # report divergence without writing
  python3 scripts/sync_top_nav.py --dry-run  # show diff per page without writing
"""
from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
# Capture leading-whitespace on the line so we replace consistently regardless
# of how deeply the original file indented its <nav>. We re-emit the canonical
# with the same leading whitespace prefixed to every line — preserving the
# source file's visual indent without inheriting its drift.
NAV_START_RE = re.compile(r'(?m)^([ \t]*)<nav class="site-header">')
NAV_END_RE = re.compile(r'</nav>', re.IGNORECASE)

# Canonical nav template — emitted with NO leading whitespace; the script
# re-indents each line to match the source file's existing indent for `<nav>`
# at write time, preserving each file's visual indent without inheriting drift.
#
# {p} is the relative-path prefix needed for each page to reach the site root
# ("" for top-level pages, "../" for /subdir/, "../../" for /blog/posts/, ...).
# Root-absolute links (/whitepaper/) and external links (https://truesight.me/...)
# are left as-is — they resolve consistently from any depth.
CANONICAL_NAV_TEMPLATE = """\
<nav class="site-header">
  <div class="header-container">
    <a href="{p}index.html" class="header-logo">
      <img
        src="https://static.wixstatic.com/media/0e2cde_f81b16c82ebe4aaca4b5ce54b819a693~mv2.png/v1/fill/w_622,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/20240612_truesight_dao_logo_long.png"
        alt="TrueSight DAO"
        width="155"
        height="40"
        loading="eager"
      />
    </a>
    <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
    </button>
    <ul class="nav-menu" aria-hidden="true">
      <li><a href="{p}index.html">Home</a></li>
      <li><a href="{p}about-us.html">About Us</a></li>
      <li>
        <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Projects</button>
        <ul class="dropdown-menu" aria-expanded="false">
          <li><a href="{p}agroverse.html">Agroverse Community</a></li>
          <li><a href="{p}sunmint.html">Sunmint Program</a></li>
          <li><a href="{p}edgar.html">Edgar Platform</a></li>
          <li><a href="{p}programs.html">Programs</a></li>
          <li><a href="{p}fundraisers.html">Fundraisers</a></li>
        </ul>
      </li>
      <li><a href="https://truesight.me/proposals" target="_blank" rel="noreferrer noopener">Proposals</a></li>
      <li>
        <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Community</button>
        <ul class="dropdown-menu" aria-expanded="false">
          <li><a href="https://truesight.me/quests" target="_blank" rel="noreferrer noopener">Community Challenges</a></li>
          <li><a href="https://truesight.me/governors" target="_blank" rel="noreferrer noopener">Community Leaders</a></li>
          <li><a href="{p}members.html">Members Directory</a></li>
          <li><a href="https://truesight.me/recurring-tdg-awards" target="_blank" rel="noreferrer noopener">Ongoing Awards</a></li>
          <li><a href="https://truesight.me/submissions/scored-and-to-be-tokenized" target="_blank" rel="noreferrer noopener">Upcoming Awards</a></li>
          <li><a href="https://truesight.me/beerhall" target="_blank" rel="noreferrer noopener">Join Chat</a></li>
          <li><a href="{p}beerhall/updates.html">Beer Hall digests</a></li>
        </ul>
      </li>
      <li>
        <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Resources</button>
        <ul class="dropdown-menu" aria-expanded="false">
          <li><a href="{p}faq.html">Frequently Asked Questions</a></li>
          <li><a href="/whitepaper/">View Whitepaper</a></li>
          <li><a href="https://truesight.me/tokenomics" target="_blank" rel="noreferrer noopener">Tokenomics</a></li>
          <li><a href="https://truesight.me/dapp" target="_blank" rel="noreferrer noopener">Web App</a></li>
          <li><a href="https://truesight.me/ledger" target="_blank" rel="noreferrer noopener">Contributions Record</a></li>
          <li><a href="https://truesight.me/roadmap" target="_blank" rel="noreferrer noopener">Roadmap</a></li>
        </ul>
      </li>
      <li><a href="{p}blog/index.html">Blog</a></li>
    </ul>
  </div>
</nav>"""


def iter_html_files(root: Path):
    skip_dirs = {".git", "node_modules", "_site", ".cache"}
    for path in sorted(root.rglob("*.html")):
        if any(part in skip_dirs for part in path.relative_to(root).parts):
            continue
        yield path


def depth_prefix(path: Path) -> str:
    """Compute the "../" prefix needed for the page at `path` to reach root."""
    rel = path.relative_to(REPO_ROOT)
    # `parts` for "blog/posts/foo.html" → ("blog", "posts", "foo.html")
    # depth = number of directories above the file = len(parts) - 1
    depth = len(rel.parts) - 1
    return "../" * depth


def find_nav_block(text: str) -> tuple[int, int, str] | None:
    """Return (start, end, indent) span for the <nav class="site-header">…</nav>
    block. `start` is the column-0 position of the line containing <nav>, so the
    replace consumes the leading whitespace too. `indent` is that leading
    whitespace, which we re-apply to every line of the canonical so the file's
    visual indent is preserved.
    """
    m_start = NAV_START_RE.search(text)
    if not m_start:
        return None
    indent = m_start.group(1)
    end_search = NAV_END_RE.search(text, m_start.end())
    if not end_search:
        return None
    # Span starts AFTER the leading whitespace (m_start.start() + len(indent))
    # so original[:start] already contains the indent that the canonical's
    # re-indented output will inherit on its first line. Wait — simpler: the
    # match start IS the start of the line content (right after indent), and
    # we re-indent the canonical, prefixing each line with `indent`. So the
    # first line's canonical output already includes the indent. To avoid
    # double-indenting, the span starts at m_start.start() + len(indent).
    return (m_start.start() + len(indent), end_search.end(), indent)


def render_canonical(prefix: str, indent: str) -> str:
    body = CANONICAL_NAV_TEMPLATE.format(p=prefix)
    lines = body.split("\n")
    # First line gets no extra indent — the source file's leading whitespace
    # on the original <nav> line is preserved by the splice. Subsequent lines
    # get the same indent prepended so they align under <nav>.
    return lines[0] + "\n" + "\n".join(indent + ln if ln else ln for ln in lines[1:])


def process_file(path: Path, *, check: bool, dry_run: bool) -> tuple[str, str | None]:
    """Returns (status, diff_text). status ∈ {'ok', 'rewrote', 'divergent', 'skipped'}."""
    original = path.read_text(encoding="utf-8")
    span = find_nav_block(original)
    if not span:
        return ("skipped", None)
    start, end, indent = span
    existing_nav = original[start:end]
    prefix = depth_prefix(path)
    canonical = render_canonical(prefix, indent)

    if existing_nav == canonical:
        return ("ok", None)

    rel = path.relative_to(REPO_ROOT)
    diff = "\n".join(difflib.unified_diff(
        existing_nav.splitlines(),
        canonical.splitlines(),
        fromfile=f"a/{rel}",
        tofile=f"b/{rel}",
        lineterm="",
    ))

    if check or dry_run:
        return ("divergent", diff)

    new_text = original[:start] + canonical + original[end:]
    path.write_text(new_text, encoding="utf-8")
    return ("rewrote", diff)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="Report divergent files and exit non-zero; do not rewrite.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Show diff per divergent file but do not rewrite.")
    ap.add_argument("--quiet", action="store_true",
                    help="Only print the summary line.")
    args = ap.parse_args()

    counts = {"ok": 0, "rewrote": 0, "divergent": 0, "skipped": 0}
    divergent_files: list[str] = []

    for path in iter_html_files(REPO_ROOT):
        status, diff = process_file(path, check=args.check, dry_run=args.dry_run)
        counts[status] = counts.get(status, 0) + 1
        rel = path.relative_to(REPO_ROOT)
        if status == "rewrote" and not args.quiet:
            print(f"  rewrote  {rel}")
        elif status == "divergent":
            divergent_files.append(str(rel))
            if not args.quiet and diff:
                print(f"  divergent  {rel}")
                if args.dry_run or args.check:
                    print(diff)
                    print()

    print()
    print(
        f"Summary: ok={counts['ok']} rewrote={counts['rewrote']} "
        f"divergent={counts['divergent']} skipped={counts['skipped']}"
    )
    if args.check and counts["divergent"]:
        print("\nDivergent files:")
        for f in divergent_files:
            print(f"  - {f}")
        print("\nRun `python3 scripts/sync_top_nav.py` to fix.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
