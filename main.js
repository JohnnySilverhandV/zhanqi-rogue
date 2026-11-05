// ============================================================
// 启动入口
// ============================================================
function render() {
  renderTopbar();
  renderBoard();
  renderActionBar();
  // 行动栏空位显示最新一条日志（选中单位时会被操作提示占用，函数内部会跳过）
  if (typeof renderLatestLog === 'function') renderLatestLog();
}

// 浏览器要求「先有用户交互」才允许出声：首次点击 / 触摸时解锁音频
document.addEventListener('pointerdown', function () {
  if (typeof SFX !== 'undefined') SFX.unlock();
}, { once: true });

// 尝试读档
if (!loadGame()) {
  newGame();
  setTimeout(() => saveGame(), 100);
  // 第一次玩：等首屏渲染完再起新手引导（只跑一次，之后靠 localStorage 记住）
  setTimeout(() => {
    if (typeof tutShouldAutoRun === 'function' && tutShouldAutoRun()) startTutorial();
  }, 450);
}
