#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tải và phân tích toàn bộ Mega Evolution trong PMDCollab tracker.json
"""
import urllib.request
import json
import os

CACHE_TRACKER = os.path.join(os.path.dirname(__file__), 'cache', 'pmdcollab_tracker.json')
os.makedirs(os.path.dirname(CACHE_TRACKER), exist_ok=True)

def get_tracker():
    if os.path.exists(CACHE_TRACKER) and os.path.getsize(CACHE_TRACKER) > 1000:
        with open(CACHE_TRACKER, 'r', encoding='utf-8') as f:
            return json.load(f)
    print("Downloading tracker.json from PMDCollab...")
    url = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json'
    req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        content = r.read().decode('utf-8')
    with open(CACHE_TRACKER, 'w', encoding='utf-8') as f:
        f.write(content)
    return json.loads(content)

def main():
    tracker = get_tracker()
    print(f"Loaded tracker with {len(tracker)} dex entries.")

    mega_forms = []

    for dex_str, entry in tracker.items():
        subgroups = entry.get('subgroups', {})
        for form_id, form_data in subgroups.items():
            name = form_data.get('name', '')
            if 'Mega' in name:
                mega_forms.append({
                    'dex_str': dex_str,
                    'dex': int(dex_str),
                    'form_id': form_id,
                    'name': name,
                    'sprite_complete': form_data.get('sprite_complete', 0),
                    'has_shiny': '0001' in form_data.get('subgroups', {}),
                    'shiny_sprite_complete': form_data.get('subgroups', {}).get('0001', {}).get('sprite_complete', 0) if '0001' in form_data.get('subgroups', {}) else 0,
                    'credit': form_data.get('sprite_credit', {})
                })

    print(f"Found {len(mega_forms)} forms matching 'Mega' in tracker.json:")
    for m in sorted(mega_forms, key=lambda x: (x['dex'], x['form_id'])):
        status = "COMPLETED" if m['sprite_complete'] == 2 else ("IN_PROGRESS" if m['sprite_complete'] == 1 else "NO_SPRITE")
        print(f"#{m['dex']:04d} form {m['form_id']}: {m['name']:<25} -> {status} (sc={m['sprite_complete']}, shiny={m['has_shiny']}, s_sc={m['shiny_sprite_complete']})")

if __name__ == '__main__':
    main()
