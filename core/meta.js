// ============================================================
// 存档奖励系统（跨局永久的「账号进度」）
//
//   一局 = 第 N 次挑战，从第 1 层爬到第 99 层。爬到顶就通关，
//   通关后自动进入下一次挑战（无限刷），并把奖励存进永久仓库。
//
//   装备系统已删除（2026-10-24），道具系统也已删除（同日晚些），
//   凯莉商店也在第四次大改里删掉了，所以仓库只攒一样开局军费：
//     · gold  开局金币 —— 进本局直接进钱包，通关三选一里花（重掷 / 多拿卡 / 升一级）
//
//   天赋（talents）—— 通关次数达标后解锁，之后每通关一次自动 +1，可无限累积：
//     · 🌳 伐木工  通关 1 次解锁 · 每回合额外 +1 金币
//     · 💰 商人    通关 3 次解锁 · 通关三选一里的花费 -5%/级（最高 -40%）
//     · 🎒 收藏家  通关 5 次解锁 · 开局多送 1 张随机卡
//     · ⚔️ 老兵    通关 7 次解锁 · 开局全队等级 +1
// ============================================================
const META_KEY = 'zhanqi_rogue_meta_v2';

const META_CLEAR_REWARD = { gold: 300 };

const TALENTS = [
  {
    id: 'lumberjack', name: '伐木工', icon: '🌳', unlockAt: 1, max: 99,
    desc: function (lv) { return '每回合额外获得 ' + lv + ' 金币'; },
  },
  {
    id: 'merchant', name: '商人', icon: '💰', unlockAt: 3, max: 8,
    desc: function (lv) { return '通关三选一的花费 -' + Math.min(40, lv * 5) + '%'; },
  },
  {
    id: 'collector', name: '收藏家', icon: '🎒', unlockAt: 5, max: 8,
    desc: function (lv) { return '开局额外获得 ' + lv + ' 张随机卡牌'; },
  },
  {
    id: 'veteran', name: '老兵', icon: '⚔️', unlockAt: 7, max: 9,
    desc: function (lv) { return '开局全队等级 +' + lv; },
  },
];

let META = null;

function createMeta() {
  return {
    v: 2,
    clears: 0,                 // 累计通关次数（爬到 99 层）
    best: 1,                   // 历史最高层
    talents: {},               // { lumberjack: 3, ... }
    vault: { gold: 0 },
  };
}

function loadMeta() {
  if (META) return META;
  let raw = null;
  try { raw = localStorage.getItem(META_KEY); } catch (e) {}
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
  META = Object.assign(createMeta(), data || {});
  META.vault = Object.assign({ gold: 0 }, META.vault || {});
  delete META.vault.potions;      // 道具已删除，老存档里的药水直接丢掉
  META.talents = META.talents || {};
  if (typeof META.clears !== 'number' || META.clears < 0) META.clears = 0;
  if (typeof META.best !== 'number' || META.best < 1) META.best = 1;
  return META;
}

function saveMeta() {
  if (!META) return;
  try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) {}
}

function metaVal(id) {
  loadMeta();
  return META.talents[id] || 0;
}

function metaUnlocked(t) {
  return loadMeta().clears >= t.unlockAt;
}

// ---- 天赋的实际效果 ----
function metaTurnGold() { return metaVal('lumberjack'); }
// 商人：通关三选一里的三种花费（重掷 / 多拿一张 / 全队升级）打折
function metaDiscount() {
  const cap = (CONFIG.SPEND && CONFIG.SPEND.DISCOUNT_CAP) || 0.4;
  return Math.min(cap, metaVal('merchant') * 0.05);
}
function metaStartCards() { return metaVal('collector'); }
function metaStartLevel() { return metaVal('veteran'); }

// ============================================================
// 通关结算：入库 + 天赋成长
//   返回 [{ talent, lv, first }]，供通关弹窗逐条展示
// ============================================================
function grantClearRewards() {
  loadMeta();
  META.clears += 1;
  META.best = Math.max(META.best, 99);
  META.vault.gold += META_CLEAR_REWARD.gold;

  const ups = [];
  TALENTS.forEach(function (t) {
    if (!metaUnlocked(t)) return;
    const cur = META.talents[t.id] || 0;
    if (cur >= t.max) return;
    META.talents[t.id] = cur + 1;
    ups.push({ talent: t, lv: cur + 1, first: cur === 0 });
  });
  saveMeta();
  return ups;
}

// ============================================================
// 新周目开局：把仓库里的开局军费发下去（自动，不需要玩家操作）
// ============================================================
function applyMetaStart() {
  loadMeta();
  const out = { gold: 0, cards: 0, level: 0 };

  if (META.vault.gold > 0) {
    G.gold += META.vault.gold;
    out.gold = META.vault.gold;
  }
  return out;
}

// 天赋的开局效果（老兵等级 / 收藏家卡牌）—— 必须等 G.allies 建好之后再调
function applyMetaTalents(out) {
  const lv = metaStartLevel();
  if (lv > 0 && G && G.allies && G.allies.length) {
    G.allies.forEach(function (a) { a.level = (a.level || 1) + lv; });
    out.level = lv;
    if (typeof recalcHeroStats === 'function') recalcHeroStats();
  }
  const n = metaStartCards();
  if (n > 0 && typeof drawCards === 'function' && typeof applyCard === 'function') {
    const cards = drawCards(n);
    cards.forEach(function (c) { applyCard(c); });
    out.cards = cards.length;
  }
  return out;
}

// 开局军备播报（弹幕）
function reportMetaArming(out) {
  if (!out || typeof DM === 'undefined') return;
  const bits = [];
  if (out.gold) bits.push('开局军费 ' + out.gold + ' 金');
  if (out.level) bits.push('老兵：全队等级 +' + out.level);
  if (out.cards) bits.push('收藏家：额外 ' + out.cards + ' 张卡');
  if (!bits.length) return;
  DM.result('🎁 存档军备：' + bits.join(' · '), true);
}

// 记录历史最高层（存档面板里显示成就）
function metaRecordFloor(floor) {
  loadMeta();
  if (floor > META.best) {
    META.best = floor;
    saveMeta();
  }
}

function resetMeta() {
  META = createMeta();
  saveMeta();
}

// ============================================================
// 存档面板（顶栏「存档」按钮）
// ============================================================
function showMetaPanel() {
  loadMeta();
  const rows = TALENTS.map(function (t) {
    const lv = META.talents[t.id] || 0;
    const ok = metaUnlocked(t);
    const name = ok
      ? t.name + ' Lv' + lv
      : t.name + '（未解锁：通关 ' + t.unlockAt + ' 次解锁）';
    const note = ok ? t.desc(lv || 1) : '';
    return '<div class="meta-row' + (ok ? ' on' : '') + '">' +
        '<span class="meta-ico">' + t.icon + '</span>' +
        '<span class="meta-name">' + name + '</span>' +
        '<span class="meta-desc">' + note + '</span>' +
      '</div>';
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal meta-modal">
      <h2>存档</h2>
      <div class="meta-sub">累计通关 <b>${META.clears}</b> 次 · 最高到过第 <b>${META.best}</b> 层</div>

      <div class="meta-sec">开局军费（只能用通关奖励攒，买不到）</div>
      <div class="meta-vault">
        <span>💰 开局金币 <b>${META.vault.gold}</b></span>
      </div>

      <div class="meta-sec">天赋（通关一次自动 +1，可无限累积）</div>
      <div class="meta-list">${rows}</div>

      <div class="meta-tip">每局卡牌 / 等级 / 金币都会清零；开局金币与天赋永久生效，进本局立刻到账。</div>
      <div class="meta-foot">
        <button class="btn ghost" id="meta-sound">音效：${(typeof SFX !== 'undefined' && SFX.isMuted()) ? '关' : '开'}</button>
        <button class="btn ghost" id="meta-restart">重新挑战</button>
        <button class="btn danger" id="meta-reset">清空存档</button>
        <button class="btn" id="meta-close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#meta-close').onclick = function () { modal.remove(); };

  // 音效开关 / 重新挑战从主界面搬到这里：主界面只留高频操作
  const snd = modal.querySelector('#meta-sound');
  if (snd) snd.onclick = function () {
    if (typeof SFX !== 'undefined') SFX.toggle();
    snd.textContent = '音效：' + (SFX.isMuted() ? '关' : '开');
  };
  const rst = modal.querySelector('#meta-restart');
  if (rst) rst.onclick = function () {
    if (!confirm('确定重新挑战？\n\n· 卡牌、等级、金币全部清零\n· 存档仓库的开局金币会在开局自动到账\n· 累计通关、天赋、仓库剩余军费永久保留\n· 挑战次数 +1')) return;
    modal.remove();
    restartRun((G.challenge || 1) + 1);
  };

  modal.querySelector('#meta-reset').onclick = function () {
    if (!confirm('确定清空存档？\n\n· 累计通关次数、天赋、开局军费全部归零\n· 当前这一局的进度也会一起清掉\n\n（不可恢复）')) return;
    resetMeta();
    modal.remove();
    restartRun(1);
    if (typeof DM !== 'undefined') DM.result('存档已清空，从第 1 次挑战重新开始', false);
  };
}
