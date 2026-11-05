// ============================================================
// 卡池
// 说明：现在抽卡发生在「过一关」时（战场已清空），
//      因此凡是依赖战场瞬间的卡一律改为 type:'armed'（待发）：
//      · trigger:'attack' → 下次自己攻击时触发
//      · trigger:'hurt'   → 下次自己受到攻击时触发
//      触发后自动移出卡牌栏。
// ============================================================
const CARD_POOL = [
  // ===== 攻击（待发：下次攻击时释放）=====
  { id:'yiquan', name:'一拳', rarity:'myth', type:'armed', trigger:'attack',
    desc:'待发：下次攻击时，对目标所在行 / 列的所有敌人造成攻击力×2 伤害',
    onTrigger:(g, ctx)=>{ const t = ctx.target; if (!t) return;
      [...g.enemies].forEach(e => { if (e.x === t.x || e.y === t.y) dealDamage(g, ctx.attacker, e, 2); }); } },

  { id:'sdl', name:'三刀流·三千世界', rarity:'legend', type:'armed', trigger:'attack', heroOnly: true,
    desc:'待发：英雄下次攻击时触发 · 第 3 / 6 行与第 3 / 6 列的敌人全部受 333 点固定伤害（无视防御闪避，触发后移出卡牌栏）',
    onTrigger:(g)=>{ [...g.enemies].forEach(e => {
      if (e.x === 2 || e.x === 5 || e.y === 2 || e.y === 5) fixedDamage(g, e, 333); }); } },

  { id:'sltz', name:'神罗天征', rarity:'legend', type:'armed', trigger:'attack',
    desc:'待发：下次攻击时，全屏所有敌人受攻击力×1.5 伤害',
    onTrigger:(g, ctx)=>{ [...g.enemies].forEach(e => dealDamage(g, ctx.attacker, e, 1.5)); } },

  { id:'sdwlb', name:'闪电五连鞭', rarity:'legend', type:'armed', trigger:'attack',
    desc:'待发：下次攻击时，对目标连续攻击 5 次',
    onTrigger:(g, ctx)=>{ const t = ctx.target; if (!t) return;
      for (let i = 0; i < 4; i++) { if (t.hp <= 0) break; dealDamage(g, ctx.attacker, t); } } },

  { id:'khdxs', name:'葵花点穴手', rarity:'legend', type:'armed', trigger:'attack',
    desc:'待发：下次攻击命中后，使目标定身 2 回合',
    onTrigger:(g, ctx)=>{ const t = ctx.target; if (!t) return;
      t.stunTurns = Math.max(t.stunTurns || 0, 2);
      floatText(t.x, t.y, '定身', 'float-crit');
      log(`🌸 葵花点穴手：${t.name} 被定身 ${t.stunTurns} 回合`, 'system'); } },

  // ===== 防御（待发：下次受伤时触发）=====
  { id:'jhsy', name:'镜花水月', rarity:'rare', type:'armed', trigger:'hurt',
    desc:'待发：下次受到攻击时，免疫该次伤害',
    onTrigger:(g, ctx)=>{ ctx.cancel = true; } },

  { id:'jhf', name:'接化发', rarity:'legend', type:'armed', trigger:'hurt',
    desc:'待发：下次受到攻击时，反弹 100% 伤害给攻击者（不致死）',
    onTrigger:(g, ctx)=>{ ctx.reflect = (ctx.reflect || 0) + ctx.dmg; } },

  { id:'ggcf', name:'改革春风吹满地', rarity:'legend', type:'armed', trigger:'hurt',
    desc:'待发：下次有友军受伤时，全体立刻回满血',
    onTrigger:(g)=>{ g.allies.forEach(u => { if (u.hp > 0) u.hp = u.maxHp; });
      log('🌸 改革春风吹满地：全体回满血！', 'heal'); } },

  // ===== 攻击（永久被动）=====
  { id:'qby', name:'千本樱景严', rarity:'legend', desc:'英雄攻击时，目标周围 1 格敌人受攻击力×0.5 伤害（可叠加）', type:'permanent',
    effect:(g)=>{ g.hero.splash = (g.hero.splash||0) + 0.5; addBuff('千本樱景严','攻击溅射 +50%'); } },
  { id:'tmlxq', name:'天马流星拳', rarity:'legend', desc:'英雄攻击击退目标 2 格（可叠加）', type:'permanent',
    effect:(g)=>{ g.hero.knockback = (g.hero.knockback||0) + 2; addBuff('天马流星拳','攻击击退 2 格'); } },
  { id:'gswdm', name:'敢杀我的马', rarity:'myth', desc:'每阵亡一个友军，英雄攻击 +50%（上限 +300%）', type:'permanent',
    effect:(g)=>{ g.hero.revenge = true; addBuff('敢杀我的马','阵亡叠攻'); } },

  // ===== 防御（永久被动）=====
  { id:'wjdfn', name:'无尽的愤怒', rarity:'legend', desc:'英雄受到致命伤害时锁 1 血（可叠加次数）', type:'permanent',
    effect:(g)=>{ g.hero.undyingCount = (g.hero.undyingCount||0) + 1; addBuff('无尽的愤怒','锁血 1 次'); } },
  { id:'bsn', name:'不死鸟', rarity:'legend', desc:'英雄死亡时满血复活一次（可叠加次数）', type:'permanent',
    effect:(g)=>{ g.hero.reviveCount = (g.hero.reviveCount||0) + 1; addBuff('不死鸟','复活 1 次'); } },
  { id:'tbs', name:'铁布衫', rarity:'common', desc:'全体受到伤害 -30%', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.defense=Math.min(0.9,(u.defense||0)+0.3)); addBuff('铁布衫','减伤30%'); } },

  // ===== 治疗buff（奶妈单位已移除，治疗改为全队常驻 buff）=====
  { id:'ssbx', name:'生生不息', rarity:'common', desc:'全队每回合额外回复 4% 最大生命（可叠加）', type:'permanent',
    effect:(g)=>{ g.healBonus = (g.healBonus||0)+0.04; addBuff('生生不息','治疗+4%'); } },
  { id:'hter', name:'华佗再世', rarity:'rare', desc:'全队每回合额外回复 8% 最大生命（可叠加）', type:'permanent',
    effect:(g)=>{ g.healBonus = (g.healBonus||0)+0.08; addBuff('华佗再世','治疗+8%'); } },

  // ===== 位移 =====
  { id:'jdy', name:'筋斗云', rarity:'legend', desc:'全体可以全屏移动', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.fullMove=true); addBuff('筋斗云','全屏移动'); } },
  { id:'lbwb', name:'凌波微步', rarity:'rare', desc:'全体闪避率 +20%', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.bonusDodge=Math.min(0.9,(u.bonusDodge||0)+0.2)); addBuff('凌波微步','闪避+20%'); } },

  // ===== 增益 =====
  { id:'jntm', name:'鸡你太美', rarity:'rare', desc:'鸡你太美：全体攻击力 +10%', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.atkBuff=(u.atkBuff||0)+0.1); addBuff('鸡你太美','攻击+10%'); } },
  { id:'olgei', name:'奥利给', rarity:'rare', desc:'全体攻击力 +50%', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.atkBuff=(u.atkBuff||0)+0.5); addBuff('奥利给','攻击+50%'); } },
  { id:'tqlz', name:'同气连枝', rarity:'rare',
    desc:'全队攻击力 +20%，闪避 +5%（可叠加）', type:'permanent',
    effect:(g)=>{
      g.allies.forEach(u=>{
        u.atkBuff = (u.atkBuff || 0) + 0.2;
        u.bonusDodge = Math.min(0.9, (u.bonusDodge || 0) + 0.05);
      });
      addBuff('同气连枝','攻+20%·闪+5%');
    } },

  // ===== 词条（永久）：装备删掉后，这些原本挂在装备上的效果改为靠卡牌获得 =====
  { id:'ls', name:'裂伤', rarity:'common', desc:'全队命中后目标流血：每回合损失「攻击力×50%」，持续 2 回合（可叠加）', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>{ u.affix=u.affix||{}; u.affix.bleed=(u.affix.bleed||0)+0.5; });
      addBuff('裂伤','命中流血'); } },
  { id:'xy', name:'血契', rarity:'rare', desc:'全队攻击吸血 12%（可叠加）', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>{ u.affix=u.affix||{}; u.affix.lifesteal=(u.affix.lifesteal||0)+0.12; });
      addBuff('血契','吸血 12%'); } },
  { id:'fr', name:'锋锐', rarity:'common', desc:'全队攻击附加 15% 伤害（可叠加）', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>{ u.affix=u.affix||{}; u.affix.bonus=(u.affix.bonus||0)+0.15; });
      addBuff('锋锐','附加 15% 伤害'); } },
  { id:'jq', name:'甲胄', rarity:'common', desc:'全队护甲 +3（每次受物理攻击固定减伤 3 点，可叠加）', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>{ u.bonusArmor=(u.bonusArmor||0)+3; });
      addBuff('甲胄','护甲 +3'); } },

  // ===== 成长 =====
  { id:'mdbw', name:'磨刀不误砍柴工', rarity:'common', desc:'全体每击杀一个敌人攻击 +1', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.killGrowth=(u.killGrowth||0)+1); addBuff('磨刀不误砍柴工','击杀+1攻'); } },
  { id:'sx', name:'嗜血', rarity:'rare', desc:'全体每击杀一个敌人攻击 +5', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.killGrowth=(u.killGrowth||0)+5); addBuff('嗜血','击杀+5攻'); } },
  { id:'tt', name:'饕餮', rarity:'legend', desc:'全体每击杀一个敌人攻击 +10', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.killGrowth=(u.killGrowth||0)+10); addBuff('饕餮','击杀+10攻'); } },
  { id:'yzyy', name:'越战越勇', rarity:'common', desc:'全体每回合结束攻击 +1', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.turnGrowth=(u.turnGrowth||0)+1); addBuff('越战越勇','回合+1攻'); } },
  { id:'tcmcz', name:'铁杵磨成针', rarity:'rare', desc:'全体每回合结束生命 +10', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.turnHpGrowth=(u.turnHpGrowth||0)+10); addBuff('铁杵磨成针','回合+10血'); } },
  { id:'ygys', name:'愚公移山', rarity:'legend', desc:'全体每回合结束生命 +50', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.turnHpGrowth=(u.turnHpGrowth||0)+50); addBuff('愚公移山','回合+50血'); } },
  { id:'wxcd', name:'卧薪尝胆', rarity:'rare', desc:'英雄每损失 10% 生命，攻击 +5%（可叠加层数）', type:'permanent',
    effect:(g)=>{ g.hero.grudgeLv = (g.hero.grudgeLv||0) + 1; g.hero.grudge = true; addBuff('卧薪尝胆','损血+攻'); } },

  // ===== 赌狗 =====
  { id:'wf', name:'无防', rarity:'myth', desc:'英雄攻击范围全屏，但受伤即死', type:'permanent',
    effect:(g)=>{ g.hero.noDefense = true; g.hero.fullAttack = true; addBuff('无防','全屏攻击·受伤即死'); } },
  { id:'pfcz', name:'破釜沉舟', rarity:'legend', desc:'英雄攻击力 +100%，但无法移动', type:'permanent',
    effect:(g)=>{ g.hero.noMove = true; g.hero.atkBuff = (g.hero.atkBuff||0)+1.0; addBuff('破釜沉舟','+100%攻·不能动'); } },
  { id:'gzyz', name:'孤注一掷', rarity:'legend', desc:'抛硬币：正面回血 30%，反面扣血 30%', type:'instant',
    effect:(g)=>{ coinFlip(g.hero); } },
  { id:'wmyb', name:'我命由我不由天', rarity:'myth', desc:'90% 游戏失败（只能重开），10% 直跳第 99 层', type:'instant',
    effect:(g)=>{ fateGamble(g); } },

  // ===== 经济 =====
  { id:'cm', name:'财迷', rarity:'common', desc:'击杀金币 +5', type:'permanent',
    effect:(g)=>{ g.goldBonus = (g.goldBonus||0)+5; addBuff('财迷','击杀金币+5'); } },
  { id:'kyjl', name:'开源节流', rarity:'rare', desc:'每回合金币 +10', type:'permanent',
    effect:(g)=>{ g.turnGold = (g.turnGold||0)+10; addBuff('开源节流','回合金币+10'); } },
  { id:'bfh', name:'暴发户', rarity:'legend', desc:'立即获得 200 金币', type:'instant',
    effect:(g)=>{ g.gold += 200; } },
  { id:'fkdg', name:'富可敌国', rarity:'myth', desc:'立即获得「层数×1000」金币', type:'instant',
    effect:(g)=>{ g.gold += g.floor * 1000; } },

  // ===== 基础 =====
  { id:'pch', name:'皮糙肉厚', rarity:'common', desc:'全体最大生命 +5', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>{u.bonusHp+=5; u.hp+=5;}); addBuff('皮糙肉厚','生命+5'); } },
  { id:'ssb', name:'闪身步', rarity:'common', desc:'全体闪避 +1%', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.bonusDodge=Math.min(0.9,(u.bonusDodge||0)+0.01)); addBuff('闪身步','闪避+1%'); } },
  { id:'bbb', name:'爆爆爆', rarity:'common', desc:'全体暴击 +1%', type:'permanent',
    effect:(g)=>{ g.allies.forEach(u=>u.bonusCrit=Math.min(1.0,(u.bonusCrit||0)+0.01)); addBuff('爆爆爆','暴击+1%'); } },
  { id:'yq', name:'运气', rarity:'common', desc:'好卡槽出现传说 / 神话的概率提升', type:'permanent',
    effect:(g)=>{ g.luck = (g.luck||0)+0.02; addBuff('运气','好卡概率+'); } },
];
