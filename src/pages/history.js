/**
 * History Page - Timeline of all entries
 */
import { getEntriesSorted, formatDisplayDate } from '../lib/storage.js';
import { navigate } from '../lib/router.js';

const HEALTH_ICONS = {
  sleptEarly: '🌙',
  wokeEarly: '☀️',
  reading: '📚',
  sideProject: '💻',
  exercised: '🏃',
  meditation: '🧘',
};

const ENERGY_EMOJIS = ['', '😫', '😕', '😐', '🙂', '😊'];

export function renderHistory(container) {
  const entries = getEntriesSorted();

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="page-enter">
        <button class="back-btn" id="back-btn">← 返回</button>
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <div class="empty-state__text">
            还没有记录。<br/>
            点击下方按钮开始你的第一笔存入！
          </div>
          <button class="btn-primary mt-xl" id="first-checkin-btn" style="max-width: 280px; margin-left: auto; margin-right: auto;">
            📝 开始存入
          </button>
        </div>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
    container.querySelector('#first-checkin-btn').addEventListener('click', () => navigate('/checkin'));
    return;
  }

  // Calculate streak info for each entry
  const streakMap = buildStreakMap(entries);

  container.innerHTML = `
    <div class="page-enter">
      <button class="back-btn" id="back-btn">← 返回</button>
      <h2 style="text-align: center; margin-bottom: var(--space-xl);">📅 成长时间线</h2>
      
      <div class="timeline">
        ${entries.map(entry => renderTimelineItem(entry, streakMap)).join('')}
      </div>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('/'));

  // Setup expand/collapse toggles after DOM renders
  requestAnimationFrame(() => setupExpandToggles(container));
}

function renderTimelineItem(entry, streakMap) {
  const displayDate = formatDisplayDate(entry.id);
  const streak = streakMap[entry.id] || 1;
  const energyEmoji = entry.energy ? ENERGY_EMOJIS[entry.energy] : '';

  // Health icons — iterate defined icons, not entry data
  const healthIcons = entry.health
    ? Object.entries(HEALTH_ICONS)
      .map(([key, icon]) => {
        const done = entry.health[key];
        return `<span class="timeline-health-icon" style="opacity: ${done ? 1 : 0.25}" title="${key}">${icon}</span>`;
      })
      .join('')
    : '';

  // Truncate text for preview
  const previewText = entry.text || '';

  return `
    <div class="timeline-item card">
      <div class="timeline-dot"></div>
      <div>
        <span class="timeline-date">${displayDate}</span>
        <span class="timeline-streak">🔥 Day ${streak}</span>
        ${energyEmoji ? `<span style="margin-left: 8px">${energyEmoji}</span>` : ''}
      </div>
      <div class="timeline-text" data-entry-id="${entry.id}">${escapeHtml(previewText)}</div>
      <button class="timeline-toggle" data-target="${entry.id}">
        <span>展开全文</span>
        <span class="timeline-toggle__arrow">▼</span>
      </button>
      ${healthIcons ? `<div class="timeline-health">${healthIcons}</div>` : ''}
      ${entry.tomorrow ? `<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-tertiary);">📌 明日计划: ${escapeHtml(entry.tomorrow)}</div>` : ''}
    </div>
  `;
}

function buildStreakMap(entries) {
  // Sort entries by date ascending
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const map = {};
  let streak = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      streak = 1;
    } else {
      const prev = new Date(sorted[i - 1].id);
      const curr = new Date(sorted[i].id);
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      streak = diffDays === 1 ? streak + 1 : 1;
    }
    map[sorted[i].id] = streak;
  }

  return map;
}

function setupExpandToggles(container) {
  container.querySelectorAll('.timeline-toggle').forEach(btn => {
    const targetId = btn.dataset.target;
    const textEl = container.querySelector(`.timeline-text[data-entry-id="${targetId}"]`);
    if (!textEl) return;

    // Hide toggle if text isn't actually truncated
    if (textEl.scrollHeight <= textEl.clientHeight + 2) {
      btn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', () => {
      const isExpanded = textEl.classList.toggle('expanded');
      const label = btn.querySelector('span:first-child');
      const arrow = btn.querySelector('.timeline-toggle__arrow');
      label.textContent = isExpanded ? '收起' : '展开全文';
      arrow.classList.toggle('expanded', isExpanded);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
