#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import os
import re
import urllib.request

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDITS_PATH = os.path.join(ROOT, 'CREDITS.md')
CACHE_DIR = os.path.join(ROOT, 'tools', 'cache')

def get_credit_names():
    cache_path = os.path.join(CACHE_DIR, 'credit_names.txt')
    if not os.path.exists(cache_path):
        req = urllib.request.Request(f'{RAW}/credit_names.txt', headers={'User-Agent': 'pokesurvivor/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            content = r.read().decode('utf-8', 'replace')
        with open(cache_path, 'w', encoding='utf-8') as f:
            f.write(content)
    else:
        with open(cache_path, 'r', encoding='utf-8') as f:
            content = f.read()

    names = {}
    for line in content.splitlines()[1:]:
        parts = line.split('\t')
        if len(parts) >= 2:
            display = parts[0].strip()
            contact = parts[2].strip() if len(parts) > 2 else ''
            names[parts[1].strip()] = (display, contact)
            # also handle without <@!
            clean_id = re.sub(r'[<@!>]', '', parts[1].strip())
            names[clean_id] = (display, contact)
            names[display] = (display, contact)
    return names

def resolve_author(raw_id, names_map):
    raw_str = str(raw_id).strip()
    if raw_str in names_map:
        return names_map[raw_str][0]
    clean_id = re.sub(r'[<@!>]', '', raw_str)
    if clean_id in names_map:
        return names_map[clean_id][0]
    return raw_str

def main():
    names_map = get_credit_names()
    with open(os.path.join(ROOT, 'js', 'data', 'mega-sprites-meta.js'), 'r', encoding='utf-8') as f:
        meta_js = f.read()

    m = re.search(r'G\.MEGA_SPRITE_META\s*=\s*(\{.*?\});', meta_js, re.S)
    meta = json.loads(m.group(1))

    from download_all_mega_sprites import MEGA_TARGETS
    target_by_id = {t['id']: t for t in MEGA_TARGETS}

    rows = []
    for mid, t in sorted(target_by_id.items(), key=lambda kv: (kv[1]['base'], kv[1]['id'])):
        data = meta.get(mid, {})
        raw_credits = data.get('credits', [])
        resolved = [resolve_author(c, names_map) for c in raw_credits if str(c).strip()]
        # deduplicate preserving order
        unique_credits = []
        for c in resolved:
            if c not in unique_credits:
                unique_credits.append(c)

        primary = unique_credits[0] if unique_credits else 'SpriteCollab'
        collabs = ', '.join(unique_credits[1:]) if len(unique_credits) > 1 else '—'
        folder = f"`assets/pokemon/{mid}`"
        rows.append((t['name'], f"#{t['base']}", folder, primary, collabs))

    table_md = "| Pokémon Mega | Base Dex | Thư mục Sprite | Họa sĩ chính | Cộng tác viên | Giấy phép |\n"
    table_md += "|---|---|---|---|---|---|\n"
    for name, dex, folder, prim, sec in rows:
        table_md += f"| **{name}** | {dex} | {folder} | **{prim}** | {sec} | CC BY-NC 4.0 |\n"

    with open(CREDITS_PATH, 'r', encoding='utf-8') as f:
        full_credits = f.read()

    # Replace Mega Evolution section in CREDITS.md
    pattern = r'### Mega Evolution.*?(?=\n## |\Z)'
    replacement = f"### Mega Evolution (v1.4)\n\nSprites de Mega Evolution procedentes de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab) bajo licencia [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (uso no comercial, con atribución a sus creadores):\n\n{table_md}\n"
    
    if re.search(pattern, full_credits, re.S):
        new_credits = re.sub(pattern, replacement, full_credits, flags=re.S)
    else:
        new_credits = full_credits + "\n\n" + replacement

    with open(CREDITS_PATH, 'w', encoding='utf-8') as f:
        f.write(new_credits)

    print(f"Updated CREDITS.md with {len(rows)} Mega Evolution forms.")

if __name__ == '__main__':
    main()
