#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import re

with open('js/data/pokedex.js', 'r', encoding='utf-8') as f:
    js_text = f.read()

m = re.search(r'G\.DEX\s*=\s*\[(.*?)\];', js_text, re.S)
items = [json.loads(x.strip()) for x in re.findall(r'\{[^{}]*\}', m.group(1))]
dex_map = {p['dex']: p for p in items}

print(f"Total Pokémon in G.DEX: {len(items)}")

with open('tools/cache/mega_sprites_scan.json', 'r', encoding='utf-8') as f:
    mega_scan = json.load(f)

print(f"Total Mega forms in scan: {len(mega_scan)}")

in_dex = [m for m in mega_scan if m['dex'] in dex_map]
not_in_dex = [m for m in mega_scan if m['dex'] not in dex_map]

print(f"Mega forms whose base Pokémon IS in G.DEX: {len(in_dex)}")
print(f"Mega forms whose base Pokémon IS NOT in G.DEX: {len(not_in_dex)}")
for m in not_in_dex:
    print(f"  Missing base: #{m['dex']:04d} {m['name']}")

playable = [m for m in in_dex if m['has_required']]
print(f"\nPlayable Mega forms with base Pokémon in G.DEX: {len(playable)}")
for p in playable:
    base = dex_map[p['dex']]
    print(f"  #{p['dex']:04d} {base['name']:<15} -> Mega: {p['name']}")
