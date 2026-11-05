// ============================================================
// 回合流程
// ============================================================
function initFloor(floor) {
  G.floor = floor;
  // 换层：清掉「本层已通关」的挂起标记，否则新层永远判不出通关
  G.clearing = false;
  if (typeof metaRecordFloor === 'function') metaRecordFloor(floor);
  G.grid = Array.from({ length: CONFIG.SIZE }, () => Array(CONFIG.SIZE).fill(null));
  // 地形：每层随机生成（保证可通行格全部连通，不会把单位困死）
  G.terrain = genTerrain(floor);
  G.allies = [];
  G.enemies = [];
  G.selected = null;
  // 换层：清掉上一层的头顶对白气泡
  if (typeof clearBubbles === 'function') clearBubbles();

  // 我方 4 人小队：出生位置「全盘随机」
  //   为什么随机：射手的环、法师的地火都只在特定相对位置才有得打，
  //   固定站位会让某几个人永远够不着敌人。双方随机散布才有戏。
  //   英雄（王子）= 主角（倒下即本局结束，垃圾话也由他说）；鸟人 = 前期核心；
  //   法师 = 全队唯一有技能的。
  const order = ['birdking', 'champion', 'wizard', 'archer'];
  const allySpots = [];
  for (let y = 0; y < CONFIG.SIZE; y++)
    for (let x = 0; x < CONFIG.SIZE; x++)
      if (isPassable(x, y) && !G.grid[y][x]) allySpots.push({ x, y });
  shuffle(allySpots);

  order.forEach(type => {
    const spot = allySpots.pop();
    if (!spot) return;
    const u = makeUnit(type, spot.x, spot.y, 'player');
    if (!u) return;
    G.allies.push(u);
    G.grid[spot.y][spot.x] = u;
    if (u.isHero) G.hero = u;
  });

  // 继承上一层（或存档）的等级 / 成长 / 永久标记，然后统一结算属性
  applyAllyProgress();
  recalcHeroStats();

  // 满血开局（等级提升后 maxHp 变大，血条要跟着补满）
  G.allies.forEach(a => { a.hp = a.maxHp; });

  // 敌人（前期更少、更弱，节奏更快）
  // 我方 4 人（鸟人 / 英雄 / 法师 / 射手），其中射手和法师血薄，
  // 单层同屏上限仍收在 6，避免开局就被围死。
  const base = 1 + Math.floor(floor / 2) + Math.floor(Math.random() * 2);
  const cap = (CONFIG.BALANCE && CONFIG.BALANCE.ENEMY_MAX) || 6;
  const count = Math.min(cap, base);   // 第1层 1~2
  const isBossFloor = floor % 5 === 0;
  // 前期敌人类型池：1~2 层只出最弱的，3~4 层加入兽人，5 层起全类型
  const pool = floor <= 2 ? ['goblin', 'shooter']
             : floor <= 4 ? ['goblin', 'shooter', 'orc']
             : ENEMY_TYPES;
  // 敌人出生位：同样「全盘随机」，与己方呼应（双方交错才有直线角色发挥空间）。
  //   两块排序：优先挑「不与我方贴脸（8 邻域）」的格子，贴脸格只在位置不够时兜底，
  //   避免随机出一堆敌人把队伍围在中间、开局就被秒。
  //   必须排除不可通行地形与已被占用的格子——否则会让单位只存在于 G.enemies
  //   而不在棋盘上 → 谁都打不到 → 该层永久卡死（历史 bug）。
  const adjacentToAlly = (x, y) => G.allies.some(a =>
    a.hp > 0 && Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1);
  const farSpots = [], nearSpots = [];
  for (let y = 0; y < CONFIG.SIZE; y++)
    for (let x = 0; x < CONFIG.SIZE; x++) {
      if (!isPassable(x, y) || G.grid[y][x]) continue;
      (adjacentToAlly(x, y) ? nearSpots : farSpots).push({ x, y });
    }
  shuffle(farSpots);
  shuffle(nearSpots);
  const positions = farSpots.concat(nearSpots);

  let total = count + (isBossFloor ? 1 : 0);
  let idx = 0;
  let spawned = 0;
  if (isBossFloor && positions[idx]) {
    const p = positions[idx++];
    const boss = makeUnit('boss', p.x, p.y, 'enemy');
    G.enemies.push(boss);
    G.grid[p.y][p.x] = boss;
    spawned++;
  }
  // 注意：occupied 的格子要跳过但不占用名额，否则第1层可能刷出 0 个敌人
  while (spawned < total && idx < positions.length) {
    const p = positions[idx++];
    if (G.grid[p.y][p.x]) continue;
    const t = pick(pool);
    const e = makeUnit(t, p.x, p.y, 'enemy');
    G.enemies.push(e);
    G.grid[p.y][p.x] = e;
    spawned++;
  }

  const eLv = 1 + Math.floor(Math.max(0, floor - 1) / 2);
  const tsum = terrainSummary();
  log(`—— 第 ${floor} 层 —— 敌人等级 Lv${eLv}`, 'system');
  log(`🗺️ 地形：🌲森林 ${tsum.forest} · 🌊河流 ${tsum.river} · ⛰️高山 ${tsum.mountain} · 平地 ${tsum.plain}`, 'terrain', true);
  if (floor === 1) {
    log('🎯 战棋操作：点己方单位 → 点蓝格移动 → 点红格敌人攻击（一次只打一个）', 'system', true);
    log('✳ 行动栏：攻击 / 待命（再点一次自己也行）；只有法师多一个技能', 'system', true);
    log(`   队形：${G.allies.map(a => a.icon + a.name + '·' + atkLabel(a)
      + (skillOf(a) ? '·' + skillLabelOf(a) : '·无技能')).join('  ')}`, 'system', true);
    log(`   🤴 英雄是主角（倒了本局结束）；🦅 鸟人飞行无视地形；射手贴脸打不到`, 'system', true);
  }
  if (isBossFloor) {
    log(`☠️ BOSS 出现了！（Lv${eLv}）`, 'system');
    // 遇到 BOSS：等开场弹字飘完，再让魔王与主角在日志里对喷
    const sayFloor = floor;
    const boss = G.enemies.find(e => e && e.isBoss);
    setTimeout(() => {
      if (!G || G.floor !== sayFloor || G.gameOver) return;
      if (typeof tauntSay === 'function') {
        if (boss && boss.hp > 0) tauntSay(boss, pick(BOSS_TAUNTS.start));
        if (G.hero && G.hero.hp > 0) tauntSay(G.hero, pick(HERO_TAUNTS.start));
      } else {
        if (boss) log(pick(BOSS_TAUNTS.start), 'taunt-boss');
        if (G.hero) log(pick(HERO_TAUNTS.start), 'taunt-hero');
      }
    }, 1150);
  }

  // 进入新一层：弹字提示（不挡操作，2.4 秒慢慢飘走）
  if (typeof showTurnBanner === 'function') {
    showTurnBanner('第 ' + floor + ' 层', isBossFloor ? 'BOSS 出现 · 开始行动' : '战斗开始', isBossFloor ? 'enemy' : 'neutral');
  }
}

// ============================================================
// 全员行动完毕 → 自动结束回合
// ============================================================
function checkAllActed() {
  if (G.phase !== 'player' || G.gameOver) return;
  if (G.clearing) return;                               // 已判定通关，别再自动进敌人回合
  if (!G.enemies.length) return;                        // 已清场，交给通关结算
  if (G.allies.some(a => a.hp > 0 && !a.hasActed)) return;
  if (G.autoEndPending) return;

  G.autoEndPending = true;
  const token = G.turn;
  setTimeout(() => {
    G.autoEndPending = false;
    // 期间可能已进入敌人回合 / 已换层，做一次校验再结束
    if (G.phase === 'player' && !G.gameOver && G.turn === token &&
        G.enemies.length && !G.allies.some(a => a.hp > 0 && !a.hasActed)) {
      log('全员行动完毕，自动结束回合', 'system');
      endPlayerTurn();
    }
  }, 300);
}

function endPlayerTurn() {
  if (G.phase !== 'player' || G.gameOver) return;

  G.selected = null;
  G.mode = null;

  G.phase = 'enemy';
  render();
  if (typeof SFX !== 'undefined') SFX.turn();
  if (typeof showTurnBanner === 'function') showTurnBanner('行动结束', '敌人回合', 'enemy');
  log(`—— 敌人回合（${G.enemies.length} 个敌人行动）——`, 'system');
  setTimeout(enemyTurn, 400);
}

function afterEnemyTurn() {
  if (G.gameOver) return;

  // 回合成长（累积到 bonus，由 recalcHeroStats 结算）
  G.allies.forEach(a => {
    if (a.turnGrowth) a.bonusAtk += a.turnGrowth;
    if (a.turnHpGrowth) { a.bonusHp += a.turnHpGrowth; a.hp += a.turnHpGrowth; }
    a.hasMoved = false;
    a.hasActed = false;
  });

  // 卡牌词条：每回合回血
  G.allies.forEach(a => {
    const regen = (a.affix && a.affix.regen) || 0;
    if (regen > 0 && a.hp > 0 && a.hp < a.maxHp) {
      const h = Math.floor(a.maxHp * regen);
      if (h > 0) {
        a.hp = Math.min(a.maxHp, a.hp + h);
        battleFx(a.x, a.y, a.x, a.y, 'heal', 'player');
        floatText(a.x, a.y, '+' + h, 'float-heal');
        log(`🩹 ${a.name} 卡牌回血 +${h}（${a.hp}/${a.maxHp}）`, 'heal');
      }
    }
  });

  // 流血（词条附加，对敌人生效，每回合开始结算，持续 2 回合）
  [...G.enemies].forEach(e => {
    if (!e || e.hp <= 0 || !(e.bleedTurns > 0) || !(e.bleedDmg > 0)) return;
    e.hp -= e.bleedDmg;
    floatText(e.x, e.y, '-' + e.bleedDmg, 'float-dmg');
    log(`🩸 ${e.name} 流血 -${e.bleedDmg}（剩余 ${e.bleedTurns - 1} 回合）`, 'player');
    e.bleedTurns--;
    if (e.bleedTurns <= 0) e.bleedDmg = 0;
    if (e.hp <= 0) killUnit(G, e, G.hero);
  });

  // 治疗buff（奶妈已移除）：每回合开始，全队按最大生命比例回血
  const healPct = CONFIG.HEAL_REGEN + (G.healBonus || 0);
  let healSum = 0, healN = 0;
  G.allies.forEach(a => {
    if (a.hp <= 0 || a.hp >= a.maxHp) return;
    const want = Math.max(1, Math.floor(a.maxHp * healPct));
    const real = Math.min(want, a.maxHp - a.hp);
    if (real <= 0) return;
    a.hp += real;
    healSum += real;
    healN++;
    battleFx(a.x, a.y, a.x, a.y, 'heal', 'player');
    floatText(a.x, a.y, '+' + real, 'float-heal');
  });
  if (healN > 0) {
    if (typeof SFX !== 'undefined') SFX.heal();
    log(`💖 全队回血：${healN} 人共回复 ${healSum} 生命（每回合 ${(healPct * 100).toFixed(1)}%）`, 'heal');
  }

  // 金币：基础 + 局内加成 + 存档天赋「伐木工」
  const talentGold = (typeof metaTurnGold === 'function') ? metaTurnGold() : 0;
  const turnIncome = CONFIG.GOLD.TURN + (G.turnGold || 0) + talentGold;
  G.gold += turnIncome;
  G.turn++;

  G.phase = 'player';
  G.mode = null;
  log(`—— 第 ${G.turn} 回合 · 场上敌人 ${G.enemies.length} 个 ——`, 'system');
  if (typeof showTurnBanner === 'function') showTurnBanner('回合开始', `第 ${G.turn} 回合 · 开始行动`, 'player');
  recalcHeroStats();
  saveGame();
  render();
}

function startPlayerTurn() {
  if (G.gameOver) return;
  afterEnemyTurn();
}

function checkWin() {
  if (G.gameOver || G.clearing) return;
  const bossFloor = (G.floor % 5) === 0;
  const bossAlive = G.enemies.some(e => e && e.isBoss && e.hp > 0);

  // 普通层：必须清干净场上敌人
  // BOSS 层：**魔王一倒就算通关**，剩下的小怪不用再打
  const cleared = G.enemies.length === 0 || (bossFloor && !bossAlive);
  if (!cleared) return;

  G.clearing = true;
  if (bossFloor && G.enemies.length > 0) {
    log(`☠️ 魔王已倒下 · 剩余 ${G.enemies.length} 个敌人不用再打，直接通关`, 'system');
    if (typeof DM !== 'undefined') DM.result('☠️ 魔王倒下 · 本层通关！', true);
  }
  setTimeout(() => showFloorClearModal(), 400);
}