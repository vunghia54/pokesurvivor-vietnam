/* ============ mega.js — Hệ thống Tiến hóa Mega (Mega Evolution) ============
 * PokéSurvivor Việt Nam — v1.4.0 (Giai đoạn 1)
 *
 * Quản lý trạng thái, dữ liệu, đồ họa hào quang và đồng bộ Co-op
 * cho cơ chế biến hình Mega Evolution trong trận đấu.
 * Không thay đổi dữ liệu gốc trong G.DEX hay lưu bền vững vào Cloud Save.
 */
G.Mega = (() => {
  // Trạng thái vòng đời Mega
  const STATES = {
    NORMAL: 'NORMAL',
    MEGA_READY: 'MEGA_READY',
    MEGA_EVOLVING: 'MEGA_EVOLVING',
    MEGA_ACTIVE: 'MEGA_ACTIVE',
    MEGA_USED: 'MEGA_USED'
  };

  // Cấu hình chung
  const CONFIG = {
    duration: 25, // 25 giây (chuyển thể thời gian thực cho game sinh tồn - chế độ thử nghiệm)
    evolveAnimDuration: 1.2, // Thời gian hiệu ứng hào quang biến hình (1.2 giây)
    minLevel: 1 // Cấp độ sẵn sàng kích hoạt trong run thử nghiệm
  };

  // Bảng dữ liệu toàn bộ các dạng Mega Evolution chính thức (36 dạng khả dụng + các dạng đang khóa an toàn)
  const FORMS = {
      "mega_charizard_x": {
          "id": "mega_charizard_x",
          "baseDex": 6,
          "name": "Mega Charizard X",
          "stone": "Charizardite X",
          "spriteId": "mega_6_x",
          "spriteAvailable": true,
          "types": [
              "fire",
              "dragon"
          ],
          "atkMul": 1.35,
          "paMul": 1.3,
          "saMul": 1.2,
          "spdMul": 1.05,
          "dfAdd": 33,
          "sdAdd": 10,
          "dmgReduceAdd": 0.08,
          "themeColor": "#29b6f6",
          "secondaryColor": "#37474f",
          "auraScale": 1.25,
          "description": "Lửa rồng đen xanh cực mạnh, tăng 35% sát thương và tăng phòng thủ vật lý."
      },
      "mega_alakazam": {
          "id": "mega_alakazam",
          "baseDex": 65,
          "name": "Mega Alakazam",
          "stone": "Alakazite",
          "spriteId": "mega_65",
          "spriteAvailable": true,
          "types": [
              "psychic"
          ],
          "atkMul": 1.4,
          "paMul": 1.05,
          "saMul": 1.4,
          "spdMul": 1.2,
          "dfAdd": 20,
          "sdAdd": 10,
          "dmgReduceAdd": 0.05,
          "themeColor": "#ffca28",
          "secondaryColor": "#ab47bc",
          "auraScale": 1.2,
          "description": "Bộ não siêu năng lực lơ lửng 5 chiếc thìa, tăng 40% phép và 20% tốc độ."
      },
      "mega_gengar": {
          "id": "mega_gengar",
          "baseDex": 94,
          "name": "Mega Gengar",
          "stone": "Gengarite",
          "spriteId": "mega_94",
          "spriteAvailable": true,
          "types": [
              "ghost",
              "poison"
          ],
          "atkMul": 1.35,
          "paMul": 1.05,
          "saMul": 1.35,
          "spdMul": 1.15,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.06,
          "themeColor": "#ab47bc",
          "secondaryColor": "#7b1fa2",
          "auraScale": 1.15,
          "description": "Bóng ma không gian thứ ba, tăng 35% sát thương và 15% tốc độ di chuyển."
      },
      "mega_kangaskhan": {
          "id": "mega_kangaskhan",
          "baseDex": 115,
          "name": "Mega Kangaskhan",
          "stone": "Kangaskhanite",
          "spriteId": "mega_115",
          "spriteAvailable": true,
          "types": [
              "normal"
          ],
          "atkMul": 1.35,
          "paMul": 1.35,
          "saMul": 1.05,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.08,
          "themeColor": "#8d6e63",
          "secondaryColor": "#ffca28",
          "auraScale": 1.2,
          "description": "Tình mẫu tử song sát cùng con non, tăng 35% đòn đánh vật lý và chống chịu."
      },
      "mega_aerodactyl": {
          "id": "mega_aerodactyl",
          "baseDex": 142,
          "name": "Mega Aerodactyl",
          "stone": "Aerodactylite",
          "spriteId": "mega_142",
          "spriteAvailable": true,
          "types": [
              "rock",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.35,
          "saMul": 1.05,
          "spdMul": 1.25,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.06,
          "themeColor": "#78909c",
          "secondaryColor": "#455a64",
          "auraScale": 1.22,
          "description": "Chúa tể bầu trời tiền sử với gai đá sắc nhọn, tăng 35% công và 25% tốc độ."
      },
      "mega_mewtwo_y": {
          "id": "mega_mewtwo_y",
          "baseDex": 150,
          "name": "Mega Mewtwo Y",
          "stone": "Mewtwonite Y",
          "spriteId": "mega_150_y",
          "spriteAvailable": true,
          "types": [
              "psychic"
          ],
          "atkMul": 1.45,
          "paMul": 1.1,
          "saMul": 1.45,
          "spdMul": 1.2,
          "dfAdd": 15,
          "sdAdd": 30,
          "dmgReduceAdd": 0.06,
          "themeColor": "#ba68c8",
          "secondaryColor": "#e1bee7",
          "auraScale": 1.25,
          "description": "Đỉnh cao siêu năng lực vũ trụ, tăng 45% sát thương phép tối thượng và 20% tốc độ."
      },
      "mega_steelix": {
          "id": "mega_steelix",
          "baseDex": 208,
          "name": "Mega Steelix",
          "stone": "Steelixite",
          "spriteId": "mega_208",
          "spriteAvailable": true,
          "types": [
              "steel",
              "ground"
          ],
          "atkMul": 1.3,
          "paMul": 1.25,
          "saMul": 1.05,
          "spdMul": 0.95,
          "dfAdd": 45,
          "sdAdd": 30,
          "dmgReduceAdd": 0.12,
          "themeColor": "#90a4ae",
          "secondaryColor": "#ffd54f",
          "auraScale": 1.35,
          "description": "Bạch kim khổng lồ xoay quanh tinh thể, phòng thủ siêu việt và giảm 12% sát thương nhận vào."
      },
      "mega_skarmory": {
          "id": "mega_skarmory",
          "baseDex": 227,
          "name": "Mega Skarmory",
          "stone": "Skarmorite",
          "spriteId": "mega_227",
          "spriteAvailable": true,
          "types": [
              "steel",
              "flying"
          ],
          "atkMul": 1.3,
          "paMul": 1.25,
          "saMul": 1.05,
          "spdMul": 1.15,
          "dfAdd": 35,
          "sdAdd": 25,
          "dmgReduceAdd": 0.1,
          "themeColor": "#b0bec5",
          "secondaryColor": "#e53935",
          "auraScale": 1.2,
          "description": "Chiến điểu giáp thép huyền thoại Lumiose, tăng tốc độ lướt gió và giáp thép."
      },
      "mega_houndoom": {
          "id": "mega_houndoom",
          "baseDex": 229,
          "name": "Mega Houndoom",
          "stone": "Houndoominite",
          "spriteId": "mega_229",
          "spriteAvailable": true,
          "types": [
              "dark",
              "fire"
          ],
          "atkMul": 1.35,
          "paMul": 1.1,
          "saMul": 1.35,
          "spdMul": 1.15,
          "dfAdd": 25,
          "sdAdd": 15,
          "dmgReduceAdd": 0.06,
          "themeColor": "#d32f2f",
          "secondaryColor": "#212121",
          "auraScale": 1.2,
          "description": "Địa ngục hắc khuyển với bộ xương gai phát sáng, tăng 35% sát thương hỏa ngục."
      },
      "mega_tyranitar": {
          "id": "mega_tyranitar",
          "baseDex": 248,
          "name": "Mega Tyranitar",
          "stone": "Tyranitarite",
          "spriteId": "mega_248",
          "spriteAvailable": true,
          "types": [
              "rock",
              "dark"
          ],
          "atkMul": 1.38,
          "paMul": 1.38,
          "saMul": 1.1,
          "spdMul": 1.05,
          "dfAdd": 30,
          "sdAdd": 20,
          "dmgReduceAdd": 0.1,
          "themeColor": "#388e3c",
          "secondaryColor": "#263238",
          "auraScale": 1.3,
          "description": "Bạo chúa cát hủy diệt mọi đối thủ, tăng 38% sức công phá vật lý và giáp đá."
      },
      "mega_gardevoir": {
          "id": "mega_gardevoir",
          "baseDex": 282,
          "name": "Mega Gardevoir",
          "stone": "Gardevoirite",
          "spriteId": "mega_282",
          "spriteAvailable": true,
          "types": [
              "psychic",
              "fairy"
          ],
          "atkMul": 1.35,
          "paMul": 1.05,
          "saMul": 1.35,
          "spdMul": 1.12,
          "dfAdd": 10,
          "sdAdd": 25,
          "dmgReduceAdd": 0.06,
          "themeColor": "#ec407a",
          "secondaryColor": "#42a5f5",
          "auraScale": 1.2,
          "description": "Nữ hoàng tiên tộc, tăng 35% sát thương phép và chỉ số phòng thủ phép."
      },
      "mega_sableye": {
          "id": "mega_sableye",
          "baseDex": 302,
          "name": "Mega Sableye",
          "stone": "Sablenite",
          "spriteId": "mega_302",
          "spriteAvailable": true,
          "types": [
              "dark",
              "ghost"
          ],
          "atkMul": 1.3,
          "paMul": 1.2,
          "saMul": 1.2,
          "spdMul": 0.9,
          "dfAdd": 45,
          "sdAdd": 40,
          "dmgReduceAdd": 0.12,
          "themeColor": "#ab47bc",
          "secondaryColor": "#e91e63",
          "auraScale": 1.2,
          "description": "Bảo ngọc khổng lồ che chở tuyệt đối, biến tốc độ thành sức phòng ngự kim cương."
      },
      "mega_mawile": {
          "id": "mega_mawile",
          "baseDex": 303,
          "name": "Mega Mawile",
          "stone": "Mawilite",
          "spriteId": "mega_303",
          "spriteAvailable": true,
          "types": [
              "steel",
              "fairy"
          ],
          "atkMul": 1.4,
          "paMul": 1.4,
          "saMul": 1.05,
          "spdMul": 1.05,
          "dfAdd": 35,
          "sdAdd": 30,
          "dmgReduceAdd": 0.08,
          "themeColor": "#fbc02d",
          "secondaryColor": "#37474f",
          "auraScale": 1.22,
          "description": "Cặp hàm thép Huge Power cắn xé đối thủ, tăng 40% sát thương cận chiến cực hạn."
      },
      "mega_medicham": {
          "id": "mega_medicham",
          "baseDex": 308,
          "name": "Mega Medicham",
          "stone": "Medichamite",
          "spriteId": "mega_308",
          "spriteAvailable": true,
          "types": [
              "fighting",
              "psychic"
          ],
          "atkMul": 1.4,
          "paMul": 1.4,
          "saMul": 1.1,
          "spdMul": 1.15,
          "dfAdd": 15,
          "sdAdd": 15,
          "dmgReduceAdd": 0.06,
          "themeColor": "#e91e63",
          "secondaryColor": "#29b6f6",
          "auraScale": 1.18,
          "description": "Yoga tâm linh Pure Power, tăng 40% uy lực võ thuật và 15% tốc độ."
      },
      "mega_manectric": {
          "id": "mega_manectric",
          "baseDex": 310,
          "name": "Mega Manectric",
          "stone": "Manectite",
          "spriteId": "mega_310",
          "spriteAvailable": true,
          "types": [
              "electric"
          ],
          "atkMul": 1.35,
          "paMul": 1.05,
          "saMul": 1.35,
          "spdMul": 1.25,
          "dfAdd": 15,
          "sdAdd": 15,
          "dmgReduceAdd": 0.05,
          "themeColor": "#ffee58",
          "secondaryColor": "#42a5f5",
          "auraScale": 1.22,
          "description": "Tia chớp lôi vân gầm thét, phóng điện siêu thanh và tăng 25% tốc độ di chuyển."
      },
      "mega_camerupt": {
          "id": "mega_camerupt",
          "baseDex": 323,
          "name": "Mega Camerupt",
          "stone": "Cameruptite",
          "spriteId": "mega_323",
          "spriteAvailable": true,
          "types": [
              "fire",
              "ground"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.35,
          "spdMul": 0.9,
          "dfAdd": 30,
          "sdAdd": 30,
          "dmgReduceAdd": 0.1,
          "themeColor": "#f4511e",
          "secondaryColor": "#ffb300",
          "auraScale": 1.25,
          "description": "Núi lửa thức tỉnh tuôn trào dung nham, bộc phát sức mạnh hủy diệt trên diện rộng."
      },
      "mega_altaria": {
          "id": "mega_altaria",
          "baseDex": 334,
          "name": "Mega Altaria",
          "stone": "Altarianite",
          "spriteId": "mega_334",
          "spriteAvailable": true,
          "types": [
              "dragon",
              "fairy"
          ],
          "atkMul": 1.32,
          "paMul": 1.3,
          "saMul": 1.3,
          "spdMul": 1.05,
          "dfAdd": 25,
          "sdAdd": 25,
          "dmgReduceAdd": 0.08,
          "themeColor": "#4fc3f7",
          "secondaryColor": "#f8bbd0",
          "auraScale": 1.25,
          "description": "Khinh vân ca nữ rồng tiên Pixilate, lông vũ mềm mại bảo vệ và cường hóa đòn đánh."
      },
      "mega_banette": {
          "id": "mega_banette",
          "baseDex": 354,
          "name": "Mega Banette",
          "stone": "Banettite",
          "spriteId": "mega_354",
          "spriteAvailable": true,
          "types": [
              "ghost"
          ],
          "atkMul": 1.38,
          "paMul": 1.38,
          "saMul": 1.1,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 15,
          "dmgReduceAdd": 0.06,
          "themeColor": "#5e35b1",
          "secondaryColor": "#ff1744",
          "auraScale": 1.18,
          "description": "Oán niệm giải phóng khóa kéo ma quái, tăng 38% sức mạnh vật lý bóng tối."
      },
      "mega_absol": {
          "id": "mega_absol",
          "baseDex": 359,
          "name": "Mega Absol",
          "stone": "Absolite",
          "spriteId": "mega_359",
          "spriteAvailable": true,
          "types": [
              "dark"
          ],
          "atkMul": 1.38,
          "paMul": 1.35,
          "saMul": 1.25,
          "spdMul": 1.22,
          "dfAdd": 10,
          "sdAdd": 10,
          "dmgReduceAdd": 0.05,
          "themeColor": "#eceff1",
          "secondaryColor": "#263238",
          "auraScale": 1.22,
          "description": "Đôi cánh thiên thần bóng đêm gieo rắc cảnh báo thảm họa, tăng công và 22% tốc độ."
      },
      "mega_glalie": {
          "id": "mega_glalie",
          "baseDex": 362,
          "name": "Mega Glalie",
          "stone": "Glalitite",
          "spriteId": "mega_362",
          "spriteAvailable": true,
          "types": [
              "ice"
          ],
          "atkMul": 1.35,
          "paMul": 1.35,
          "saMul": 1.25,
          "spdMul": 1.15,
          "dfAdd": 15,
          "sdAdd": 15,
          "dmgReduceAdd": 0.06,
          "themeColor": "#81d4fa",
          "secondaryColor": "#29b6f6",
          "auraScale": 1.22,
          "description": "Cơ hàm băng giá vỡ vụn Refrigerate, phóng ra bão tuyết đông cứng kẻ địch."
      },
      "mega_latias": {
          "id": "mega_latias",
          "baseDex": 380,
          "name": "Mega Latias",
          "stone": "Latiasite",
          "spriteId": "mega_380",
          "spriteAvailable": true,
          "types": [
              "dragon",
              "psychic"
          ],
          "atkMul": 1.32,
          "paMul": 1.15,
          "saMul": 1.32,
          "spdMul": 1.15,
          "dfAdd": 30,
          "sdAdd": 30,
          "dmgReduceAdd": 0.08,
          "themeColor": "#e91e63",
          "secondaryColor": "#7e57c2",
          "auraScale": 1.22,
          "description": "Thần long hộ vệ thanh nhã bay lượn trên bầu trời, dung hòa phép thuật và phòng ngự."
      },
      "mega_latios": {
          "id": "mega_latios",
          "baseDex": 381,
          "name": "Mega Latios",
          "stone": "Latiosite",
          "spriteId": "mega_381",
          "spriteAvailable": true,
          "types": [
              "dragon",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.3,
          "saMul": 1.35,
          "spdMul": 1.15,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#1e88e5",
          "secondaryColor": "#7e57c2",
          "auraScale": 1.22,
          "description": "Phi cơ rồng siêu thanh xé toạc không gian, tăng tốc độ và sức bắn ma thuật."
      },
      "mega_rayquaza": {
          "id": "mega_rayquaza",
          "baseDex": 384,
          "name": "Mega Rayquaza",
          "stone": "Dragon Ascent",
          "spriteId": "mega_384",
          "spriteAvailable": true,
          "types": [
              "dragon",
              "flying"
          ],
          "atkMul": 1.45,
          "paMul": 1.45,
          "saMul": 1.45,
          "spdMul": 1.2,
          "dfAdd": 25,
          "sdAdd": 25,
          "dmgReduceAdd": 0.1,
          "themeColor": "#43a047",
          "secondaryColor": "#ffeb3b",
          "auraScale": 1.35,
          "description": "Bá chủ tầng ozone Delta Stream hóa giải điểm yếu gió, sức mạnh tối thượng vô địch."
      },
      "mega_lopunny": {
          "id": "mega_lopunny",
          "baseDex": 428,
          "name": "Mega Lopunny",
          "stone": "Lopunnite",
          "spriteId": "mega_428",
          "spriteAvailable": true,
          "types": [
              "normal",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.35,
          "saMul": 1.05,
          "spdMul": 1.25,
          "dfAdd": 20,
          "sdAdd": 15,
          "dmgReduceAdd": 0.06,
          "themeColor": "#8d6e63",
          "secondaryColor": "#e91e63",
          "auraScale": 1.2,
          "description": "Thỏ chiến binh Scrappy tung cước như chớp, đả kích cả hệ Ma và tăng 25% tốc độ."
      },
      "mega_lucario": {
          "id": "mega_lucario",
          "baseDex": 448,
          "name": "Mega Lucario",
          "stone": "Lucarionite",
          "spriteId": "mega_448",
          "spriteAvailable": true,
          "types": [
              "fighting",
              "steel"
          ],
          "atkMul": 1.35,
          "paMul": 1.35,
          "saMul": 1.25,
          "spdMul": 1.15,
          "dfAdd": 18,
          "sdAdd": 10,
          "dmgReduceAdd": 0.08,
          "themeColor": "#ffca28",
          "secondaryColor": "#1e88e5",
          "auraScale": 1.18,
          "description": "Thần sóng Aura tối thượng, tăng 35% đòn đánh cận chiến và 15% tốc độ."
      },
      "mega_gallade": {
          "id": "mega_gallade",
          "baseDex": 475,
          "name": "Mega Gallade",
          "stone": "Galladite",
          "spriteId": "mega_475",
          "spriteAvailable": true,
          "types": [
              "psychic",
              "fighting"
          ],
          "atkMul": 1.38,
          "paMul": 1.38,
          "saMul": 1.05,
          "spdMul": 1.18,
          "dfAdd": 25,
          "sdAdd": 15,
          "dmgReduceAdd": 0.07,
          "themeColor": "#00e676",
          "secondaryColor": "#e040fb",
          "auraScale": 1.2,
          "description": "Hiệp sĩ lưỡi kiếm danh dự Inner Focus, vung trảm đao bảo vệ đồng đội không sợ hãi."
      },
      "mega_darkrai": {
          "id": "mega_darkrai",
          "baseDex": 491,
          "name": "Mega Darkrai",
          "stone": "Darkrainite",
          "spriteId": "mega_491",
          "spriteAvailable": true,
          "types": [
              "dark"
          ],
          "atkMul": 1.42,
          "paMul": 1.1,
          "saMul": 1.42,
          "spdMul": 1.2,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#212121",
          "secondaryColor": "#d50000",
          "auraScale": 1.25,
          "description": "Cơn ác mộng bóng đêm vĩnh hằng gieo rắc kinh hoàng, tăng 42% sát thương bóng tối."
      },
      "mega_excadrill": {
          "id": "mega_excadrill",
          "baseDex": 530,
          "name": "Mega Excadrill",
          "stone": "Excadrillite",
          "spriteId": "mega_530",
          "spriteAvailable": true,
          "types": [
              "ground",
              "steel"
          ],
          "atkMul": 1.38,
          "paMul": 1.38,
          "saMul": 1.05,
          "spdMul": 1.15,
          "dfAdd": 25,
          "sdAdd": 20,
          "dmgReduceAdd": 0.08,
          "themeColor": "#d84315",
          "secondaryColor": "#616161",
          "auraScale": 1.22,
          "description": "Mũi khoan thép khổng lồ xoay chuyển mặt đất Lumiose, xuyên thủng mọi hàng thủ quái vật."
      },
      "mega_eelektross": {
          "id": "mega_eelektross",
          "baseDex": 604,
          "name": "Mega Eelektross",
          "stone": "Eelektrossite",
          "spriteId": "mega_604",
          "spriteAvailable": true,
          "types": [
              "electric"
          ],
          "atkMul": 1.35,
          "paMul": 1.35,
          "saMul": 1.3,
          "spdMul": 1.05,
          "dfAdd": 25,
          "sdAdd": 25,
          "dmgReduceAdd": 0.09,
          "themeColor": "#00838f",
          "secondaryColor": "#ffeb3b",
          "auraScale": 1.25,
          "description": "Lươn điện trôi nổi Levitate không có điểm yếu hệ Đất, tích tụ điện thế sấm sét ngút trời."
      },
      "mega_floette": {
          "id": "mega_floette",
          "baseDex": 670,
          "name": "Mega Floette",
          "stone": "Floettite",
          "spriteId": "mega_670",
          "spriteAvailable": true,
          "types": [
              "fairy"
          ],
          "atkMul": 1.35,
          "paMul": 1.05,
          "saMul": 1.38,
          "spdMul": 1.15,
          "dfAdd": 15,
          "sdAdd": 28,
          "dmgReduceAdd": 0.06,
          "themeColor": "#f48fb1",
          "secondaryColor": "#4caf50",
          "auraScale": 1.18,
          "description": "Hoa ánh sáng trường cửu Light of Ruin của Vua AZ, phục sinh hào quang tiên tộc thanh khiết."
      },
      "mega_dragalge": {
          "id": "mega_dragalge",
          "baseDex": 691,
          "name": "Mega Dragalge",
          "stone": "Dragalgenite",
          "spriteId": "mega_691",
          "spriteAvailable": true,
          "types": [
              "poison",
              "dragon"
          ],
          "atkMul": 1.35,
          "paMul": 1.15,
          "saMul": 1.38,
          "spdMul": 1.05,
          "dfAdd": 25,
          "sdAdd": 30,
          "dmgReduceAdd": 0.09,
          "themeColor": "#7b1fa2",
          "secondaryColor": "#8bc34a",
          "auraScale": 1.22,
          "description": "Hải long độc tố Adaptability nhân đôi uy lực kịch độc rồng biển, phòng ngự phép kiên cố."
      },
      "mega_zygarde": {
          "id": "mega_zygarde",
          "baseDex": 718,
          "name": "Mega Zygarde",
          "stone": "Zygardite",
          "spriteId": "mega_718",
          "spriteAvailable": true,
          "types": [
              "dragon",
              "ground"
          ],
          "atkMul": 1.42,
          "paMul": 1.4,
          "saMul": 1.35,
          "spdMul": 1.1,
          "dfAdd": 35,
          "sdAdd": 35,
          "dmgReduceAdd": 0.12,
          "themeColor": "#00e676",
          "secondaryColor": "#212121",
          "auraScale": 1.35,
          "description": "Thần hộ vệ hệ sinh thái Kalos trừng phạt kẻ xâm lăng, chấn động địa cầu và áp đảo hắc ám."
      },
      "mega_diancie": {
          "id": "mega_diancie",
          "baseDex": 719,
          "name": "Mega Diancie",
          "stone": "Diancite",
          "spriteId": "mega_719",
          "spriteAvailable": true,
          "types": [
              "rock",
              "fairy"
          ],
          "atkMul": 1.42,
          "paMul": 1.4,
          "saMul": 1.4,
          "spdMul": 1.22,
          "dfAdd": 10,
          "sdAdd": 10,
          "dmgReduceAdd": 0.06,
          "themeColor": "#f06292",
          "secondaryColor": "#80deea",
          "auraScale": 1.22,
          "description": "Công chúa kim cương Magic Bounce phản đòn bất lợi, tỏa sáng rực rỡ muôn màu lung linh."
      },
      "mega_drampa": {
          "id": "mega_drampa",
          "baseDex": 780,
          "name": "Mega Drampa",
          "stone": "Drampanite",
          "spriteId": "mega_780",
          "spriteAvailable": true,
          "types": [
              "normal",
              "dragon"
          ],
          "atkMul": 1.36,
          "paMul": 1.1,
          "saMul": 1.4,
          "spdMul": 1.05,
          "dfAdd": 25,
          "sdAdd": 25,
          "dmgReduceAdd": 0.09,
          "themeColor": "#80cbc4",
          "secondaryColor": "#ffb74d",
          "auraScale": 1.25,
          "description": "Lão long hiền triết Berserk nổi giận khi bạn bè bị thương, giáng sấm sét rồng dữ dội."
      },
      "mega_zeraora": {
          "id": "mega_zeraora",
          "baseDex": 807,
          "name": "Mega Zeraora",
          "stone": "Zeraorite",
          "spriteId": "mega_807",
          "spriteAvailable": true,
          "types": [
              "electric"
          ],
          "atkMul": 1.4,
          "paMul": 1.4,
          "saMul": 1.2,
          "spdMul": 1.3,
          "dfAdd": 15,
          "sdAdd": 15,
          "dmgReduceAdd": 0.06,
          "themeColor": "#ffee58",
          "secondaryColor": "#00e5ff",
          "auraScale": 1.22,
          "description": "Tia chớp Plasma Volt Absorb xé toạc màn đêm, tốc độ bứt phá thần tốc di chuyển nhanh nhất."
      },
      "mega_tatsugiri": {
          "id": "mega_tatsugiri",
          "baseDex": 978,
          "name": "Mega Tatsugiri",
          "stone": "Tatsugirinite",
          "spriteId": "mega_978",
          "spriteAvailable": true,
          "types": [
              "dragon",
              "water"
          ],
          "atkMul": 1.35,
          "paMul": 1.05,
          "saMul": 1.4,
          "spdMul": 1.15,
          "dfAdd": 15,
          "sdAdd": 20,
          "dmgReduceAdd": 0.06,
          "themeColor": "#ff7043",
          "secondaryColor": "#fff9c4",
          "auraScale": 1.15,
          "description": "Thần mưu sushi Commander mưu lược xuất chúng, tăng cường phép rồng nước kỳ ảo."
      },
      "mega_venusaur": {
          "id": "mega_venusaur",
          "baseDex": 3,
          "name": "Mega Venusaur",
          "stone": "Venusaurite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "poison"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Venusaur (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_charizard_y": {
          "id": "mega_charizard_y",
          "baseDex": 6,
          "name": "Mega Charizard Y",
          "stone": "Charizardite Y",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fire",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Charizard Y (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_blastoise": {
          "id": "mega_blastoise",
          "baseDex": 9,
          "name": "Mega Blastoise",
          "stone": "Blastoisinite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Blastoise (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_pinsir": {
          "id": "mega_pinsir",
          "baseDex": 127,
          "name": "Mega Pinsir",
          "stone": "Pinsirite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "bug",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Pinsir (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_gyarados": {
          "id": "mega_gyarados",
          "baseDex": 130,
          "name": "Mega Gyarados",
          "stone": "Gyaradosite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "dark"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Gyarados (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_mewtwo_x": {
          "id": "mega_mewtwo_x",
          "baseDex": 150,
          "name": "Mega Mewtwo X",
          "stone": "Mewtwonite X",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "psychic",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Mewtwo X (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_ampharos": {
          "id": "mega_ampharos",
          "baseDex": 181,
          "name": "Mega Ampharos",
          "stone": "Ampharosite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "electric",
              "dragon"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Ampharos (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_scizor": {
          "id": "mega_scizor",
          "baseDex": 212,
          "name": "Mega Scizor",
          "stone": "Scizorite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "bug",
              "steel"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Scizor (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_heracross": {
          "id": "mega_heracross",
          "baseDex": 214,
          "name": "Mega Heracross",
          "stone": "Heracronite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "bug",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Heracross (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_blaziken": {
          "id": "mega_blaziken",
          "baseDex": 257,
          "name": "Mega Blaziken",
          "stone": "Blazikenite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fire",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Blaziken (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_aggron": {
          "id": "mega_aggron",
          "baseDex": 306,
          "name": "Mega Aggron",
          "stone": "Aggronite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "steel"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Aggron (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_garchomp": {
          "id": "mega_garchomp",
          "baseDex": 445,
          "name": "Mega Garchomp",
          "stone": "Garchompite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dragon",
              "ground"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Garchomp (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_abomasnow": {
          "id": "mega_abomasnow",
          "baseDex": 460,
          "name": "Mega Abomasnow",
          "stone": "Abomasite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "ice"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Abomasnow (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_beedrill": {
          "id": "mega_beedrill",
          "baseDex": 15,
          "name": "Mega Beedrill",
          "stone": "Beedrillite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "bug",
              "poison"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Beedrill (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_pidgeot": {
          "id": "mega_pidgeot",
          "baseDex": 18,
          "name": "Mega Pidgeot",
          "stone": "Pidgeotite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "normal",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Pidgeot (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_slowbro": {
          "id": "mega_slowbro",
          "baseDex": 80,
          "name": "Mega Slowbro",
          "stone": "Slowbronite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Slowbro (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_sceptile": {
          "id": "mega_sceptile",
          "baseDex": 254,
          "name": "Mega Sceptile",
          "stone": "Sceptilite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "dragon"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Sceptile (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_swampert": {
          "id": "mega_swampert",
          "baseDex": 260,
          "name": "Mega Swampert",
          "stone": "Swampertite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "ground"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Swampert (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_sharpedo": {
          "id": "mega_sharpedo",
          "baseDex": 319,
          "name": "Mega Sharpedo",
          "stone": "Sharpedonite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "dark"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Sharpedo (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_salamence": {
          "id": "mega_salamence",
          "baseDex": 373,
          "name": "Mega Salamence",
          "stone": "Salamencite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dragon",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Salamence (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_metagross": {
          "id": "mega_metagross",
          "baseDex": 376,
          "name": "Mega Metagross",
          "stone": "Metagrossite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "steel",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Metagross (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_audino": {
          "id": "mega_audino",
          "baseDex": 531,
          "name": "Mega Audino",
          "stone": "Audinite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "normal",
              "fairy"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Audino (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_clefable": {
          "id": "mega_clefable",
          "baseDex": 36,
          "name": "Mega Clefable",
          "stone": "Clefablite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fairy"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Clefable (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_victreebel": {
          "id": "mega_victreebel",
          "baseDex": 71,
          "name": "Mega Victreebel",
          "stone": "Victreebelite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "poison"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Victreebel (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_starmie": {
          "id": "mega_starmie",
          "baseDex": 121,
          "name": "Mega Starmie",
          "stone": "Starminite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Starmie (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_dragonite": {
          "id": "mega_dragonite",
          "baseDex": 149,
          "name": "Mega Dragonite",
          "stone": "Dragonitite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dragon",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Dragonite (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_meganium": {
          "id": "mega_meganium",
          "baseDex": 154,
          "name": "Mega Meganium",
          "stone": "Meganiumite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "fairy"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Meganium (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_feraligatr": {
          "id": "mega_feraligatr",
          "baseDex": 160,
          "name": "Mega Feraligatr",
          "stone": "Feraligatrite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "dark"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Feraligatr (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_froslass": {
          "id": "mega_froslass",
          "baseDex": 478,
          "name": "Mega Froslass",
          "stone": "Froslassite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "ice",
              "ghost"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Froslass (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_emboar": {
          "id": "mega_emboar",
          "baseDex": 500,
          "name": "Mega Emboar",
          "stone": "Emboarite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fire",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Emboar (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_scolipede": {
          "id": "mega_scolipede",
          "baseDex": 545,
          "name": "Mega Scolipede",
          "stone": "Scolipedite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "bug",
              "poison"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Scolipede (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_scrafty": {
          "id": "mega_scrafty",
          "baseDex": 560,
          "name": "Mega Scrafty",
          "stone": "Scraftynite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dark",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Scrafty (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_chandelure": {
          "id": "mega_chandelure",
          "baseDex": 609,
          "name": "Mega Chandelure",
          "stone": "Chandelurite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "ghost",
              "fire"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Chandelure (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_chesnaught": {
          "id": "mega_chesnaught",
          "baseDex": 652,
          "name": "Mega Chesnaught",
          "stone": "Chesnaughtite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Chesnaught (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_delphox": {
          "id": "mega_delphox",
          "baseDex": 655,
          "name": "Mega Delphox",
          "stone": "Delphoxite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fire",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Delphox (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_greninja": {
          "id": "mega_greninja",
          "baseDex": 658,
          "name": "Mega Greninja",
          "stone": "Greninjite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "water",
              "dark"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Greninja (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_pyroar": {
          "id": "mega_pyroar",
          "baseDex": 668,
          "name": "Mega Pyroar",
          "stone": "Pyroarite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU POKÉMON GỐC",
          "types": [
              "fire",
              "normal"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Pyroar (Đang chờ tài nguyên sprite chính thức: THIẾU POKÉMON GỐC)."
      },
      "mega_malamar": {
          "id": "mega_malamar",
          "baseDex": 687,
          "name": "Mega Malamar",
          "stone": "Malamarite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dark",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Malamar (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_barbaracle": {
          "id": "mega_barbaracle",
          "baseDex": 689,
          "name": "Mega Barbaracle",
          "stone": "Barbaraclite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "rock",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Barbaracle (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_hawlucha": {
          "id": "mega_hawlucha",
          "baseDex": 701,
          "name": "Mega Hawlucha",
          "stone": "Hawluchanite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fighting",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Hawlucha (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_falinks": {
          "id": "mega_falinks",
          "baseDex": 870,
          "name": "Mega Falinks",
          "stone": "Falinksite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU POKÉMON GỐC",
          "types": [
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Falinks (Đang chờ tài nguyên sprite chính thức: THIẾU POKÉMON GỐC)."
      },
      "mega_lucario_z": {
          "id": "mega_lucario_z",
          "baseDex": 448,
          "name": "Mega Lucario Z",
          "stone": "Lucarionite Z",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fighting",
              "steel"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Lucario Z (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_garchomp_z": {
          "id": "mega_garchomp_z",
          "baseDex": 445,
          "name": "Mega Garchomp Z",
          "stone": "Garchompite Z",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dragon",
              "ground"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Garchomp Z (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_absol_z": {
          "id": "mega_absol_z",
          "baseDex": 359,
          "name": "Mega Absol Z",
          "stone": "Absolite Z",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dark"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Absol Z (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_raichu_x": {
          "id": "mega_raichu_x",
          "baseDex": 26,
          "name": "Mega Raichu X",
          "stone": "Raichunite X",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "electric",
              "fighting"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Raichu X (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_raichu_y": {
          "id": "mega_raichu_y",
          "baseDex": 26,
          "name": "Mega Raichu Y",
          "stone": "Raichunite Y",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "electric",
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Raichu Y (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_chimecho": {
          "id": "mega_chimecho",
          "baseDex": 358,
          "name": "Mega Chimecho",
          "stone": "Chimechite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "psychic",
              "ghost"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Chimecho (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_staraptor": {
          "id": "mega_staraptor",
          "baseDex": 398,
          "name": "Mega Staraptor",
          "stone": "Staraptorite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "normal",
              "flying"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Staraptor (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_heatran": {
          "id": "mega_heatran",
          "baseDex": 485,
          "name": "Mega Heatran",
          "stone": "Heatranite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fire",
              "steel"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Heatran (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_golurk": {
          "id": "mega_golurk",
          "baseDex": 623,
          "name": "Mega Golurk",
          "stone": "Golurkite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "ground",
              "ghost"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Golurk (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_meowstic": {
          "id": "mega_meowstic",
          "baseDex": 678,
          "name": "Mega Meowstic",
          "stone": "Meowsticite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "psychic"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Meowstic (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_crabominable": {
          "id": "mega_crabominable",
          "baseDex": 740,
          "name": "Mega Crabominable",
          "stone": "Crabominablite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "fighting",
              "ice"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Crabominable (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_golisopod": {
          "id": "mega_golisopod",
          "baseDex": 768,
          "name": "Mega Golisopod",
          "stone": "Golisopodite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "bug",
              "water"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Golisopod (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_magearna": {
          "id": "mega_magearna",
          "baseDex": 801,
          "name": "Mega Magearna",
          "stone": "Magearnite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "steel",
              "fairy"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Magearna (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_scovillain": {
          "id": "mega_scovillain",
          "baseDex": 952,
          "name": "Mega Scovillain",
          "stone": "Scovillainite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "grass",
              "fire"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Scovillain (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_glimmora": {
          "id": "mega_glimmora",
          "baseDex": 970,
          "name": "Mega Glimmora",
          "stone": "Glimmorite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "rock",
              "poison"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Glimmora (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      },
      "mega_baxcalibur": {
          "id": "mega_baxcalibur",
          "baseDex": 998,
          "name": "Mega Baxcalibur",
          "stone": "Baxcaliburite",
          "spriteId": null,
          "spriteAvailable": false,
          "missingReason": "THIẾU SPRITE",
          "types": [
              "dragon",
              "ice"
          ],
          "atkMul": 1.35,
          "paMul": 1.25,
          "saMul": 1.25,
          "spdMul": 1.1,
          "dfAdd": 20,
          "sdAdd": 20,
          "dmgReduceAdd": 0.07,
          "themeColor": "#78909c",
          "secondaryColor": "#37474f",
          "auraScale": 1.2,
          "description": "Mega Baxcalibur (Đang chờ tài nguyên sprite chính thức: THIẾU SPRITE)."
      }
  };

  // Tra cứu dạng Mega theo Base Dex
  const FORMS_BY_DEX = {};
  for (const f of Object.values(FORMS)) {
    if (!FORMS_BY_DEX[f.baseDex]) FORMS_BY_DEX[f.baseDex] = [];
    FORMS_BY_DEX[f.baseDex].push(f);
  }

  // Tùy chọn ưu tiên dạng (cho Pokémon có nhiều dạng như Charizard X/Y, Mewtwo X/Y, Lucario/Lucario Z...)
  const userPreferences = {
    6: 'mega_charizard_x',
    150: 'mega_mewtwo_y',
    359: 'mega_absol',
    448: 'mega_lucario'
  };

  /** Lấy danh sách dạng Mega của một Pokémon */
  function getFormsForDex(dex) {
    return FORMS_BY_DEX[dex] || [];
  }

  /** Kiểm tra Pokémon có khả năng Mega hay không */
  function hasMega(dex) {
    const list = getFormsForDex(dex);
    return list.some(f => f.spriteAvailable && f.spriteId);
  }

  /** Chọn dạng Mega dự kiến theo lựa chọn */
  function getSelectedForm(dex) {
    const list = getFormsForDex(dex);
    if (!list.length) return null;
    const pref = userPreferences[dex];
    if (pref) {
      const match = list.find(f => f.id === pref);
      if (match && match.spriteAvailable && match.spriteId) return match;
    }
    // Chỉ chọn dạng đã có sprite hoàn thiện và khả dụng
    return list.find(f => f.spriteAvailable && f.spriteId) || null;
  }

  /** Đặt dạng ưu tiên (ví dụ Charizard X hoặc Y) */
  function setPreference(dex, formId) {
    const form = FORMS[formId];
    if (form && form.baseDex === dex) {
      if (!form.spriteAvailable || !form.spriteId) {
        // Không cho phép đặt preference cho dạng chưa có sprite hoàn thiện (ví dụ Charizard Y)
        return false;
      }
      userPreferences[dex] = formId;
      return true;
    }
    return false;
  }

  /** Khởi tạo Mega khi bắt đầu một run */
  function onRunStart(pl) {
    if (!pl || !pl.mon) return;
    pl.megaState = STATES.NORMAL;
    pl.megaForm = null;
    pl.megaTimer = 0;
    pl.megaEvolvingT = 0;
    pl.megaAuraPhase = 0;

    if (hasMega(pl.dex)) {
      pl.megaState = STATES.MEGA_READY;
      const targetForm = getSelectedForm(pl.dex);
      if (targetForm && targetForm.spriteId) {
        // Tải trước sprite để không giật khung hình khi biến hình
        G.Sprites.preload([targetForm.spriteId], 8000, pl.shiny);
      }
    }
  }

  /** Kiểm tra xem player có thể kích hoạt Mega ngay bây giờ không */
  function canTrigger(pl) {
    if (!pl || pl.dead) return false;
    if (pl.megaState !== STATES.MEGA_READY) return false;
    const form = getSelectedForm(pl.dex);
    if (!form || !form.spriteAvailable || !form.spriteId) return false;
    return true;
  }

  /** Kích hoạt quá trình tiến hóa Mega */
  function trigger(pl) {
    if (!canTrigger(pl)) return false;
    const form = getSelectedForm(pl.dex);
    if (!form) return false;

    // Chuyển sang trạng thái biến hình
    pl.megaState = STATES.MEGA_EVOLVING;
    pl.megaEvolvingT = CONFIG.evolveAnimDuration;
    pl.megaPendingForm = form;

    // Hiệu ứng âm thanh và chấn động màn hình
    if (G.Audio && typeof G.Audio.sfx === 'function') {
      G.Audio.sfx('legend');
      G.Audio.sfx('surge');
    }
    if (G.Camera && typeof G.Camera.kick === 'function') {
      G.Camera.kick(0.45);
    }

    // Hiệu ứng vòng năng lượng và chữ nổi
    if (G.FX) {
      if (typeof G.FX.ring === 'function') {
        G.FX.ring(pl.x, pl.y, 8, 120, form.themeColor, 0.9, 5);
      }
      if (typeof G.FX.text === 'function') {
        G.FX.text(pl.x, pl.y - pl.bodyH - 18, form.name + '!', '#ffd23f', true);
      }
    }

    // Đồng bộ sang đồng đội trong Co-op
    if (G.Coop && typeof G.Coop.emitMega === 'function') {
      G.Coop.emitMega(form.id);
    }

    return true;
  }

  /** Hoàn thành biến hình Mega và kích hoạt hình thái mới */
  function completeEvolution(pl) {
    const form = pl.megaPendingForm || getSelectedForm(pl.dex);
    if (!form) return;

    pl.megaState = STATES.MEGA_ACTIVE;
    pl.megaForm = form;
    pl.megaPendingForm = null;
    pl.megaTimer = CONFIG.duration; // 0 = vĩnh viễn đến hết run

    // Chuyển đổi Sprite Animator sang dạng Mega nếu có sprite hợp lệ
    if (form.spriteId && G.Sprites) {
      pl.anim = new G.Sprites.Animator(form.spriteId, pl.scale, pl.shiny);
    }

    // Chấn động hào quang kết thúc biến hình
    if (G.Camera && typeof G.Camera.kick === 'function') {
      G.Camera.kick(0.3);
    }
    if (G.FX && typeof G.FX.ring === 'function') {
      G.FX.ring(pl.x, pl.y, 12, 140, form.themeColor, 0.7, 4);
      G.FX.ring(pl.x, pl.y, 6, 80, '#ffffff', 0.5, 3);
    }
  }

  /** Hết hạn hoặc kết thúc Mega */
  function expireMega(pl) {
    if (!pl || pl.megaState !== STATES.MEGA_ACTIVE) return;
    pl.megaState = STATES.MEGA_USED;
    pl.megaForm = null;
    pl.megaTimer = 0;

    // Trở về Animator của Pokémon gốc
    if (G.Sprites) {
      pl.anim = new G.Sprites.Animator(pl.dex, pl.scale, pl.shiny);
    }

    if (G.FX && typeof G.FX.ring === 'function') {
      G.FX.ring(pl.x, pl.y, 10, 60, 'rgba(255,255,255,.5)', 0.5, 2);
    }

    // Đồng bộ hoàn nguyên cho đồng đội trong Co-op
    if (G.Coop && typeof G.Coop.emitMega === 'function' && !pl.remote) {
      G.Coop.emitMega('');
    }
  }

  /** Cập nhật thời gian biến hình và hào quang */
  function update(pl, dt) {
    if (!pl) return;

    // Cập nhật góc quay hào quang
    pl.megaAuraPhase = (pl.megaAuraPhase || 0) + dt * 2.5;

    // Đang biến hình
    if (pl.megaState === STATES.MEGA_EVOLVING) {
      pl.megaEvolvingT -= dt;
      if (pl.megaEvolvingT <= 0) {
        completeEvolution(pl);
      }
      return;
    }

    // Đang trong trạng thái Mega
    if (pl.megaState === STATES.MEGA_ACTIVE) {
      if (CONFIG.duration > 0) {
        pl.megaTimer -= dt;
        if (pl.megaTimer <= 0) {
          expireMega(pl);
        }
      }
    }
  }

  /** Kết thúc run hoặc người chơi chết: Dọn dẹp an toàn */
  function onRunEnd(pl) {
    if (!pl) return;
    if (pl.megaState === STATES.MEGA_ACTIVE || pl.megaState === STATES.MEGA_EVOLVING) {
      if (G.Coop && typeof G.Coop.emitMega === 'function' && !pl.remote) {
        G.Coop.emitMega('');
      }
      if (G.Sprites) {
        pl.anim = new G.Sprites.Animator(pl.dex, pl.scale, pl.shiny);
      }
    }
    pl.megaState = STATES.NORMAL;
    pl.megaForm = null;
    pl.megaPendingForm = null;
    pl.megaTimer = 0;
    pl.megaEvolvingT = 0;
  }

  /** Áp dụng trạng thái Mega cho Puppet trong phòng Co-op */
  function applyPuppet(puppet, formId, shiny, remTime = null) {
    if (!puppet) return;
    if (!formId) {
      // Hoàn nguyên Puppet về dạng thường
      puppet.megaState = STATES.MEGA_USED;
      puppet.megaForm = null;
      puppet.megaTimer = 0;
      if (G.Sprites) {
        puppet.anim = new G.Sprites.Animator(puppet.dex, puppet.scale, shiny);
      }
      return;
    }
    const form = FORMS[formId];
    if (!form || !form.spriteAvailable || !form.spriteId) return;

    puppet.megaState = STATES.MEGA_ACTIVE;
    puppet.megaForm = form;
    puppet.megaTimer = (typeof remTime === 'number' && remTime > 0) ? remTime : CONFIG.duration;
    if (form.spriteId && G.Sprites) {
      puppet.anim = new G.Sprites.Animator(form.spriteId, puppet.scale, shiny);
    }
    if (G.FX && typeof G.FX.ring === 'function') {
      G.FX.ring(puppet.x, puppet.y, 10, 100, form.themeColor, 0.8, 4);
    }
  }

  /** Vẽ hào quang Mega dưới chân và xung quanh Pokémon */
  function drawAura(ctx, pl) {
    if (!pl || pl.dead) return;
    const isEvolving = pl.megaState === STATES.MEGA_EVOLVING;
    const isActive = pl.megaState === STATES.MEGA_ACTIVE;
    if (!isEvolving && !isActive) return;

    const form = pl.megaForm || pl.megaPendingForm || getSelectedForm(pl.dex);
    if (!form) return;

    const col = form.themeColor || '#29b6f6';
    const x = pl.x, y = pl.y;
    const phase = pl.megaAuraPhase || 0;
    const r = pl.r * (form.auraScale || 1.2);

    ctx.save();

    // 1. Vòng hào quang chân phát sáng (pulsing ground aura)
    const pulse = 0.85 + Math.sin(phase * 3) * 0.15;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.5 * pulse, r * 0.75 * pulse, 0, 0, 6.2832);
    ctx.fillStyle = col;
    ctx.globalAlpha = isEvolving ? 0.5 : 0.28;
    ctx.fill();

    // Vành sáng gradient
    ctx.lineWidth = isEvolving ? 3.5 : 2;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = isEvolving ? 0.75 : 0.45;
    ctx.stroke();

    // 2. Các hạt ánh sáng DNA / Mega Motes xoay quanh nhân vật
    const motes = 4;
    for (let i = 0; i < motes; i++) {
      const ang = phase + (i * Math.PI * 2) / motes;
      const mx = x + Math.cos(ang) * (r * 1.35);
      const my = y - 10 + Math.sin(ang) * (r * 0.65) - (pl.bodyH * 0.25);
      const mSize = 3 + Math.sin(phase * 4 + i) * 1.2;

      ctx.beginPath();
      ctx.arc(mx, my, mSize, 0, 6.2832);
      ctx.fillStyle = i % 2 === 0 ? col : '#ffffff';
      ctx.globalAlpha = isEvolving ? 0.9 : 0.65;
      ctx.fill();
    }

    // 3. Tia sáng năng lượng khi đang tiến hóa (Burst rays)
    if (isEvolving) {
      const rays = 8;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      for (let j = 0; j < rays; j++) {
        const rayAng = phase * 2 + (j * Math.PI * 2) / rays;
        const len = r * (1.8 + Math.sin(phase * 6 + j) * 0.5);
        ctx.beginPath();
        ctx.moveTo(x, y - pl.bodyH * 0.4);
        ctx.lineTo(x + Math.cos(rayAng) * len, y - pl.bodyH * 0.4 + Math.sin(rayAng) * len);
        ctx.globalAlpha = 0.6;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Vẽ nút MEGA trên HUD
   * Vị trí: Đặt bên phải của thanh 8 kỹ năng, không che khuất bất kỳ phần tử nào.
   * Kích thước: 48x48 CSS px (vùng chạm chuẩn di động >= 44x44px).
   */
  function drawButton(ctx, pl, bounds) {
    if (!pl || !hasMega(pl.dex)) return;

    const { x, y, size = 48, touch = false } = bounds;
    const state = pl.megaState || STATES.NORMAL;
    const form = getSelectedForm(pl.dex);
    const col = form ? form.themeColor : '#29b6f6';

    const isReady = state === STATES.MEGA_READY;
    const isEvolving = state === STATES.MEGA_EVOLVING;
    const isActive = state === STATES.MEGA_ACTIVE;
    const isUsed = state === STATES.MEGA_USED;

    // Đăng ký vùng chạm cho mobile touch
    if (G.Touch && typeof G.Touch.addButton === 'function') {
      G.Touch.addButton(x, y, size, size, () => {
        if (isReady) trigger(pl);
      }, 4);
    }

    ctx.save();

    // Bo góc hình chữ nhật
    const radius = 12;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);

    // Nền nút
    if (isReady) {
      const pulse = 0.8 + Math.sin(performance.now() * 0.006) * 0.2;
      ctx.fillStyle = 'rgba(20, 28, 52, 0.95)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      ctx.stroke();

      // Hào quang nút bấm sẵn sàng
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = pulse * 0.7;
      ctx.stroke();
    } else if (isActive) {
      ctx.fillStyle = 'rgba(15, 35, 45, 0.95)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      ctx.stroke();
    } else if (isEvolving) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
    } else {
      // Đã dùng (USED)
      ctx.fillStyle = 'rgba(16, 20, 28, 0.6)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120, 140, 160, 0.3)';
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Vẽ biểu tượng Mega (Mega Stone Emblem)
    const cx = x + size / 2;
    const cy = y + size / 2 - (touch ? 2 : 5);

    // Biểu tượng DNA helix cách điệu của Mega Evolution
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, 6.2832);
    ctx.fillStyle = isReady ? col : isActive ? col : '#5c6b73';
    ctx.fill();

    // Dải xoắn DNA bên trong
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 4, Math.PI / 4, 0, 6.2832);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 4, -Math.PI / 4, 0, 6.2832);
    ctx.fillStyle = isReady ? '#ffd54f' : '#b0bec5';
    ctx.fill();

    // Nhãn văn bản
    ctx.textAlign = 'center';
    ctx.font = '700 9px Pixelify, "Segoe UI", sans-serif';

    if (isReady) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(touch ? 'MEGA' : 'MEGA [M]', cx, y + size - 5);
    } else if (isActive) {
      ctx.fillStyle = col;
      ctx.fillText('ACTIVE', cx, y + size - 5);
    } else if (isEvolving) {
      ctx.fillStyle = '#212121';
      ctx.fillText('EVOLVE', cx, y + size - 5);
    } else {
      ctx.fillStyle = '#8090a0';
      ctx.fillText('USED', cx, y + size - 5);
    }

    ctx.restore();
  }

  return {
    STATES,
    CONFIG,
    FORMS,
    FORMS_BY_DEX,
    hasMega,
    getFormsForDex,
    getSelectedForm,
    setPreference,
    canTrigger,
    trigger,
    update,
    onRunStart,
    onRunEnd,
    applyPuppet,
    expireMega,
    drawAura,
    drawButton
  };
})();
