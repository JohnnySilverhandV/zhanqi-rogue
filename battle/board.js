// ============================================================
// 地图渲染 + 点击处理（2026-10-24 真正的战棋操作）
//
//   一次操作流程：
//     点己方单位 → 亮出「蓝色可移动格」+「红色可攻击格」
//       · 点蓝格  = 移动（不结束行动，之后还能攻击）
//       · 点红格  = 攻击那个敌人（打一下就结束这个单位的行动）
//       · 点技能  = 进入技能模式，再点一个敌人当落点 / 方向
//       · 点自己  = 待命（结束这个单位的行动，最常用，所以放在最顺手的位置）
//   单位属性不再靠长按 / 悬浮查看：顶栏「队伍」按钮里有一张完整表格。
// ============================================================
function renderBoard() {
  const board = document.getElementById('board');
  if (!board) return;
  board.innerHTML = '';

  const hl = getHighlights();
  const sel = (G.selected && G.grid[G.selected.y])
    ? G.grid[G.selected.y][G.selected.x] : null;

  for (let y = 0; y < CONFIG.SIZE; y++) {
    for (let x = 0; x < CONFIG.SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const u = G.grid[y][x];
      const td = terrainDef(x, y);

      // 地形：背景纹理 + 空格上的地形图标
      if (td.key !== 'plain') cell.classList.add('terrain-' + td.key);

      // 阵营
      if (u) {
        if (u.team === 'player') cell.classList.add('ally');
        else cell.classList.add('enemy');

        cell.textContent = u.icon;
        if (u.isHero) cell.classList.add('hero');
        if (u.isBoss) cell.classList.add('boss');
        if (u.team === 'player' && u.hasActed) cell.classList.add('done');

        // 等级角标
        const lv = document.createElement('div');
        lv.className = 'lv-badge';
        lv.textContent = 'Lv' + (u.level || 1);
        cell.appendChild(lv);

        // 血条
        const bar = document.createElement('div');
        bar.className = 'hp-bar';
        const fill = document.createElement('div');
        fill.className = 'hp-fill';
        const pct = Math.max(0, (u.hp / u.maxHp) * 100);
        fill.style.width = pct + '%';
        bar.appendChild(fill);
        cell.appendChild(bar);

        // 桌面鼠标悬停：预演「它现在能打到哪」（只是高亮，不弹详情框）
        if (!IS_TOUCH) {
          cell.onmouseenter = () => {
            if (u.team === 'enemy') previewThreat(u);
            else previewAtkFrom(u, u.x, u.y);
          };
          cell.onmouseleave = () => clearShapePreview();
        }
      } else {
        if (td.key !== 'plain') {
          const ic = document.createElement('span');
          ic.className = 'terrain-icon';
          ic.textContent = td.icon;
          cell.appendChild(ic);
        }
        // 悬停可达格：预演「站到这里能打到哪」——战棋的核心信息
        if (!IS_TOUCH && sel && hl.move.has(`${x},${y}`)) {
          cell.onmouseenter = () => previewAtkFrom(sel, x, y);
          cell.onmouseleave = () => clearShapePreview();
        }
      }

      // 高亮
      const key = `${x},${y}`;
      if (hl.move.has(key)) cell.classList.add('moveable');
      if (hl.range.has(key)) cell.classList.add('atk-range');
      if (hl.attack.has(key)) cell.classList.add('attackable');
      if (hl.skill.has(key)) cell.classList.add('skillable');
      if (G.selected && G.selected.x === x && G.selected.y === y) cell.classList.add('selected');

      cell.onclick = () => handleClick(x, y);
      board.appendChild(cell);
    }
  }

  // 说明（地形 / 我方单位 / 操作方式）已收进顶栏「说明」弹窗，
  // 不再每次渲染都重算一遍
}

// ------------------------------------------------------------
// 当前该高亮哪些格子
//   move   蓝色：还能走的格（只有没移动过且没行动过才有）
//   range  淡红：普攻能覆盖到的格（说明「我打得到多远」）
//   attack 实红：其中站着敌人的格（点一下就开打）
//   skill  紫色：技能模式下的可选落点
// ------------------------------------------------------------
function getHighlights() {
  const move = new Set(), range = new Set(), attack = new Set(), skill = new Set();
  const empty = { move, range, attack, skill };
  if (!G.selected || G.phase !== 'player' || G.gameOver) return empty;

  const u = G.grid[G.selected.y] && G.grid[G.selected.y][G.selected.x];
  if (!u || u.team !== 'player') return empty;

  if (!u.hasMoved && !u.hasActed && !u.noMove) {
    const maxMove = u.fullMove ? 99 : u.move;
    const map = computeMoveMap(u);
    Object.keys(map).forEach(k => {
      const c = map[k];
      if (c > 0 && c <= maxMove) move.add(k);
    });
  }

  if (!u.hasActed) {
    atkCells(u, u.x, u.y).forEach(k => {
      range.add(k);
      const t = G.grid[+k.slice(k.indexOf(',') + 1)][+k.slice(0, k.indexOf(','))];
      if (t && t.team !== u.team && t.hp > 0) attack.add(k);
    });
    if (G.mode === 'skill') skillAnchorCells(u).forEach(k => skill.add(k));
  }
  return { move, range, attack, skill };
}

// ------------------------------------------------------------
// 预演：悬停可达格 / 己方单位时，直接画出「站到这里的攻击覆盖」
// ------------------------------------------------------------
function previewAtkFrom(u, fx, fy) {
  clearShapePreview();
  const board = document.getElementById('board');
  if (!board || !board.children || !u) return;

  atkCells(u, fx, fy).forEach(k => {
    const i = k.indexOf(',');
    const x = +k.slice(0, i), y = +k.slice(i + 1);
    const cell = board.children[y * CONFIG.SIZE + x];
    if (!cell || !cell.classList) return;
    const t = G.grid[y] && G.grid[y][x];
    cell.classList.add((t && t.team !== u.team && t.hp > 0) ? 'pv-hit' : 'pv-cell');
  });

  const self = board.children[fy * CONFIG.SIZE + fx];
  if (self && self.classList) self.classList.add('pv-self');
}

// 敌方威胁范围（红斜纹）
function previewThreat(u) {
  clearShapePreview();
  const board = document.getElementById('board');
  if (!board || !board.children || !u) return;
  enemyThreatCells(u).forEach(k => {
    const i = k.indexOf(',');
    const cell = board.children[+k.slice(i + 1) * CONFIG.SIZE + +k.slice(0, i)];
    if (cell && cell.classList) cell.classList.add('th-threat');
  });
  const self = board.children[u.y * CONFIG.SIZE + u.x];
  if (self && self.classList) self.classList.add('th-threat');
}

function clearShapePreview() {
  const board = document.getElementById('board');
  if (!board || !board.children) return;
  const cls = ['pv-hit', 'pv-cell', 'pv-self', 'pv-heal', 'th-threat'];
  for (let i = 0; i < board.children.length; i++) {
    const c = board.children[i];
    if (c && c.classList) c.classList.remove(...cls);
  }
}

// ------------------------------------------------------------
// 点击：整局游戏唯一的操作入口
// ------------------------------------------------------------
function handleClick(x, y) {
  if (G.gameOver || G.phase !== 'player') return;
  clearShapePreview();

  const u = G.grid[y][x];
  const sel = G.selected ? (G.grid[G.selected.y] && G.grid[G.selected.y][G.selected.x]) : null;

  // 选中的单位已经没了（阵亡 / 换层）→ 清掉选中
  if (G.selected && !sel) { G.selected = null; G.mode = null; render(); return; }

  // ===== 技能模式：这一下点击是在选落点 / 方向 =====
  if (G.mode === 'skill' && sel && actionReady(sel)) {
    if (skillAnchorCells(sel).has(x + ',' + y)) { doSkill(sel, x, y); return; }
    // 点歪了：退出技能模式并告诉玩家为什么，不消耗行动
    G.mode = null;
    floatText(x, y, '不在技能范围', 'float-miss');
    render();
    return;
  }

  if (sel && actionReady(sel)) {
    // 点自己所在格 → 待命（结束这个单位的行动）。
    // 这是全场点得最多的操作，所以直接给最短路径：点完人再点一下自己就过了。
    // 想取消选中：点行动栏左边的名字，或者点另一个自己人。
    if (sel.x === x && sel.y === y) { standBy(sel); return; }

    // 点另一个己方 → 换人
    if (u && u.team === 'player') {
      if (actionReady(u)) { G.selected = { x, y }; G.mode = null; render(); return; }
      floatText(x, y, '它已行动', 'float-miss');
      return;
    }

    // 点敌人 → 在射程内就打，够不着给个明确提示
    if (u && u.team === 'enemy') {
      if (atkCells(sel, sel.x, sel.y).has(x + ',' + y)) { doAttack(sel, u); return; }
      floatText(x, y, '够不着', 'float-miss');
      log(`${sel.name} 射程 ${atkLabel(sel)}，够不到 ${u.name}（试试技能）`, 'miss', true);
      return;
    }

    // 点空格 → 移动（移动不结束行动，之后还能攻击）
    if (!u) {
      const canMove = !sel.hasMoved && !sel.hasActed && !sel.noMove;
      const maxMove = sel.fullMove ? 99 : sel.move;
      const cost = canMove ? moveCostTo(sel, x, y) : Infinity;
      if (canMove && cost <= maxMove) {
        G.grid[sel.y][sel.x] = null;
        G.grid[y][x] = sel;
        sel.x = x; sel.y = y;
        sel.hasMoved = true;
        G.selected = { x, y };
        floatText(x, y, '移动', 'float-move');
        recalcHeroStats();          // 位置变了，重算属性
        render();
        saveGame();
        return;
      }
      // 下面这几种都是「点了走不了的地方」：一律给明确原因并保持选中，
      // 绝不静默取消选中 —— 玩家点空地想走过去，结果人被取消选中会一头雾水
      if (!isPassable(x, y)) {
        floatText(x, y, TERRAIN[terrainAt(x, y)].name + '·不可通行', 'float-miss');
        return;
      }
      if (sel.noMove) {
        floatText(x, y, '本局无法移动', 'float-miss');
        return;
      }
      if (sel.hasMoved) {
        floatText(x, y, '这回合已经移动过', 'float-miss');
        return;
      }
      floatText(x, y, '走不到（移动力 ' + maxMove + '）', 'float-miss');
      return;
    }
  }

  // 选中己方
  if (u && u.team === 'player') {
    if (!actionReady(u)) { floatText(x, y, '本回合已行动', 'float-miss'); return; }
    G.selected = { x, y };
    G.mode = null;
    render();
    return;
  }

  G.selected = null;
  G.mode = null;
  render();
}

// 治疗buff 当前系数（基础 + 卡牌加成）
function healPctOf() {
  return CONFIG.HEAL_REGEN + ((G && G.healBonus) || 0);
}
