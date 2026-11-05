// ============================================================
// 队伍面板（顶栏「队伍」按钮）
//
//   为什么要有这个东西：手机上「长按 / 悬浮看详情」根本点不准，
//   详情框还会一直挡着棋盘。所以做成一张固定的表格：
//   谁的属性、能打哪几格、技能是什么档位，点开一次全看得见。
//   纯文字 + emoji，不用图片。
// ============================================================

// 一个单位当前的状态标签
function teamStateTag(u) {
  if (!u || u.hp <= 0) return '<i class="tt-dead">阵亡</i>';
  if (u.hasActed) return '<i class="tt-done">本回合已行动</i>';
  if (u.hasMoved) return '<i class="tt-ready">还能出手</i>';
  return '<i class="tt-ready">未行动</i>';
}

// 卡牌 / 奇遇留下的额外属性，只有非零才显示
//   （护甲 / 魔抗不在这里 —— 它们每个单位都有基础值，单独占一行）
function teamExtraBits(u) {
  const bits = [];
  const a = u.affix || {};
  if (a.bonus) bits.push('附加伤害 ' + Math.round(a.bonus * 100) + '%');
  if (a.lifesteal) bits.push('吸血 ' + Math.round(a.lifesteal * 100) + '%');
  if (a.bleed) bits.push('流血');
  if (u.atkBuff) bits.push('攻击加成 ' + Math.round(u.atkBuff * 100) + '%');
  if (u.fly) bits.push('飞行·无视地形');
  return bits;
}

function showTeamModal() {
  if (!G || !G.allies) return;

  const rows = G.allies.map(u => {
    const dead = u.hp <= 0;
    const lv = u.level || 1;
    const s = skillOf(u);
    const sName = skillLabelOf(u);
    const extra = teamExtraBits(u);
    const expMax = CONFIG.EXP.LEVEL_UP(lv);

    const head =
      `<tr class="tt-u${dead ? ' tt-off' : ''}">` +
        `<td class="tt-name">${u.isHero ? '<b class="tt-hero">主角</b>' : ''}${u.icon} ${u.name}<em>Lv${lv}</em></td>` +
        `<td>${u.hp}/${u.maxHp}</td>` +
        `<td>${u.atk}${u.spell ? `<span class="tt-spell">法${u.spell}</span>` : ''}</td>` +
        `<td>${Math.round(u.crit * 100)}%</td>` +
        `<td>${Math.round(u.dodge * 100)}%</td>` +
        `<td>${u.move}</td>` +
      `</tr>`;

    // 普攻 / 技能 / 护甲 / 魔抗 / 经验 / 加成 / 状态
    //   护甲（固定减物理）与魔抗（百分比减法术）必须写出来：
    //   坦克砍不动的时候，玩家得知道该换法师的地火
    const skillLine = s
      ? `<span class="tt-k">技能</span>${sName}：${skillDescOf(u)}`
      : '<span class="tt-k">技能</span>无（只有普攻）';

    const detail =
      `<tr class="tt-d${dead ? ' tt-off' : ''}"><td colspan="6">` +
        `<div><span class="tt-k">普攻</span>${atkLabel(u)}` +
          `　<span class="tt-k">护甲</span>${u.armor || 0}` +
          `　<span class="tt-k">魔抗</span>${Math.round((u.magicRes || 0) * 100)}%</div>` +
        `<div>${skillLine}${s ? `　<span class="tt-k">射程</span>${skillRangeLabel(u)}` : ''}</div>` +
        `<div><span class="tt-k">经验</span>${u.exp || 0}/${expMax}` +
          (extra.length ? `　<span class="tt-k">加成</span>${extra.join(' · ')}` : '') +
          `　${teamStateTag(u)}</div>` +
      `</td></tr>`;

    return head + detail;
  }).join('');

  const healPct = (typeof healPctOf === 'function') ? healPctOf() * 100 : CONFIG.HEAL_REGEN * 100;
  const alive = G.allies.filter(a => a.hp > 0).length;

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal team-modal">
      <h2>队伍</h2>
      <div class="tt-sub">第 ${G.floor} 层 · 第 ${G.turn} 回合 · 存活 ${alive}/${G.allies.length}</div>
      <div class="tt-wrap">
        <table class="tt">
          <thead>
            <tr><th>角色</th><th>生命</th><th>攻击</th><th>暴击</th><th>闪避</th><th>移动</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tt-tip">每回合开始时全队自动回复 ${healPct.toFixed(1)}% 最大生命 · 站在森林里命中 -20%</div>
      <button class="btn" id="team-close">关闭</button>
    </div>`;
  modal.querySelector('#team-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}
