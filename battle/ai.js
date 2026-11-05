// ============================================================
// 敌人 AI
// ============================================================
function enemyTurn() {
  if (G.gameOver) return;
  const list = [...G.enemies];
  let i = 0;
  function step() {
    if (G.gameOver) return;
    if (i >= list.length) { startPlayerTurn(); return; }
    const e = list[i++];
    if (!G.enemies.includes(e)) { step(); return; }
    enemyAct(e);
    setTimeout(step, 400);
  }
  step();
}

function enemyAct(u) {
  // 葵花点穴手等：多回合定身
  if (u.stunTurns > 0) {
    u.stunTurns--;
    floatText(u.x, u.y, '定身', 'float-miss');
    log(`${u.name} 被定身，无法行动（剩余 ${u.stunTurns} 回合）`, 'system');
    render();
    return;
  }
  if (u.stun) { u.stun = false; log(`${u.name} 被定身`, 'system'); return; }
  if (u.blind) { u.blind = false; log(`${u.name} 被致盲`, 'system'); return; }

  const bossOnField = G.enemies.some(e => e.isBoss && e.hp > 0);

  // 魔法师：全屏（走 dealDamage，受闪避 / 待发卡牌影响）
  if (u.mage) {
    log(`${u.name} 释放全屏法术！`, 'enemy');
    [...G.allies].forEach(a => {
      if (G.gameOver) return;
      if (a.hp <= 0) return;
      dealDamage(G, u, a);
    });
    render();
    if (G.gameOver) return;
    checkWin();
    return;
  }

  // BOSS：站桩（移动 0），打射程内
  if (u.isBoss) {
    const t = enemyTargetInRange(u);
    if (t) strike(u, t);
    else render();
    return;
  }

  // 坦克：有 BOSS 时站桩护主（射程内就打）；没 BOSS 时冲上去打
  if (u.guard && bossOnField) {
    const t = enemyTargetInRange(u);
    if (t) strike(u, t);
    else render();
    return;
  }

  // 其他（含无 BOSS 时的坦克）：推进后攻击
  advanceAndStrike(u);
}

// 射程内的攻击目标：优先主角（英雄），其次血量最低
function enemyTargetInRange(u) {
  const list = G.allies.filter(a => a.hp > 0 && canReach(u, u.x, u.y, a.x, a.y));
  if (!list.length) return null;
  const hero = list.find(a => a.isHero);
  if (hero) return hero;
  list.sort((a, b) => a.hp - b.hp);
  return list[0];
}

// 推进目标：最近的我方单位（等距时优先主角）
function nearestAlly(u) {
  const list = G.allies.filter(a => a.hp > 0);
  if (!list.length) return null;
  list.sort((a, b) => {
    const da = moveDist(u.x, u.y, a.x, a.y);
    const db = moveDist(u.x, u.y, b.x, b.y);
    if (da !== db) return da - db;
    return (b.isHero ? 1 : 0) - (a.isHero ? 1 : 0);
  });
  return list[0];
}

// 走满移动点靠近最近的我方单位；移动前、每一步之后、移动结束都会判定"能否攻击"
// 移动按地形消耗结算：平地 1 点、森林 2 点，河流 / 高山不可进入
function advanceAndStrike(u) {
  let budget = Math.max(1, u.move || 1);

  while (budget > 0) {
    if (G.gameOver) return;

    // 1) 当前位置能打到就打（旁边有人就攻击）
    const hit = enemyTargetInRange(u);
    if (hit) return strike(u, hit);

    // 2) 朝最近的我方单位走一步
    const tgt = nearestAlly(u);
    if (!tgt) { render(); return; }

    const cands = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      .map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy }))
      .filter(p => inBounds(p.x, p.y) && !G.grid[p.y][p.x] && isPassable(p.x, p.y))
      .sort((a, b) => moveDist(a.x, a.y, tgt.x, tgt.y) - moveDist(b.x, b.y, tgt.x, tgt.y));

    if (!cands.length) break;
    const best = cands[0];
    if (moveDist(best.x, best.y, tgt.x, tgt.y) >= moveDist(u.x, u.y, tgt.x, tgt.y)) break;

    // 地形消耗（森林 2 点），点数不够就停在原地
    const stepCost = terrainDef(best.x, best.y).cost;
    if (stepCost > budget) break;
    budget -= stepCost;

    G.grid[u.y][u.x] = null;
    G.grid[best.y][best.x] = u;
    u.x = best.x; u.y = best.y;
  }

  // 3) 移动结束：只要旁边有人能打，立刻攻击
  const after = enemyTargetInRange(u);
  if (after) return strike(u, after);
  render();
}

// 攻击并结算
function strike(u, t) {
  dealDamage(G, u, t);
  render();
  checkWin();
}
