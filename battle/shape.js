// ============================================================
// 攻击距离 / 技能范围（纯判定，不做结算）
//
//   2026-10-24 第四次重做：
//     · 技能只剩法师一家（地火），鸟人 / 射手 / 英雄都是纯普攻单位
//     · 地火的「施法距离」= 射手 1 级的形状（十字第 2 格 + 斜角第 1 格），
//       固定不变远 —— 贴身第 1 格永远烧不到，站错位置就得先走一步
//     · 地火的「爆炸范围」按法师等级变（单体 → 十字 → 一圈）
//
//   每个单位每回合 = 移动一次 + 做一件事：
//     ① 攻击  在射程内点一个目标，只打这一个人
//     ② 技能  只有法师有：地火
//     ③ 待命  再点一次自己脚下的格子即可（board.js handleClick）
//
//   普攻形态 atkMode：
//     cross1      前后左右 1 格（鸟人 / 英雄 / 法师）
//     archerRing  十字第 2~N 格 + 斜角第 1~N-1 格（射手，N 随等级 2→3→4，里层不清空）
// ============================================================

// 技能表：按单位 type 取（现在只有法师有键）
//   kind   fire 地火（按等级扩爆炸范围）
//   cast   施法距离的形状：archerRing + castN = 十字第 N 格 + 斜角第 N-1 格
const SKILLS = {
  wizard: {
    id: 'dihuo', name: '地火', icon: '🔥', kind: 'fire',
    cast: 'archerRing', castN: 2,
    desc: '点一个敌人引燃地火，范围内所有敌人受到等量法术伤害（随法师等级扩圈）',
  },
};

// 法师地火的等级档位（1 级 / 5 级 / 10 级各一档）
//   orth = 以靶心为中心向外的扩散形状：0 只有靶心 / 1 十字 4 格 / 2 周围 8 格
//   mult = 法术倍率 —— 法师本体攻击力压得很低，全靠这个系数把「法术伤害」顶起来
const FIRE_TIERS = [
  { lv: 1,  orth: 0, mult: 2.60, name: '地火1', area: '只烧中目标一人' },
  { lv: 5,  orth: 1, mult: 2.20, name: '地火2', area: '目标和前后左右各 1 格' },
  { lv: 10, orth: 2, mult: 1.80, name: '地火3', area: '目标和周围 8 格' },
];

const _CARD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const _DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function atkModeOf(u) {
  if (!u) return 'cross1';
  return u.atkMode || 'cross1';
}

function atkRangeOf(u) {
  const cap = (CONFIG.SHAPE && CONFIG.SHAPE.RANGE_CAP) || 7;
  return Math.max(1, Math.min(cap, u.atkRange || 1));
}

function mountainBlocks() {
  return !!(CONFIG.SHAPE && CONFIG.SHAPE.MOUNTAIN_BLOCKS);
}

function _blocked(x, y) {
  return mountainBlocks() && terrainAt(x, y) === 'mountain';
}

// 射线：从 (fx,fy) 向 d 方向走 maxRange 步
//   stopAtMountain = true 时遇到高山就停（箭被挡住），并且山本身不可打
function _ray(set, fx, fy, dx, dy, maxRange, stopAtMountain) {
  let x = fx + dx, y = fy + dy;
  for (let i = 0; i < maxRange; i++) {
    if (!inBounds(x, y)) return;
    if (stopAtMountain && _blocked(x, y)) return;
    set.add(x + ',' + y);
    x += dx; y += dy;
  }
}

// ------------------------------------------------------------
// 十字 + 斜角（射手普攻 / 法师施法共用）
//   span=false（法师施法）：只取第 N 格那一层
//     N=2 → 十字第 2 格 + 四个斜角第 1 格（贴身第 1 格是死角）
//   span=true （射手普攻）：从里往外全都要，升级时里层不清空
//     N=2 → 十字第 2 格 + 斜角第 1 格
//     N=3 → 十字第 2~3 格 + 斜角第 1~2 格
//     N=4 → 十字第 2~4 格 + 斜角第 1~3 格
// ------------------------------------------------------------
function archerRingN(u) {
  const lv = (u && u.level) || 1;
  return lv >= 10 ? 4 : (lv >= 5 ? 3 : 2);
}

function _archerRingCells(out, fx, fy, n, span) {
  const orthFrom = span ? 2 : n;
  const diagTo = n - 1;
  for (let r = orthFrom; r <= n; r++) {
    _CARD.forEach(d => {
      const x = fx + d[0] * r, y = fy + d[1] * r;
      if (inBounds(x, y)) out.add(x + ',' + y);
    });
  }
  const diagFrom = span ? 1 : diagTo;
  for (let r = diagFrom; r <= diagTo; r++) {
    _DIAG.forEach(d => {
      const x = fx + d[0] * r, y = fy + d[1] * r;
      if (inBounds(x, y)) out.add(x + ',' + y);
    });
  }
}

// ------------------------------------------------------------
// 普攻可选格（不含自己）
// ------------------------------------------------------------
function atkCells(u, fx, fy) {
  const out = new Set();
  if (!u) return out;
  const mode = atkModeOf(u);

  if (mode === 'archerRing') {
    _archerRingCells(out, fx, fy, archerRingN(u), true);
    return out;
  }

  // cross1（以及敌人预览用的兜底）：前后左右，距离 range
  const r = atkRangeOf(u);
  _CARD.forEach(d => _ray(out, fx, fy, d[0], d[1], r, false));
  return out;
}

function _unitAt(x, y) {
  return (G && G.grid[y]) ? G.grid[y][x] : null;
}

// 普攻能打的敌人（站在 atkCells 里的敌对单位）
function atkTargets(u, fx, fy) {
  const res = [];
  if (!u || !G || !G.grid) return res;
  atkCells(u, fx, fy).forEach(k => {
    const i = k.indexOf(',');
    const t = _unitAt(+k.slice(0, i), +k.slice(i + 1));
    if (t && t.team !== u.team && t.hp > 0) res.push(t);
  });
  return res;
}

// 普攻范围的白话说明（行动栏 / 队伍表 / 新手引导共用）
function atkLabel(u) {
  const m = atkModeOf(u);
  if (m === 'archerRing') {
    const n = archerRingN(u);
    if (n <= 2) return '十字第 2 格 · 斜角第 1 格';
    return `十字第 2~${n} 格 · 斜角第 1~${n - 1} 格`;
  }
  const r = atkRangeOf(u);
  return r <= 1 ? '前后左右 1 格' : `前后左右 ${r} 格`;
}

function skillOf(u) {
  return (u && SKILLS[u.type]) ? SKILLS[u.type] : null;
}

// 地火档位（其他技能恒定返回第一档）
function fireTierOf(u) {
  const s = skillOf(u);
  if (!s || s.kind !== 'fire') return FIRE_TIERS[0];
  const lv = (u && u.level) || 1;
  let cur = FIRE_TIERS[0];
  FIRE_TIERS.forEach(t => { if (lv >= t.lv) cur = t; });
  return cur;
}

// 技能显示名：地火会带档位（地火1 / 地火2 / 地火3）
function skillLabelOf(u) {
  const s = skillOf(u);
  if (!s) return '';
  if (s.kind === 'fire') return fireTierOf(u).name;
  return s.name;
}

// 技能伤害系数（地火随档位下降，因为打的人变多了）
function skillMultOf(u) {
  const s = skillOf(u);
  if (!s) return 1;
  if (s.kind === 'fire') return fireTierOf(u).mult;
  return s.mult;
}

// 法术强度：法师的普攻已经压到 1，地火走这条独立数值（recalcHeroStats 结算）
function spellPowerOf(u) {
  if (!u) return 1;
  if (typeof u.spell === 'number' && u.spell > 0) return u.spell;
  return Math.max(1, u.atk || 1);
}

// 技能说明（队伍表 / 说明弹窗用，地火会写出当前档位的范围与真实伤害）
function skillDescOf(u) {
  const s = skillOf(u);
  if (!s) return '';
  if (s.kind === 'fire') {
    const t = fireTierOf(u);
    const dmg = Math.max(1, Math.floor(spellPowerOf(u) * t.mult));
    return `${t.area}，各受约 ${dmg} 点法术伤害`;
  }
  return s.desc;
}

// 施法距离的白话说明（固定不变远 —— 法师升级只扩大爆炸范围）
function skillRangeLabel(u) {
  const s = skillOf(u);
  if (!s) return '';
  if (s.cast === 'archerRing') {
    const n = s.castN || 2;
    return `十字第 ${n} 格 · 斜角第 ${n - 1} 格`;
  }
  return `前后左右 ${s.range || 1} 格`;
}

// ------------------------------------------------------------
// 技能：可点击的落点（都必须踩着敌人，否则点了也没意义）
//   地火的施法距离 = 射手 1 级的形状：十字第 2 格 + 斜角第 1 格，
//   **固定不随等级变远**，而且贴身的第 1 格永远烧不到。
// ------------------------------------------------------------
function skillCastCells(u) {
  const out = new Set();
  const s = skillOf(u);
  if (!u || !s) return out;
  if (s.cast === 'archerRing') {
    _archerRingCells(out, u.x, u.y, s.castN || 2, false);
    return out;
  }
  // 兜底：十字 range 格
  _CARD.forEach(d => _ray(out, u.x, u.y, d[0], d[1], s.range || 2, false));
  return out;
}

function skillAnchorCells(u) {
  const out = new Set();
  if (!u || !skillOf(u) || !G || !G.grid) return out;
  skillCastCells(u).forEach(k => {
    const i = k.indexOf(',');
    const t = _unitAt(+k.slice(0, i), +k.slice(i + 1));
    if (t && t.team !== u.team && t.hp > 0) out.add(k);
  });
  return out;
}

// 技能落点确定后，实际覆盖哪些格子
//   fire → 靶心 + 前后左右（地火2）/ 靶心 + 周围八格（地火3）
function skillCoverCells(u, ax, ay) {
  const out = new Set();
  const s = skillOf(u);
  if (!u || !s || !G || !G.grid) return out;

  const t = fireTierOf(u);
  if (t.orth === 0) return out;                 // 地火1：只有靶心，没有额外格子
  _CARD.forEach(d => {
    const x = ax + d[0], y = ay + d[1];
    if (inBounds(x, y)) out.add(x + ',' + y);
  });
  if (t.orth >= 2) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = ax + dx, y = ay + dy;
        if (inBounds(x, y)) out.add(x + ',' + y);
      }
  }
  return out;
}

// 覆盖格里站着的敌人（靶心排第一，它是这场爆发的中心）
function skillTargetsAt(u, ax, ay) {
  const res = [];
  const seen = new Set();
  const push = (t) => {
    if (!t || t.team === u.team || t.hp <= 0) return;
    const key = t.x + ',' + t.y;
    if (seen.has(key)) return;
    seen.add(key);
    res.push(t);
  };
  push(_unitAt(ax, ay));
  skillCoverCells(u, ax, ay).forEach(k => {
    const i = k.indexOf(',');
    push(_unitAt(+k.slice(0, i), +k.slice(i + 1)));
  });
  return res;
}

// 技能当前能打到几个人（行动栏按钮用）：取所有落点里命中最多的那个
function skillHitCount(u) {
  if (!u) return 0;
  if (!skillOf(u)) return 0;
  let best = 0;
  skillAnchorCells(u).forEach(k => {
    const i = k.indexOf(',');
    const n = skillTargetsAt(u, +k.slice(0, i), +k.slice(i + 1)).length;
    if (n > best) best = n;
  });
  return best;
}

// ------------------------------------------------------------
// 敌方威胁范围（悬浮到敌人身上时预演「它下回合能打到哪」）
//   敌人沿用旧规则：十字射程；魔法师全屏
// ------------------------------------------------------------
function enemyThreatCells(u) {
  const out = new Set();
  if (!u || !G || !G.grid) return out;
  if (u.mage) {
    for (let y = 0; y < CONFIG.SIZE; y++)
      for (let x = 0; x < CONFIG.SIZE; x++)
        if (x !== u.x || y !== u.y) out.add(x + ',' + y);
    return out;
  }
  const r = Math.min(7, u.range || 1);
  _CARD.forEach(d => _ray(out, u.x, u.y, d[0], d[1], r, false));
  return out;
}
