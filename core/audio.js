// ============================================================
// 音效系统（WebAudio 实时合成 · 不加载任何音频文件）
//   · 每个兵种一套音色：鸟人=锐利风声，射手=拨弦，
//     法师=电流，敌人=粗哑低吼，BOSS=沉重轰鸣
//   · 命中 / 暴击 / 闪避 / 治疗 / 阵亡 / 升级 / 回合 都有独立声音
//   · 浏览器要求「先有用户操作」才允许出声：首次点击时自动解锁
//   · 静音开关记在 localStorage（zhanqi_rouge_sound = on / off）
// ============================================================
const SFX = (function () {
  let ac = null;
  let master = null;
  let lastAtk = 0;      // 连击限流：同一瞬间多次开火只响一次
  let muted = false;

  try { muted = localStorage.getItem('zhanqi_rouge_sound') === 'off'; } catch (e) {}

  function ctx() {
    if (muted) return null;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) {
      return null;
    }
  }

  // 单音：频率可从 f0 滑到 f1
  function tone(o) {
    const c = ctx();
    if (!c || !master) return;
    try {
      const t0 = c.currentTime + (o.delay || 0);
      const dur = o.dur || 0.15;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, o.f0), t0);
      if (o.f1 && o.f1 !== o.f0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
      }
      const peak = o.gain === undefined ? 0.16 : o.gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (o.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  // 噪声：用于打击感 / 风声 / 爆裂
  function noise(o) {
    const c = ctx();
    if (!c || !master) return;
    try {
      const dur = o.dur || 0.12;
      const t0 = c.currentTime + (o.delay || 0);
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const flt = c.createBiquadFilter();
      flt.type = o.filter || 'bandpass';
      flt.frequency.setValueAtTime(o.freq || 1200, t0);
      if (o.freq1) flt.frequency.exponentialRampToValueAtTime(Math.max(60, o.freq1), t0 + dur);
      flt.Q.value = o.q || 1;
      const g = c.createGain();
      g.gain.setValueAtTime(o.gain === undefined ? 0.14 : o.gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(flt).connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  // 各兵种出手音色
  const ATTACK = {
    birdking: () => {   // 鸟人：破空风刃 + 尖锐下扫
      noise({ freq: 2600, freq1: 700, dur: 0.16, gain: 0.13, q: 0.8 });
      tone({ type: 'sawtooth', f0: 900, f1: 240, dur: 0.16, gain: 0.1 });
    },
    archer: () => {     // 射手：弓弦拨动
      tone({ type: 'triangle', f0: 1250, f1: 520, dur: 0.1, gain: 0.11 });
      noise({ freq: 3600, freq1: 1800, dur: 0.07, gain: 0.08, q: 2 });
    },
    wizard: () => {     // 法师：电流嗡鸣
      tone({ type: 'square', f0: 520, f1: 1500, dur: 0.15, gain: 0.07 });
      tone({ type: 'sine', f0: 1800, f1: 640, dur: 0.22, gain: 0.06, delay: 0.03 });
    },
    enemy: () => {      // 普通敌人：粗哑低吼
      tone({ type: 'square', f0: 240, f1: 95, dur: 0.15, gain: 0.1 });
      noise({ filter: 'lowpass', freq: 900, dur: 0.1, gain: 0.1 });
    },
    boss: () => {       // BOSS：沉重轰鸣
      tone({ type: 'sawtooth', f0: 130, f1: 52, dur: 0.34, gain: 0.2 });
      noise({ filter: 'lowpass', freq: 420, freq1: 140, dur: 0.3, gain: 0.16 });
    },
  };

  function attack(u) {
    if (muted || !u) return;
    const now = Date.now();
    if (now - lastAtk < 45) return;   // 限流，避免全屏攻击糊成一片
    lastAtk = now;
    const key = u.isBoss ? 'boss'
      : (ATTACK[u.type] ? u.type : (u.mage ? 'wizard' : 'enemy'));
    try { (ATTACK[key] || ATTACK.enemy)(); } catch (e) {}
  }

  return {
    attack,

    // 命中：暴击更亮更脆
    hit(crit, heavy) {
      if (muted) return;
      if (crit) {
        noise({ freq: 4200, freq1: 1500, dur: 0.13, gain: 0.2, q: 1.4 });
        tone({ type: 'square', f0: 1500, f1: 700, dur: 0.12, gain: 0.09 });
      } else {
        noise({ filter: 'lowpass', freq: 1600, freq1: 480, dur: 0.11, gain: 0.18 });
        if (heavy) tone({ type: 'triangle', f0: 240, f1: 110, dur: 0.14, gain: 0.14 });
      }
    },

    miss() {
      if (muted) return;
      noise({ freq: 900, freq1: 2600, dur: 0.13, gain: 0.08, q: 0.7 });
    },

    heal() {
      if (muted) return;
      [523, 659, 784].forEach((f, i) => {
        tone({ type: 'sine', f0: f, f1: f, dur: 0.18, gain: 0.09, delay: i * 0.05 });
      });
    },

    death() {
      if (muted) return;
      tone({ type: 'sawtooth', f0: 320, f1: 60, dur: 0.32, gain: 0.16 });
      noise({ filter: 'lowpass', freq: 800, freq1: 120, dur: 0.28, gain: 0.12 });
    },

    coin() {
      if (muted) return;
      tone({ type: 'square', f0: 1180, f1: 1560, dur: 0.07, gain: 0.06 });
      tone({ type: 'square', f0: 1560, f1: 1900, dur: 0.08, gain: 0.05, delay: 0.06 });
    },

    levelup() {
      if (muted) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        tone({ type: 'triangle', f0: f, dur: 0.16, gain: 0.09, delay: i * 0.07 });
      });
    },

    // 回合弹字的过场音
    turn() {
      if (muted) return;
      tone({ type: 'sine', f0: 392, f1: 523, dur: 0.16, gain: 0.08 });
      tone({ type: 'sine', f0: 523, f1: 784, dur: 0.2, gain: 0.06, delay: 0.1 });
    },

    // 首次用户操作时解锁音频（浏览器自动播放策略）
    unlock() { ctx(); },

    isMuted() { return muted; },

    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('zhanqi_rouge_sound', muted ? 'off' : 'on'); } catch (e) {}
      if (muted && ac && master) {
        try { master.gain.value = 0; } catch (e) {}
      } else if (ac && master) {
        try { master.gain.value = 0.5; } catch (e) {}
      }
      if (!muted) ctx();
    },

    toggle() { this.setMuted(!muted); return muted; },
  };
})();
