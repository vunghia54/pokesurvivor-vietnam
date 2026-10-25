#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tải toàn bộ sprite sheets và animation metadata cho tất cả các dạng Mega khả dụng từ SpriteCollab.
Licence: CC BY-NC 4.0 (PMDCollab / SpriteCollab)
"""
import io
import json
import os
import re
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
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

# 36 dạng Mega có sprite hoàn chỉnh từ PMDCollab
MEGA_TARGETS = [
    # Kanto & Johto (Gen 1 & 2)
    {'id': 'mega_6_x', 'tag': '0006', 'form': '0001', 'name': 'Mega Charizard X', 'base': 6},
    {'id': 'mega_65', 'tag': '0065', 'form': '0001', 'name': 'Mega Alakazam', 'base': 65},
    {'id': 'mega_94', 'tag': '0094', 'form': '0001', 'name': 'Mega Gengar', 'base': 94},
    {'id': 'mega_115', 'tag': '0115', 'form': '0001', 'name': 'Mega Kangaskhan', 'base': 115},
    {'id': 'mega_142', 'tag': '0142', 'form': '0001', 'name': 'Mega Aerodactyl', 'base': 142},
    {'id': 'mega_150_y', 'tag': '0150', 'form': '0002', 'name': 'Mega Mewtwo Y', 'base': 150},
    {'id': 'mega_208', 'tag': '0208', 'form': '0001', 'name': 'Mega Steelix', 'base': 208},
    {'id': 'mega_227', 'tag': '0227', 'form': '0001', 'name': 'Mega Skarmory', 'base': 227},
    {'id': 'mega_229', 'tag': '0229', 'form': '0001', 'name': 'Mega Houndoom', 'base': 229},
    {'id': 'mega_248', 'tag': '0248', 'form': '0001', 'name': 'Mega Tyranitar', 'base': 248},

    # Hoenn (Gen 3)
    {'id': 'mega_282', 'tag': '0282', 'form': '0001', 'name': 'Mega Gardevoir', 'base': 282},
    {'id': 'mega_302', 'tag': '0302', 'form': '0001', 'name': 'Mega Sableye', 'base': 302},
    {'id': 'mega_303', 'tag': '0303', 'form': '0001', 'name': 'Mega Mawile', 'base': 303},
    {'id': 'mega_308', 'tag': '0308', 'form': '0001', 'name': 'Mega Medicham', 'base': 308},
    {'id': 'mega_310', 'tag': '0310', 'form': '0001', 'name': 'Mega Manectric', 'base': 310},
    {'id': 'mega_323', 'tag': '0323', 'form': '0001', 'name': 'Mega Camerupt', 'base': 323},
    {'id': 'mega_334', 'tag': '0334', 'form': '0001', 'name': 'Mega Altaria', 'base': 334},
    {'id': 'mega_354', 'tag': '0354', 'form': '0001', 'name': 'Mega Banette', 'base': 354},
    {'id': 'mega_359', 'tag': '0359', 'form': '0001', 'name': 'Mega Absol', 'base': 359},
    {'id': 'mega_362', 'tag': '0362', 'form': '0001', 'name': 'Mega Glalie', 'base': 362},
    {'id': 'mega_380', 'tag': '0380', 'form': '0001', 'name': 'Mega Latias', 'base': 380},
    {'id': 'mega_381', 'tag': '0381', 'form': '0001', 'name': 'Mega Latios', 'base': 381},
    {'id': 'mega_384', 'tag': '0384', 'form': '0001', 'name': 'Mega Rayquaza', 'base': 384},

    # Sinnoh, Unova, Kalos, Alola, Paldea (Gen 4 - Gen 9)
    {'id': 'mega_428', 'tag': '0428', 'form': '0001', 'name': 'Mega Lopunny', 'base': 428},
    {'id': 'mega_448', 'tag': '0448', 'form': '0001', 'name': 'Mega Lucario', 'base': 448},
    {'id': 'mega_475', 'tag': '0475', 'form': '0001', 'name': 'Mega Gallade', 'base': 475},
    {'id': 'mega_491', 'tag': '0491', 'form': '0002', 'name': 'Mega Darkrai', 'base': 491},
    {'id': 'mega_530', 'tag': '0530', 'form': '0001', 'name': 'Mega Excadrill', 'base': 530},
    {'id': 'mega_604', 'tag': '0604', 'form': '0001', 'name': 'Mega Eelektross', 'base': 604},
    {'id': 'mega_670', 'tag': '0670', 'form': '0006', 'name': 'Mega Floette', 'base': 670},
    {'id': 'mega_691', 'tag': '0691', 'form': '0001', 'name': 'Mega Dragalge', 'base': 691},
    {'id': 'mega_718', 'tag': '0718', 'form': '0005', 'name': 'Mega Zygarde', 'base': 718},
    {'id': 'mega_719', 'tag': '0719', 'form': '0001', 'name': 'Mega Diancie', 'base': 719},
    {'id': 'mega_780', 'tag': '0780', 'form': '0001', 'name': 'Mega Drampa', 'base': 780},
    {'id': 'mega_807', 'tag': '0807', 'form': '0001', 'name': 'Mega Zeraora', 'base': 807},
    {'id': 'mega_978', 'tag': '0978', 'form': '0003', 'name': 'Mega Tatsugiri', 'base': 978},
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
        path = os.path.join(out_dir, want + '.png')
        # Skip if already exists and non-empty
        if os.path.exists(path) and os.path.getsize(path) > 100:
            with Image.open(path) as im:
                w, h = im.size
        else:
            png = fetch(f'{url_base}/{src}-Anim.png')
            if not png:
                continue
            w, h = save_optimized(png, path)
        cols, rows = w // geom['w'], h // geom['h']
        if rows < 1 or cols < 1:
            if os.path.exists(path):
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

def process_target(t):
    mid = t['id']
    tag = t['tag']
    form = t['form']
    out_dir = os.path.join(OUT_ASSETS, mid)
    url_base = f'{BASE}/{tag}/{form}'

    xml = fetch(f'{url_base}/AnimData.xml')
    if not xml:
        return mid, None, f"Failed to fetch AnimData.xml for {mid}"

    anims, shadow = parse_animdata(xml.decode('utf-8', 'replace'))
    normal = download_set(url_base, out_dir, anims)
    if not REQUIRED & set(normal):
        return mid, None, f"Missing required animations for {mid}"

    meta = {'s': shadow, 'a': normal}

    # Check shiny
    surl = f'{url_base}/0001'
    sxml = fetch(f'{surl}/AnimData.xml')
    if sxml:
        sanims = parse_animdata(sxml.decode('utf-8', 'replace'))[0]
        shiny = download_set(surl, os.path.join(out_dir, 's'), sanims, normal)
        if REQUIRED <= set(shiny) or ('Idle' in shiny and 'Walk' in shiny):
            meta['sh'] = 1
            diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
            if diff:
                meta['sa'] = diff
            missing_s = [k for k in normal if k not in shiny]
            if missing_s:
                meta['sm'] = missing_s

    # Fetch credits for this form
    credits_txt = fetch(f'{url_base}/credits.txt')
    authors = []
    if credits_txt:
        for line in credits_txt.decode('utf-8', 'replace').splitlines():
            parts = line.split('\t')
            if len(parts) > 1 and parts[1].strip():
                authors.append(parts[1].strip())
    meta['credits'] = authors

    return mid, meta, f"[OK] {t['name']} ({mid}) done. Anims: {list(normal.keys())}, Shiny: {bool(meta.get('sh'))}"

def main():
    print(f"Starting parallel processing for {len(MEGA_TARGETS)} Mega forms...")
    all_meta = {}

    with ThreadPoolExecutor(max_workers=8) as pool:
        for mid, meta, log in pool.map(process_target, MEGA_TARGETS):
            print(log)
            if meta:
                all_meta[mid] = meta

    # Write meta file
    js_content = "/* ============ mega-sprites-meta.js — Metadatos de Sprites Mega Evolución ============ */\n"
    js_content += "G.MEGA_SPRITE_META = " + json.dumps(all_meta, separators=(',', ':')) + ";\n"
    with open(OUT_META, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"\nSaved {OUT_META} with {len(all_meta)} forms.")

if __name__ == '__main__':
    main()
