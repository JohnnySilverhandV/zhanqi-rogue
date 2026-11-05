// ============================================================
// 弹幕日志层（从屏幕右侧向左飘过）
//
//   设计要点：
//   · 全屏覆盖、pointer-events:none —— 只做演出，绝不挡点击
//   · 轨道分配是「独占式」：一条轨道同一时刻只允许一条弹幕。
//     轨道没空出来就等（排队），**绝不硬塞**——硬塞就会两条叠在一起变成一坨糊字
//   · 一条轨道空出来的时刻 = 上一条的尾巴离开右边缘 + 安全间距所需时间：
//       freeAt = now + (宽 + GAP_X) / 速度
//     因为全屏所有弹幕速度一致，同轨的后一条永远追不上前一条
//   · 竖向：轨道几何用「轨顶 + 行高」，弹幕在轨内垂直居中。
//     以前把「轨道中心」当成元素 top 用，整排都会往下一压半行，看着就像怼在一起
//   · 大字（强化成败 / 存档奖励）**占两条轨道**（2×行高 ≥ 字高），
//     并且和普通流水共用同一套轨道账本 —— 否则上层大字会压住下层普通弹幕
//   · 吞吐不够时：桌面最多 13 轨、手机 5 轨；队列积压就丢掉「经验 / 回血」这类小字，
//     把轨道留给战斗流水（丢小字比叠字好，叠字等于没信息）
//
//   对外接口：
//     DM.push(text, type, opts)   普通弹幕（type 即日志类型，决定配色）
//     DM.result(text, ok)         特大号结果弹幕（强化成功 / 失败 / 通关奖励）
//     DM.clear()                  清屏（换周目 / 重新开始时用）
// ============================================================
const DM = (function () {
  const CFG = {
    SPEED: 210,          // 飘行速度 px/s（宽屏按屏宽微调，窄屏锁 150）
    SPEED_MIN: 150,
    GAP_X: 34,           // 同轨两条之间的最小横向间距
    MIN_INTERVAL: 56,    // 两条弹幕之间的最小间隔 ms
    FAST_INTERVAL: 42,   // 队列积压时缩短到这么短
    MAX_LIVE: 48,        // 单层同屏上限（纯兜底；13 轨每条可挂 2~3 条，正常不该触发）
    MAX_QUEUE: 48,       // 队列上限，超了丢最旧的
    LANES_DESKTOP: 13,   // 桌面最多 13 条轨道
    LANES_MOBILE: 5,     // 手机最多 5 条，否则糊满棋盘
    RETRY_MS: 110,       // 没轨道时的重试间隔
    RETRY_MAX: 40,       // 重试上限（约 4.4 秒），超了宁可丢这条也不叠字
    SLACK: 26,           // 允许提前这么久发车（ms），吸收定时器抖动
  };

  let lanes = [];        // [{ y: 轨顶, freeAt: 空出来时刻 }]
  let lineH = 27;
  let laneKey = '';
  // 发车台账：只留最近 400 条，给测试/排查算「任意时刻屏幕上是否重叠」用。
  // 记录的是动画的真实运动参数（起点、宽高、速度），所以脱离渲染也能精确复算
  const trace = [];
  const TRACE_MAX = 400;
  let queue = [];
  let pumping = false;
  let lastSpawn = 0;

  function small() {
    return (window.innerWidth || 800) < 861;
  }

  // 两个层：
  //   #danmaku-layer      普通流水，z-index 55（在弹窗下面，不干扰阅读）
  //   #danmaku-layer-top  结论级大字（强化成败 / 存档奖励），z-index 210
  //                       强化是在商店弹窗里点的，如果结果被弹窗盖住就等于没反馈
  function layer(top) {
    const id = top ? 'danmaku-layer-top' : 'danmaku-layer';
    let l = document.getElementById(id);
    if (!l) {
      l = document.createElement('div');
      l.id = id;
      document.body.appendChild(l);
    }
    return l;
  }

  // 弹幕活动区：顶栏下沿（与行动栏下沿取大）~ 棋盘下沿
  function measure() {
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    // 兜底 92：newGame 阶段顶栏还是空 div（高度 0），这时按「常规顶栏高度」算，
    // 否则最早的几条弹幕会直接压在顶栏上
    let top = 92;
    let bottom = vh - 140;
    const tb = document.getElementById('topbar');
    const bd = document.getElementById('board');
    if (tb) {
      const r = tb.getBoundingClientRect();
      if (r.height > 20) top = r.bottom + 2;
    }
    const ab = document.getElementById('action-bar');
    if (ab) {
      const r = ab.getBoundingClientRect();
      // 行动栏是「选中单位 / 攻击范围 / 原地开火」那一条，弹幕压上去会看不清
      if (r.height > 10) top = Math.max(top, r.bottom + 2);
    }
    if (bd) {
      const r = bd.getBoundingClientRect();
      if (r.height && r.bottom > top + 40) bottom = r.bottom - 3;
    }
    if (bottom - top < 70) {
      top = Math.max(8, top);
      bottom = Math.min(vh - 40, top + 170);
    }
    return { top: top, bottom: bottom, vh: vh };
  }

  // 轨道几何只由「活动区高度 / 行高」决定，布局没变就不动。
  // 轨道**均匀铺满**活动区：轨距 = max(行高, 均分间距)，所以永远 ≥ 行高，竖向绝不会互相压。
  // （早先固定用行高当轨距，手机上 5 条轨道会全挤在顶上 120px，下面 260px 空着）
  // 重算时保留每条轨道已有的 freeAt / speed / clearAt，避免重排那一瞬间出现「全部空闲」导致齐发叠字。
  function syncLanes() {
    const m = measure();
    const s = small();
    const lh = s ? 24 : 27;
    const maxN = s ? CFG.LANES_MOBILE : CFG.LANES_DESKTOP;
    const avail = m.bottom - m.top;
    const n = Math.max(2, Math.min(maxN, Math.floor(avail / lh)));
    const step = n > 1 ? Math.max(lh, (avail - lh) / (n - 1)) : lh;
    const key = m.top + '|' + n + '|' + Math.round(step) + '|' + lh;
    if (key === laneKey && lanes.length === n) return;
    laneKey = key;
    lineH = lh;
    const next = [];
    for (let i = 0; i < n; i++) {
      const old = lanes[i];
      next.push({
        y: Math.round(m.top + i * step),
        freeAt: old ? old.freeAt : 0,
        speed: old ? old.speed : 0,
        clearAt: old ? old.clearAt : 0,
      });
    }
    lanes = next;
  }

  // 找一段连续 span 条轨道、且它们都已空出来。找不到返回 -1（调用方等着，不硬塞）
  function pickLanes(now, span) {
    const n = lanes.length;
    const need = Math.min(span, n);
    for (let i = 0; i + need <= n; i++) {
      let ok = true;
      for (let k = 0; k < need; k++) {
        if (lanes[i + k].freeAt > now + CFG.SLACK) { ok = false; break; }
      }
      if (ok) return i;
    }
    return -1;
  }

  function trimLive(l) {
    const live = l.children;
    if (live.length <= CFG.MAX_LIVE) return;
    const over = live.length - CFG.MAX_LIVE;
    for (let i = 0; i < over; i++) {
      if (live[0] && live[0].remove) live[0].remove();
    }
  }

  function spawn(item) {
    syncLanes();
    const now = performance.now();
    // 大字占两条轨道：字高 31px > 单轨 27px，只占一条就会漫进下一轨压住别人
    const span = item.big ? 2 : 1;
    const idx = pickLanes(now, span);
    if (idx < 0) return false;            // 全忙 → 等，绝不硬塞

    const l = layer(item.big);
    const el = document.createElement('span');
    el.className = 'dm' + (item.cls ? ' ' + item.cls : '');
    el.textContent = item.text;

    // 测量阶段：暂停动画 + 不可见。否则用 0.001s 的动画量宽度，元素会被瞬间甩到终点
    el.style.animationName = 'none';
    el.style.visibility = 'hidden';
    el.style.top = '0px';
    l.appendChild(el);
    const w = el.offsetWidth || Math.min(260, item.text.length * 13);
    const h = el.offsetHeight || lineH - 4;

    // 垂直：在「本条占用的那几条轨道」围出的带状区域里居中
    // （轨道是均匀铺开的，轨距可能大于行高，所以带状高度要按首末轨道实际位置算）
    const bandTop = lanes[idx].y;
    const bandH = lanes[idx + span - 1].y + lineH - bandTop;
    const topPx = Math.round(bandTop + (bandH - h) / 2);
    el.style.top = topPx + 'px';
    el.style.visibility = '';

    const vw = window.innerWidth || 800;
    let speed = Math.max(CFG.SPEED_MIN, Math.min(CFG.SPEED, vw / 6.8));
    if (item.big) speed *= 0.82;          // 大字慢一点，留时间读完
    // 关键：同一条轨道上还在屏幕上跑的那条如果更慢，这条必须跟它一样慢。
    // 否则后发的快车会追上并穿过前车 —— 那就是「两句怼在一起」的真正成因。
    for (let k = 0; k < span; k++) {
      const ln2 = lanes[idx + k];
      if (ln2.clearAt > now && ln2.speed && speed > ln2.speed) speed = ln2.speed;
    }
    const dur = Math.max(3.3, (vw + w + 24) / speed);
    el.style.animationDuration = dur.toFixed(2) + 's';
    el.style.animationName = '';          // 交回 .dm 的 dm-fly，从 0 起播

    // 占轨：等自己的尾巴离开右边缘 + 间距所需的时间
    const occ = now + ((w + CFG.GAP_X) / speed) * 1000;
    for (let k = 0; k < span; k++) {
      lanes[idx + k].freeAt = occ;
      lanes[idx + k].speed = speed;
      lanes[idx + k].clearAt = now + dur * 1000;   // 这条彻底离场（尾离开左边缘）的时刻
    }

    trace.push({ t: now, d: dur * 1000, y: topPx, w: w, h: h, v: speed, vw: vw,
                 i: idx, s: span, big: !!item.big, x: item.text.slice(0, 18) });
    if (trace.length > TRACE_MAX) trace.shift();

    trimLive(l);
    setTimeout(function () { if (el.remove) el.remove(); }, dur * 1000 + 240);
    return true;
  }

  function pump() {
    if (pumping) return;
    if (!queue.length) return;
    pumping = true;

    var tick = function () {
      if (!queue.length) { pumping = false; return; }
      const gap = queue.length > 8 ? CFG.FAST_INTERVAL : CFG.MIN_INTERVAL;
      const wait = gap - (performance.now() - lastSpawn);
      if (wait > 0) { setTimeout(tick, wait); return; }

      const item = queue[0];
      if (!spawn(item)) {
        // 没轨道 → 等一会儿；等太久说明真的爆了，丢掉这条，别堵住后面所有日志
        item.tries = (item.tries || 0) + 1;
        if (item.tries > CFG.RETRY_MAX) { queue.shift(); }
        setTimeout(tick, CFG.RETRY_MS);
        return;
      }
      queue.shift();
      lastSpawn = performance.now();
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }

  function push(text, type, opts) {
    if (!text) return;
    let s = String(text).replace(/\s+/g, ' ').trim();
    if (!s) return;
    const S = small();
    // 窄屏文本再短一截：弹幕短 = 占轨时间短 = 轨道周转快
    const maxLen = S ? 42 : 62;
    if (s.length > maxLen) s = s.slice(0, maxLen) + '…';

    const o = opts || {};
    // 队列已经积压 → 经验 / 回血这类小字直接不上屏，把轨道让给战斗流水
    if (o.minor && queue.length >= (S ? 4 : 9)) return;

    const cls = ['t-' + (type || 'system')];
    if (o.big) cls.push('big');
    if (o.ok === true) cls.push('ok');
    if (o.ok === false) cls.push('bad');
    if (o.minor) cls.push('minor');

    queue.push({ text: s, cls: cls.join(' '), big: !!o.big, minor: !!o.minor });
    while (queue.length > CFG.MAX_QUEUE) queue.shift();
    pump();
  }

  // 强化结果 / 通关奖励这类「一句话结论」：大号 + 冷暖色
  function result(text, ok) {
    push(text, ok ? 'big-ok' : 'big-bad', { big: true, ok: !!ok });
  }

  function clear() {
    queue = [];
    pumping = false;
    lastSpawn = 0;
    // 轨道也一起放空，否则清屏后新弹幕还要白等上一批的占轨时间
    for (let i = 0; i < lanes.length; i++) lanes[i].freeAt = 0;
    ['danmaku-layer', 'danmaku-layer-top'].forEach(function (id) {
      const l = document.getElementById(id);
      if (l && l.innerHTML !== undefined) l.innerHTML = '';
    });
  }

  // 布局变了（旋转 / 缩放）→ 轨道重算
  window.addEventListener('resize', function () { laneKey = ''; });

  // 调试探针：测试里用来确认轨道 / 队列状态（正常游戏不调用）
  function stat() {
    const now = performance.now();
    const ln = document.getElementById('danmaku-layer');
    const tp = document.getElementById('danmaku-layer-top');
    return {
      lanes: lanes.length,
      tracks: lanes.length,                      // 兼容旧断言名
      lineH: lineH,
      queue: queue.length,
      pumping: pumping,
      busy: lanes.filter(function (x) { return x.freeAt > now; }).length,
      tops: lanes.map(function (x) { return Math.round(x.y); }),
      liveNormal: ln ? ln.children.length : 0,
      liveBig: tp ? tp.children.length : 0,
    };
  }

  return {
    push: push, result: result, clear: clear, _stat: stat,
    // 测试用：取发车台账 / 清空台账（正常游戏不调用）
    _trace: function () { return trace.slice(); },
    _clearTrace: function () { trace.length = 0; },
  };
})();

// 日志类型 → 弹幕配色 / 字号（在 style.css 里定义 .dm.t-*）
//   player/enemy 是战斗流水，exp/heal 是成长流水，kill/levelup 是值得看大的
function dmClsOfType(type) {
  return type || 'system';
}
