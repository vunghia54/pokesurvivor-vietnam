#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bajar sprites de Mega Evolución desde SpriteCollab (normal y shiny).
Licencia: CC BY-NC 4.0 (PMDCollab)
"""
import io
import json
import os
import re
import urllib.error
import urllib.request
from PIL import Image

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
BASE = RAW + '/sprite'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ASSETS = os.path.join(ROOT, 'assets', 'pokemon')
OUT_META = os.path.join(ROOT, 'js', 'data', 'mega-sprites-meta.js')

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

MEGA_TARGETS = [
    {'id': 'mega_6_x', 'tag': '0006', 'form': '0001', 'name': 'Mega Charizard X'},
    {'id': 'mega_94', 'tag': '0094', 'form': '0001', 'name': 'Mega Gengar'},
    {'id': 'mega_282', 'tag': '0282', 'form': '0001', 'name': 'Mega Gardevoir'},
    {'id': 'mega_448', 'tag': '0448', 'form': '0001', 'name': 'Mega Lucario'},
]

def fetch(url, retries=3):
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
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

def ground_anchor(png, w, h):
    try:
        im = Image.open(io.BytesIO(png)).convert('RGBA')
    except Exception:
        return None
    px = im.crop((0, 0, w, h)).load()
    xs = ys = n = 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                xs += x; ys += y; n += 1
    return (round(xs / n, 1), round(ys / n, 1)) if n else None

def save_optimized(png, path):
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    cols = im.getcolors(256)
    if cols is None:
        im.save(path, 'PNG', optimize=True)
        return im.size
    colors = [c for _, c in cols]
    colors.sort(key=lambda c: c[3])
    idx = {c: i for i, c in enumerate(colors)}
    pim = Image.new('P', im.size)
    data = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    pim.putdata([idx[p] for p in data])
    flat = []
    for c in colors:
        flat += c[:3]
    pim.putpalette(flat + [0] * (768 - len(flat)))
    pim.save(path, 'PNG', optimize=True, transparency=bytes(c[3] for c in colors))
    return im.size

def download_set(url_base, out_dir, anims, geometry_from=None):
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for want in WANT:
        src, geom = None, None
        for cand in [want] + FALLBACK.get(want, []):
            src, geom = resolve(anims, cand)
            if geom:
                break
        if not geom:
            continue
        png = fetch(f'{url_base}/{src}-Anim.png')
        if not png:
            continue
        path = os.path.join(out_dir, want + '.png')
        w, h = save_optimized(png, path)
        cols, rows = w // geom['w'], h // geom['h']
        if rows < 1 or cols < 1:
            os.remove(path)
            continue
        ref = geometry_from.get(want) if geometry_from else None
        if ref and ref['w'] == geom['w'] and ref['h'] == geom['h']:
            ax, ay = ref['ax'], ref['ay']
        else:
            sh = fetch(f'{url_base}/{src}-Shadow.png')
            anchor = ground_anchor(sh, geom['w'], geom['h']) if sh else None
            ax, ay = (anchor if anchor else (geom['w'] / 2, geom['h'] * 0.78))
        meta[want] = {'w': geom['w'], 'h': geom['h'], 'n': min(geom['n'], cols), 'r': rows,
                      'd': geom['d'][:cols], 'ax': ax, 'ay': ay}
    return meta

def main():
    all_meta = {}
    for t in MEGA_TARGETS:
        mid = t['id']
        tag = t['tag']
        form = t['form']
        print(f"Fetching {t['name']} ({mid})...")
        out_dir = os.path.join(OUT_ASSETS, mid)
        url_base = f'{BASE}/{tag}/{form}'
        xml = fetch(f'{url_base}/AnimData.xml')
        if not xml:
            print(f"  ! Failed to fetch AnimData.xml for {mid}")
            continue
        anims, shadow = parse_animdata(xml.decode('utf-8', 'replace'))
        normal = download_set(url_base, out_dir, anims)
        if not REQUIRED & set(normal):
            print(f"  ! Missing required animations for {mid}")
            continue
        meta = {'s': shadow, 'a': normal}

        # Check shiny
        surl = f'{url_base}/0001'
        sxml = fetch(f'{surl}/AnimData.xml')
        sanims = parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else anims
        shiny = download_set(surl, os.path.join(out_dir, 's'), sanims, normal)
        if REQUIRED <= set(shiny) or ('Idle' in shiny and 'Walk' in shiny):
            meta['sh'] = 1
            diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
            if diff:
                meta['sa'] = diff
            missing_s = [k for k in normal if k not in shiny]
            if missing_s:
                meta['sm'] = missing_s

        all_meta[mid] = meta
        print(f"  [OK] {t['name']} done. Animations: {list(normal.keys())}, Shiny: {bool(meta.get('sh'))}")

    # Output JS file
    js_content = "/* ============ mega-sprites-meta.js — Metadatos de Sprites Mega Evolución ============ */\n"
    js_content += "G.MEGA_SPRITE_META = " + json.dumps(all_meta, separators=(',', ':')) + ";\n"
    with open(OUT_META, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"Saved {OUT_META} with {len(all_meta)} mega forms.")

if __name__ == '__main__':
    main()
