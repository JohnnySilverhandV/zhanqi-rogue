// ============================================================
// 文字信息（主界面精简后从侧栏搬进弹窗）
//
//   主界面只剩「顶栏 + 棋盘 + 行动栏」，原来的右侧日志栏拆成三处：
//     · 行动栏空位 —— 最新一条日志，不点也能看见刚刚发生了什么
//     · 顶栏「日志」 —— 全量落档清单（想复盘才翻）
//     · 顶栏「说明」 —— 地形 / 我方单位 / 怎么操作 / 重看新手引导
//   全部是纯文字，不用图标猜谜。
// ============================================================

// ---- 行动栏空位：只显示最新一条 ----
function renderLatestLog() {
  const el = document.getElementById('ab-msg');
  if (!el) return;
  // 选中单位时这一行是操作提示，不能被日志顶掉
  if (G && G.selected && G.phase === 'player' && !G.gameOver) return;
  const arr = (G && G.logLines) || [];
  const last = arr[arr.length - 1];
  if (!last) { el.textContent = ''; return; }
  el.textContent = last.t;
  el.className = 'hint ab-latest' + (last.c ? ' log-' + last.c : '');
}

// ---- 日志弹窗：全量 ----
function showLogList() {
  const arr = (G && G.logLines) || [];

  const rows = arr.map(l =>
    `<div class="lg-row${l.c ? ' log-' + l.c : ''}">${l.t}</div>`
  ).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal log-modal">
      <h2>战斗日志</h2>
      <div class="lg-sub">共 ${arr.length} 条 · 最新的在最下面</div>
      <div class="lg-body" id="lg-body">${rows || '<div class="lg-empty">还没有记录。</div>'}</div>
      <button class="btn" id="log-close">关闭</button>
    </div>
  `;
  modal.querySelector('#log-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);

  const body = modal.querySelector('#lg-body');
  if (body) body.scrollTop = body.scrollHeight;
}

// ---- 说明弹窗：操作 / 地形 ----
//   单位属性不在这里了：顶栏「队伍」按钮是一张专门的属性表
function showHelpModal() {
  const terrain = (typeof terrainLegendHtml === 'function') ? terrainLegendHtml() : '';
  const healPct = (CONFIG.HEAL_REGEN + (G.healBonus || 0)) * 100;

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal help-modal">
      <h2>战场说明</h2>

      <div class="hp-sec">
        <div class="hp-h">怎么操作</div>
        <div class="hp-line">① 点己方单位 → 点<b>蓝格</b>移动（每回合一次，移动后还能出手）</div>
        <div class="hp-line">② 点<b>红格里的敌人</b> ＝ 攻击它（一次只打一个）</div>
        <div class="hp-line">③ <b>再点一次自己脚下的格子 ＝ 待命</b></div>
        <div class="hp-line">④ 全队动完自动换敌方 · 想提前结束就点「结束回合」</div>
      </div>

      <div class="hp-sec">
        <div class="hp-h">四名队员<span class="hp-sub">只有法师有技能</span></div>
        <div class="hp-line">🤴 <b>英雄</b> 主角 · 前后左右 1 格 · 初始最弱、成长最高 ·<b>他倒下这局就结束</b></div>
        <div class="hp-line">🦅 <b>鸟人</b> 前后左右 1 格 · 飞行无视地形 · 前期最强，但倒了不影响本局</div>
        <div class="hp-line">🏹 <b>射手</b> 十字第 2~N 格 + 斜角第 1~N-1 格 · 贴脸打不到 · 血最薄</div>
        <div class="hp-line">🧙 <b>法师</b> 普攻 1 格但只有 1 点 · 技能【地火】射程同上，法术伤害</div>
        <div class="hp-heal">每回合开始时，全队自动回复 <b>${healPct.toFixed(1)}%</b> 最大生命</div>
      </div>

      <div class="hp-sec">
        <div class="hp-h">护甲 / 魔抗<span class="hp-sub">打不动的时候先看这个</span></div>
        <div class="hp-line">🛡️ <b>护甲</b>：挨<b>普攻</b>按固定值减伤 —— 坦克护甲 8，鸟人一刀只砍掉 3 点</div>
        <div class="hp-line">🔮 <b>魔抗</b>：挨<b>法术</b>按百分比减伤 —— 坦克只有 5%，地火几乎全额打进去</div>
        <div class="hp-line">所以坦克交给法师的地火；魔法师魔抗高，反过来用普攻砍</div>
      </div>

      <div class="hp-sec">
        <div class="hp-h">金币花在哪<span class="hp-sub">商店已经删了</span></div>
        <div class="hp-line">每层通关的三选一弹窗里：<b>重掷三张</b> / <b>再拿一张</b> / <b>全队升 1 级</b></div>
        <div class="hp-line">全队升级每买一次，下一次的价钱就<b>翻一倍</b>（180 → 360 → 720 …）</div>
      </div>

      <div class="hp-sec">
        <div class="hp-h">本层地形（第 ${G.floor} 层）</div>
        ${terrain}
      </div>

      <div class="hp-link" id="tut-replay">↻ 重看新手引导</div>
      <button class="btn" id="help-close">关闭</button>
    </div>
  `;
  modal.querySelector('#help-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  const replay = modal.querySelector('#tut-replay');
  if (replay) replay.onclick = function () {
    modal.remove();
    if (typeof startTutorial === 'function') startTutorial(true);
  };
  document.body.appendChild(modal);
}
