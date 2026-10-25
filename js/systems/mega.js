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

  // Bảng dữ liệu các dạng Mega Evolution giai đoạn 1
  const FORMS = {
    'mega_charizard_x': {
      id: 'mega_charizard_x',
      baseDex: 6,
      name: 'Mega Charizard X',
      stone: 'Charizardite X',
      spriteId: 'mega_6_x',
      spriteAvailable: true,
      types: ['fire', 'dragon'],
      // Chỉ số cộng thêm / hệ số nhân
      atkMul: 1.35,
      paMul: 1.30,
      saMul: 1.20,
      spdMul: 1.05,
      dfAdd: 33,
      sdAdd: 10,
      dmgReduceAdd: 0.08,
      themeColor: '#29b6f6',      // Lửa rồng xanh lam
      secondaryColor: '#37474f',  // Đen than đá
      auraScale: 1.25,
      description: 'Lửa rồng đen xanh cực mạnh, tăng 35% sát thương và tăng phòng thủ vật lý.'
    },
    'mega_charizard_y': {
      id: 'mega_charizard_y',
      baseDex: 6,
      name: 'Mega Charizard Y',
      stone: 'Charizardite Y',
      spriteId: null, // Chưa có sprite chính thức từ PMDCollab (sprite_complete: 0)
      spriteAvailable: false,
      types: ['fire', 'flying'],
      atkMul: 1.40,
      paMul: 1.15,
      saMul: 1.40,
      spdMul: 1.05,
      dfAdd: 10,
      sdAdd: 30,
      dmgReduceAdd: 0.05,
      themeColor: '#ff9800',      // Lửa mặt trời rực sáng
      secondaryColor: '#f57c00',
      auraScale: 1.2,
      description: 'Hỏa thần mặt trời, tăng 40% sát thương đặc biệt và kháng phép cao.'
    },
    'mega_gengar': {
      id: 'mega_gengar',
      baseDex: 94,
      name: 'Mega Gengar',
      stone: 'Gengarite',
      spriteId: 'mega_94',
      spriteAvailable: true,
      types: ['ghost', 'poison'],
      atkMul: 1.35,
      paMul: 1.05,
      saMul: 1.35,
      spdMul: 1.15,
      dfAdd: 20,
      sdAdd: 20,
      dmgReduceAdd: 0.06,
      themeColor: '#ab47bc',      // Hắc ám tím ma mị
      secondaryColor: '#7b1fa2',
      auraScale: 1.15,
      description: 'Bóng ma không gian thứ ba, tăng 35% sát thương và 15% tốc độ di chuyển.'
    },
    'mega_gardevoir': {
      id: 'mega_gardevoir',
      baseDex: 282,
      name: 'Mega Gardevoir',
      stone: 'Gardevoirite',
      spriteId: 'mega_282',
      spriteAvailable: true,
      types: ['psychic', 'fairy'],
      atkMul: 1.35,
      paMul: 1.05,
      saMul: 1.35,
      spdMul: 1.12,
      dfAdd: 10,
      sdAdd: 25,
      dmgReduceAdd: 0.06,
      themeColor: '#ec407a',      // Hồng tiên tộc rực rỡ
      secondaryColor: '#42a5f5',  // Lam thanh khiết
      auraScale: 1.2,
      description: 'Nữ hoàng tiên tộc, tăng 35% sát thương phép và chỉ số phòng thủ phép.'
    },
    'mega_lucario': {
      id: 'mega_lucario',
      baseDex: 448,
      name: 'Mega Lucario',
      stone: 'Lucarionite',
      spriteId: 'mega_448',
      spriteAvailable: true,
      types: ['fighting', 'steel'],
      atkMul: 1.35,
      paMul: 1.35,
      saMul: 1.25,
      spdMul: 1.15,
      dfAdd: 18,
      sdAdd: 10,
      dmgReduceAdd: 0.08,
      themeColor: '#ffca28',      // Hoàng kim Aura
      secondaryColor: '#1e88e5',  // Lam võ sĩ
      auraScale: 1.18,
      description: 'Thần sóng Aura tối thượng, tăng 35% đòn đánh cận chiến và 15% tốc độ.'
    }
  };

  // Tra cứu dạng Mega theo Base Dex
  const FORMS_BY_DEX = {};
  for (const f of Object.values(FORMS)) {
    if (!FORMS_BY_DEX[f.baseDex]) FORMS_BY_DEX[f.baseDex] = [];
    FORMS_BY_DEX[f.baseDex].push(f);
  }

  // Tùy chọn ưu tiên dạng (cho Charizard: X hoặc Y)
  const userPreferences = {
    6: 'mega_charizard_x'
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
  function applyPuppet(puppet, formId, shiny) {
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
    puppet.megaTimer = CONFIG.duration;
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
    drawAura,
    drawButton
  };
})();
