// ============================================================
// 新手引导（只在「第一次进第 1 层」时自动出现一次）
//
//   · 遮罩用 box-shadow 挖洞 + pointer-events:none —— 完全不挡点击，
//     所以玩家必须真的「点单位 → 走一步 → 出手」，教学才算过
//   · 4 步：选人 → 走位 → 出手（攻击 / 技能 / 待命）→ 结束回合
//   · 随时可从「说明」弹窗的「↻ 重看新手引导」重播
// ============================================================
const TUTORIAL_KEY = 'zhanqi_rouge_tutorial_v2';
const TUT_STEP_N = 4;

let tutState = null;          // { step, unit, hx, hy }
let tutBoardHandler = null;
let tutResizeHandler = null;
let tutTimer = null;

function tutorialSeen() {
  try { return !!localStorage.getItem(TUTORIAL_KEY); } catch (e) { return true; }
}

function tutMarkSeen() {
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {}
}

// 自动触发的条件：第 1 层 / 没看过 / 当前没有在跑 / 游戏没结束
function tutShouldAutoRun() {
  return !!G && !tutState && !G.gameOver && G.floor === 1 && !tutorialSeen();
}

// ------------------------------------------------------------
// 启动 / 结束
// ------------------------------------------------------------
function startTutorial(force) {
  if (tutState) return;
  if (!force && tutorialSeen()) return;
  if (!G || G.gameOver) return;
  const board = document.getElementById('board');
  if (!board) return;

  tutState = { step: 0, unit: null, hx: -1, hy: -1 };
  tutBuildLayer();

  tutBoardHandler = function (ev) { tutBoardClick(ev); };
  board.addEventListener('click', tutBoardHandler, true);
  tutResizeHandler = function () { tutRelayout(); };
  window.addEventListener('resize', tutResizeHandler);

  // 轮询推进：走位 / 出手这两种「玩家真的做了」的状态，用状态比对来判，比猜事件可靠
  tutTimer = setInterval(tutTick, 260);

  // 从「干净状态」开始教：先取消选中，让玩家自己点
  G.selected = null;
  G.mode = null;
  render();
  tutGoto(1);
}

function tutFinish() {
  tutMarkSeen();
  tutCancel();
  log('💡 引导结束：点单位 → 蓝格移动 → 红格攻击（或技能 / 待命）→ 结束回合', 'system');
}

function tutCancel() {
  const board = document.getElementById('board');
  if (board) {
    board.classList.remove('tut-light');
    if (tutBoardHandler) board.removeEventListener('click', tutBoardHandler, true);
  }
  if (tutResizeHandler) window.removeEventListener('resize', tutResizeHandler);
  if (tutTimer) { clearInterval(tutTimer); tutTimer = null; }
  tutBoardHandler = null;
  tutResizeHandler = null;
  const layer = document.getElementById('tut-layer');
  if (layer) layer.remove();
  tutState = null;
  if (typeof clearShapePreview === 'function') clearShapePreview();
}

// 状态轮询：判断玩家是否真的走了 / 真的出手了
function tutTick() {
  if (!tutState) return;
  const u = tutState.unit;

  if (tutState.step === 2) {
    if (!G.selected && !(u && (u.x !== tutState.hx || u.y !== tutState.hy))) { tutGoto(1); return; }
    if (u && (u.x !== tutState.hx || u.y !== tutState.hy)) tutGoto(3);
    return;
  }
  if (tutState.step === 3) {
    if (!u || u.hp <= 0 || u.hasActed) tutGoto(4);
  }
}

// ------------------------------------------------------------
// DOM
// ------------------------------------------------------------
function tutBuildLayer() {
  const layer = document.createElement('div');
  layer.id = 'tut-layer';
  layer.innerHTML =
    '<div id="tut-spot"></div>' +
    '<div id="tut-tip">' +
      '<div class="tut-step" id="tut-step-no"></div>' +
      '<div class="tut-title" id="tut-title"></div>' +
      '<div class="tut-desc" id="tut-desc"></div>' +
      '<div class="tut-hint" id="tut-hint"></div>' +
      '<div class="tut-actions">' +
        '<button class="tut-skip" id="tut-skip">跳过</button>' +
        '<button class="tut-next" id="tut-next">下一步</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(layer);

  document.getElementById('tut-skip').onclick = function () { tutFinish(); };
  document.getElementById('tut-next').onclick = function () { tutNext(); };
}

// ------------------------------------------------------------
// 步骤
// ------------------------------------------------------------
function tutGoto(n) {
  if (!tutState) return;
  const board = document.getElementById('board');
  if (!board) { tutCancel(); return; }
  tutState.step = n;
  clearShapePreview();
  board.classList.remove('tut-light');

  const nextBtn = document.getElementById('tut-next');
  if (!nextBtn) return;

  if (n === 1) {
    const h = G.hero || G.allies[0];
    tutState.unit = null;
    tutShow(1, '先选中一个单位',
      '这局是<b>真正的战棋</b>：攻击不再自动，谁、往哪走、打谁，都由你点出来。<br>先点一下场上任意一个自己人。',
      '👆 点一下任意己方单位');
    tutHoleTo(tutCellEl(h), 4);
    tutPlaceTip(board.getBoundingClientRect());
    tutSetNext(false);
    return;
  }

  if (n === 2) {
    const u = tutState.unit;
    tutState.hx = u ? u.x : -1;
    tutState.hy = u ? u.y : -1;
    tutShow(2, '亮起来的格子就是能走的范围',
      '点任意一个<b>蓝格</b>走过去。平地耗 1 步、森林耗 2 步，河流和高山走不了。<br>移动不会结束行动 —— 走完还能出手。',
      '👆 点一个蓝格');
    board.classList.add('tut-light');
    tutPlaceTip(tutHoleTo(board, 6));
    tutSetNext(false);
    return;
  }

  if (n === 3) {
    const u = tutState.unit;
    const s = u ? skillOf(u) : null;
    const sName = u ? skillLabelOf(u) : '';
    tutShow(3, '现在出手：打谁？',
      '脚下的<b>淡红格</b>就是你这一下的射程，里面站着敌人的是<b>深红格</b>，点一下就开打（一次只打一个）。<br>' +
      (s ? `够不着就用技能【${sName}】：点「技能」，再点<b>紫色敌人</b>。` : '够不着就先走一步 —— 这回合还能出手。') +
      '<br>都不想动就<b>再点一下自己</b> —— 那就是待命。',
      '👆 点红格敌人 / 点技能 / 再点自己待命');
    if (u) previewAtkFrom(u, u.x, u.y);
    tutPlaceTip(tutHoleTo(board, 6));
    tutSetNext(false);
    return;
  }

  if (n === 4) {
    tutShow(4, '对了，敌人也会动',
      '四个人都出手完，会<b>自动换敌方回合</b>；想提前结束就点顶栏的「结束回合」。<br>剩下的全靠站位、射程和技能，去试试吧。',
      '');
    tutPlaceTip(tutHoleTo(document.getElementById('end-turn-btn'), 8));
    tutSetNext(true, '开始游戏');
  }
}

// 没有「下一步」的步骤（必须真的操作才能过），把「跳过」按钮拉满宽度
function tutSetNext(show, label) {
  const n = document.getElementById('tut-next');
  const k = document.getElementById('tut-skip');
  if (!n) return;
  n.style.display = show ? '' : 'none';
  if (label) n.textContent = label;
  if (k) {
    k.style.flex = show ? '0 0 auto' : '1';
    k.textContent = show ? '跳过' : '跳过引导';
  }
}

function tutNext() {
  if (!tutState) return;
  if (tutState.step >= TUT_STEP_N) { tutFinish(); return; }
  tutGoto(tutState.step + 1);
}

// ------------------------------------------------------------
// 点击推进：必须真的点到单位
// ------------------------------------------------------------
function tutBoardClick(ev) {
  if (!tutState) return;
  const board = document.getElementById('board');
  if (!board) return;

  // 从事件目标往上找 .cell（点到的可能是角标 / 血条等子节点）
  let cell = ev.target;
  while (cell && cell !== board &&
         !(cell.className && String(cell.className).indexOf('cell') >= 0)) {
    cell = cell.parentNode;
  }
  if (!cell || cell === board) return;

  const idx = Array.prototype.indexOf.call(board.children, cell);
  if (idx < 0) return;
  const x = idx % CONFIG.SIZE;
  const y = Math.floor(idx / CONFIG.SIZE);

  if (tutState.step === 1) {
    const u = G.grid[y][x];
    if (u && u.team === 'player') {
      tutState.unit = u;
      // 等 handleClick + renderBoard 跑完再切下一步
      setTimeout(function () {
        if (tutState && tutState.step === 1) tutGoto(2);
      }, 90);
    }
  }
}

// ------------------------------------------------------------
// 布局：挖洞 + 气泡定位
// ------------------------------------------------------------
function tutCellEl(u) {
  const board = document.getElementById('board');
  if (!board || !u) return null;
  return board.children[u.y * CONFIG.SIZE + u.x] || null;
}

function tutHoleTo(el, pad) {
  const spot = document.getElementById('tut-spot');
  if (!spot) return null;
  if (!el) {
    spot.style.display = 'none';
    return null;
  }
  const p = pad || 4;
  const r = el.getBoundingClientRect();
  const rect = { left: r.left - p, top: r.top - p, right: r.right + p, bottom: r.bottom + p };
  spot.style.display = 'block';
  spot.style.left = rect.left + 'px';
  spot.style.top = rect.top + 'px';
  spot.style.width = (rect.right - rect.left) + 'px';
  spot.style.height = (rect.bottom - rect.top) + 'px';
  return rect;
}

function tutShow(stepNo, title, desc, hint) {
  const no = document.getElementById('tut-step-no');
  const t = document.getElementById('tut-title');
  const d = document.getElementById('tut-desc');
  const h = document.getElementById('tut-hint');
  if (!no || !t || !d) return;
  no.textContent = '第 ' + stepNo + ' / ' + TUT_STEP_N + ' 步';
  t.textContent = title;
  d.innerHTML = desc;
  if (h) {
    h.textContent = hint || '';
    h.style.display = hint ? 'block' : 'none';
  }
}

function tutPlaceTip(rect) {
  const tip = document.getElementById('tut-tip');
  if (!tip) return;
  const vw = window.innerWidth || 800;
  const vh = window.innerHeight || 600;
  const tw = tip.offsetWidth || 300;
  const th = tip.offsetHeight || 150;

  let left = rect ? (rect.left + rect.right) / 2 - tw / 2 : (vw - tw) / 2;
  left = Math.max(8, Math.min(left, vw - tw - 8));

  let top;
  if (rect) {
    if (rect.bottom + 12 + th <= vh - 8) top = rect.bottom + 12;
    else if (rect.top - 12 - th >= 8) top = rect.top - 12 - th;
    else top = Math.max(8, vh - th - 8);
  } else {
    top = Math.max(8, (vh - th) / 2);
  }

  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

function tutRelayout() {
  if (!tutState) return;
  const n = tutState.step;
  let target = null, pad = 6;
  if (n === 1) {
    tutHoleTo(tutCellEl(G.hero || G.allies[0]), 4);
    tutPlaceTip(document.getElementById('board').getBoundingClientRect());
    return;
  }
  else if (n === 2 || n === 3) target = document.getElementById('board');
  else if (n === 4) target = document.getElementById('end-turn-btn');
  tutPlaceTip(tutHoleTo(target, pad));
}
