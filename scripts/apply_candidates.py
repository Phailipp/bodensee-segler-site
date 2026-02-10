#!/usr/bin/env python3
"""Apply candidate URLs to existing data/*.json entries (best-effort).

Strict: writes only candidate* fields. Never writes source/lastVerified.

Matching: simple token overlap on name.
"""

import json
import re
from pathlib import Path

CAND_PATH = Path('/tmp/osm_candidates.json')
TODAY = None

STOP = {"am","an","bei","zum","zur","und","the","der","die","das","im","in","of","a","la","le"}

def tokens(s: str):
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9äöüß]+", " ", s)
    toks = [t for t in s.split() if len(t) > 2 and t not in STOP]
    return set(toks)


def main():
    cand = json.loads(CAND_PATH.read_text(encoding='utf-8'))['candidates']
    # index by name tokens
    idx = []
    for c in cand:
        idx.append((tokens(c['name']), c))

    data_dir = Path('data')
    changed = 0
    for p in sorted(data_dir.glob('*.json')):
        items = json.loads(p.read_text(encoding='utf-8'))
        for it in items:
            if (it.get('source') or '').strip():
                continue
            if (it.get('candidateUrl') or '').strip():
                continue
            t_it = tokens(it.get('name',''))
            if not t_it:
                continue
            best = None
            best_score = 0
            for t_c, c in idx:
                score = len(t_it & t_c)
                if score > best_score:
                    best_score = score
                    best = c
            if best and best_score >= 2:
                it['candidateUrl'] = best['website']
                it['candidateFoundAt'] = best['foundAt']
                it['candidateSource'] = best['foundVia']
                changed += 1
        p.write_text(json.dumps(items, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

    print(changed)

if __name__ == '__main__':
    main()
