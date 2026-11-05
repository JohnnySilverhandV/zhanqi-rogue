// ============================================================
// 顶栏
//   全部用文字表达，不用图标 —— 图标看不懂，玩家得靠猜。
//   左侧：第几次挑战 → 第几层 → 第几回合 → 金币（含每回合收入）
//   右侧：结束回合 / 队伍 / 卡牌 / 日志 / 说明 / 存档
//   （音效开关与重新挑战收进「存档」弹窗，主界面只留高频操作）
//   「队伍」= 角色属性表：单位详情不再靠长按悬浮，想查就点开看
// ============================================================
function cardTotal() {
  const armed = (G && G.armed) || [];
  const buffs = (G && G.buffs) || [];
  return armed.reduce((s, a) => s + (a.stacks || 1), 0)
       + buffs.reduce((s, b) => s + (b.stacks || 1), 0);
}

function renderTopbar() {
  const el = document.getElementById('topbar');
  if (!el) return;
  const talentGold = (typeof metaTurnGold === 'function') ? metaTurnGold() : 0;
  const income = CONFIG.GOLD.TURN + (G.turnGold || 0) + talentGold;
  const nCard = cardTotal();

  el.innerHTML = `
    <span class="tb-info">
      <span class="tb-i">第 <b>${G.challenge || 1}</b> 次挑战</span>
      <span class="tb-i">第 <b>${G.floor}</b> 层</span>
      <span class="tb-i">第 <b>${G.turn}</b> 回合</span>
      <span class="tb-i">金币 <b>${G.gold}</b><i class="tb-inc">每回合 +${income}</i></span>
    </span>
    <span class="tb-btns">
      <button id="end-turn-btn" class="${G.phase === 'player' ? 'is-player' : 'is-enemy'}" ${G.phase !== 'player' || G.gameOver ? 'disabled' : ''}>${G.phase === 'player' ? '结束回合' : '敌人行动中'}</button>
      <button id="team-btn" class="tb-dark" title="队伍属性表">队伍</button>
      <button id="cards-btn" class="tb-dark" title="查看手上的全部卡牌">卡牌 ${nCard}</button>
      <button id="log-btn" class="tb-dark" title="查看完整的战斗日志">日志</button>
      <button id="help-btn" class="tb-dark" title="地形 / 操作说明">说明</button>
      <button id="meta-btn" class="tb-meta" title="通关次数 / 开局军费 / 天赋">存档</button>
    </span>
  `;

  document.getElementById('end-turn-btn').onclick = endPlayerTurn;

  const teamBtn = document.getElementById('team-btn');
  if (teamBtn) teamBtn.onclick = () => {
    if (typeof showTeamModal === 'function') showTeamModal();
  };

  const cardsBtn = document.getElementById('cards-btn');
  if (cardsBtn) cardsBtn.onclick = () => {
    if (typeof showCardList === 'function') showCardList();
  };

  const logBtn = document.getElementById('log-btn');
  if (logBtn) logBtn.onclick = () => {
    if (typeof showLogList === 'function') showLogList();
  };

  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.onclick = () => {
    if (typeof showHelpModal === 'function') showHelpModal();
  };

  const metaBtn = document.getElementById('meta-btn');
  if (metaBtn) metaBtn.onclick = () => {
    if (typeof showMetaPanel === 'function') showMetaPanel();
  };
}

// ============================================================
// 行动栏：唯一常驻的「操作 + 最新动态」条（2026-10-24 移到棋盘上方，
// 原来在屏幕最底部，手机上大拇指够不到）
//   未选中单位 → 显示最新一条日志（不用点也能看见刚发生了什么）
//   选中单位   → 显示这回合能做的三件事
//   点左边的角色名可以取消选中；再点一次自己脚下格子 = 待命
// ============================================================
function renderActionBar() {
  const el = document.getElementById('action-bar');
  if (!el) return;

  const u = (G.selected && G.grid[G.selected.y]) ? G.grid[G.selected.y][G.selected.x] : null;

  if (!u || u.team !== 'player' || G.phase !== 'player' || G.gameOver) {
    el.innerHTML = '<span class="hint ab-latest" id="ab-msg"></span>';
    renderLatestLog();
    return;
  }

  const ready = !u.hasActed && u.hp > 0;
  const nAtk = ready ? atkTargets(u, u.x, u.y).length : 0;
  const s = skillOf(u);
  const sName = skillLabelOf(u);
  const nSkill = (ready && s) ? skillHitCount(u) : 0;

  // 提示文案一律短句：行动栏是单行固定宽，窄屏上长句只会被裁成半截（手机上直接隐藏，
  // 详细玩法在「说明」弹窗里有一份）
  let tip;
  if (!ready) tip = '本回合已行动';
  else if (G.mode === 'skill') tip = `<b>点紫色敌人</b>：${sName} 可打 ${nSkill} 人`;
  else if (G.mode === 'attack') tip = '<b>点红色敌人</b>攻击';
  else if (!nAtk && !nSkill) tip = '射程内没敌人 · 先走一步';
  else if (u.hasMoved) tip = '已移动 · 攻击 / 技能';
  else tip = '点蓝格移动 · 再出手';

  const forest = isForest(u.x, u.y) ? '<span class="hint-forest">森林中：命中 -20%</span>' : '';

  // 技能按钮只给有技能的人（现在只有法师）—— 白板单位不该有个永远灰着的按钮
  const skillBtn = !s ? '' :
    `<button class="act skill${G.mode === 'skill' ? ' on' : ''}" id="act-skill"` +
      `${ready && (nSkill > 0 || G.mode === 'skill') ? '' : ' disabled'}>` +
      `${G.mode === 'skill' ? '取消' : '技能'}</button>`;

  el.innerHTML =
    `<button class="who" id="act-deselect" title="取消选中">${u.icon} ${u.name} Lv${u.level || 1} ✕</button>` +
    `<span class="shape-tag">${atkLabel(u)}</span>` +
    `<span class="hint" id="ab-msg">${tip}</span>` +
    forest +
    `<span class="act-group">` +
      `<button class="act atk${G.mode === 'attack' ? ' on' : ''}" id="act-atk"` +
        `${ready && nAtk > 0 ? '' : ' disabled'}>攻击</button>` +
      skillBtn +
      `<button class="act" id="act-wait" ${ready ? '' : ' disabled'}>待命</button>` +
    `</span>`;

  const de = document.getElementById('act-deselect');
  if (de) de.onclick = () => {
    G.selected = null;
    G.mode = null;
    render();
  };

  const atk = document.getElementById('act-atk');
  if (atk) atk.onclick = () => {
    G.mode = (G.mode === 'attack') ? null : 'attack';
    render();
  };

  const sk = document.getElementById('act-skill');
  if (sk) sk.onclick = () => {
    if (G.mode === 'skill') { G.mode = null; render(); return; }
    if (!s) return;
    G.mode = 'skill';
    render();
    log(`${s.icon} 选择【${sName}】落点：${skillDescOf(u)}`, 'system', true);
  };

  const w = document.getElementById('act-wait');
  if (w) w.onclick = () => standBy(u);
}
