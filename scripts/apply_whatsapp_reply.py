#!/usr/bin/env python3
"""Apply manual verification info from a WhatsApp-style reply.

Problem this solves
-------------------
During manual verification you often copy/paste an item's template into WhatsApp
(or any chat) and then respond with something short like:

- "ok" (meaning: candidate URL is good, promote it)
- "source <url>" (meaning: use a different official source URL)

This script takes:
- the original template text (or explicit --type/--id)
- the short reply
and updates the matching JSON entry in-place:

- sets url + source
- sets lastVerified = today (UTC)
- clears candidate* fields

It intentionally does NOT modify anything else.

Examples
--------

1) Reply "ok" (promote candidateUrl)

  python3 scripts/apply_whatsapp_reply.py \
    --template-file /tmp/item.txt \
    --reply "ok"

2) Override with explicit source

  python3 scripts/apply_whatsapp_reply.py \
    --template-file /tmp/item.txt \
    --reply "source https://example.com/impressum"

3) If you already know the identifiers

  python3 scripts/apply_whatsapp_reply.py --type harbor --id osm-node-123 --reply ok

"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

TYPE_FILES = {
    "harbor": "harbors.json",
    "anchor": "anchors.json",
    "rental": "rentals.json",
    "gastro": "gastros.json",
    "service": "services.json",
}

# Keep this aligned with scripts/auto_verify.py (conservative)
BLOCKLIST = {
    "tripadvisor.",
    "google.",
    "goo.gl",
    "facebook.",
    "instagram.",
    "yelp.",
    "booking.",
    "opentable.",
    "thefork.",
    "ubereats.",
    "just-eat.",
    "lieferando.",
    "wikipedia.",
    "wikidata.",
    "openstreetmap.",
    "osm.",
}

ANCHOR_ALLOW = {
    "navily.",
    "noonsite.",
    "cruisersforum.",
    "forum.",
    "seglerforum.",
}


def today_iso_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def norm(s: str | None) -> str:
    return (s or "").strip()


def domain_ok(url: str, typ: str) -> bool:
    u = (url or "").strip()
    if not u.lower().startswith("http"):
        return False

    # basic parse sanity
    try:
        host = (urlparse(u).hostname or "").lower()
    except Exception:
        return False

    # avoid local/invalid
    if not host or "." not in host:
        return False

    # anchors: allow forums etc, but still avoid the worst aggregators
    lowered = u.lower()
    if typ == "anchor":
        for b in BLOCKLIST:
            if b in lowered:
                return False
        return True

    # non-anchor: blocklist + also block general "forum" style sites
    for b in BLOCKLIST:
        if b in lowered:
            return False
    for a in ANCHOR_ALLOW:
        if a in lowered:
            return False
    return True


@dataclass
class Target:
    typ: str
    item_id: str


TEMPLATE_TYPE_RE = re.compile(r"^Type:\s*(\w+)\s*$", re.IGNORECASE)
TEMPLATE_ID_RE = re.compile(r"^ID:\s*(.+?)\s*$", re.IGNORECASE)
TEMPLATE_CAND_RE = re.compile(r"^Candidate URL \(found, not verified\):\s*$", re.IGNORECASE)
URL_LINE_RE = re.compile(r"^\-\s*(https?://\S+)\s*$", re.IGNORECASE)


def parse_template_text(txt: str) -> tuple[Target | None, str | None]:
    """Extract (type, id) and candidateUrl from the standard template body."""

    typ: str | None = None
    item_id: str | None = None
    candidate: str | None = None

    lines = [ln.rstrip("\n") for ln in (txt or "").splitlines()]
    in_cand = False

    for ln in lines:
        m = TEMPLATE_TYPE_RE.match(ln.strip())
        if m and not typ:
            typ = m.group(1).lower()
            continue

        m = TEMPLATE_ID_RE.match(ln.strip())
        if m and not item_id:
            item_id = m.group(1).strip()
            continue

        if TEMPLATE_CAND_RE.match(ln.strip()):
            in_cand = True
            continue

        if in_cand:
            m = URL_LINE_RE.match(ln.strip())
            if m:
                candidate = m.group(1).strip()
            # regardless of match, stop scanning candidate block after first line
            in_cand = False

    target = Target(typ=typ, item_id=item_id) if (typ and item_id) else None
    return target, candidate


REPLY_SOURCE_RE = re.compile(r"^source\s+(https?://\S+)\s*$", re.IGNORECASE)


def parse_reply(reply: str) -> tuple[str, str | None]:
    r = norm(reply).lower()
    if r == "ok":
        return "ok", None
    m = REPLY_SOURCE_RE.match(norm(reply))
    if m:
        return "source", m.group(1).strip()
    raise SystemExit("Reply must be either 'ok' or 'source <url>'.")


def iter_data_files() -> Iterable[tuple[str, Path]]:
    """Yield (type, path) for all known data files (global + per-lake)."""
    # global
    for typ, fname in TYPE_FILES.items():
        yield typ, ROOT / "data" / fname

    # per-lake
    lakes_dir = ROOT / "data" / "lakes"
    if lakes_dir.exists():
        for lake in sorted(p for p in lakes_dir.iterdir() if p.is_dir()):
            for typ, fname in TYPE_FILES.items():
                p = lake / fname
                if p.exists():
                    yield typ, p


@dataclass
class Found:
    typ: str
    path: Path
    idx: int
    item: dict[str, Any]


def find_unique_item(typ: str, item_id: str) -> Found:
    matches: list[Found] = []

    for t, p in iter_data_files():
        if t != typ:
            continue
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            continue
        for i, it in enumerate(data):
            if norm(str(it.get("id") or "")) == item_id:
                matches.append(Found(typ=typ, path=p, idx=i, item=it))

    if not matches:
        raise SystemExit(f"Could not find item: type={typ} id={item_id}")
    if len(matches) > 1:
        detail = "\n".join([f"- {m.path}" for m in matches])
        raise SystemExit(f"Item not unique (found in multiple files).\n{detail}")
    return matches[0]


def apply_verification(found: Found, source_url: str) -> None:
    # re-load full file so we can persist changes
    data = json.loads(found.path.read_text(encoding="utf-8"))
    it = data[found.idx]

    it["url"] = source_url
    it["source"] = source_url
    it["lastVerified"] = today_iso_utc()

    # clear candidate fields (be defensive about older schemas)
    for k in ["candidateUrl", "candidateFoundAt", "candidateSource", "candidateUrlKind"]:
        if k in it:
            it[k] = None

    found.path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", help="Template text containing Type/ID and candidate URL")
    ap.add_argument("--template-file", help="File containing template text")
    ap.add_argument("--type", choices=sorted(TYPE_FILES.keys()))
    ap.add_argument("--id", dest="item_id")
    ap.add_argument("--reply", required=True, help="Either 'ok' or 'source <url>'")
    args = ap.parse_args()

    reply_kind, reply_url = parse_reply(args.reply)

    template_txt = None
    if args.template_file:
        template_txt = Path(args.template_file).read_text(encoding="utf-8")
    elif args.template:
        template_txt = args.template

    target: Target | None = None
    candidate: str | None = None

    if template_txt:
        target, candidate = parse_template_text(template_txt)

    typ = (args.type or (target.typ if target else None))
    item_id = (args.item_id or (target.item_id if target else None))

    if not typ or not item_id:
        raise SystemExit("Need --type and --id (or provide --template/--template-file with Type/ID lines).")

    source_url = None
    if reply_kind == "source":
        source_url = reply_url
    else:
        source_url = candidate

    if not source_url:
        raise SystemExit("Reply 'ok' requires the template to contain a candidate URL.")

    if not domain_ok(source_url, typ):
        raise SystemExit(f"Refusing to set source for type={typ}: URL looks non-official or blocked: {source_url}")

    found = find_unique_item(typ, item_id)
    apply_verification(found, source_url)

    print(
        json.dumps(
            {
                "ok": True,
                "updated": {
                    "type": typ,
                    "id": item_id,
                    "file": str(found.path.relative_to(ROOT)),
                    "source": source_url,
                    "lastVerified": today_iso_utc(),
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
