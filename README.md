# zhanqi-rogue · 战棋肉鸽

一个**零依赖、零构建**的纯前端战棋肉鸽：8×8 棋盘上带着四人小队逐层爬塔，每 5 层一个魔王，杀到第 99 层通关。WebAudio 实时合成音效、CSS+emoji 视觉，没有任何图片素材。

> 🎮 **在线直接玩（国内直连）**：<https://zhanqi-rogue.app.workbuddy.host/?sharecode=2LPYC3XOMV>
>
> 🌐 **GitHub Pages**：<https://johnnysilverhandv.github.io/zhanqi-rogue/>
>
> 📦 **离线版下载**：[GitHub Releases](https://github.com/JohnnySilverhandV/zhanqi-rogue/releases) ｜ [码云 Releases](https://gitee.com/johnny-silver-hand123/zhanqi-rogue/releases)（单文件 HTML，解压双击即玩）

## 源码仓库

| 平台 | 地址 |
|---|---|
| GitHub | https://github.com/JohnnySilverhandV/zhanqi-rogue |
| Gitee（国内直连） | https://gitee.com/johnny-silver-hand123/zhanqi-rogue |

---

## 🆕 更新日志

### v1.1.0 — 首个双端发布版（2026-11-05）

- 仓库公开化：GitHub 同名建仓 + 双推 + 双平台 Release + GitHub Pages
- `build-single.js` 去掉写死桌面的输出路径，改为 `OUT` 环境变量（默认 `build/`，已 gitignore）
- 补 README（本文件）与 MIT LICENSE
- 游戏本体与 v1 一致：第六轮改造（主角换英雄 + 杀 boss 即通 + 单文件发布）

## 🎯 玩法

### 队伍

| 单位 | 定位 | 特点 |
|---|---|---|
| 🦅 鸟人 | 前期核心 | 飞行无视地形，开局最能扛，后期被英雄反超 |
| 🤴 英雄 | 主角 · 后期主力 | 初始全队最弱、每级成长最高；他倒下＝这局结束 |
| 🏹 射手 | 远程点杀 | 十字第 2~N 格 + 斜角第 1~N-1 格环形射程，升级只往外扩、里层保留；贴身第 1 格反而打不到 |
| 🧙 法师 | 法术爆发 | 普攻只有 1 点，但「地火」走独立的法术强度线；贴身也打不到 |

### 回合与战斗

- 每个单位每回合：**移动一次 → 攻击 / 技能 / 待命**
- 双防系统：普攻吃**护甲**（固定值减伤），法术吃**魔抗**（百分比减伤，上限 90%）——物理砍不动的坦克，得靠法师的地火烧
- 地形每层随机：森林进去费 2 移动力且命中 -20%，河流/高山不可通行（生成时保证所有可通行格连通）
- 敌人 6 种：哥布林 / 兽人 / 射手 / 魔法师 / 坦克 / 刺客（刺客血薄攻高，会绕后摸射手法师）

### 塔层与经济

- 每 5 层一个魔王，**杀 boss 即过关**（小怪不用清）；每 7 层触发一次奇遇；99 层通关后进入无限刷
- 每层通关三选一抽卡，金币当筹码当场花：**重掷**（60 起，每重掷 +60）/ **多拿一张**（120 起）/ **全队升 1 级**（180 起，价 ×2^已购次数，跨层保留）
- 金币来源：击杀 / 每回合 / 过关；全队每回合按最大生命 6% 自动回血（不需要奶妈）

### 存档

- 局内进度 + 跨局 meta 双存档（`zhanqi_rogue_save_v6` / `zhanqi_rogue_meta_v2`），全在 localStorage，不联网

## 🚀 运行 / 构建

**在线玩**：点上面入口三条里任意一个。

**本地源码运行**：直接双击根目录 `index.html` 即可（纯多文件静态页，无构建步骤）。

**打单文件包**（手机版 / 电脑版 / dist 发布版）：

```bash
node build-single.js                  # 两个包写进 ./build/（已 gitignore）
OUT=~/Desktop node build-single.js    # 或指定输出目录
# dist/index.html 同步生成，是「电脑版去掉标题后缀」的发布版
```

## 🛠 技术要点

- **8×8 战棋**：攻击形状独立建模（`battle/shape.js`）——鸟人/英雄/法师 `cross1` 贴身十字，射手 `archerRing` 环形射程随等级外扩且里层保留
- **双伤害线**：`atk`（物理）与 `spellAtk`（法术）分离；法师普攻压到 1，地火完全按法术强度结算
- **WebAudio 实时合成**：全部音效代码生成（`core/audio.js`），首次交互解锁后出声
- **弹幕层**：普通流水在弹窗下面、结论大字在弹窗上面（`core/danmaku.js`）
- **单文件打包**：`build-single.js` 把 CSS 与 28 个 `<script src>` 按原顺序内联，顶层 `const/let` 跨段共享依赖这个顺序
- **垃圾话系统**：英雄与魔王按击杀/暴击/受伤/阵亡轮播台词（`core/config.js`）

## 📁 目录

```
index.html            入口页（引用全部 JS/CSS，源码版）
style.css             全部样式（约 1300 行）
core/                 配置 / 状态 / 存档 / 音效 / 弹幕 / 工具
battle/               棋盘 / 地形 / 形状 / 战斗 / AI / 回合
cards/                卡池 / 效果 / 卡牌 UI
ui/                   顶栏 / 弹窗 / 队伍 / 日志 / 引导 / 特效
main.js               启动入口
build-single.js       单文件打包脚本
dist/index.html       发布版（构建产物，供托管与 Pages）
```

## ⚖️ 说明

个人自制的战棋肉鸽小游戏，纯前端、不联网、不上传任何数据。

## 📄 License

[MIT](LICENSE) © JohnnySilverhandV
