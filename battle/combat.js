// ============================================================
// 战斗：攻击、伤害、死亡
// ============================================================
// 说明：2026-10-24 起改为手动战棋 —— 玩家在射程内点谁就打谁（battle/action.js）。
// 本文件只负责「一次伤害结算」，不再自动开火。
//   mult  伤害倍率（技能 AOE 用）
//   opts  { noBeam } 不画攻击者→目标的光束（技能一次打一片时用，避免一堆光束糊屏）
//         { quiet }  这条伤害只写日志栏，不飘弹幕（AOE 多段命中时由技能统一播报）

function dealDamage(g, attacker, target, mult = 1, opts) {
  const o = opts || {};
  // 攻击音效：按出手单位类型给不同音色（鸟人 / 射手 / 法师 / 敌人 / BOSS）
  if (typeof SFX !== 'undefined') SFX.attack(attacker);

  // 地形：站在森林里出手，视野被树木遮挡 → 命中率 -20%
  const inForest = isForest(attacker.x, attacker.y);
  const dodgeChance = Math.min(0.9, (target.dodge || 0) + (inForest ? FOREST_MISS : 0));
  if (Math.random() < dodgeChance) {
    if (typeof SFX !== 'undefined') SFX.miss();
    battleFx(attacker.x, attacker.y, target.x, target.y, 'miss', attacker.team);
    floatText(target.x, target.y, 'MISS', 'float-miss');
    log(`${target.name} 闪避了攻击！${inForest ? `（${attacker.name} 身处森林，命中下降）` : ''}`,
        target.team === 'player' ? 'player' : 'enemy', o.quiet);
    return;
  }

  const af = attacker.affix || {};
  const isCrit = Math.random() < attacker.crit;
  let critMul = 1.8 + (af.critDmg || 0);
  // 伤害基数：默认用普攻攻击力；法术（地火）走独立的法术强度，由调用方传进来
  const baseDmg = (o.baseDmg != null) ? o.baseDmg : attacker.atk;
  // 攻击加成（atkBuff）已经在 recalcHeroStats 里乘进 attacker.atk，这里不再重复乘
  let dmg = Math.floor(baseDmg * (isCrit ? critMul : 1) * mult);

  // 装备词条：概率双倍
  let isDouble = false;
  if (af.double && Math.random() < af.double) { dmg *= 2; isDouble = true; }

  // 装备词条：处决——对生命低于 30% 的目标额外加伤
  let isExecute = false;
  if (af.execute && target.maxHp > 0 && target.hp / target.maxHp < 0.3) {
    dmg = Math.floor(dmg * (1 + af.execute));
    isExecute = true;
  }

  // 卧薪尝胆：损血越多攻击越高（可叠加层数，每层再加一次收益）
  const grudgeLv = attacker.grudgeLv || (attacker.grudge ? 1 : 0);
  if (grudgeLv > 0 && attacker.hp < attacker.maxHp) {
    const lost = 1 - attacker.hp / attacker.maxHp;
    dmg = Math.floor(dmg * (1 + Math.min(2.0, lost * 0.5 * grudgeLv)));
  }

  let def = target.defense || 0;
  if (target.noDefense) def = -9999;
  if (def > 0) dmg = Math.floor(dmg * (1 - def));
  if (def < 0) dmg = 99999;

  // 目标装备词条：受伤减免
  const tReduce = Math.min(0.9, (target.affix && target.affix.reduce) || 0);
  if (def >= 0 && tReduce > 0) dmg = Math.floor(dmg * (1 - tReduce));

  // 护甲 / 魔抗（2026-10-24 加入）
  //   · 法术伤害（法师的地火 o.magic / 敌方法师 isMagic）→ 由「魔抗」按百分比减伤
  //   · 物理伤害（所有普攻）→ 由「护甲」按固定值减伤；带「破甲」词条则无视护甲
  //   坦克护甲高魔抗低，所以砍不动的时候换法师的地火去烧。
  //   注意：别把减伤结果写回 opts —— doSkill 一次打一片时共用同一个对象。
  const isMagic = !!(o.magic || attacker.isMagic);
  let armorCut = 0, mrCut = 0;
  if (def >= 0) {
    if (isMagic) {
      const mr = Math.min(0.9, target.magicRes || 0);
      if (mr > 0) { dmg = Math.floor(dmg * (1 - mr)); mrCut = mr; }
    } else if (!af.armorPen) {
      const arm = target.armor || 0;
      if (arm > 0) { dmg = Math.max(1, dmg - arm); armorCut = arm; }
    }
  }

  // 攻击者装备词条：附加伤害
  if (af.bonus && def >= 0) dmg += Math.floor(dmg * af.bonus);

  // ===== 待发·受伤型卡牌（在扣血之前判定，可免疫 / 反弹 / 全体回满血）=====
  if (target.team === 'player') {
    const hctx = { attacker, target, dmg, cancel: false, reflect: 0 };
    fireArmed('hurt', hctx);

    if (hctx.cancel) {
      battleFx(attacker.x, attacker.y, target.x, target.y, 'miss', attacker.team);
      floatText(target.x, target.y, '免疫', 'float-miss');
      log(`🛡️ ${target.name} 免疫了 ${attacker.name} 的攻击`, 'system');
      return;
    }
    if (hctx.reflect > 0) {
      attacker.hp = Math.max(1, attacker.hp - hctx.reflect);
      floatText(attacker.x, attacker.y, '反弹 -' + hctx.reflect, 'float-dmg');
      log(`🪞 反弹 ${hctx.reflect} 伤害给 ${attacker.name}`, 'system');
      if (attacker.hp <= 0) killUnit(g, attacker, target);
    }
  }

  target.hp -= dmg;
  const cls = isCrit ? 'float-crit' : 'float-dmg';
  const tag = (isCrit ? '暴击 ' : '') + (isDouble ? '双倍 ' : '') + (isExecute ? '处决 ' : '');
  if (typeof SFX !== 'undefined') SFX.hit(isCrit, isDouble || isExecute);
  // 单体普攻：画一条「攻击者 → 目标」的光束，出手方向一眼可见
  battleFx(attacker.x, attacker.y, target.x, target.y,
    (isCrit || isDouble) ? 'crit' : 'hit', attacker.team,
    { noBeam: !!o.noBeam });
  floatText(target.x, target.y, tag + '-' + dmg, cls);
  // 减伤提示：护甲 / 魔抗挡掉了多少，直接写在日志里 ——
  // 不然「打坦克只掉 3 血」会让人以为出 bug 了
  const mit = armorCut > 0 ? `（护甲 -${armorCut}）`
            : mrCut > 0 ? `（魔抗 -${Math.round(mrCut * 100)}%）` : '';
  // 弹幕：暴击走大字「crit」，普通命中走小字流水
  log(`${attacker.name} 攻击 ${target.name}，造成 ${dmg} 伤害${mit}`
    + `${isCrit ? '（暴击！）' : ''}${isDouble ? '（双倍！）' : ''}${isExecute ? '（处决！）' : ''}`,
      isCrit ? 'crit' : (attacker.team === 'player' ? 'player' : 'enemy'), o.quiet);

  // 装备词条：每次命中额外获得金币
  if (af.goldPerHit && attacker.team === 'player') {
    g.gold += af.goldPerHit;
    floatText(attacker.x, attacker.y, '+' + af.goldPerHit + '金', 'float-exp');
  }

  // 装备词条：流血——命中后目标每回合损失「攻击力 × val」，持续 2 回合
  if (af.bleed && target.hp > 0 && target.team !== attacker.team) {
    const bd = Math.max(1, Math.floor(attacker.atk * af.bleed));
    target.bleedDmg = Math.max(target.bleedDmg || 0, bd);
    target.bleedTurns = 2;
    log(`🩸 ${target.name} 陷入流血（每回合 -${target.bleedDmg}，持续 2 回合）`,
      attacker.team === 'player' ? 'player' : 'enemy');
  }

  // 垃圾话（只在对面有 BOSS 时才说）—— 只落日志，不再冒头顶气泡
  const bossOnField = hasBoss();
  if (bossOnField && isCrit && attacker.isHero) say(attacker, pick(HERO_TAUNTS.crit));
  if (isCrit && attacker.isBoss) say(attacker, pick(BOSS_TAUNTS.crit));
  if (target.isHero && attacker.isBoss && Math.random() < 0.3) say(attacker, pick(BOSS_TAUNTS.heroHurt));
  if (bossOnField && target.isHero && target.hp > 0 && target.hp / target.maxHp < 0.5 && Math.random() < 0.3)
    say(target, pick(HERO_TAUNTS.hurt));

  // 装备词条：攻击吸血
  if (af.lifesteal && dmg > 0 && attacker.hp > 0 && attacker.hp < attacker.maxHp) {
    const steal = Math.max(1, Math.floor(dmg * af.lifesteal));
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + steal);
    battleFx(attacker.x, attacker.y, attacker.x, attacker.y, 'heal', attacker.team);
    floatText(attacker.x, attacker.y, '+' + steal, 'float-heal');
  }

  // 反弹
  if (target.reflect && target.hp > 0) {
    const ref = Math.floor(dmg * target.reflect);
    attacker.hp = Math.max(1, attacker.hp - ref);
    floatText(attacker.x, attacker.y, '反弹 -' + ref, 'float-dmg');
  }

  // 装备词条：棘刺——被攻击时对攻击者造成固定反伤
  const tThorns = Math.max(0, (target.affix && target.affix.thorns) || 0);
  if (tThorns > 0 && attacker.hp > 0) {
    attacker.hp = Math.max(0, attacker.hp - tThorns);
    floatText(attacker.x, attacker.y, '反伤 -' + tThorns, 'float-dmg');
    log(`🧷 棘刺反伤：${attacker.name} 受到 ${tThorns} 点反伤`, 'system');
    if (attacker.hp <= 0) killUnit(g, attacker, target);
  }

  // 溅射
  if (attacker.splash) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    dirs.forEach(([dx, dy]) => {
      const nx = target.x + dx, ny = target.y + dy;
      if (!inBounds(nx, ny)) return;
      const e = g.grid[ny][nx];
      if (e && e.team !== attacker.team) {
        const sd = Math.floor(attacker.atk * attacker.splash);
        e.hp -= sd;
        battleFx(target.x, target.y, nx, ny, 'hit', attacker.team,
          { noBeam: !!o.noBeam });
        floatText(nx, ny, '-' + sd, 'float-dmg');
        if (e.hp <= 0) killUnit(g, e, attacker);
      }
    });
  }

  // 击退
  if (attacker.knockback) {
    const dx = Math.sign(target.x - attacker.x);
    const dy = Math.sign(target.y - attacker.y);
    for (let i = 0; i < attacker.knockback; i++) {
      const nx = target.x + dx, ny = target.y + dy;
      if (!inBounds(nx, ny) || g.grid[ny][nx]) break;
      g.grid[target.y][target.x] = null;
      target.x = nx; target.y = ny;
      g.grid[ny][nx] = target;
    }
  }

  // 死亡处理（锁血 / 复活都是「次数」，可叠加：用掉一次减一层）
  if (target.hp <= 0) {
    if (target.undyingCount > 0) {
      target.undyingCount--;
      target.hp = 1;
      floatText(target.x, target.y, '锁血！', 'float-crit');
      log(`🛡️ ${target.name} 锁血不死（剩 ${target.undyingCount} 次）`, 'system');
    } else if (target.reviveCount > 0) {
      target.reviveCount--;
      target.hp = target.maxHp;
      floatText(target.x, target.y, '复活！', 'float-heal');
      log(`🕊️ ${target.name} 原地复活（剩 ${target.reviveCount} 次）`, 'system');
    } else {
      killUnit(g, target, attacker);
    }
  }
}

// ============================================================
// 固定伤害（卡牌专用）：无视闪避 / 防御 / 护甲 / 魔抗，直接扣血
// ============================================================
function fixedDamage(g, target, amount) {
  if (!g || !target || target.hp <= 0 || amount <= 0) return 0;
  target.hp -= amount;
  battleFx(target.x, target.y, target.x, target.y, 'crit', target.team === 'player' ? 'enemy' : 'player');
  floatText(target.x, target.y, '-' + amount, 'float-crit');
  log(`💥 固定伤害 ${amount} → ${target.name}（剩 ${Math.max(0, target.hp)}）`, 'system');
  if (target.hp <= 0) killUnit(g, target, g.hero);
  return amount;
}

function killUnit(g, u, killer) {
  g.grid[u.y][u.x] = null;
  if (typeof SFX !== 'undefined') SFX.death();

  if (u.team === 'enemy') {
    g.enemies = g.enemies.filter(e => e !== u);
    deathFx(u.x, u.y);
    floatText(u.x, u.y, '击杀！', 'float-kill');

    // 金币（含「击杀额外金币」词条）
    const killBonus = (killer && killer.affix && killer.affix.goldOnKill) || 0;
    const goldGain = CONFIG.GOLD.KILL + (g.goldBonus || 0) + killBonus;
    g.gold += goldGain;
    if (typeof SFX !== 'undefined') SFX.coin();

    // 详细击杀日志：谁杀的、等级、金币
    const killerName = (killer && killer.team === 'player') ? killer.name : '友军';
    log(`⚔️ ${killerName} 击杀 ${u.name}（Lv${u.level || 1}）`, 'kill');
    log(`   +${goldGain} 金币（共 ${g.gold}）`, 'system', true);
    if (u.isBoss) log('☠️ 魔王被击败了！', 'kill');

    // 击杀成长（累积到 bonusAtk，由 recalcHeroStats 结算）
    g.allies.forEach(a => {
      if (a.killGrowth) {
        a.bonusAtk += a.killGrowth;
        floatText(a.x, a.y, `+${a.killGrowth}攻`, 'float-exp');
        log(`📈 ${a.name} 击杀成长：攻击 +${a.killGrowth}（累计 +${a.bonusAtk}）`, 'exp');
      }
    });

    // 经验：击杀者拿全额，其余存活队友拿助攻经验
    //   （只给击杀者的话，鸟人伤害高 → 抢人头 → 等级越拉越开，队友永远追不上）
    const baseExp = u.isBoss ? CONFIG.EXP.KILL_BOSS : CONFIG.EXP.KILL;
    if (killer && killer.team === 'player' && killer.hp > 0) {
      gainExp(killer, baseExp, `击杀 ${u.name}`);
    }
    const assistExp = Math.max(1, Math.floor(baseExp * (CONFIG.EXP.ASSIST || 0)));
    g.allies.forEach(a => {
      if (a === killer || a.hp <= 0 || a.team !== 'player') return;
      gainExp(a, assistExp, `助攻 ${u.name}`, true);
    });

    // 垃圾话（只在对面有 BOSS 时才说）—— 只落日志
    if (hasBoss() && g.hero && g.hero.isHero) say(g.hero, pick(HERO_TAUNTS.kill));
    if (u.isBoss && g.hero) say(g.hero, pick(HERO_TAUNTS.killBoss));

    recalcHeroStats();

    // BOSS 层：魔王一倒立刻判通关（流血 / 反伤 / 技能多段打死也走这条路）
    if (u.isBoss && typeof checkWin === 'function') checkWin();
  } else {
    g.allies = g.allies.filter(a => a !== u);
    deathFx(u.x, u.y);
    floatText(u.x, u.y, '阵亡', 'float-kill');
    log(`💀 ${u.name}（Lv${u.level || 1}）阵亡！剩余友军 ${g.allies.length} 人`, 'kill');

    // 敢杀我的马：主角（英雄）以外的友军阵亡触发，叠主角攻击
    if (!u.isHero && g.hero.revenge) {
      g.hero.revengeCount = (g.hero.revengeCount || 0) + 1;
      log(`敢杀我的马！${g.hero.name}攻击叠加（${g.hero.revengeCount}）`, 'system');
      recalcHeroStats();
    }

    if (u.isHero) {
      if (hasBoss()) {
        log(pick(HERO_TAUNTS.die), 'taunt-hero');
        const boss = g.enemies.find(e => e && e.isBoss && e.hp > 0);
        if (boss) say(boss, pick(BOSS_TAUNTS.heroDie));
      }
      g.gameOver = true;
      clearSave();
      setTimeout(() => showFailModal(), 500);
    }
  }
}

// ============================================================
// 经验 / 升级
// ============================================================
function gainExp(u, amount, reason, silent) {
  if (u.team !== 'player') return;
  u.exp = (u.exp || 0) + amount;
  let need = CONFIG.EXP.LEVEL_UP(u.level || 1);
  // 助攻经验走 silent，否则每杀一个人刷 2 条日志，日志栏会被挤爆
  if (!silent) {
    log(`📖 ${u.name} 获得 ${amount} 经验${reason ? `（${reason}）` : ''} · 进度 ${u.exp}/${need}`, 'exp');
  }
  while (u.exp >= need) {
    u.exp -= need;
    levelUp(u);
    need = CONFIG.EXP.LEVEL_UP(u.level);
  }
}

function levelUp(u) {
  const before = {
    maxHp: u.maxHp, atk: u.atk, range: u.range, move: u.move,
    crit: u.crit, dodge: u.dodge,
  };
  const from = u.level || 1;
  u.level = from + 1;

  // 属性/射程/移动/治疗量统一由 recalcHeroStats 按等级成长结算
  recalcHeroStats();
  u.hp = u.maxHp;   // 升级回满

  // 详细日志：这次升级到底加了哪些属性
  const gains = [];
  if (u.maxHp !== before.maxHp) gains.push(`生命 ${before.maxHp}→${u.maxHp}（+${u.maxHp - before.maxHp}）`);
  if (u.atk !== before.atk) gains.push(`攻击 ${before.atk}→${u.atk}（+${u.atk - before.atk}）`);
  if (u.range !== before.range) gains.push(`射程 ${before.range}→${u.range}`);
  if (u.move !== before.move) gains.push(`移动 ${before.move}→${u.move}`);
  if (u.crit !== before.crit) gains.push(`暴击 ${Math.round(before.crit * 100)}%→${Math.round(u.crit * 100)}%`);

  if (typeof SFX !== 'undefined') SFX.levelup();
  floatText(u.x, u.y, `升级！Lv${u.level}`, 'float-levelup');
  log(`⭐ ${u.name} 升级！Lv${from} → Lv${u.level}：${gains.join(' · ') || '无属性变化'}（血量回满）`, 'levelup');
  if (u.isHero && hasBoss()) say(u, pick(HERO_TAUNTS.levelup));
}