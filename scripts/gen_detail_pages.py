#!/usr/bin/env python3
"""Generate static, indexable detail pages for POIs.

Creates detail/<type>/<id>/index.html and a sitemap.xml.
Strict: uses existing data only; does not invent facts.
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
SITE_BASE = "https://phailipp.github.io/bodensee-segler-site"

TYPES = {
    "harbor": "data/harbors.json",
    "anchor": "data/anchors.json",
    "rental": "data/rentals.json",
    "gastro": "data/gastros.json",
    "service": "data/services.json",
}


def esc(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def is_verified(it: dict) -> bool:
    return bool((it.get("source") or "").strip() and (it.get("lastVerified") or "").strip())


def label_country(c: str) -> str:
    return (c or "").upper()


def main() -> None:
    out_root = ROOT / "detail"
    out_root.mkdir(parents=True, exist_ok=True)

    urls = []
    today = date.today().isoformat()

    for typ, rel in TYPES.items():
        data = json.loads((ROOT / rel).read_text(encoding="utf-8"))
        for it in data:
            pid = it.get("id")
            name = it.get("name") or pid
            if not pid:
                continue

            ver = is_verified(it)
            # premium site: only publish verified pages for indexability
            if not ver:
                continue

            country = label_country(it.get("country"))
            region = it.get("region") or it.get("location") or ""
            coords = ""
            if it.get("lat") is not None and it.get("lng") is not None:
                coords = f"{it['lat']:.5f}, {it['lng']:.5f}"

            source = (it.get("source") or "").strip()
            lastv = (it.get("lastVerified") or "").strip()
            title = f"{name} – Bodensee Segler"
            desc = f"Verified entry: {name}. Official source and last verified date included." if name else "Verified entry with official source."

            page_dir = out_root / typ / pid
            page_dir.mkdir(parents=True, exist_ok=True)
            url = f"{SITE_BASE}/detail/{typ}/{pid}/"
            urls.append(url)

            html = f"""<!doctype html>
<html lang=\"de\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>{esc(title)}</title>
  <meta name=\"description\" content=\"{esc(desc)}\" />
  <link rel=\"stylesheet\" href=\"../../../css/styles.css\" />
  <meta property=\"og:title\" content=\"{esc(title)}\" />
  <meta property=\"og:description\" content=\"{esc(desc)}\" />
  <meta property=\"og:type\" content=\"website\" />
  <link rel=\"canonical\" href=\"{esc(url)}\" />
</head>
<body>
  <nav>
    <div class=\"logo\">Bodensee<span>.</span></div>
    <div class=\"nav-tools\" aria-label=\"Tools\">
      <a class=\"pill-switch\" href=\"{SITE_BASE}/?open={typ}:{pid}\" style=\"text-decoration:none\">Open on map</a>
      <div class=\"lang-toggle\" aria-label=\"Language selector\">
        <a class=\"pill-switch\" href=\"{SITE_BASE}/detail/{typ}/{pid}/\" style=\"text-decoration:none\">DE</a>
        <a class=\"pill-switch\" href=\"{SITE_BASE}/detail/{typ}/{pid}/\" style=\"text-decoration:none\">EN</a>
      </div>
    </div>
  </nav>

  <section class=\"guide-section\" style=\"padding-top:120px\">
    <div class=\"section-header\">
      <div class=\"section-label\">VERIFIED</div>
      <h1 class=\"section-title\">{esc(name)}</h1>
      <p class=\"section-subtitle\">{esc(region)} {esc(country)}</p>
    </div>

    <div class=\"prose\" aria-label=\"Details\" style=\"max-width:900px;margin:0 auto\">
      <p><span class=\"k\">Type</span><br><span class=\"v\">{esc(typ)}</span></p>
      {f"<p><span class='k'>Coordinates</span><br><span class='v'>{esc(coords)}</span></p>" if coords else ""}
      <p><span class=\"k\">Source</span><br><span class=\"v\"><a href=\"{esc(source)}\" target=\"_blank\" rel=\"noreferrer\">{esc(source)}</a></span></p>
      <p><span class=\"k\">Last verified</span><br><span class=\"v\">{esc(lastv)}</span></p>

      <p style=\"margin-top:24px\">
        <a class=\"hero-cta\" href=\"{SITE_BASE}/?open={typ}:{pid}\">Open on the map</a>
      </p>
    </div>
  </section>
</body>
</html>
"""
            (page_dir / "index.html").write_text(html, encoding="utf-8")

    # robots + sitemap
    (ROOT / "robots.txt").write_text("User-agent: *\nAllow: /\nSitemap: " + SITE_BASE + "/sitemap.xml\n", encoding="utf-8")

    sm = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        f"  <url><loc>{SITE_BASE}/</loc><lastmod>{today}</lastmod></url>",
    ]
    for u in sorted(set(urls)):
        sm.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>")
    sm.append("</urlset>\n")
    (ROOT / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")

    print(f"generated_pages={len(urls)}")


if __name__ == "__main__":
    main()
