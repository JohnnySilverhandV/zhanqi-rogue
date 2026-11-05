// ============================================================
// 属性结算（全队唯一入口）
//
//   2026-10-24 起装备系统已删除，所以属性只有三个来源：
//     ① 单位模板 base
//     ② 等级成长 lv * growth（含每级暴击成长）
//     ③ 局内永久加成 bonusAtk / bonusHp / bonusCrit / bonusDodge
//        （来自卡牌、奇遇、击杀成长、回合成长）
//   外加战斗内的临时状态：atkBuff（破釜沉舟等卡牌）、复仇、卧薪尝胆。
//
//   任何地方都不许直接改 h.atk / h.maxHp —— 下一次 recalcHeroStats
//   会把它们覆盖回去。要长期加成就写 bonus*，要临时加成就写 atkBuff。
// ============================================================
function recalcHeroStats() {
  if (!G || !G.allies) return;

  const capR = (CONFIG.SHAPE && CONFIG.SHAPE.RANGE_CAP) || 7;

  G.allies.forEach(function (h) {
    const base = UNIT_TEMPLATES[h.type];
    if (!base) return;

    const lv = (h.level || 1) - 1;
    const g = base.growth || {};

    // 基础 + 等级成长 + 永久加成
    let maxHp = base.hp + lv * (g.hp || 0) + (h.bonusHp || 0);
    let atk = base.atk + lv * (g.atk || 0) + (h.bonusAtk || 0);

    // 敢杀我的马：每阵亡 1 友军攻击 +50%（上限 +300%）
    if (h.revenge && h.revengeCount > 0) {
      atk = Math.floor(atk * (1 + 0.5 * Math.min(6, h.revengeCount)));
    }

    h.maxHp = Math.max(1, Math.floor(maxHp));
    if (h.hp > h.maxHp) h.hp = h.maxHp;

    // 攻击加成（奥利给 / 破釜沉舟）在这里一次乘进去，
    // 保证队伍表上的 ATK 就是真实出手攻击力
    h.atk = Math.max(1, Math.floor(atk * (1 + (h.atkBuff || 0))));

    // 法术强度：跟普攻完全分开的一条线（法师普攻只有 1，地火靠这条）
    //   来源 = 模板 spellAtk + 等级成长 spell + 永久加成 bonusAtk / bonusSpell
    const spellBase = base.spellAtk
      ? (base.spellAtk + lv * (g.spell || 0) + (h.bonusAtk || 0) + (h.bonusSpell || 0))
      : 0;
    h.spell = spellBase > 0
      ? Math.max(1, Math.floor(spellBase * (1 + (h.atkBuff || 0))))
      : 0;

    // 暴击：基础 + 每级成长 + 永久加成（负向奇遇可能扣，夹在 0~1）
    h.crit = Math.max(0, Math.min(1,
      (base.crit || 0.05) + lv * (g.crit || 0) + (h.bonusCrit || 0)));
    h.dodge = Math.max(0, Math.min(0.95, (base.dodge || 0.05) + (h.bonusDodge || 0)));

    // 护甲 / 魔抗：模板基础值 + 卡牌与奇遇加成
    //   护甲按固定值减物理伤害，魔抗按百分比减法术伤害（见 battle/combat.js）
    h.armor = (base.armor || 0) + (h.bonusArmor || 0);
    h.magicRes = Math.max(0, Math.min(0.9, (base.magicRes || 0) + (h.bonusMagicRes || 0)));

    // 等级成长：视野 / 移动
    h.range = Math.min(6, base.range + Math.floor(lv * (g.range || 0)));
    h.move = Math.min(6, base.move + Math.floor(lv * (g.move || 0)));

    // 普攻形状 / 距离：全部只算前后左右（射手另算，形状由 archerRingN 按等级外扩）
    h.atkMode = base.atkMode || 'cross1';
    h.atkRange = Math.max(1, Math.min(capR,
      (base.atkRange || 1) + Math.floor(lv * (base.atkRangeGrow || 0))));
  });
}
