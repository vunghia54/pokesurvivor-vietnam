#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tạo js/systems/mega.js hoàn chỉnh với toàn bộ danh mục Mega Evolution chính thức.
36 dạng khả dụng (sprite từ PMDCollab) + toàn bộ các dạng chính thức còn thiếu (khóa an toàn).
"""
import os
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, 'js', 'systems', 'mega.js')

# 36 dạng khả dụng có sprite
READY_FORMS = [
    # Kanto & Johto
    ('mega_charizard_x', 6, 'Mega Charizard X', 'Charizardite X', 'mega_6_x', ['fire', 'dragon'], 1.35, 1.30, 1.20, 1.05, 33, 10, 0.08, '#29b6f6', '#37474f', 1.25, 'Lửa rồng đen xanh cực mạnh, tăng 35% sát thương và tăng phòng thủ vật lý.'),
    ('mega_alakazam', 65, 'Mega Alakazam', 'Alakazite', 'mega_65', ['psychic'], 1.40, 1.05, 1.40, 1.20, 20, 10, 0.05, '#ffca28', '#ab47bc', 1.2, 'Bộ não siêu năng lực lơ lửng 5 chiếc thìa, tăng 40% phép và 20% tốc độ.'),
    ('mega_gengar', 94, 'Mega Gengar', 'Gengarite', 'mega_94', ['ghost', 'poison'], 1.35, 1.05, 1.35, 1.15, 20, 20, 0.06, '#ab47bc', '#7b1fa2', 1.15, 'Bóng ma không gian thứ ba, tăng 35% sát thương và 15% tốc độ di chuyển.'),
    ('mega_kangaskhan', 115, 'Mega Kangaskhan', 'Kangaskhanite', 'mega_115', ['normal'], 1.35, 1.35, 1.05, 1.10, 20, 20, 0.08, '#8d6e63', '#ffca28', 1.2, 'Tình mẫu tử song sát cùng con non, tăng 35% đòn đánh vật lý và chống chịu.'),
    ('mega_aerodactyl', 142, 'Mega Aerodactyl', 'Aerodactylite', 'mega_142', ['rock', 'flying'], 1.35, 1.35, 1.05, 1.25, 20, 20, 0.06, '#78909c', '#455a64', 1.22, 'Chúa tể bầu trời tiền sử với gai đá sắc nhọn, tăng 35% công và 25% tốc độ.'),
    ('mega_mewtwo_y', 150, 'Mega Mewtwo Y', 'Mewtwonite Y', 'mega_150_y', ['psychic'], 1.45, 1.10, 1.45, 1.20, 15, 30, 0.06, '#ba68c8', '#e1bee7', 1.25, 'Đỉnh cao siêu năng lực vũ trụ, tăng 45% sát thương phép tối thượng và 20% tốc độ.'),
    ('mega_steelix', 208, 'Mega Steelix', 'Steelixite', 'mega_208', ['steel', 'ground'], 1.30, 1.25, 1.05, 0.95, 45, 30, 0.12, '#90a4ae', '#ffd54f', 1.35, 'Bạch kim khổng lồ xoay quanh tinh thể, phòng thủ siêu việt và giảm 12% sát thương nhận vào.'),
    ('mega_skarmory', 227, 'Mega Skarmory', 'Skarmorite', 'mega_227', ['steel', 'flying'], 1.30, 1.25, 1.05, 1.15, 35, 25, 0.10, '#b0bec5', '#e53935', 1.2, 'Chiến điểu giáp thép huyền thoại Lumiose, tăng tốc độ lướt gió và giáp thép.'),
    ('mega_houndoom', 229, 'Mega Houndoom', 'Houndoominite', 'mega_229', ['dark', 'fire'], 1.35, 1.10, 1.35, 1.15, 25, 15, 0.06, '#d32f2f', '#212121', 1.2, 'Địa ngục hắc khuyển với bộ xương gai phát sáng, tăng 35% sát thương hỏa ngục.'),
    ('mega_tyranitar', 248, 'Mega Tyranitar', 'Tyranitarite', 'mega_248', ['rock', 'dark'], 1.38, 1.38, 1.10, 1.05, 30, 20, 0.10, '#388e3c', '#263238', 1.3, 'Bạo chúa cát hủy diệt mọi đối thủ, tăng 38% sức công phá vật lý và giáp đá.'),

    # Hoenn
    ('mega_gardevoir', 282, 'Mega Gardevoir', 'Gardevoirite', 'mega_282', ['psychic', 'fairy'], 1.35, 1.05, 1.35, 1.12, 10, 25, 0.06, '#ec407a', '#42a5f5', 1.2, 'Nữ hoàng tiên tộc, tăng 35% sát thương phép và chỉ số phòng thủ phép.'),
    ('mega_sableye', 302, 'Mega Sableye', 'Sablenite', 'mega_302', ['dark', 'ghost'], 1.30, 1.20, 1.20, 0.90, 45, 40, 0.12, '#ab47bc', '#e91e63', 1.2, 'Bảo ngọc khổng lồ che chở tuyệt đối, biến tốc độ thành sức phòng ngự kim cương.'),
    ('mega_mawile', 303, 'Mega Mawile', 'Mawilite', 'mega_303', ['steel', 'fairy'], 1.40, 1.40, 1.05, 1.05, 35, 30, 0.08, '#fbc02d', '#37474f', 1.22, 'Cặp hàm thép Huge Power cắn xé đối thủ, tăng 40% sát thương cận chiến cực hạn.'),
    ('mega_medicham', 308, 'Mega Medicham', 'Medichamite', 'mega_308', ['fighting', 'psychic'], 1.40, 1.40, 1.10, 1.15, 15, 15, 0.06, '#e91e63', '#29b6f6', 1.18, 'Yoga tâm linh Pure Power, tăng 40% uy lực võ thuật và 15% tốc độ.'),
    ('mega_manectric', 310, 'Mega Manectric', 'Manectite', 'mega_310', ['electric'], 1.35, 1.05, 1.35, 1.25, 15, 15, 0.05, '#ffee58', '#42a5f5', 1.22, 'Tia chớp lôi vân gầm thét, phóng điện siêu thanh và tăng 25% tốc độ di chuyển.'),
    ('mega_camerupt', 323, 'Mega Camerupt', 'Cameruptite', 'mega_323', ['fire', 'ground'], 1.35, 1.25, 1.35, 0.90, 30, 30, 0.10, '#f4511e', '#ffb300', 1.25, 'Núi lửa thức tỉnh tuôn trào dung nham, bộc phát sức mạnh hủy diệt trên diện rộng.'),
    ('mega_altaria', 334, 'Mega Altaria', 'Altarianite', 'mega_334', ['dragon', 'fairy'], 1.32, 1.30, 1.30, 1.05, 25, 25, 0.08, '#4fc3f7', '#f8bbd0', 1.25, 'Khinh vân ca nữ rồng tiên Pixilate, lông vũ mềm mại bảo vệ và cường hóa đòn đánh.'),
    ('mega_banette', 354, 'Mega Banette', 'Banettite', 'mega_354', ['ghost'], 1.38, 1.38, 1.10, 1.10, 20, 15, 0.06, '#5e35b1', '#ff1744', 1.18, 'Oán niệm giải phóng khóa kéo ma quái, tăng 38% sức mạnh vật lý bóng tối.'),
    ('mega_absol', 359, 'Mega Absol', 'Absolite', 'mega_359', ['dark'], 1.38, 1.35, 1.25, 1.22, 10, 10, 0.05, '#eceff1', '#263238', 1.22, 'Đôi cánh thiên thần bóng đêm gieo rắc cảnh báo thảm họa, tăng công và 22% tốc độ.'),
    ('mega_glalie', 362, 'Mega Glalie', 'Glalitite', 'mega_362', ['ice'], 1.35, 1.35, 1.25, 1.15, 15, 15, 0.06, '#81d4fa', '#29b6f6', 1.22, 'Cơ hàm băng giá vỡ vụn Refrigerate, phóng ra bão tuyết đông cứng kẻ địch.'),
    ('mega_latias', 380, 'Mega Latias', 'Latiasite', 'mega_380', ['dragon', 'psychic'], 1.32, 1.15, 1.32, 1.15, 30, 30, 0.08, '#e91e63', '#7e57c2', 1.22, 'Thần long hộ vệ thanh nhã bay lượn trên bầu trời, dung hòa phép thuật và phòng ngự.'),
    ('mega_latios', 381, 'Mega Latios', 'Latiosite', 'mega_381', ['dragon', 'psychic'], 1.35, 1.30, 1.35, 1.15, 20, 20, 0.07, '#1e88e5', '#7e57c2', 1.22, 'Phi cơ rồng siêu thanh xé toạc không gian, tăng tốc độ và sức bắn ma thuật.'),
    ('mega_rayquaza', 384, 'Mega Rayquaza', 'Dragon Ascent', 'mega_384', ['dragon', 'flying'], 1.45, 1.45, 1.45, 1.20, 25, 25, 0.10, '#43a047', '#ffeb3b', 1.35, 'Bá chủ tầng ozone Delta Stream hóa giải điểm yếu gió, sức mạnh tối thượng vô địch.'),

    # Sinnoh - Paldea
    ('mega_lopunny', 428, 'Mega Lopunny', 'Lopunnite', 'mega_428', ['normal', 'fighting'], 1.35, 1.35, 1.05, 1.25, 20, 15, 0.06, '#8d6e63', '#e91e63', 1.2, 'Thỏ chiến binh Scrappy tung cước như chớp, đả kích cả hệ Ma và tăng 25% tốc độ.'),
    ('mega_lucario', 448, 'Mega Lucario', 'Lucarionite', 'mega_448', ['fighting', 'steel'], 1.35, 1.35, 1.25, 1.15, 18, 10, 0.08, '#ffca28', '#1e88e5', 1.18, 'Thần sóng Aura tối thượng, tăng 35% đòn đánh cận chiến và 15% tốc độ.'),
    ('mega_gallade', 475, 'Mega Gallade', 'Galladite', 'mega_475', ['psychic', 'fighting'], 1.38, 1.38, 1.05, 1.18, 25, 15, 0.07, '#00e676', '#e040fb', 1.2, 'Hiệp sĩ lưỡi kiếm danh dự Inner Focus, vung trảm đao bảo vệ đồng đội không sợ hãi.'),
    ('mega_darkrai', 491, 'Mega Darkrai', 'Darkrainite', 'mega_491', ['dark'], 1.42, 1.10, 1.42, 1.20, 20, 20, 0.07, '#212121', '#d50000', 1.25, 'Cơn ác mộng bóng đêm vĩnh hằng gieo rắc kinh hoàng, tăng 42% sát thương bóng tối.'),
    ('mega_excadrill', 530, 'Mega Excadrill', 'Excadrillite', 'mega_530', ['ground', 'steel'], 1.38, 1.38, 1.05, 1.15, 25, 20, 0.08, '#d84315', '#616161', 1.22, 'Mũi khoan thép khổng lồ xoay chuyển mặt đất Lumiose, xuyên thủng mọi hàng thủ quái vật.'),
    ('mega_eelektross', 604, 'Mega Eelektross', 'Eelektrossite', 'mega_604', ['electric'], 1.35, 1.35, 1.30, 1.05, 25, 25, 0.09, '#00838f', '#ffeb3b', 1.25, 'Lươn điện trôi nổi Levitate không có điểm yếu hệ Đất, tích tụ điện thế sấm sét ngút trời.'),
    ('mega_floette', 670, 'Mega Floette', 'Floettite', 'mega_670', ['fairy'], 1.35, 1.05, 1.38, 1.15, 15, 28, 0.06, '#f48fb1', '#4caf50', 1.18, 'Hoa ánh sáng trường cửu Light of Ruin của Vua AZ, phục sinh hào quang tiên tộc thanh khiết.'),
    ('mega_dragalge', 691, 'Mega Dragalge', 'Dragalgenite', 'mega_691', ['poison', 'dragon'], 1.35, 1.15, 1.38, 1.05, 25, 30, 0.09, '#7b1fa2', '#8bc34a', 1.22, 'Hải long độc tố Adaptability nhân đôi uy lực kịch độc rồng biển, phòng ngự phép kiên cố.'),
    ('mega_zygarde', 718, 'Mega Zygarde', 'Zygardite', 'mega_718', ['dragon', 'ground'], 1.42, 1.40, 1.35, 1.10, 35, 35, 0.12, '#00e676', '#212121', 1.35, 'Thần hộ vệ hệ sinh thái Kalos trừng phạt kẻ xâm lăng, chấn động địa cầu và áp đảo hắc ám.'),
    ('mega_diancie', 719, 'Mega Diancie', 'Diancite', 'mega_719', ['rock', 'fairy'], 1.42, 1.40, 1.40, 1.22, 10, 10, 0.06, '#f06292', '#80deea', 1.22, 'Công chúa kim cương Magic Bounce phản đòn bất lợi, tỏa sáng rực rỡ muôn màu lung linh.'),
    ('mega_drampa', 780, 'Mega Drampa', 'Drampanite', 'mega_780', ['normal', 'dragon'], 1.36, 1.10, 1.40, 1.05, 25, 25, 0.09, '#80cbc4', '#ffb74d', 1.25, 'Lão long hiền triết Berserk nổi giận khi bạn bè bị thương, giáng sấm sét rồng dữ dội.'),
    ('mega_zeraora', 807, 'Mega Zeraora', 'Zeraorite', 'mega_807', ['electric'], 1.40, 1.40, 1.20, 1.30, 15, 15, 0.06, '#ffee58', '#00e5ff', 1.22, 'Tia chớp Plasma Volt Absorb xé toạc màn đêm, tốc độ bứt phá thần tốc di chuyển nhanh nhất.'),
    ('mega_tatsugiri', 978, 'Mega Tatsugiri', 'Tatsugirinite', 'mega_978', ['dragon', 'water'], 1.35, 1.05, 1.40, 1.15, 15, 20, 0.06, '#ff7043', '#fff9c4', 1.15, 'Thần mưu sushi Commander mưu lược xuất chúng, tăng cường phép rồng nước kỳ ảo.')
]

# Các dạng chính thức còn lại (chưa có sprite hoàn chỉnh từ PMDCollab -> khóa an toàn)
LOCKED_FORMS = [
    # Gen 6 XY
    ('mega_venusaur', 3, 'Mega Venusaur', 'Venusaurite', ['grass', 'poison'], 'THIẾU SPRITE'),
    ('mega_charizard_y', 6, 'Mega Charizard Y', 'Charizardite Y', ['fire', 'flying'], 'THIẾU SPRITE'),
    ('mega_blastoise', 9, 'Mega Blastoise', 'Blastoisinite', ['water'], 'THIẾU SPRITE'),
    ('mega_pinsir', 127, 'Mega Pinsir', 'Pinsirite', ['bug', 'flying'], 'THIẾU SPRITE'),
    ('mega_gyarados', 130, 'Mega Gyarados', 'Gyaradosite', ['water', 'dark'], 'THIẾU SPRITE'),
    ('mega_mewtwo_x', 150, 'Mega Mewtwo X', 'Mewtwonite X', ['psychic', 'fighting'], 'THIẾU SPRITE'),
    ('mega_ampharos', 181, 'Mega Ampharos', 'Ampharosite', ['electric', 'dragon'], 'THIẾU SPRITE'),
    ('mega_scizor', 212, 'Mega Scizor', 'Scizorite', ['bug', 'steel'], 'THIẾU SPRITE'),
    ('mega_heracross', 214, 'Mega Heracross', 'Heracronite', ['bug', 'fighting'], 'THIẾU SPRITE'),
    ('mega_blaziken', 257, 'Mega Blaziken', 'Blazikenite', ['fire', 'fighting'], 'THIẾU SPRITE'),
    ('mega_aggron', 306, 'Mega Aggron', 'Aggronite', ['steel'], 'THIẾU SPRITE'),
    ('mega_garchomp', 445, 'Mega Garchomp', 'Garchompite', ['dragon', 'ground'], 'THIẾU SPRITE'),
    ('mega_abomasnow', 460, 'Mega Abomasnow', 'Abomasite', ['grass', 'ice'], 'THIẾU SPRITE'),

    # Gen 6 ORAS
    ('mega_beedrill', 15, 'Mega Beedrill', 'Beedrillite', ['bug', 'poison'], 'THIẾU SPRITE'),
    ('mega_pidgeot', 18, 'Mega Pidgeot', 'Pidgeotite', ['normal', 'flying'], 'THIẾU SPRITE'),
    ('mega_slowbro', 80, 'Mega Slowbro', 'Slowbronite', ['water', 'psychic'], 'THIẾU SPRITE'),
    ('mega_sceptile', 254, 'Mega Sceptile', 'Sceptilite', ['grass', 'dragon'], 'THIẾU SPRITE'),
    ('mega_swampert', 260, 'Mega Swampert', 'Swampertite', ['water', 'ground'], 'THIẾU SPRITE'),
    ('mega_sharpedo', 319, 'Mega Sharpedo', 'Sharpedonite', ['water', 'dark'], 'THIẾU SPRITE'),
    ('mega_salamence', 373, 'Mega Salamence', 'Salamencite', ['dragon', 'flying'], 'THIẾU SPRITE'),
    ('mega_metagross', 376, 'Mega Metagross', 'Metagrossite', ['steel', 'psychic'], 'THIẾU SPRITE'),
    ('mega_audino', 531, 'Mega Audino', 'Audinite', ['normal', 'fairy'], 'THIẾU SPRITE'),

    # Legends: Z-A & Z Variants
    ('mega_clefable', 36, 'Mega Clefable', 'Clefablite', ['fairy'], 'THIẾU SPRITE'),
    ('mega_victreebel', 71, 'Mega Victreebel', 'Victreebelite', ['grass', 'poison'], 'THIẾU SPRITE'),
    ('mega_starmie', 121, 'Mega Starmie', 'Starminite', ['water', 'psychic'], 'THIẾU SPRITE'),
    ('mega_dragonite', 149, 'Mega Dragonite', 'Dragonitite', ['dragon', 'flying'], 'THIẾU SPRITE'),
    ('mega_meganium', 154, 'Mega Meganium', 'Meganiumite', ['grass', 'fairy'], 'THIẾU SPRITE'),
    ('mega_feraligatr', 160, 'Mega Feraligatr', 'Feraligatrite', ['water', 'dark'], 'THIẾU SPRITE'),
    ('mega_froslass', 478, 'Mega Froslass', 'Froslassite', ['ice', 'ghost'], 'THIẾU SPRITE'),
    ('mega_emboar', 500, 'Mega Emboar', 'Emboarite', ['fire', 'fighting'], 'THIẾU SPRITE'),
    ('mega_scolipede', 545, 'Mega Scolipede', 'Scolipedite', ['bug', 'poison'], 'THIẾU SPRITE'),
    ('mega_scrafty', 560, 'Mega Scrafty', 'Scraftynite', ['dark', 'fighting'], 'THIẾU SPRITE'),
    ('mega_chandelure', 609, 'Mega Chandelure', 'Chandelurite', ['ghost', 'fire'], 'THIẾU SPRITE'),
    ('mega_chesnaught', 652, 'Mega Chesnaught', 'Chesnaughtite', ['grass', 'fighting'], 'THIẾU SPRITE'),
    ('mega_delphox', 655, 'Mega Delphox', 'Delphoxite', ['fire', 'psychic'], 'THIẾU SPRITE'),
    ('mega_greninja', 658, 'Mega Greninja', 'Greninjite', ['water', 'dark'], 'THIẾU SPRITE'),
    ('mega_pyroar', 668, 'Mega Pyroar', 'Pyroarite', ['fire', 'normal'], 'THIẾU POKÉMON GỐC'),
    ('mega_malamar', 687, 'Mega Malamar', 'Malamarite', ['dark', 'psychic'], 'THIẾU SPRITE'),
    ('mega_barbaracle', 689, 'Mega Barbaracle', 'Barbaraclite', ['rock', 'fighting'], 'THIẾU SPRITE'),
    ('mega_hawlucha', 701, 'Mega Hawlucha', 'Hawluchanite', ['fighting', 'flying'], 'THIẾU SPRITE'),
    ('mega_falinks', 870, 'Mega Falinks', 'Falinksite', ['fighting'], 'THIẾU POKÉMON GỐC'),
    ('mega_lucario_z', 448, 'Mega Lucario Z', 'Lucarionite Z', ['fighting', 'steel'], 'THIẾU SPRITE'),
    ('mega_garchomp_z', 445, 'Mega Garchomp Z', 'Garchompite Z', ['dragon', 'ground'], 'THIẾU SPRITE'),
    ('mega_absol_z', 359, 'Mega Absol Z', 'Absolite Z', ['dark'], 'THIẾU SPRITE'),

    # Mega Dimension DLC
    ('mega_raichu_x', 26, 'Mega Raichu X', 'Raichunite X', ['electric', 'fighting'], 'THIẾU SPRITE'),
    ('mega_raichu_y', 26, 'Mega Raichu Y', 'Raichunite Y', ['electric', 'psychic'], 'THIẾU SPRITE'),
    ('mega_chimecho', 358, 'Mega Chimecho', 'Chimechite', ['psychic', 'ghost'], 'THIẾU SPRITE'),
    ('mega_staraptor', 398, 'Mega Staraptor', 'Staraptorite', ['normal', 'flying'], 'THIẾU SPRITE'),
    ('mega_heatran', 485, 'Mega Heatran', 'Heatranite', ['fire', 'steel'], 'THIẾU SPRITE'),
    ('mega_golurk', 623, 'Mega Golurk', 'Golurkite', ['ground', 'ghost'], 'THIẾU SPRITE'),
    ('mega_meowstic', 678, 'Mega Meowstic', 'Meowsticite', ['psychic'], 'THIẾU SPRITE'),
    ('mega_crabominable', 740, 'Mega Crabominable', 'Crabominablite', ['fighting', 'ice'], 'THIẾU SPRITE'),
    ('mega_golisopod', 768, 'Mega Golisopod', 'Golisopodite', ['bug', 'water'], 'THIẾU SPRITE'),
    ('mega_magearna', 801, 'Mega Magearna', 'Magearnite', ['steel', 'fairy'], 'THIẾU SPRITE'),
    ('mega_scovillain', 952, 'Mega Scovillain', 'Scovillainite', ['grass', 'fire'], 'THIẾU SPRITE'),
    ('mega_glimmora', 970, 'Mega Glimmora', 'Glimmorite', ['rock', 'poison'], 'THIẾU SPRITE'),
    ('mega_baxcalibur', 998, 'Mega Baxcalibur', 'Baxcaliburite', ['dragon', 'ice'], 'THIẾU SPRITE'),
]

def main():
    forms_dict = {}

    for item in READY_FORMS:
        mid, base, name, stone, sprite_id, types, atk, pa, sa, spd, df, sd, red, col1, col2, scale, desc = item
        forms_dict[mid] = {
            'id': mid,
            'baseDex': base,
            'name': name,
            'stone': stone,
            'spriteId': sprite_id,
            'spriteAvailable': True,
            'types': types,
            'atkMul': atk,
            'paMul': pa,
            'saMul': sa,
            'spdMul': spd,
            'dfAdd': df,
            'sdAdd': sd,
            'dmgReduceAdd': red,
            'themeColor': col1,
            'secondaryColor': col2,
            'auraScale': scale,
            'description': desc
        }

    for item in LOCKED_FORMS:
        mid, base, name, stone, types, reason = item
        forms_dict[mid] = {
            'id': mid,
            'baseDex': base,
            'name': name,
            'stone': stone,
            'spriteId': None,
            'spriteAvailable': False,
            'missingReason': reason,
            'types': types,
            'atkMul': 1.35,
            'paMul': 1.25,
            'saMul': 1.25,
            'spdMul': 1.10,
            'dfAdd': 20,
            'sdAdd': 20,
            'dmgReduceAdd': 0.07,
            'themeColor': '#78909c',
            'secondaryColor': '#37474f',
            'auraScale': 1.2,
            'description': f"{name} (Đang chờ tài nguyên sprite chính thức: {reason})."
        }

    print(f"Total forms configured: {len(forms_dict)}")
    ready_count = sum(1 for f in forms_dict.values() if f['spriteAvailable'])
    locked_count = sum(1 for f in forms_dict.values() if not f['spriteAvailable'])
    print(f"  Ready forms: {ready_count}")
    print(f"  Locked forms: {locked_count}")

    # Read original mega.js template to preserve logic
    with open(OUT_PATH, 'r', encoding='utf-8') as f:
        orig = f.read()

    # Find the FORMS object in original file and replace it
    start_marker = "  // Bảng dữ liệu các dạng Mega Evolution"
    end_marker = "  // Tra cứu dạng Mega theo Base Dex"

    idx_start = orig.find(start_marker)
    idx_end = orig.find(end_marker)

    if idx_start == -1 or idx_end == -1:
        raise ValueError("Could not find FORMS block markers in mega.js")

    forms_json = json.dumps(forms_dict, indent=4, ensure_ascii=False)
    # indent properly
    forms_indented = '\n'.join(('  ' if i > 0 else '') + line for i, line in enumerate(forms_json.splitlines()))

    new_forms_code = f"  // Bảng dữ liệu toàn bộ các dạng Mega Evolution chính thức (36 dạng khả dụng + các dạng đang khóa an toàn)\n  const FORMS = {forms_indented};\n\n"

    new_content = orig[:idx_start] + new_forms_code + orig[idx_end:]

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"Successfully updated {OUT_PATH}!")

if __name__ == '__main__':
    main()
