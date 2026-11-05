// ============================================================
// 全局状态
// ============================================================
let G = null;

function createState() {
  return {
    // 进度
    floor: 1,
    turn: 1,
    challenge: 1,        // 第几次挑战
    phase: 'player',     // player / enemy

    // 资源
    gold: 0,
    levelBuys: 0,        // 本局花金币全队升级的次数（价钱按它指数翻倍，跨层保留）

    // 单位
    allies: [],
    enemies: [],
    grid: [],
    hero: null,
    allyProgress: null,  // 队伍成长快照（跨层继承等级/成长/永久标记）

    // 交互
    selected: null,
    mode: null,          // 行动模式：null / 'attack' / 'skill'（技能选落点中）
    jumpFloor: null,     // 下一层要跳到的目标层（我命由我不由天用）

    // 卡牌
    buffs: [],           // 永久 buff 列表
    armed: [],           // 待发卡牌（下次攻击 / 受伤时触发，触发后移出）

    // 奇遇（每 7 层触发一次）
    encounterHistory: [],  // 已触发过的奇遇 id，避免重复
    encounterCount: 0,     // 已触发奇遇次数

    // 全局加成
    goldBonus: 0,
    turnGold: 0,
    luck: 0,
    healBonus: 0,

    // 文字日志（装备栏删掉后，全量日志改为数据 + 弹窗，不再靠 DOM 裁剪）
    logLines: [],

    // 状态
    gameOver: false,
    clearing: false,         // 本层已判定通关、正在弹结算（防止重复触发 / 又进敌人回合）
    autoEndPending: false,   // 正在等待"全员行动完自动结束回合"
  };
}

function newGame(challenge) {
  G = createState();
  if (challenge) G.challenge = challenge;
  initFloor(1);
  render();
  if (hasBoss()) {
    const boss = G.enemies.find(e => e && e.isBoss);
    if (typeof tauntSay === 'function') {
      if (G.hero) tauntSay(G.hero, pick(HERO_TAUNTS.start));
      if (boss) tauntSay(boss, pick(BOSS_TAUNTS.start));
    } else {
      log(pick(HERO_TAUNTS.start), 'taunt-hero');
      log(pick(BOSS_TAUNTS.start), 'taunt-boss');
    }
  }
}

// ============================================================
// 重开一局（第 N 次挑战）
//   肉鸽循环：卡牌 / 等级 / 金币 / 层数 全部清零，
//   带得进下一局的只有「存档仓库的开局资源」与「永久天赋」。
// ============================================================
function restartRun(challenge) {
  if (typeof tutCancel === 'function') tutCancel();
  if (typeof DM !== 'undefined') DM.clear();

  const next = challenge || ((G && G.challenge) || 1) + 1;

  clearSave();
  newGame(next);                       // 全新一局：卡牌 / 等级 / 金币 / 层数全部清零

  // 仓库里的开局资源（金币）
  const arming = (typeof applyMetaStart === 'function') ? applyMetaStart()
    : { gold: 0, cards: 0, level: 0 };

  // 天赋的开局效果（老兵等级 / 收藏家卡牌）—— 必须在人建好之后
  if (typeof applyMetaTalents === 'function') applyMetaTalents(arming);

  G.allies.forEach(a => { a.hp = a.maxHp; });   // 满血开局
  saveGame();
  render();
  if (typeof reportMetaArming === 'function') reportMetaArming(arming);
}

// ============================================================
// 队伍成长快照：跨层 / 跨存档继承等级、成长与永久标记
// ============================================================
const PROGRESS_FIELDS = [
  'level', 'exp',
  'killGrowth', 'turnGrowth', 'turnHpGrowth',
  'bonusAtk', 'bonusHp', 'bonusCrit', 'bonusDodge', 'bonusArmor', 'bonusMagicRes',
  'affix',                       // 卡牌词条：跨层必须带走，否则每层重建单位就丢了
  'revenge', 'revengeCount',
  'undying', 'revive', 'undyingCount', 'reviveCount',
  'splash', 'knockback', 'reflect', 'grudge', 'grudgeLv',
  'noDefense', 'noMove', 'fullAttack', 'fullMove', 'atkBuff', 'defense',
];

function snapshotAllies() {
  if (!G) return [];
  const byType = {};
  // 先保留上一层的记录（阵亡队友的等级/成长也不丢）
  (G.allyProgress || []).forEach(p => { byType[p.type] = Object.assign({}, p); });
  (G.allies || []).forEach(a => {
    const o = { type: a.type };
    PROGRESS_FIELDS.forEach(f => { o[f] = a[f]; });
    byType[a.type] = o;
  });
  return Object.keys(byType).map(t => byType[t]);
}

function applyAllyProgress() {
  if (!G || !G.allyProgress) return;
  G.allies.forEach(a => {
    const p = G.allyProgress.find(x => x.type === a.type);
    if (!p) return;
    PROGRESS_FIELDS.forEach(f => { if (p[f] !== undefined) a[f] = p[f]; });
  });
}
