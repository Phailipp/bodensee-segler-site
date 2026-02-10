#!/usr/bin/env python3
"""Fetch Natura 2000 polygons (EEA) for a bbox and write GeoJSON.

Source: EEA discomap FeatureServer (official EU provider).
"""

import json
from pathlib import Path
import requests

OUT = Path('data/layers/de_natura2000.geojson')
OUT.parent.mkdir(parents=True, exist_ok=True)

# Rough Bodensee bbox (WGS84)
# west,south,east,north
BBOX = (8.70, 47.40, 10.35, 47.85)

URL = 'https://nest.discomap.eea.europa.eu/arcgis/rest/services/Hosted/Layman_Sites/FeatureServer/0/query'

PARAMS = {
  'f': 'json',
  'where': "1=1",
  'geometry': ','.join(map(str, BBOX)),
  'geometryType': 'esriGeometryEnvelope',
  'inSR': '4326',
  'spatialRel': 'esriSpatialRelIntersects',
  'outFields': 'sitecode,sitename,sitetype,sitetype_label',
  'returnGeometry': 'true',
  'outSR': '4326',
}

# ArcGIS often needs this to avoid huge payloads
PARAMS['resultRecordCount'] = 2000

r = requests.get(URL, params=PARAMS, timeout=60, headers={'user-agent':'Mozilla/5.0'})
r.raise_for_status()
obj = r.json()

features = []
for f in obj.get('features', []):
  geom = f.get('geometry') or {}
  rings = geom.get('rings')
  if not rings:
    continue
  props = f.get('attributes') or {}
  # Convert esri rings to GeoJSON polygon/multipolygon heuristically:
  # We'll emit as MultiPolygon with one polygon composed of rings.
  coords = []
  for ring in rings:
    coords.append([[pt[0], pt[1]] for pt in ring])
  gj = {
    'type': 'Feature',
    'properties': {
      'sitecode': props.get('sitecode'),
      'sitename': props.get('sitename'),
      'sitetype': props.get('sitetype'),
      'sitetype_label': props.get('sitetype_label'),
      'provider': 'EEA Natura 2000',
    },
    'geometry': {
      'type': 'Polygon',
      'coordinates': coords,
    }
  }
  features.append(gj)

fc = {'type':'FeatureCollection', 'features': features}
OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'written={OUT} features={len(features)}')
