// ============================================================
// 存档系统（v6：四人大队 + 护甲魔抗 + 商店删除）
// ============================================================
const SAVE_KEY = 'zhanqi_rogue_save_v6';

function saveGame() {
  if (!G) return;
  try {
    const data = {
      version: 6,
      floor: G.floor,
      turn: G.turn,
      challenge: G.challenge,
      gold: G.gold,
      levelBuys: G.levelBuys || 0,
      buffs: G.buffs,
      armed: (G.armed || []).map(a => ({ id: a.id, stacks: a.stacks || 1 })),
      goldBonus: G.goldBonus,
      turnGold: G.turnGold,
      luck: G.luck,
      healBonus: G.healBonus,
      encounterHistory: G.encounterHistory || [],
      encounterCount: G.encounterCount || 0,
      allyProgress: snapshotAllies(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('存档失败', e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.version !== 6) return false;

    newGame();
    G.floor = data.floor || 1;
    G.turn = data.turn || 1;
    G.challenge = data.challenge || 1;
    G.gold = data.gold || 0;
    G.levelBuys = data.levelBuys || 0;   // 老存档没有这个字段，按 0 算（下一次升级仍是最低价）
    G.buffs = data.buffs || [];
    G.armed = (data.armed || []).map(a => {
      const c = CARD_POOL.find(x => x.id === a.id);
      if (!c) return null;
      return { id: c.id, name: c.name, desc: c.desc, trigger: c.trigger, stacks: a.stacks || 1 };
    }).filter(Boolean);
    G.goldBonus = data.goldBonus || 0;
    G.turnGold = data.turnGold || 0;
    G.luck = data.luck || 0;
    G.healBonus = data.healBonus || 0;
    G.encounterHistory = data.encounterHistory || [];
    G.encounterCount = data.encounterCount || 0;
    G.allyProgress = data.allyProgress || null;

    initFloor(G.floor);   // initFloor 内部会 applyAllyProgress 恢复整队成长

    // 旧存档迁移：接化发已改为「待发」卡，不再提供永久反弹
    if (G.hero && G.hero.reflect > 0) {
      G.hero.reflect = 0;
      log('旧存档的「接化发」已按新规则改为待发卡，本次未保留', 'system');
    }

    render();
    log('读取存档成功', 'system');
    return true;
  } catch (e) {
    console.warn('读档失败', e);
    return false;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}
