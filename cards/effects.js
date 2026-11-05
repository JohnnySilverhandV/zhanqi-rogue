// ============================================================
// 卡牌效果实现
// ============================================================

// 永久卡牌叠加：
//   · 同名卡只占“一条”显示位，累加 stacks（避免卡牌栏堆出一长串重复条目）
//   · 效果本身在各自的 effect 里累加（攻击 / 生命 / 成长等都是 +=），所以
//     抽到第 N 张时，实际收益也是第 N 份——显示 ×N 与真实强度一致
function addBuff(name, desc) {
  if (!G.buffs) G.buffs = [];
  const exist = G.buffs.find(b => b.name === name);
  if (exist) {
    exist.stacks = (exist.stacks || 1) + 1;
    return;
  }
  G.buffs.push({ name, desc, stacks: 1 });
}

function coinFlip(u) {
  if (Math.random() < 0.5) {
    const heal = Math.floor(u.maxHp * 0.3);
    u.hp = Math.min(u.maxHp, u.hp + heal);
    floatText(u.x, u.y, '+' + heal, 'float-heal');
    log('硬币正面！回血！', 'system');
  } else {
    const dmg = Math.floor(u.maxHp * 0.3);
    u.hp = Math.max(1, u.hp - dmg);
    floatText(u.x, u.y, '-' + dmg, 'float-dmg');
    log('硬币反面！扣血！', 'system');
  }
}

function fateGamble(g) {
  if (Math.random() < 0.9) {
    // 90%：赌输了 → 直接判负（由奖励弹窗检测 gameOver 后弹出失败界面，只能重开）
    log('我命由我不由天... 天意难违。游戏失败！', 'system');
    g.gameOver = true;
    g.fateFail = true;
  } else {
    // 10%：天选之人 → 跳到第 99 层
    log('天选之人！跳到第 99 层！', 'system');
    g.fateFail = false;
    g.jumpFloor = 99;
  }
}

// ============================================================
// 待发卡牌
// 过一关抽卡后，依赖战场瞬间的卡改为「待发」进入卡牌栏：
//   下次自己攻击（trigger:'attack'）/ 受到攻击（trigger:'hurt'）时触发，
//   触发后自动移出卡牌栏。
// ============================================================
function armCard(card) {
  if (!G.armed) G.armed = [];
  const exist = G.armed.find(a => a.id === card.id);
  if (exist) {
    exist.stacks = (exist.stacks || 1) + 1;
  } else {
    G.armed.push({
      id: card.id, name: card.name, desc: card.desc,
      trigger: card.trigger, stacks: 1, heroOnly: !!card.heroOnly,
    });
  }
  const when = card.trigger === 'attack'
    ? (card.heroOnly ? '英雄下次攻击时触发' : '下次攻击时触发')
    : '下次受到攻击时触发';
  log(`⏳ 卡牌待发：${card.name}（${when}，触发后移出卡牌栏）`, 'system');
  if (typeof renderTopbar === 'function') renderTopbar();
}

// 触发待发卡牌。ctx 可携带：{ attacker, target, dmg, cancel, reflect }
//   · 卡定义带 heroOnly:true 时，只有「英雄出手」才会触发；
//     否则该卡继续留在卡牌栏，等英雄下一次攻击（触发后才会移出）。
function fireArmed(trigger, ctx) {
  if (!G.armed || !G.armed.length) return;
  const due = G.armed.filter(a => a.trigger === trigger);
  if (!due.length) return;

  const byHero = !!(G.hero && ctx && ctx.attacker === G.hero);

  // 分成「本次触发」与「继续待发（英雄专属但出手的不是英雄）」两组
  const ready = [], held = [];
  due.forEach(a => {
    const card = CARD_POOL.find(c => c.id === a.id);
    if (card && card.heroOnly && !byHero) held.push(a);
    else ready.push(a);
  });
  if (!ready.length) return;

  // 先整体移出「将要触发」的卡牌，避免效果内部再次触发造成递归；
  // 继续待发的（held）保留在卡牌栏
  G.armed = G.armed.filter(a => ready.indexOf(a) < 0);

  ready.forEach(a => {
    const card = CARD_POOL.find(c => c.id === a.id);
    if (!card || typeof card.onTrigger !== 'function') return;
    const times = a.stacks || 1;
    log(`⏳ 【${a.name}】触发！${times > 1 ? `（叠加 ${times} 层）` : ''}`, 'system');
    for (let i = 0; i < times; i++) {
      try { card.onTrigger(G, ctx); } catch (e) { console.warn('卡牌触发出错', a.name, e); }
    }
  });

  if (typeof renderTopbar === 'function') renderTopbar();
}
