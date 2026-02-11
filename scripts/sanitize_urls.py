#!/usr/bin/env python3
"""Sanitize/normalize candidate URLs across a lake.

- Normalizes http->https when safe (just replacement; no fetch)
- Strips whitespace
- Classifies social/aggregator URLs (candidateUrlKind)

Strict: does not invent sources or lastVerified.
"""

import argparse
import json
import re
from pathlib import Path

SOCIAL = (
    'facebook.com', 'instagram.com', 'fb.com', 'tiktok.com', 'x.com', 'twitter.com'
)
AGG = (
    'tripadvisor.', 'google.', 'yelp.', 'booking.', 'opentable.', 'thefork.', 'ubereats.', 'just-eat.', 'lieferando.'
)

FILES = ['harbors.json','anchors.json','rentals.json','gastros.json','services.json']


def norm_url(u: str) -> str:
    u = (u or '').strip()
    if not u:
        return ''
    # remove tracking fragments for common cases
    u = re.sub(r"#utm_.*$", "", u)
    # basic normalize
    if u.startswith('http://'):
        u = 'https://' + u[len('http://'):]
    return u


def classify(u: str) -> str:
    lu = (u or '').lower()
    if any(d in lu for d in SOCIAL):
        return 'social'
    if any(d in lu for d in AGG):
        return 'aggregator'
    if lu.startswith('https://') or lu.startswith('http://'):
        return 'web'
    return 'other'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lake', required=True)
    args = ap.parse_args()

    base = Path('data')/'lakes'/args.lake
    changed = 0

    for fn in FILES:
        p = base/fn
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding='utf-8'))
        for it in data:
            if 'candidateUrl' in it:
                before = it.get('candidateUrl') or ''
                after = norm_url(before)
                if after != before:
                    it['candidateUrl'] = after
                    changed += 1
                if after:
                    kind = classify(after)
                    if it.get('candidateUrlKind') != kind:
                        it['candidateUrlKind'] = kind
            # also normalize item.url if present
            if 'url' in it and it.get('url'):
                it['url'] = norm_url(it.get('url'))
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(json.dumps({'lake': args.lake, 'changed': changed}, ensure_ascii=False))


if __name__ == '__main__':
    main()
