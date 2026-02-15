/**
 * Check-in Page - Daily deposit form
 * Free text + health toggles + energy selector + tomorrow plan
 */
import { saveEntry, getTodayEntry, todayStr } from '../lib/storage.js';
import { navigate } from '../lib/router.js';

const HEALTH_ITEMS = [
  { key: 'sleptEarly', icon: '🌙', label: '早睡' },
  { key: 'wokeEarly', icon: '☀️', label: '早起' },
  { key: 'reading', icon: '📚', label: '阅读' },
  { key: 'sideProject', icon: '💻', label: '副业' },
  { key: 'exercised', icon: '🏃', label: '运动' },
  { key: 'meditation', icon: '🧘', label: '冥想' },
];

const ENERGY_LEVELS = [
  { value: 1, emoji: '😫', label: '很差' },
  { value: 2, emoji: '😕', label: '较差' },
  { value: 3, emoji: '😐', label: '一般' },
  { value: 4, emoji: '🙂', label: '不错' },
  { value: 5, emoji: '😊', label: '很好' },
];

export function renderCheckin(container) {
  const existing = getTodayEntry();
  const isEdit = !!existing;

  // Pre-fill values
  const text = existing?.text || '';
  const health = existing?.health || {};
  const energy = existing?.energy || 0;
  const tomorrow = existing?.tomorrow || '';

  container.innerHTML = `
    <div class="page-enter">
      <!-- Back button -->
      <button class="back-btn" id="back-btn">← 返回</button>

      <h2 style="text-align: center; margin-bottom: var(--space-xs);">
        📝 ${isEdit ? '编辑' : ''}今日存入
      </h2>
      <p style="text-align: center; color: var(--text-tertiary); font-size: 0.85rem; margin-bottom: var(--space-xl);">
        ${getTodayDisplayDate()}
      </p>

      <!-- Health toggles (above text) -->
      <div class="checkin-section">
        <div class="checkin-section__title">快速打卡</div>
        <div class="toggle-group" id="health-toggles">
          ${HEALTH_ITEMS.map(item => `
            <button
              class="toggle-btn ${health[item.key] ? 'active' : ''}"
              data-key="${item.key}"
            >
              <span class="toggle-icon">${item.icon}</span>
              ${item.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Free text -->
      <div class="checkin-section">
        <div class="checkin-section__title">今天你存入了什么？</div>
        <textarea
          class="text-input"
          id="checkin-text"
          placeholder="想到什么写什么，哪怕只是一句话。&#10;比如：今天早睡了，感觉不错。&#10;比如：在B站看了一个关于副业的视频，有点启发。"
        >${text}</textarea>
      </div>

      <!-- Energy level -->
      <div class="checkin-section">
        <div class="checkin-section__title">今天能量</div>
        <div class="energy-selector" id="energy-selector">
          ${ENERGY_LEVELS.map(level => `
            <button
              class="energy-option ${energy === level.value ? 'active' : ''}"
              data-value="${level.value}"
              title="${level.label}"
            >${level.emoji}</button>
          `).join('')}
        </div>
      </div>

      <!-- Tomorrow plan -->
      <div class="checkin-section">
        <div class="checkin-section__title">明天打算存入什么？</div>
        <textarea
          class="text-input text-input--small"
          id="checkin-tomorrow"
          placeholder="一句话就好，降低明天的启动摩擦。"
        >${tomorrow}</textarea>
      </div>

      <!-- Submit -->
      <button class="btn-primary" id="submit-btn">
        ${isEdit ? '💾 保存修改' : '✅ 存入'}
      </button>
    </div>
  `;

  setupCheckinEvents(container, isEdit);

  // Auto-resize textareas to fit existing content
  container.querySelectorAll('.text-input').forEach(autoResize);
}

function setupCheckinEvents(container, isEdit) {
  // Health toggles
  container.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
    });
  });

  // Auto-resize textareas on input
  container.querySelectorAll('.text-input').forEach(el => {
    el.addEventListener('input', () => autoResize(el));
  });

  // Energy selector
  container.querySelectorAll('.energy-option').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.energy-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Back button
  container.querySelector('#back-btn').addEventListener('click', () => {
    navigate('/');
  });

  // Submit
  container.querySelector('#submit-btn').addEventListener('click', () => {
    const textEl = container.querySelector('#checkin-text');
    const text = textEl.value.trim();

    if (!text) {
      textEl.style.borderColor = 'var(--danger)';
      textEl.setAttribute('placeholder', '写点什么吧，哪怕只是"今天还活着"也行 😄');
      textEl.focus();
      setTimeout(() => {
        textEl.style.borderColor = '';
      }, 2000);
      return;
    }

    // Collect health data
    const health = {};
    container.querySelectorAll('.toggle-btn').forEach(btn => {
      health[btn.dataset.key] = btn.classList.contains('active');
    });

    // Collect energy
    const activeEnergy = container.querySelector('.energy-option.active');
    const energy = activeEnergy ? parseInt(activeEnergy.dataset.value) : 0;

    // Collect tomorrow plan
    const tomorrow = container.querySelector('#checkin-tomorrow').value.trim();

    const entry = {
      id: todayStr(),
      timestamp: Date.now(),
      text,
      health,
      energy,
      tomorrow,
    };

    // Disable button immediately with animation
    const btn = container.querySelector('#submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="ai-loading">⏳ 保存中...</span>';

    // Fire-and-forget: saveEntry writes localStorage synchronously inside,
    // then syncs to cloud in the background. No await needed.
    saveEntry(entry);

    // Immediate feedback
    showToast(isEdit ? '💾 已更新！' : '✅ 存入成功！你的复利资产在增长。');
    setTimeout(() => {
      navigate('/');
    }, 400);
  });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

function getTodayDisplayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${year}年${month}月${day}日 周${weekdays[d.getDay()]}`;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
