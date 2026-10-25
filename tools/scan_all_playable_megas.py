#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kiểm tra chi tiết tất cả các Mega Form có sc >= 1 trong PMDCollab
sử dụng ThreadPoolExecutor để kiểm tra nhanh AnimData.xml, Idle, Walk, Attack.
"""
import urllib.request
import urllib.error
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
BASE = RAW + '/sprite'
CACHE_TRACKER = os.path.join(os.path.dirname(__file__), 'cache', 'pmdcollab_tracker.json')

WANT = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']
FALLBACK = {
    'Idle': ['Walk'],
    'Walk': ['Idle'],
    'Attack': ['Strike', 'QuickStrike', 'Swing', 'Shoot', 'Idle'],
    'Shoot': ['Attack', 'Strike', 'SpAttack', 'Idle'],
    'Charge': ['DeepBreath', 'Idle'],
    'Hurt': ['Cringe', 'Idle'],
    'Faint': ['Hurt', 'Idle'],
}
REQUIRED = {'Idle', 'Walk', 'Attack'}

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor/1.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.read()
    except Exception:
        return None

def parse_animdata(xml):
    anims = {}
    for blk in re.findall(r'<Anim>(.*?)</Anim>', xml, re.S):
        name = re.search(r'<Name>(\w+)</Name>', blk)
        if not name:
            continue
        name = name.group(1)
        copy = re.search(r'<CopyOf>(\w+)</CopyOf>', blk)
        if copy:
            anims[name] = {'copyOf': copy.group(1)}
            continue
        fw = re.search(r'<FrameWidth>(\d+)</FrameWidth>', blk)
        fh = re.search(r'<FrameHeight>(\d+)</FrameHeight>', blk)
        if not (fw and fh):
            continue
        durs = [int(x) for x in re.findall(r'<Duration>(\d+)</Duration>', blk)]
        anims[name] = {'w': int(fw.group(1)), 'h': int(fh.group(1)), 'n': len(durs), 'd': durs}
    shadow = re.search(r'<ShadowSize>(\d+)</ShadowSize>', xml)
    return anims, int(shadow.group(1)) if shadow else 1

def resolve(anims, name, seen=None):
    seen = seen or set()
    if name not in anims or name in seen:
        return None, None
    seen.add(name)
    a = anims[name]
    if 'copyOf' in a:
        return resolve(anims, a['copyOf'], seen)
    return name, a

def check_one(item):
    dex_str, form_id, form_data = item
    name = form_data.get('name', '')
    sc = form_data.get('sprite_complete', 0)
    tag = dex_str
    dex = int(dex_str)

    res = {
        'dex': dex,
        'tag': tag,
        'form_id': form_id,
        'name': name,
        'sc': sc,
        'xml_ok': False,
        'has_required': False,
        'anims_found': [],
        'has_shiny': False,
        'shiny_xml_ok': False,
        'credits': form_data.get('sprite_credit', {})
    }

    if sc >= 1:
        url_base = f'{BASE}/{tag}/{form_id}'
        xml = fetch(f'{url_base}/AnimData.xml')
        if xml:
            res['xml_ok'] = True
            anims, shadow = parse_animdata(xml.decode('utf-8', 'replace'))
            found = set()
            for want in WANT:
                for cand in [want] + FALLBACK.get(want, []):
                    src, geom = resolve(anims, cand)
                    if geom:
                        found.add(want)
                        break
            res['anims_found'] = sorted(list(found))
            if REQUIRED <= found:
                res['has_required'] = True

            # check shiny
            surl = f'{url_base}/0001'
            sxml = fetch(f'{surl}/AnimData.xml')
            if sxml:
                res['has_shiny'] = True
                res['shiny_xml_ok'] = True
    return res

def main():
    with open(CACHE_TRACKER, 'r', encoding='utf-8') as f:
        tracker = json.load(f)

    items = []
    for dex_str, entry in tracker.items():
        subgroups = entry.get('subgroups', {})
        for form_id, form_data in subgroups.items():
            name = form_data.get('name', '')
            if 'Mega' in name:
                items.append((dex_str, form_id, form_data))

    print(f"Scanning {len(items)} Mega forms with 16 parallel threads...")
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(check_one, items))

    print(f"Scan finished. Total Mega forms: {len(results)}")
    playable = [r for r in results if r['has_required']]
    print(f"Forms with playable animations (Idle+Walk+Attack): {len(playable)}")
    for r in sorted(playable, key=lambda x: (x['dex'], x['form_id'])):
        print(f"  [READY] #{r['dex']:04d} form {r['form_id']}: {r['name']:<20} anims={r['anims_found']} shiny={r['has_shiny']}")

    not_playable = [r for r in results if not r['has_required']]
    print(f"\nForms missing playable animations or sprites: {len(not_playable)}")

    out_file = os.path.join(os.path.dirname(__file__), 'cache', 'mega_sprites_scan.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print(f"Saved results to {out_file}")

if __name__ == '__main__':
    main()
