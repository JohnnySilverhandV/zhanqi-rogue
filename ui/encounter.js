// ============================================================
// 奇遇系统
//   · 每 7 层触发一次（通关第 7、14、21、28…层之后，进下一层之前）
//   · 每个奇遇都是一道选择题，结果随选择而定
//   · **不是白送好处**：每个奇遇都带代价 / 风险，赌一把还是稳妥绕开由你决定
//   · 已触发过的奇遇不会重复出现，池子抽干后重新洗牌
// ============================================================

// ---------------- 效果工具 ----------------
function encGold(n) { G.gold = Math.max(0, G.gold + n); }
function encHeroAtk(n) { if (G.hero) G.hero.bonusAtk += n; recalcHeroStats(); }
function encAllAtk(n) { G.allies.forEach(a => { a.bonusAtk += n; }); recalcHeroStats(); }
function encAllHp(n) { G.allies.forEach(a => { a.bonusHp += n; a.hp = Math.max(1, a.hp + n); }); recalcHeroStats(); }
function encAllCrit(n) { G.allies.forEach(a => { a.bonusCrit += n; }); recalcHeroStats(); }
function encAllDodge(n) { G.allies.forEach(a => { a.bonusDodge += n; }); recalcHeroStats(); }
function encAllyAtk(type, n) {
  G.allies.filter(a => a.type === type).forEach(a => { a.bonusAtk += n; });
  recalcHeroStats();
}
function encFullHeal() { G.allies.forEach(a => { a.hp = a.maxHp; }); }
function encExp(n) { G.allies.forEach(a => { if (a.hp > 0) gainExp(a, n, '奇遇'); }); }

// ---- 负面 / 代价类工具（奇遇的另一面）----
// 当前生命扣比例（不会致死，最低留 1 点）
function encHurtPct(p) {
  G.allies.forEach(a => { if (a.hp > 0) a.hp = Math.max(1, Math.round(a.hp * (1 - p))); });
}
// 最大生命永久下降比例（基础值，跨层保留）
function encMaxHpPct(p) {
  G.allies.forEach(a => {
    const cut = Math.round((a.maxHp || 0) * p);
    a.bonusHp -= cut;
    a.hp = Math.max(1, a.hp - cut);
  });
  recalcHeroStats();
}

// ---------------- 事件池 ----------------
const ENCOUNTERS = [
  {
    id: 'oldman',
    title: '拾荒老人',
    icon: '🧓',
    text: '桥头蹲着个衣衫褴褛的老人，枯瘦的手伸到你面前：“军爷……行行好，给口饭吃吧。”',
    options: [
      {
        label: '施舍 50 金币', cost: 50,
        run: () => {
          encHeroAtk(20);
          return '老人接过金币，哆嗦着从怀里掏出一本泛黄的手抄册子：“这是老朽年轻时拾到的《天罡刀法》，留在我这儿也是废纸……”\n'
               + '你随手翻了几页，越看越心惊——刀意如奔雷，气血翻涌。\n【英雄 攻击力 +20】';
        },
      },
      { label: '摇头走开', run: () => '你绕过老人继续赶路。身后传来一声长长的叹息，你没有回头。' },
    ],
  },
  {
    id: 'well',
    title: '枯井许愿',
    icon: '⛲',
    text: '一口被遗忘的古井立在路旁，井沿刻着歪歪扭扭的字：“投币者，得庇佑。”',
    options: [
      {
        label: '投入 30 金币', cost: 30,
        run: () => {
          encAllHp(12);
          return '金币沉入井底，水面泛起一圈微光，温润的气息顺着井口涌上来，包裹住每一个人。\n【全队 最大生命 +12 并回复】';
        },
      },
      { label: '不投，继续走', run: () => '你朝井里看了一眼，只有深不见底的黑暗。还是赶路要紧。' },
    ],
  },
  {
    id: 'tablet',
    title: '斑驳石碑',
    icon: '🗿',
    text: '半截石碑埋在土里，碑文大半模糊，只有几个古字还闪着微光：“……以血为引，以念为刃。”',
    options: [
      {
        label: '伸手触摸碑文',
        run: () => {
          const roll = Math.random();
          if (roll < 0.4) { encAllCrit(0.06); return '碑文骤然亮起，一缕锋芒钻进你掌心。\n【全队 暴击率 +6%】'; }
          if (roll < 0.72) { encAllDodge(0.06); return '一阵凉意沿着指尖爬满全身，你忽然觉得脚步轻了许多。\n【全队 闪避率 +6%】'; }
          if (roll < 0.88) return '你摸了半天，石碑纹丝不动，倒是沾了一手灰——什么也没发生。';
          encHurtPct(0.15);
          return '你的手刚贴上碑面，一股阴冷的力量顺着经脉反噬上来，指尖瞬间青黑。\n【全队 当前生命 -15%】';
        },
      },
      { label: '收回手', run: () => '你把手缩了回来。荒郊野岭的东西，最好别碰。' },
    ],
  },
  {
    id: 'gambler',
    title: '骰子狂徒',
    icon: '🎲',
    text: '一个独眼汉子蹲在篝火边摇着骰盅：“来来来，一赔三！敢不敢赌一把？”',
    options: [
      {
        label: '押上 50 金币', cost: 50,
        run: () => {
          if (Math.random() < 0.5) {
            encGold(150);
            return '骰盅揭开——三个红点，豹子！\n独眼汉子脸都绿了，不情不愿地数出 150 金币拍在你手里。\n【金币 +150】';
          }
          return '骰盅揭开，你输了。独眼汉子乐呵呵地把金币收进怀里：“多谢赏脸！”\n【金币 -50】';
        },
      },
      { label: '不赌', run: () => '你摆摆手。独眼汉子撇撇嘴：“没胆。”' },
    ],
  },
  {
    id: 'wolf',
    title: '受伤的狼',
    icon: '🐺',
    text: '一只后腿中箭的灰狼挡在路中央，喉咙里发出低低的呜咽，却没有扑上来的意思。',
    options: [
      {
        label: '花 30 金币买药替它包扎', cost: 30,
        run: () => {
          encAllyAtk('archer', 12);
          return '你替它拔出箭头、敷上金创药。灰狼舔了舔你的手，转身钻进林中。\n'
               + '片刻后它叼着一支打磨得极精巧的骨箭回来，放在射手脚边。\n【射手 攻击力 +12】';
        },
      },
      { label: '绕道而行', run: () => '你握紧武器，从狼身边慢慢绕了过去。它始终没有动。' },
    ],
  },
  {
    id: 'pot',
    title: '路边的陶罐',
    icon: '🏺',
    text: '一个半人高的陶罐立在道旁，罐口被泥封得严严实实，隐约飘出说不清的甜香。',
    options: [
      {
        label: '掀开看看',
        run: () => {
          const roll = Math.random();
          if (roll < 0.45) {
            encFullHeal();
            return '罐里是温热的肉汤。你们分着喝了个精光，浑身舒坦。\n【全队 生命回满】';
          }
          if (roll < 0.75) {
            encAllAtk(8);
            G.allies.forEach(a => { a.hp = Math.max(1, Math.round(a.hp * 0.85)); });
            return '罐里泡着几株血色药草。你们嚼了下去，只觉浑身发热、筋骨作响，胸口却也隐隐发胀。\n【全队 攻击 +8，当前生命 -15%】';
          }
          return '罐子是空的，只有罐底一层发霉的药渣。你失望地把它踢翻了。';
        },
      },
      { label: '原封不动走开', run: () => '你没碰它。荒郊野岭的东西，还是别乱开为妙。' },
    ],
  },
  {
    id: 'sorcerer',
    title: '流浪术士',
    icon: '🧙‍♂️',
    text: '一个裹着破斗篷的术士拦住去路，晃着手中泛紫光的试管：“上好魔药，一剂见效，只要 60 金币。”',
    options: [
      {
        label: '花 60 金币买下', cost: 60,
        run: () => {
          encAllAtk(6);
          return '药剂入喉，像有一团火在血脉里流淌。术士满意地点头：“三日之内，你们的拳头会硬得吓人。”\n【全队 攻击 +6】';
        },
      },
      { label: '摆手拒绝', run: () => '术士耸耸肩：“不识货。”说罢钻进林子里不见了。' },
    ],
  },
  {
    id: 'farm',
    title: '荒废的农田',
    icon: '🌾',
    text: '一片没人打理的金黄麦田，穗子沉甸甸的，风一吹沙沙作响。田边倒着一把锈镰刀。',
    options: [
      {
        label: '顺手收割一批',
        run: () => {
          encGold(80);
          return '你们忙活了一阵，把割下的麦子背到镇上换了些盘缠。\n【金币 +80】';
        },
      },
      { label: '不耽误工夫', run: () => '赶路要紧，你们从田埂上直接走了过去。' },
    ],
  },
  {
    id: 'ruins',
    title: '塌方的商队',
    icon: '🏚️',
    text: '山道塌方，一支商队的马车翻在沟里。货物散落一地，车厢底下还有人低声呻吟。',
    options: [
      {
        label: '搜刮散落的货物',
        run: () => {
          encGold(60);
          return '你翻出几袋银币和一匹没湿透的布料，塞进背包。车厢底下的呻吟声，渐渐小了下去。\n【金币 +60】';
        },
      },
      {
        label: '先把人刨出来',
        run: () => {
          encAllHp(10);
          return '你们合力撬开车厢，把两个伙计拖了出来。他们千恩万谢，硬塞来一包伤药：“拿着，保命用！”\n【全队 最大生命 +10 并回复】';
        },
      },
    ],
  },
  {
    id: 'campfire',
    title: '现成的篝火',
    icon: '🔥',
    text: '一堆篝火还在噼啪作响，旁边挂着烤到一半的野味，主人却不知去向。',
    options: [
      {
        label: '坐下来吃饱再说',
        run: () => {
          encFullHeal();
          return '你们把野味分了个干净，围着火堆歇了半个时辰。\n【全队 生命回满】';
        },
      },
      {
        label: '不吃，连夜赶路',
        run: () => {
          encAllDodge(0.04);
          return '你们咬着干粮摸黑前进。夜路走得多了，耳朵和脚步都变得极灵。\n【全队 闪避率 +4%】';
        },
      },
    ],
  },
  {
    id: 'veteran',
    title: '白发老兵',
    icon: '🎖️',
    text: '一个独臂老兵坐在界石上磨刀，抬眼打量你们：“小鬼，敢不敢陪老朽过两招？”',
    options: [
      {
        label: '痛快切磋一场',
        run: () => {
          encExp(120);
          return '三十招后，你们全被摔在了地上。老兵哈哈大笑：“不错，底子不差！”\n'
               + '他一边骂，一边把你们的破绽一个个指了出来。\n【全队 获得 120 经验】';
        },
      },
      {
        label: '婉言谢绝',
        run: () => {
          encGold(60);
          return '老兵叹了口气，从怀里摸出一个钱袋塞给你：“拿去吧，老朽留着也没用。”\n【金币 +60】';
        },
      },
    ],
  },
  {
    id: 'altar',
    title: '荒野祭坛',
    icon: '🕯️',
    text: '一圈黑石围成的祭坛中央，跳着一簇没有温度的白色火焰，火焰前有个小小的石盘。',
    options: [
      {
        label: '献上 40 金币', cost: 40,
        run: () => {
          if (Math.random() < 0.5) {
            encAllAtk(10);
            return '金币在盘中化为灰烬，白焰猛地窜高三尺，一层锋锐的气旋扫过每个人的兵刃。\n【全队 攻击 +10】';
          }
          encAllCrit(0.08);
          return '金币融进火焰，白焰一分为四，钻进你们的眉心。眼前的世界忽然清晰了许多。\n【全队 暴击率 +8%】';
        },
      },
      { label: '不献祭', run: () => '你退后两步。白焰无风自动，像是在无声地嘲笑。' },
    ],
  },

  // ===== 以下奇遇全部带「代价 / 风险」，不是白拿好处 =====
  {
    id: 'bandit',
    title: '拦路劫匪',
    icon: '🗡️',
    text: '三个蒙面汉子从林子里窜出来堵住去路。领头的掂着刀，笑得露出黄牙：“过路费，50 金币。识相的话，钱留下，人走。”',
    options: [
      {
        label: '掏钱买路', cost: 50,
        run: () => '你把金币丢过去。汉子们数了数，咧嘴一笑让开了道。\n【金币 -50 · 全员平安】',
      },
      {
        label: '抄家伙硬闯',
        run: () => {
          encHurtPct(0.25);
          encGold(120);
          return '一场混战。你们把三个劫匪打翻在地，搜出他们抢来的钱袋——\n'
               + '代价是每个人身上都添了几道口子。\n【金币 +120 · 全队当前生命 -25%】';
        },
      },
    ],
  },
  {
    id: 'pact',
    title: '深渊契约',
    icon: '😈',
    text: '一缕黑雾不知何时缠上了你的手腕，一个嘶哑的声音贴着耳朵低语：\n“用一半的血，换双倍的力……很划算，不是吗？”',
    options: [
      {
        label: '签下契约',
        run: () => {
          encMaxHpPct(0.30);
          encAllAtk(14);
          return '黑雾猛地收紧，钻入每个人的心脏。你感到一阵窒息，随即是排山倒海的力量。\n【全队 最大生命 -30% · 攻击 +14】';
        },
      },
      {
        label: '撕毁契约',
        run: () => {
          encHurtPct(0.20);
          return '你咬破手指把黑雾按散。它临走前狠狠绞了你一把，像是不甘的报复。\n【全队 当前生命 -20%】';
        },
      },
    ],
  },
  {
    id: 'potion',
    title: '来路不明的药剂',
    icon: '🧪',
    text: '石缝里卡着一只玻璃瓶，深紫色的液体在里面缓缓打转。瓶身没有标签，只有一行歪歪扭扭的字：“强身。”',
    options: [
      {
        label: '分着喝掉',
        run: () => {
          if (Math.random() < 0.5) {
            encAllAtk(16);
            encHurtPct(0.15);
            return '药力霸烈，你们浑身滚烫、青筋暴起——力量确实涨了，但五脏六腑像被火燎过。\n【全队 攻击 +16 · 当前生命 -15%】';
          }
          encHurtPct(0.35);
          return '入口才知道是劣制毒药。你们扶着树吐了半天，脸色一个比一个白。\n【全队 当前生命 -35%】';
        },
      },
      { label: '倒掉', run: () => '你把瓶子倒扣在石头上，紫色液体渗进土里，冒起一缕黑烟。还好没喝。' },
    ],
  },
  {
    id: 'mine',
    title: '塌方的矿洞',
    icon: '⛏️',
    text: '一座废弃的矿洞张着黑口，深处隐约有金属的反光。洞顶的巨石被雨水泡得发胀，一动不动地悬着。',
    options: [
      {
        label: '进去搜刮',
        run: () => {
          encGold(150);
          encHurtPct(0.20);
          return '你们摸到深处，果然翻出几袋被遗弃的矿银。刚退到洞口，身后轰然塌下一片碎石——\n'
               + '烟尘里，每个人都挂了彩。\n【金币 +150 · 全队当前生命 -20%】';
        },
      },
      { label: '绕道走', run: () => '你抬头看了看那几块巨石，摇了摇头。为这点钱赌命，不值。' },
    ],
  },
  {
    id: 'thorns',
    title: '密不透风的荆棘',
    icon: '🌿',
    text: '一片黑荆棘横在必经之路上，刺尖泛着幽蓝的光。绕路要多走大半天，天快黑了。',
    options: [
      {
        label: '硬劈过去',
        run: () => {
          encHurtPct(0.12);
          encExp(100);
          return '你们挥刀砍了半个时辰，手上、腿上全是血口子。\n'
               + '不过这一路劈砍，倒把每个人的刀法磨得更利了些。\n【全队 当前生命 -12% · 获得 100 经验】';
        },
      },
      {
        label: '绕远路',
        run: () => {
          encGold(-40);
          return '你们绕了大半天的山路，天黑了才到镇子，住店、吃饭花了不少盘缠。\n【金币 -40】';
        },
      },
    ],
  },
  {
    id: 'idol',
    title: '独眼的石像',
    icon: '🪨',
    text: '一尊半人高的石像立在路中央，独眼里嵌着一颗黑曜石，无论你走到哪个角度，都像在盯着你。石座下压着一只钱箱。',
    options: [
      {
        label: '撬开钱箱，带走黑曜石',
        run: () => {
          encGold(100);
          encAllAtk(-4);
          encAllDodge(-0.04);
          return '钱箱里的金币是实的。可当你抠下那颗黑曜石时，一阵恶心涌上所有人的嗓子眼，手脚都变得沉重迟钝。\n'
               + '身后，石像的嘴角似乎动了一下。\n【金币 +100 · 全队 攻击 -4 · 闪避 -4%】';
        },
      },
      { label: '敬而远之', run: () => '你按住想去摸钱箱的手，绕开石像继续赶路。' },
    ],
  },
];

// ---------------- 抽取 ----------------
function pickEncounter() {
  if (!G.encounterHistory) G.encounterHistory = [];
  let pool = ENCOUNTERS.filter(e => G.encounterHistory.indexOf(e.id) < 0);
  if (!pool.length) { G.encounterHistory = []; pool = ENCOUNTERS.slice(); }
  const ev = pick(pool);
  G.encounterHistory.push(ev.id);
  G.encounterCount = (G.encounterCount || 0) + 1;
  return ev;
}

// 该层通关后是否触发奇遇（每 7 层一次）
function encounterDue(clearedFloor) {
  return clearedFloor > 0 && clearedFloor % 7 === 0;
}

// ---------------- 弹窗 ----------------
function showEncounterModal(onDone, forcedEvent) {
  const ev = forcedEvent || pickEncounter();
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  let resolved = false;

  function paintChoose() {
    modal.innerHTML = `
      <div class="modal enc-modal">
        <h2>❓ 奇遇</h2>
        <div class="enc-head">💰 金币 ${G.gold}</div>
        <div class="enc-icon">${ev.icon}</div>
        <div class="enc-title">${ev.title}</div>
        <div class="enc-text">${ev.text}</div>
        <div class="enc-options">
          ${ev.options.map((o, i) => {
            const poor = o.cost && G.gold < o.cost;
            return `<button class="btn enc-opt" id="enc-opt-${i}" ${poor ? 'disabled' : ''}>`
                 + `${o.label}${poor ? ' · 金币不足' : ''}</button>`;
          }).join('')}
        </div>
        <div class="enc-tip">选择会立即生效 · 每个选择都有代价，量力而行</div>
      </div>
    `;
    ev.options.forEach((o, i) => {
      const b = modal.querySelector('#enc-opt-' + i);
      if (!b) return;
      // 金币不够的选项直接置灰（HTML 里已带 disabled，这里再显式设置一次，避免依赖字符串）
      b.disabled = !!(o.cost && G.gold < o.cost);
      b.onclick = () => choose(o);
    });
  }

  function choose(opt) {
    if (resolved) return;
    resolved = true;
    if (opt.cost) G.gold -= opt.cost;

    const result = opt.run() || '……';
    log(`❓ 奇遇「${ev.title}」· 你选择了：${opt.label}`, 'encounter');
    String(result).split('\n').forEach(line => log('　└ ' + line, 'encounter'));

    recalcHeroStats();
    paintResult(result);
    saveGame();
  }

  function paintResult(result) {
    modal.innerHTML = `
      <div class="modal enc-modal">
        <h2>❓ ${ev.icon} ${ev.title}</h2>
        <div class="enc-result">${result}</div>
        <div class="enc-head">💰 金币 ${G.gold} · 队伍整装待发</div>
        <button class="btn" id="enc-continue">继续前进 ▶</button>
      </div>
    `;
    const btn = modal.querySelector('#enc-continue');
    if (btn) btn.onclick = () => {
      modal.remove();
      if (typeof onDone === 'function') onDone();
    };
  }

  paintChoose();
  document.body.appendChild(modal);
  log('❓ 路上遇到了奇遇……', 'encounter');
}
