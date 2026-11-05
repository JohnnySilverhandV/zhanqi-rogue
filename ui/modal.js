// ============================================================
// 通用弹窗
// ============================================================

// 金币花费价（商店删除后，金币只在「通关三选一」里花）
//   重掷 / 多拿一张：同一次三选一里越用越贵（线性）
//   全队升级：按「本局已经买过几次」指数翻倍（180 → 360 → 720 → 1440 …）
function spendPrice(kind, n) {
  const S = CONFIG.SPEND;
  const off = (typeof metaDiscount === 'function') ? metaDiscount() : 0;
  let raw;
  if (kind === 'reroll')     raw = S.REROLL_BASE + (n || 0) * S.REROLL_STEP;
  else if (kind === 'extra') raw = S.EXTRA_BASE + (n || 0) * S.EXTRA_STEP;
  else                       raw = S.LEVEL_BASE * Math.pow(S.LEVEL_MULT || 2, n || 0);
  return Math.max(1, Math.floor(raw * (1 - off)));
}

// ------------------------------------------------------------
// 通关结算：三选一 + 金币筹码
//
//   商店已删除（2026-10-24 第四次大改），金币的用处全部搬到这张弹窗里：
//     · 重掷三张   换一批（选卡之前才有意义）
//     · 再拿一张   已经选了一张之后，再花金币带走一张
//     · 全队升 1 级 每层限一次
//   都在原地结算，点一下就出结果，没有二次弹窗。
// ------------------------------------------------------------
function showFloorClearModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal clear-modal">
      <h2>第 ${G.floor} 层通过！🎉</h2>
      <p class="clr-sub" id="clr-sub"></p>
      <div id="clear-cards"></div>
      <div class="clr-buys" id="clr-buys"></div>
      <button class="btn" id="next-floor" style="display:none;">进入下一层 ▶</button>
    </div>
  `;
  const cont  = modal.querySelector('#clear-cards');
  const buys  = modal.querySelector('#clr-buys');
  const sub   = modal.querySelector('#clr-sub');
  const nextBtn = modal.querySelector('#next-floor');

  let picks = 0;       // 本层已拿到的卡
  let rerolls = 0;     // 本层重掷次数（决定下一次的价钱）
  let extras = 0;      // 本层额外买的卡
  let leveled = 0;     // 本层是否已经花金币升过级
  let settling = false; // 正在选卡的那一小下，防止连点两张

  // ---- 卡牌三张 ----
  function paintCards() {
    settling = false;
    renderCardChoices(cont, onPick);
  }

  function onPick(card) {
    if (settling) return;
    settling = true;
    applyCard(card);
    log(`获得奖励卡牌：${card.name}`, 'system');

    // 「我命由我不由天」踩到 90% 分支：直接判定游戏失败，只能重开
    if (G.gameOver) {
      modal.remove();
      showFailModal('fate');
      return;
    }

    picks++;
    cont.querySelectorAll('.card-option').forEach(e => {
      e.style.opacity = '0.35';
      e.style.pointerEvents = 'none';
    });
    nextBtn.style.display = 'block';
    paint();
  }

  // ---- 金币筹码 ----
  function spend(price, what) {
    if (G.gold < price) return false;
    G.gold -= price;
    log(`💰 ${what}：-${price} 金（剩 ${G.gold}）`, 'system', true);
    saveGame();
    return true;
  }

  function buyReroll() {
    const price = spendPrice('reroll', rerolls);
    if (!spend(price, '重掷三张')) return;
    rerolls++;
    paintCards();
    paint();
    if (typeof DM !== 'undefined') DM.push(`💰 重掷：换了一批卡（-${price} 金）`, 'system');
  }

  function buyExtra() {
    const price = spendPrice('extra', extras);
    if (!spend(price, '再拿一张卡')) return;
    extras++;
    paintCards();
    paint();
    if (typeof DM !== 'undefined') DM.push(`💰 已经多拿 ${extras} 张卡`, 'system');
  }

  function buyLevel() {
    const price = spendPrice('level', G.levelBuys || 0);
    if (leveled) return;
    if (!spend(price, '全队升 1 级')) return;
    leveled = 1;
    G.levelBuys = (G.levelBuys || 0) + 1;   // 下一次升级的价钱 ×2
    G.allies.forEach(a => {
      a.level = (a.level || 1) + 1;
    });
    recalcHeroStats();
    G.allies.forEach(a => { a.hp = a.maxHp; });
    render();
    paint();
    if (typeof DM !== 'undefined') DM.result(`⭐ 全队升到 Lv${G.allies[0] ? G.allies[0].level : 1}！（-${price} 金）`, true);
  }

  function paint() {
    sub.innerHTML = `金币 <b>${G.gold}</b> · 本层免费拿 1 张卡` +
      (picks > 1 ? ` · 已经多拿 ${picks - 1} 张` : '');

    const btns = [];
    if (picks === 0) {
      const rp = spendPrice('reroll', rerolls);
      btns.push(`<button class="clr-buy" id="clr-reroll" ${G.gold < rp ? 'disabled' : ''}>` +
        `重掷三张<i>${rp} 金</i></button>`);
    } else {
      const ep = spendPrice('extra', extras);
      btns.push(`<button class="clr-buy" id="clr-extra" ${G.gold < ep ? 'disabled' : ''}>` +
        `再拿一张<i>${ep} 金</i></button>`);
    }
    const lp = spendPrice('level', G.levelBuys || 0);
    btns.push(`<button class="clr-buy" id="clr-level" ` +
      `${G.gold < lp || leveled ? 'disabled' : ''}>全队升 1 级<i>${leveled ? '本层已用' : lp + ' 金'}</i></button>`);
    buys.innerHTML = btns.join('');

    const rb = buys.querySelector('#clr-reroll');
    if (rb) rb.onclick = buyReroll;
    const eb = buys.querySelector('#clr-extra');
    if (eb) eb.onclick = buyExtra;
    const lb = buys.querySelector('#clr-level');
    if (lb) lb.onclick = buyLevel;
  }

  // ---- 进入下一层 ----
  nextBtn.onclick = () => {
    modal.remove();
    const jump = G.jumpFloor;
    G.jumpFloor = null;

    // 没有跳层指令，且已到最后一层 → 通关
    if (!jump && G.floor >= 99) { showGameClearModal(); return; }

    // 注意：必须在 initFloor 之前读当前层号
    const clearedFloor = G.floor;

    G.gold += CONFIG.GOLD.FLOOR_CLEAR;
    log(`通关奖励 +${CONFIG.GOLD.FLOOR_CLEAR} 金币（现有 ${G.gold}）`, 'system');
    // 先快照当前队伍成长，再进入下一层（等级/成长随之继承）
    G.allyProgress = snapshotAllies();

    const target = jump || (clearedFloor + 1);
    const enterNext = () => {
      initFloor(target);
      saveGame();
      render();
    };

    // 每 7 层 → 先触发奇遇，再进入下一层
    if (!jump && encounterDue(clearedFloor) && clearedFloor < 99) {
      log(`🎲 第 ${clearedFloor} 层通关，触发奇遇`, 'system');
      showEncounterModal(enterNext);
    } else {
      enterNext();
    }
  };

  paintCards();
  paint();
  document.body.appendChild(modal);
}

// ============================================================
// 通关 99 层：结算存档奖励 → 直接进入下一次挑战（无限刷）
// ============================================================
function showGameClearModal() {
  const m = (typeof loadMeta === 'function') ? loadMeta() : null;
  const clears = (m && m.clears) || 0;
  const nextClears = clears + 1;
  const talents = (typeof TALENTS !== 'undefined') ? TALENTS : [];

  // 预览本次会成长的天赋（grantClearRewards 之后才真正写入）
  const ups = talents.filter(t =>
    nextClears >= t.unlockAt && ((m && m.talents[t.id]) || 0) < t.max);
  const upLines = ups.map(t => {
    const lv = ((m && m.talents[t.id]) || 0) + 1;
    return `<div class="gc-row">${t.icon} <b>${t.name} Lv${lv}</b> — ${t.desc(lv)}</div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal clear-modal">
      <h2>通关 99 层</h2>
      <p class="gc-sub">第 ${G.challenge || 1} 次挑战 · 累计通关将达 ${nextClears} 次</p>

      <div class="gc-sec">存档奖励（自动入库，任何地方都买不到）</div>
      <div class="gc-list">
        <div class="gc-row">💰 开局金币 <b>+${META_CLEAR_REWARD.gold}</b> — 下次挑战一进场就到钱包里</div>
      </div>

      ${upLines ? `<div class="gc-sec">天赋成长（永久生效）</div><div class="gc-list">${upLines}</div>` : ''}

      <div class="gc-tip">下一次挑战：卡牌 / 等级 / 金币全部回到 0，仓库里的开局军费会自动到账。</div>
      <button class="btn" id="next-run">开始第 ${(G.challenge || 1) + 1} 次挑战 ▶</button>
    </div>
  `;

  modal.querySelector('#next-run').onclick = () => {
    modal.remove();
    const gains = (typeof grantClearRewards === 'function') ? grantClearRewards() : [];
    restartRun((G.challenge || 1) + 1);

    // restartRun 会清屏，所以播报放在它之后
    if (typeof DM !== 'undefined') {
      DM.result('🏆 通关存档已入库：开局金币 +' + META_CLEAR_REWARD.gold, true);
      gains.forEach(function (g) {
        DM.push(g.talent.icon + ' ' + g.talent.name + ' Lv' + g.lv + ' — ' + g.talent.desc(g.lv), 'levelup');
      });
    }
  };
  document.body.appendChild(modal);
}

function showFailModal(reason) {
  const isFate = reason === 'fate';
  clearSave();   // 本局作废，读档不会回到已失败的进度

  const m = (typeof loadMeta === 'function') ? loadMeta() : null;
  const vaultLine = m
    ? `存档保留：累计通关 ${m.clears} 次 · 开局金币 ${m.vault.gold}`
    : '';

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal">
      <h2>${isFate ? '💀 天意难违' : '💀 英雄倒下了'}</h2>
      <p style="color:#ccc;margin-bottom:6px;">
        ${isFate ? '我命由我不由天……你被打回了原点' : '你爬到了第 ' + G.floor + ' 层'}
      </p>
      <p style="color:#888;font-size:12px;margin-bottom:6px;">本局卡牌 / 等级 / 金币清零</p>
      <p class="fail-vault">${vaultLine}</p>
      <button class="btn" id="restart">重新开始（第 ${(G.challenge || 1) + 1} 次挑战）</button>
    </div>
  `;
  // 重新开始：全新一局，仓库的开局军费自动到账（与通关新周目同一套逻辑）
  modal.querySelector('#restart').onclick = () => {
    modal.remove();
    restartRun((G.challenge || 1) + 1);
  };
  document.body.appendChild(modal);
}