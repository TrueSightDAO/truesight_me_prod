#!/usr/bin/env python3
"""
Optional: generate placeholder diagram PNGs only when assets are missing (404 risk).

Real diagrams live in assets/whitepaper/{main,agroverse}/ and should come from
Google Doc / handbook exports (same filenames). Do not run this if real PNGs
are already present — use --force to overwrite placeholders during development.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "whitepaper"

# (subdir, filename)
FILES = [
    ("main", "inline_kix.2l8slcti7klh.png"),
    ("main", "inline_kix.v0zyhxgt9q6j.png"),
    ("main", "inline_kix.b0e8jctyce2r.png"),
    ("main", "inline_kix.a576i17z8fdo.png"),
    ("main", "inline_kix.su3ji7a2epd.png"),
    ("main", "inline_kix.10lc14hfc9ba.png"),
    ("main", "inline_kix.4fp6sx7z48fk.png"),
    ("agroverse", "inline_kix.y3gsc96cj1pd.png"),
    ("agroverse", "inline_kix.9wlj7c6nc3dl.png"),
    ("agroverse", "inline_kix.f040isrtak5x.png"),
    ("agroverse", "inline_kix.6hjkkh5cxw7p.png"),
    ("agroverse", "inline_kix.d2cy12ca8p7t.png"),
    ("agroverse", "inline_kix.gwn5p55pwvdb.png"),
]

W, H = 880, 420
BG_TOP = (247, 241, 232)
BG_BOTTOM = (236, 226, 209)
BORDER = (95, 111, 82)
MUTED = (111, 90, 68)


def _draw() -> Image.Image:
    img = Image.new("RGB", (W, H))
    pix = img.load()
    for y in range(H):
        t = y / max(H - 1, 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        for x in range(W):
            pix[x, y] = (r, g, b)
    draw = ImageDraw.Draw(img)
    draw.rectangle([2, 2, W - 3, H - 3], outline=BORDER, width=2)
    title = "Diagram (placeholder)"
    subtitle = "Replace with exported figure; path kept for stable URLs."
    font = None
    font_sm = None
    for path in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        try:
            font = ImageFont.truetype(path, 22)
            font_sm = ImageFont.truetype(path, 15)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
        font_sm = font
    tw, th = draw.textbbox((0, 0), title, font=font)[2:]
    draw.text(((W - tw) // 2, H // 2 - 28), title, fill=MUTED, font=font)
    sw, sh = draw.textbbox((0, 0), subtitle, font=font_sm)[2:]
    draw.text(((W - sw) // 2, H // 2 + 8), subtitle, fill=MUTED, font=font_sm)
    return img


def main() -> None:
    parser = argparse.ArgumentParser(description="Write placeholder whitepaper diagram PNGs.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing files (default: skip if file already exists).",
    )
    args = parser.parse_args()

    base = _draw()
    for sub, name in FILES:
        out = ASSETS / sub / name
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists() and not args.force:
            print("skip (exists):", out.relative_to(ROOT))
            continue
        base.save(out, format="PNG", optimize=True)
        print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
