// ============================================================
// 三选一渲染（可复用于通关奖励等）
// ============================================================
function renderCardChoices(container, onPick) {
  const options = drawCards(3);
  container.innerHTML = '';
  options.forEach(card => {
    const rr = CONFIG.RARITY[card.rarity];
    const armedTag = (card.type === 'armed' ? ' <span class="card-armed">⏳ 待发</span>' : '')
      + (card.heroOnly ? ' <span class="card-hero-only">🤴 英雄触发</span>' : '');
    const el = document.createElement('div');
    el.className = 'card-option' + (card.type === 'armed' ? ' is-armed' : '');
    el.innerHTML = `
      <div class="card-name" style="color:${rr.color}">${card.name} <span style="color:${rr.color};font-size:11px;">[${rr.name}]</span>${armedTag}</div>
      <div class="card-desc">${card.desc}</div>
    `;
    el.onclick = () => onPick(card);
    container.appendChild(el);
  });
}

// ============================================================
// 抽卡：固定 2 张普通 + 1 张「好卡槽」（稀有为主，偶尔传说，神话近乎不出现）
// ============================================================
function pickRarity(rarity) {
  const pool = CARD_POOL.filter(c => c.rarity === rarity);
  return pool.length ? pick(pool) : null;
}

function drawCards(n) {
  const luck = G.luck || 0;
  const out = [];
  const push = (c) => { if (c && !out.find(o => o.id === c.id)) out.push(c); };

  if (n >= 3) {
    const up = CONFIG.DRAW.UPGRADE;
    // 「运气」卡：主要提升传说概率，神话只小幅上浮（仍近乎不出现）
    const mythC = up.myth + luck * 0.1;
    const legendC = up.legend + luck;
    const r = Math.random();
    let third = 'rare';
    if (r < mythC) third = 'myth';
    else if (r < mythC + legendC) third = 'legend';

    for (let i = 0; i < CONFIG.DRAW.COMMON; i++) push(pickRarity('common'));
    push(pickRarity(third));
  } else {
    const s = CONFIG.DRAW.SINGLE;
    const mythC = s.myth + luck * 0.1;
    const legendC = s.legend + luck;
    const r = Math.random();
    let rar = 'common';
    if (r < mythC) rar = 'myth';
    else if (r < mythC + legendC) rar = 'legend';
    else if (r < mythC + legendC + s.rare) rar = 'rare';
    push(pickRarity(rar));
  }

  // 去重后不足 n 张时用普通卡补齐
  let guard = 0;
  while (out.length < n && guard++ < 200) push(pickRarity('common'));
  return out.slice(0, n);
}

function applyCard(card) {
  log(`获得卡牌：${card.name}`, 'system');
  if (card.type === 'armed') { armCard(card); return; }
  if (typeof card.effect === 'function') card.effect(G);
  recalcHeroStats();
}
