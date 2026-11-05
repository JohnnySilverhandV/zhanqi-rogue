// ============================================================
// 卡牌组清单（顶栏「卡牌 N」按钮打开）
//
//   主界面上不再有卡牌条 —— 卡片墙既占地方又看不清效果，
//   一条窄条也只是第二次重复。现在只在顶栏显示张数，
//   点开是一份纯文字清单：卡名（带稀有度色点）+ 完整说明。
// ============================================================

// 从卡池反查完整说明与稀有度（G.buffs 里只存了短说明）
function cardPoolMeta(name) {
  if (typeof CARD_POOL === 'undefined') return null;
  return CARD_POOL.find(c => c.name === name) || null;
}

function cardRarity(name) {
  const c = cardPoolMeta(name);
  const r = (c && c.rarity) || 'common';
  return { key: r, name: (CONFIG.RARITY[r] || CONFIG.RARITY.common).name,
           color: (CONFIG.RARITY[r] || CONFIG.RARITY.common).color };
}

// 一行：左边卡名（带稀有度色点），右边完整说明
function cardRowHtml(o) {
  const r = cardRarity(o.name);
  // 待发卡的说明原文都以「待发：」开头，清单里已经有分组标题，去掉更干净
  const desc = (o.desc || '').replace(/^待发[:：]\s*/, '');
  const stk = (o.stacks || 1) > 1 ? `<span class="cl-stk">叠加 ${o.stacks} 层</span>` : '';
  const when = o.when ? `<span class="cl-when">${o.when}</span>` : '';
  return `<div class="cl-row">` +
      `<span class="cl-name" style="color:${r.color}"><i class="cl-dot" style="background:${r.color}"></i>${o.name}</span>` +
      `<span class="cl-desc">${desc}${stk}${when}</span>` +
    `</div>`;
}

function showCardList() {
  const armed = (G && G.armed) || [];
  const buffs = (G && G.buffs) || [];
  const nArmed = armed.reduce((s, a) => s + (a.stacks || 1), 0);
  const nPerm  = buffs.reduce((s, b) => s + (b.stacks || 1), 0);

  let body = '';

  if (nArmed) {
    body += '<div class="cl-sec"><div class="cl-sec-h">待发卡牌 · 用掉就消失</div>';
    armed.forEach(a => {
      const c = cardPoolMeta(a.name);
      const when = a.trigger === 'attack'
        ? (a.heroOnly ? '只认英雄出手' : '你下次攻击时触发')
        : '你下次受伤时触发';
      body += cardRowHtml({ name: a.name, desc: (c && c.desc) || a.desc, stacks: a.stacks, when });
    });
    body += '</div>';
  }

  if (nPerm) {
    body += '<div class="cl-sec"><div class="cl-sec-h">常驻卡牌 · 全程生效</div>';
    buffs.forEach(b => {
      const c = cardPoolMeta(b.name);
      body += cardRowHtml({ name: b.name, desc: (c && c.desc) || b.desc, stacks: b.stacks });
    });
    body += '</div>';
  }

  if (!body) {
    body = '<div class="cl-empty">还没有任何卡牌。<br>每通过一层可以三选一拿一张卡（2 张普通 + 1 张好卡），' +
           '通关那张弹窗里还能用金币重掷、多拿一张、给全队升 1 级。</div>';
  }

  // 稀有度图例：和卡名前面的色点同一套颜色
  const legend = ['common', 'rare', 'legend', 'myth'].map(k => {
    const rr = CONFIG.RARITY[k];
    return `<i class="cl-dot" style="background:${rr.color}"></i>` +
           `<span style="color:${rr.color}">${rr.name}</span>`;
  }).join(' · ');

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal card-modal">
      <h2>卡牌组</h2>
      <div class="cl-sub">共 ${nArmed + nPerm} 张 · 待发 ${nArmed} 张 · 常驻 ${nPerm} 张</div>
      <div class="cl-body">${body}</div>
      <div class="cl-legend">稀有度：${legend}</div>
      <button class="btn" id="card-list-close">关闭</button>
    </div>
  `;
  modal.querySelector('#card-list-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}
