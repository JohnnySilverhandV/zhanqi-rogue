// ============================================================
// 工具函数
// ============================================================

// 是否为「没有 hover 的触摸设备」（手机 / 平板）。
// 这类设备 tap 一次只会触发 mouseenter，永远等不到 mouseleave，
// 所以悬浮详情必须靠定时器自动收起，否则会一直糊在画面上。
const IS_TOUCH = (function () {
  try { return !!(window.matchMedia && window.matchMedia('(hover: none)').matches); }
  catch (e) { return false; }
})();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function moveDist(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function canReach(u, x1, y1, x2, y2) {
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  if (u.mage) return true;
  if (dx !== 0 && dy !== 0) return false;
  return (dx + dy) <= u.range;
}

function inBounds(x, y) {
  return x >= 0 && x < CONFIG.SIZE && y >= 0 && y < CONFIG.SIZE;
}

// 场上是否还有 BOSS（垃圾话只在"对面有 BOSS"时才说）
function hasBoss() {
  return !!(G && G.enemies && G.enemies.some(e => e && e.isBoss && e.hp > 0));
}

// ============================================================
// 攻击特效（纯 CSS 渐变 + 关键帧，不使用任何图片素材）
// ============================================================
function cellRectInWrap(x, y) {
  const wrap = document.getElementById('board-wrap');
  const board = document.getElementById('board');
  if (!wrap || !board || !board.children) return null;
  const cell = board.children[y * CONFIG.SIZE + x];
  if (!cell || typeof cell.getBoundingClientRect !== 'function') return null;
  const cr = cell.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  if (!cr.width) return null;
  return {
    cx: cr.left - wr.left + cr.width / 2,
    cy: cr.top - wr.top + cr.height / 2,
    w: cr.width, h: cr.height,
  };
}

function fxNode(wrap, cls, style, ttl) {
  const el = document.createElement('div');
  el.className = cls;
  if (style) {
    Object.keys(style).forEach(k => {
      if (k.indexOf('--') === 0) el.style.setProperty(k, style[k]);
      else el.style[k] = style[k];
    });
  }
  wrap.appendChild(el);
  setTimeout(() => { if (el.remove) el.remove(); }, ttl || 600);
  return el;
}

// kind: hit | crit | miss | heal |   side: player | enemy
// opts.noBeam：不再画「攻击者→目标」的光束（形状特效已经画过一条贯穿整行/列的光带，
//              再叠 8 条斜光束只会糊成一片）
function battleFx(ax, ay, tx, ty, kind, side, opts) {
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return;
  const t = cellRectInWrap(tx, ty);
  if (!t) return;

  const enemySide = side === 'enemy';
  const noBeam = !!(opts && opts.noBeam);

  // 治疗：绿色上升光环
  if (kind === 'heal') {
    fxNode(wrap, 'fx-heal', { left: t.cx + 'px', top: t.cy + 'px' }, 900);
    return;
  }
  // 闪避 / 免疫：虚线弧
  if (kind === 'miss') {
    fxNode(wrap, 'fx-swoosh', { left: t.cx + 'px', top: t.cy + 'px' }, 700);
    return;
  }

  const crit = kind === 'crit';
  const mod = crit ? ' crit' : (enemySide ? ' enemy' : '');

  // 命中闪光
  fxNode(wrap, 'fx-flash' + mod, {
    left: t.cx + 'px', top: t.cy + 'px', width: t.w + 'px', height: t.h + 'px',
  }, 560);

  // 冲击环
  fxNode(wrap, 'fx-ring' + mod, { left: t.cx + 'px', top: t.cy + 'px' }, 720);
  if (crit) {
    setTimeout(() => fxNode(wrap, 'fx-ring crit ring2', { left: t.cx + 'px', top: t.cy + 'px' }, 820), 100);
  }

  // 攻击轨迹：从攻击者指向目标的光束
  const a = cellRectInWrap(ax, ay);
  if (!noBeam && a && (a.cx !== t.cx || a.cy !== t.cy)) {
    const dx = t.cx - a.cx, dy = t.cy - a.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    fxNode(wrap, 'fx-beam' + mod, {
      left: a.cx + 'px', top: (a.cy - 2) + 'px', width: len + 'px', '--ang': ang + 'deg',
    }, 540);
    // 近战（贴脸）：交击火花
    if (len <= t.w * 1.6) {
      fxNode(wrap, 'fx-clash' + (crit ? ' crit' : ''), { left: t.cx + 'px', top: t.cy + 'px' }, 580);
    }
  }

  // 暴击：整个棋盘一次轻微震屏
  if (crit) {
    wrap.classList.remove('fx-shake');
    void wrap.offsetWidth;
    wrap.classList.add('fx-shake');
    setTimeout(() => wrap.classList.remove('fx-shake'), 360);
  }
}

// ------------------------------------------------------------
// 技能特效：把「这一下打的是哪一片」直接画在棋盘上
//   现在只有一种技能（法师的地火），所以只剩「以靶心为中心的一圈火」，
//   圈的直径按档位放大：单体 / 十字 / 八格
// ------------------------------------------------------------
// 从某一格向两侧铺一条光带（row = 横带，col = 竖带）—— 暂时没有技能用到，
// 保留给后续「射线类」技能复用
function bandFx(cx, cy, kind) {
  const wrap = document.getElementById('board-wrap');
  const board = document.getElementById('board');
  if (!wrap || !board) return;
  const r = cellRectInWrap(cx, cy);
  if (!r) return;
  const br = board.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  if (!br.width) return;
  const c = r.w;
  const bx = br.left - wr.left, by = br.top - wr.top;

  if (kind === 'row') {
    const top = (r.cy - c * 0.46) + 'px';
    const hgt = (c * 0.92) + 'px';
    const mid = r.cx - bx;
    if (mid > 1) fxNode(wrap, 'fx-row-shot left', { left: bx + 'px', top: top, width: mid + 'px', height: hgt }, 1250);
    if (br.width - mid > 1) fxNode(wrap, 'fx-row-shot right', { left: r.cx + 'px', top: top, width: (br.width - mid) + 'px', height: hgt }, 1250);
    fxNode(wrap, 'fx-muzzle', { left: r.cx + 'px', top: r.cy + 'px' }, 760);
    return;
  }

  if (kind === 'col') {
    const left = (r.cx - c * 0.46) + 'px';
    const wid = (c * 0.92) + 'px';
    const mid = r.cy - by;
    if (mid > 1) fxNode(wrap, 'fx-col-shot up', { left: left, top: by + 'px', width: wid, height: mid + 'px' }, 1250);
    if (br.height - mid > 1) fxNode(wrap, 'fx-col-shot down', { left: left, top: r.cy + 'px', width: wid, height: (br.height - mid) + 'px' }, 1250);
    fxNode(wrap, 'fx-muzzle', { left: r.cx + 'px', top: r.cy + 'px' }, 760);
  }
}

function ringFx(cx, cy, scale) {
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return;
  const r = cellRectInWrap(cx, cy);
  if (!r) return;
  const d = r.w * (scale || 3.1);
  fxNode(wrap, 'fx-ring8', { left: r.cx + 'px', top: r.cy + 'px', width: d + 'px', height: d + 'px' }, 1150);
  setTimeout(() => {
    fxNode(wrap, 'fx-ring8 wave2', { left: r.cx + 'px', top: r.cy + 'px', width: d + 'px', height: d + 'px' }, 1150);
  }, 120);
  fxNode(wrap, 'fx-muzzle big', { left: r.cx + 'px', top: r.cy + 'px' }, 820);
}

function skillCastFx(u, s, ax, ay) {
  if (!u || !s) return;
  if (s.kind === 'fire') {
    // 地火：环的直径按档位放大 —— 单体一圈小的、十字中圈、八格大圈
    const t = fireTierOf(u);
    ringFx(ax, ay, t.orth === 0 ? 1.7 : (t.orth === 1 ? 2.6 : 3.4));
    return;
  }
  // 兜底：靶心横竖各一道
  bandFx(ax, ay, 'row');
  setTimeout(() => bandFx(ax, ay, 'col'), 90);
  ringFx(ax, ay);
}


// 阵亡爆裂
function deathFx(x, y) {
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return;
  const t = cellRectInWrap(x, y);
  if (!t) return;
  fxNode(wrap, 'fx-burst', { left: t.cx + 'px', top: t.cy + 'px' }, 720);
  fxNode(wrap, 'fx-burst shard', { left: t.cx + 'px', top: t.cy + 'px' }, 720);
}

// ============================================================
// 飘字
// ============================================================
function floatText(x, y, text, cls) {
  const wrap = document.getElementById('board-wrap');
  const board = document.getElementById('board');
  if (!board) return;
  const cell = board.children[y * CONFIG.SIZE + x];
  if (!cell) return;
  const wr = wrap.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-text ' + (cls || '');
  el.textContent = text;
  el.style.left = (cr.left - wr.left + cr.width / 2) + 'px';
  el.style.top = (cr.top - wr.top) + 'px';
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// ============================================================
// 日志（双通道：弹幕 + 文字落档）
//
//   2026-10-24 主界面精简：日志栏从主界面上撤掉了，改成两处出口：
//     · 行动栏的空位 —— 只显示「最新一条」，不用点就能看见刚发生了什么
//     · 顶栏「日志」按钮 —— 打开全量清单（想复盘才去翻）
//   落档从 DOM 改成 G.logLines 数组：不再靠 scrollHeight 裁剪，
//   隐藏 / 弹窗 / 窄屏都不影响条数，也省掉一堆布局抖动。
//
//   弹幕白名单：
//     player  我方命中        enemy 敌方命中      miss 闪避
//     crit    暴击（大字）    kill  击杀（大字）  skill 技能（大字）
//     levelup 升级（大字）                system 回合切换等节点
//   只落档不飘的：经验 exp / 回血 heal / 地形 terrain / 垃圾话 taunt
//   （这些要么每回合都有、要么屏幕上有专门的视觉表现，飘起来纯噪音）
//
//   第 3 个参数 noDm=true 表示「这条只落档」，用于板书类说明。
// ============================================================
const DM_TYPES = {
  player: 1, enemy: 1, miss: 1,
  crit: 1, kill: 1, skill: 1, levelup: 1,
  system: 1,
};

const LOG_MAX = 400;

function log(msg, type, noDm) {
  if (G) {
    if (!Array.isArray(G.logLines)) G.logLines = [];
    G.logLines.push({ t: msg, c: type || '' });
    if (G.logLines.length > LOG_MAX) {
      G.logLines.splice(0, G.logLines.length - LOG_MAX);
    }
    // 行动栏空位同步刷新（只在没选中单位时才占用那一行）
    if (typeof renderLatestLog === 'function') renderLatestLog();
  }
  if (!noDm && typeof DM !== 'undefined' && DM_TYPES[type]) {
    // 大型节点（击杀 / 暴击 / 技能 / 升级）走大字，普通交锋走小字
    const big = (type === 'kill' || type === 'crit' || type === 'skill' || type === 'levelup');
    DM.push(msg, dmClsOfType(type), { big: big });
  }
}

// ============================================================
// 单位工厂
// ============================================================
function makeUnit(type, x, y, team) {
  const t = UNIT_TEMPLATES[type];
  if (!t) return null;

  // 敌人等级随层数提升（每 2 层 +1 级），属性随等级同步增强
  //   生命成长快于攻击成长：改成手动单体攻击后，玩家清怪速度变慢，
  //   如果敌人攻击也按同样倍率涨，几回合就会把队伍磨死。
  const enemyLv = 1 + Math.floor(Math.max(0, (G.floor || 1) - 1) / 2);
  const B = CONFIG.BALANCE || {};
  const hpScale = team === 'enemy' ? (1 + (enemyLv - 1) * (B.ENEMY_HP_SCALE || 0.44)) : 1;
  const atkScale = team === 'enemy' ? (1 + (enemyLv - 1) * (B.ENEMY_ATK_SCALE || 0.30)) : 1;
  const hp = Math.floor(t.hp * hpScale);

  return {
    type, name: t.name, icon: t.icon,
    x, y, team,
    hp, maxHp: hp,
    atk: Math.floor(t.atk * atkScale),
    range: t.range,
    move: t.move,
    crit: t.crit || 0.05,
    dodge: t.dodge || 0.05,
    level: team === 'enemy' ? enemyLv : 1,
    exp: 0,

    isHero: !!t.isHero,
    isBoss: !!t.isBoss,
    mage: !!t.mage,
    guard: !!t.guard,
    atkMode: t.atkMode || 'cross1',       // 普攻形态：cross1 前后左右 / archerRing 射手环
    atkRange: t.atkRange || 1,            // 普攻距离（等级成长由 recalcHeroStats 结算）
    fly: !!t.fly,                         // 飞行：无视地形（河流 / 高山可走、森林不减速）
    isMagic: !!t.mage,                    // 法术攻击：受目标「魔抗」影响
    growth: t.growth || { hp: 5, atk: 1 },

    hasMoved: false,
    hasActed: false,

    // 成长
    killGrowth: 0,
    turnGrowth: 0,
    turnHpGrowth: 0,

    // 战斗
    defense: 0,
    // 护甲：每次受物理攻击的固定减伤（模板基础值 + 卡牌加成）
    // 魔抗：受法术伤害的百分比减伤（模板基础值 + 卡牌加成）
    armor: t.armor || 0,
    magicRes: t.magicRes || 0,
    atkBuff: 0,
    stun: false,
    blind: false,

    // 流血（来源：卡牌 / 奇遇附加的持续伤害）
    bleedDmg: 0,
    bleedTurns: 0,

    // 永久加成（由 recalcHeroStats 统一结算）
    bonusAtk: 0,
    bonusHp: 0,
    bonusCrit: 0,
    bonusDodge: 0,
    bonusArmor: 0,
    bonusMagicRes: 0,
    // 卡牌词条（原装备词条系统的落点，现在只由卡牌 / 奇遇写入）：
    //   bonus 附加伤害 / lifesteal 吸血 / bleed 流血 / critDmg 暴伤
    //   double 双倍 / execute 处决 / armorPen 破甲
    //   reduce 减伤 / regen 回血 / thorns 反伤 / hpPct 生命%
    //   goldPerHit / goldOnKill 经济
    affix: {},
    revengeCount: 0,

    // 特殊
    splash: 0,
    reflect: 0,
    undying: false,        // 旧的布尔标记（兼容老存档）
    revive: false,
    undyingCount: 0,       // 「无尽的愤怒」锁血剩余次数（可叠加）
    reviveCount: 0,        // 「不死鸟」复活剩余次数（可叠加）
    grudgeLv: 0,           // 「卧薪尝胆」层数（可叠加：每层损血加成再乘一次）
    noDefense: false,
    noMove: false,
    fullAttack: false,
    fullMove: false,
    revenge: false,
    grudge: false,
    multiAttack: 0,
    knockback: 0,
  };
}