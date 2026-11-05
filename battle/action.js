// ============================================================
// 单位动作：攻击 / 技能 / 待命
//
//   2026-10-24：自动开火已删除。这里是玩家每一次操作真正落地的地方。
//   一个单位每回合的额度 = 「移动一次」+「做上面三件事之一」，做完即结束行动。
//   （道具系统已于同日删除，金币只剩抽卡 / 全队治疗两个出口）
// ============================================================

function actionReady(u) {
  return !!u && u.hp > 0 && u.team === 'player' && !u.hasActed
    && G && G.phase === 'player' && !G.gameOver;
}

// 结束某个单位的行动：标记 → 重算属性 → 重绘 → 判定通关 / 全员行动完
function finishAction(u) {
  if (!u) return;
  u.hasMoved = true;
  u.hasActed = true;
  G.selected = null;
  G.mode = null;
  recalcHeroStats();        // 位置 / 状态变化会影响装备词条结算
  render();
  checkWin();               // 清场 → 通关结算
  checkAllActed();          // 全员行动完 → 自动换敌方回合
  saveGame();
}

// ------------------------------------------------------------
// ① 普攻：射程内点一个目标，只打这一个人
// ------------------------------------------------------------
function doAttack(u, t) {
  if (!actionReady(u) || !t || t.hp <= 0) return false;
  G.mode = null;

  // 待发·攻击型卡牌（一拳 / 三刀流 / 神罗天征 / 五连鞭 / 点穴手）在出手瞬间释放
  fireArmed('attack', { attacker: u, target: t });

  const times = u.multiAttack > 0 ? Math.max(1, u.multiAttack) : 1;
  u.multiAttack = 0;
  for (let i = 0; i < times; i++) {
    if (t.hp <= 0 || u.hp <= 0) break;
    dealDamage(G, u, t);
  }

  finishAction(u);
  return true;
}

// ------------------------------------------------------------
// ② 技能：现在只有法师的地火（见 battle/shape.js 的 SKILLS）
//    地火是**法术伤害**：吃目标的魔抗、无视护甲 —— 坦克的克星
// ------------------------------------------------------------
function doSkill(u, ax, ay) {
  if (!actionReady(u)) return false;
  const s = skillOf(u);
  if (!s) return false;

  const anchors = skillAnchorCells(u);
  if (!anchors.has(ax + ',' + ay)) return false;
  G.mode = null;

  // 覆盖目标：以落点为靶心，按档位算出这一片
  const targets = skillTargetsAt(u, ax, ay);
  if (!targets.length) return false;

  const mult = skillMultOf(u);

  if (typeof SFX !== 'undefined') SFX.skill && SFX.skill();
  if (typeof skillCastFx === 'function') skillCastFx(u, s, ax, ay);

  log(`${s.icon} ${u.name} 释放【${skillLabelOf(u)}】· ${targets.length} 个目标`, 'skill');

  if (typeof DM !== 'undefined') DM.result(`${s.icon} ${skillLabelOf(u)}！`, true);

  let kills = 0, total = 0;
  const alive = targets.filter(t => t.hp > 0);
  alive.forEach(t => {
    if (G.gameOver || u.hp <= 0) return;
    if (!t || t.hp <= 0) return;
    const before = t.hp;
    // 地火按「法术强度」结算，不走法师那点可怜的普攻
    dealDamage(G, u, t, mult, { noBeam: true, quiet: true, magic: true, baseDmg: spellPowerOf(u) });
    total += Math.max(0, before - Math.max(0, t.hp));
    if (t.hp <= 0) kills++;
  });

  // 一次打一片，最该看见的是「这一下总共砸了多少」——单发数字已经飘在棋盘上了
  if (alive.length > 0) {
    const tail = kills > 0 ? ` · 击杀 ${kills}` : '';
    log(`   合计造成 ${total} 伤害${tail}`, 'skill', true);
    if (typeof DM !== 'undefined') DM.push(`合计 ${total} 伤害${tail}`, 'skill');
  }

  // 爽点：一发打掉两个以上 → 报连杀
  if (kills >= 2 && typeof DM !== 'undefined') {
    DM.result(kills >= 3 ? `${kills} 杀！清场级爆发` : '双杀！', true);
  }

  finishAction(u);
  return true;
}

// ------------------------------------------------------------
// ③ 待命：结束这个单位的行动，不开火
//    （2026-10-24：再点一次自己脚下的格子也会走到这里，见 board.js handleClick）
// ------------------------------------------------------------
function standBy(u) {
  if (!actionReady(u)) return false;
  floatText(u.x, u.y, '待命', 'float-move');
  log(`${u.icon} ${u.name} 待命`, 'system', true);
  finishAction(u);
  return true;
}
