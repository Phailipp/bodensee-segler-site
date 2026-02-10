#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

DATA_FILE = Path('data/harbors.json')

TEL_RE = re.compile(r'(?:tel:)?\+?\d[\d\s\-\/()]{5,}\d')
MAIL_RE = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.I)

BAD_HOSTS = {
  'facebook.com','www.facebook.com','instagram.com','www.instagram.com',
  'tripadvisor.com','www.tripadvisor.com'
}

def pick_phone(text: str):
  m = TEL_RE.findall(text or '')
  if not m:
    return ''
  # prefer the first candidate that has enough digits
  for raw in m:
    s = (raw or '').replace('tel:', '').strip()
    digits = re.sub(r'\D', '', s)
    if len(digits) < 7:
      continue
    # basic cleanup
    s = re.sub(r'\s+', ' ', s)
    return s
  return ''

def pick_email(text: str):
  m = MAIL_RE.findall(text or '')
  if not m:
    return ''
  return m[0].strip()

def fetch(url: str):
  try:
    r = requests.get(url, timeout=20, headers={'user-agent':'Mozilla/5.0'})
    if r.status_code >= 400:
      return ''
    return r.text
  except Exception:
    return ''


def main():
  data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
  changed = 0
  checked = 0
  for h in data:
    src = (h.get('source') or '').strip()
    lv = (h.get('lastVerified') or '').strip()
    if not src or not lv:
      continue
    if (h.get('phone') or '').strip() and (h.get('email') or '').strip():
      continue

    try:
      host = urlparse(src).hostname or ''
      if host.lower() in BAD_HOSTS:
        continue
    except Exception:
      continue

    checked += 1
    html = fetch(src)
    if not html:
      continue

    if not (h.get('phone') or '').strip():
      ph = pick_phone(html)
      if ph:
        h['phone'] = ph
        changed += 1

    if not (h.get('email') or '').strip():
      em = pick_email(html)
      if em:
        h['email'] = em
        changed += 1

  DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
  print(f'checked={checked} changed={changed}')

if __name__ == '__main__':
  main()
