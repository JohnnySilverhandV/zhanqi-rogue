// ============================================================
// 屏幕演出层：回合弹字
//   · 弹字：回合开始 / 行动结束 · 敌人回合 —— 不挡操作，慢慢飘走
//   · 垃圾话（BOSS / 主角）：只写日志，**不再冒头顶气泡**
//     （2026-10-24 第五次调整：气泡会挡住棋盘上的单位，全部收掉）
// ============================================================

// ------------------------------------------------------------
// 回合弹字
//   kind: player（金） / enemy（红） / neutral（青）
// ------------------------------------------------------------
function showTurnBanner(main, sub, kind) {
  if (!main) return;
  // 同一时刻只保留一条弹字：敌人回合很快时，新弹字直接顶掉旧的，避免文字叠在一起
  const olds = document.querySelectorAll('.turn-banner');
  for (let i = 0; i < olds.length; i++) {
    if (olds[i].remove) olds[i].remove();
  }
  const el = document.createElement('div');
  el.className = 'turn-banner' + (kind ? ' tb-' + kind : '');
  el.innerHTML = '<b>' + main + '</b>' + (sub ? '<i>' + sub + '</i>' : '');
  document.body.appendChild(el);
  placeBanner(el);
  // 换层弹字常常在 render() 之前就创建了（顶栏还没填内容，棋盘位置偏高），
  // 等下一帧布局定下来再量一次，避免弹字落在棋盘里
  setTimeout(function () { if (el.parentNode) placeBanner(el); }, 80);
  // 动画 2.4s（放慢，保证能看清），结束后移除
  setTimeout(function () { if (el.remove) el.remove(); }, 2450);
}

// 弹字落在棋盘下沿之外（卡牌区那一带），既不压格子也不挡顶栏按钮
function placeBanner(el) {
  const board = document.getElementById('board');
  if (!board || typeof board.getBoundingClientRect !== 'function') return;
  const br = board.getBoundingClientRect();
  if (!br.width) return;
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;
  const h = el.offsetHeight || 52;
  // 元素用 translate(-50%,-50%)，所以 top 给的是「中心线」
  let center = br.bottom + 10 + h / 2;
  if (center + h / 2 > vh - 6) center = Math.max(h / 2 + 6, br.top - 10 - h / 2);
  el.style.top = center + 'px';
}

// ------------------------------------------------------------
// 垃圾话
//   以前会在单位头顶冒一个气泡（.taunt-bubble），盖住相邻格子、
//   混战时根本看不清，已整体取消。现在只说一句话：写进日志
//   （taunt-* 类型不进弹幕白名单，所以只在「日志」弹窗里能翻到）。
// ------------------------------------------------------------
function clearBubbles() {
  // 兼容旧调用：气泡已删除，这里只负责把可能残留的节点清掉
  const wrap = document.getElementById('board-wrap');
  if (!wrap || !wrap.querySelectorAll) return;
  const list = wrap.querySelectorAll('.taunt-bubble');
  for (let i = 0; i < list.length; i++) {
    if (list[i].remove) list[i].remove();
  }
}

function say(unit, text) {
  if (!unit || !text) return;
  // 只落日志：日志栏 / 日志弹窗里仍能看到谁在说什么
  log(text, unit.team === 'enemy' ? 'taunt-boss' : 'taunt-hero');
}

// 兼容命名：与 tauntSay 是同义词
function tauntSay(unit, text) { say(unit, text); }
