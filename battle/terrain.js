// ============================================================
// 地形系统：平地 / 森林 / 河流 / 高山（每层随机生成）
//   · 平地：无影响
//   · 森林：可通行，但进入消耗 2 点移动力；站在森林中命中率 -20%
//   · 河流 / 高山：不可通行，也不会在其上生成任何单位
//   · 生成时保证「所有可通行格彼此连通」——绝不会把所有单位困死
// ============================================================
const TERRAIN = {
  plain:    { key: 'plain',    name: '平地', icon: '·',  cost: 1,  passable: true,  desc: '无特殊影响' },
  forest:   { key: 'forest',   name: '森林', icon: '🌲', cost: 2,  passable: true,  desc: '进入消耗 2 点移动力，站在其中命中率 -20%' },
  river:    { key: 'river',    name: '河流', icon: '🌊', cost: 99, passable: false, desc: '无法通行，也不会生成单位' },
  mountain: { key: 'mountain', name: '高山', icon: '⛰️', cost: 99, passable: false, desc: '无法通行，也不会生成单位' },
};

const FOREST_MISS = 0.20;       // 站在森林中：命中率 -20%

// ------------------------------------------------------------
// 查询
// ------------------------------------------------------------
function terrainAt(x, y) {
  if (!G || !G.terrain || !G.terrain[y]) return 'plain';
  return G.terrain[y][x] || 'plain';
}

function terrainDef(x, y) {
  return TERRAIN[terrainAt(x, y)] || TERRAIN.plain;
}

function isPassable(x, y) {
  return terrainDef(x, y).passable;
}

function isForest(x, y) {
  return terrainAt(x, y) === 'forest';
}

// ------------------------------------------------------------
// 生成：最下两行永远保持平地（开阔的后方，避免开局就被地形困住）
//       敌我双方出生位置已改为「全盘随机」，不再依赖固定的上下分区
// ------------------------------------------------------------
function isSpawnProtected(x, y) {
  return y >= CONFIG.SIZE - 2;
}

function fillBlob(t, sx, sy, type, size) {
  const queue = [{ x: sx, y: sy }];
  let n = 0;
  while (queue.length && n < size) {
    const c = queue.shift();
    if (!inBounds(c.x, c.y)) continue;
    if (t[c.y][c.x] !== 'plain') continue;
    if (isSpawnProtected(c.x, c.y)) continue;
    t[c.y][c.x] = type;
    n++;
    // 随机向四周蔓延，形成不规则的斑块
    const dirs = shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]);
    for (const [dx, dy] of dirs) {
      if (Math.random() < 0.62) queue.push({ x: c.x + dx, y: c.y + dy });
    }
  }
  return n;
}

// 连通性 + 落脚点校验：不满足则整张图重新生成
function terrainOk(t) {
  const N = CONFIG.SIZE;
  const start = { x: 5, y: 6 };          // 连通性校验的起点（固定取一个下方格）
  if (!TERRAIN[t[start.y][start.x]].passable) return false;

  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (!inBounds(nx, ny)) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (!TERRAIN[t[ny][nx]].passable) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }

  // 所有可通行格必须彼此连通（任何单位之间至少有一条路）
  let passableCount = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (TERRAIN[t[y][x]].passable) {
        passableCount++;
        if (!seen.has(`${x},${y}`)) return false;
      }
    }
  }
  if (passableCount < N * N * 0.6) return false;   // 别把地图堵得太死

  // 敌我双方都全盘随机出生 → 只看「全盘可通行格够不够站人」即可
  // （最多 7 我方 + 11 敌方 = 18 个单位，60% 的 64 格 = 38 格，足够）
  return passableCount >= 24;
}

function genTerrain(floor) {
  const N = CONFIG.SIZE;
  const plainMap = () => Array.from({ length: N }, () => Array(N).fill('plain'));

  for (let attempt = 0; attempt < 90; attempt++) {
    const t = plainMap();

    // 1) 障碍（河流 / 高山）：随层数略有增加，上限约 22%
    const blockGoal = Math.round(N * N * Math.min(0.22, 0.11 + floor * 0.003));
    let blocked = 0, guard = 0;
    while (blocked < blockGoal && guard++ < 400) {
      const sx = Math.floor(Math.random() * N);
      const sy = Math.floor(Math.random() * N);
      if (isSpawnProtected(sx, sy) || t[sy][sx] !== 'plain') continue;
      const type = Math.random() < 0.5 ? 'river' : 'mountain';
      blocked += fillBlob(t, sx, sy, type, 1 + Math.floor(Math.random() * 3));
    }

    // 2) 森林：可通行，撒得更散一些
    const forestGoal = Math.round(N * N * 0.13);
    let forested = 0; guard = 0;
    while (forested < forestGoal && guard++ < 400) {
      const sx = Math.floor(Math.random() * N);
      const sy = Math.floor(Math.random() * N);
      if (isSpawnProtected(sx, sy) || t[sy][sx] !== 'plain') continue;
      forested += fillBlob(t, sx, sy, 'forest', 1 + Math.floor(Math.random() * 3));
    }

    if (terrainOk(t)) return t;
  }

  // 兜底：极端情况下退回全平地，保证游戏永远能开局
  return plainMap();
}

// ------------------------------------------------------------
// 移动力消耗（Dijkstra：森林 2 步、平地 1 步、障碍不可进入、其他单位挡路）
// 返回 { 'x,y': cost }，起点本身为 0
// ------------------------------------------------------------
function computeMoveMap(u) {
  const cost = {};
  if (!u || !G.grid || !G.grid[u.y]) return cost;
  const startKey = `${u.x},${u.y}`;
  cost[startKey] = 0;
  const open = [{ x: u.x, y: u.y }];
  const done = new Set();

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (cost[`${open[i].x},${open[i].y}`] < cost[`${open[bi].x},${open[bi].y}`]) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const ck = `${cur.x},${cur.y}`;
    if (done.has(ck)) continue;
    done.add(ck);

    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = `${nx},${ny}`;
      if (done.has(nk)) continue;
      // 飞行（鸟人）：无视地形——河流 / 高山可通行，森林不额外消耗
      if (!u.fly && !isPassable(nx, ny)) continue;
      if (G.grid[ny][nx]) continue;         // 被其他单位占用
      const step = u.fly ? 1 : terrainDef(nx, ny).cost;
      const nc = (cost[ck] || 0) + step;
      if (cost[nk] === undefined || nc < cost[nk]) {
        cost[nk] = nc;
        open.push({ x: nx, y: ny });
      }
    }
  }
  return cost;
}

// 从 u 走到 (tx,ty) 需要多少移动力（不可达返回 Infinity）
function moveCostTo(u, tx, ty) {
  const map = computeMoveMap(u);
  const c = map[`${tx},${ty}`];
  return c === undefined ? Infinity : c;
}

// ------------------------------------------------------------
// 本层地形统计 + 图例
// ------------------------------------------------------------
function terrainSummary() {
  const N = CONFIG.SIZE;
  const cnt = { plain: 0, forest: 0, river: 0, mountain: 0 };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      cnt[terrainAt(x, y)]++;
  return cnt;
}

// 地形图例（日志栏上栏）——固定 3 行，尽量不占空间
function terrainLegendHtml() {
  const f = TERRAIN.forest, r = TERRAIN.river, m = TERRAIN.mountain;
  return `<div class="tu-line"><b>${f.icon} ${f.name}</b>：移动耗 2 · 站其中命中 -20%</div>` +
         `<div class="tu-line"><b>${r.icon}${r.name} / ${m.icon}${m.name}</b>：不可通行，高山还会挡住直线攻击</div>` +
         `<div class="tu-line"><b>· 平地</b>：无影响（棋盘最下两行永远是平地）</div>`;
}
