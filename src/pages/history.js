/**
 * History Page - Timeline of all entries with per-entry classification
 */
import { getEntriesSorted, formatDisplayDate, isEntryProcessed, addNotes, getTopicsConfig, addTopic, migrateTopicsV3toV4 } from '../lib/storage.js';
import { supabase, isCloudEnabled } from '../lib/supabase.js';
import { navigate } from '../lib/router.js';

const FUNCTION_NAME = 'classify';

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
  // Run migration on first load
  migrateTopicsV3toV4();

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
  requestAnimationFrame(() => {
    setupExpandToggles(container);
    setupClassifyButtons(container, entries);
  });
}

function renderTimelineItem(entry, streakMap) {
  const displayDate = formatDisplayDate(entry.id);
  const streak = streakMap[entry.id] || 1;
  const energyEmoji = entry.energy ? ENERGY_EMOJIS[entry.energy] : '';
  const processed = isEntryProcessed(entry.id);

  const healthIcons = entry.health
    ? Object.entries(HEALTH_ICONS)
      .map(([key, icon]) => {
        const done = entry.health[key];
        return `<span class="timeline-health-icon" style="opacity: ${done ? 1 : 0.25}" title="${key}">${icon}</span>`;
      })
      .join('')
    : '';

  const previewText = entry.text || '';

  return `
    <div class="timeline-item card" data-entry-id="${entry.id}">
      <div class="timeline-dot"></div>
      <div class="timeline-item__top">
        <div>
          <span class="timeline-date">${displayDate}</span>
          <span class="timeline-streak">🔥 Day ${streak}</span>
          ${energyEmoji ? `<span style="margin-left: 8px">${energyEmoji}</span>` : ''}
          ${processed ? '<span class="timeline-classified-badge">✅ 已整理</span>' : ''}
        </div>
        <button class="btn-classify" data-entry-id="${entry.id}" ${processed ? 'title="重新整理"' : ''}>
          ${processed ? '🔄 重整' : '📋 整理'}
        </button>
      </div>
      <div class="timeline-text" data-entry-id="${entry.id}">${escapeHtml(previewText)}</div>
      <button class="timeline-toggle" data-target="${entry.id}">
        <span>展开全文</span>
        <span class="timeline-toggle__arrow">▼</span>
      </button>
      ${healthIcons ? `<div class="timeline-health">${healthIcons}</div>` : ''}
      ${entry.tomorrow ? `<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-tertiary);">📌 明日计划: ${escapeHtml(entry.tomorrow)}</div>` : ''}
      <div class="classify-panel" id="panel-${entry.id}" style="display: none;"></div>
    </div>
  `;
}

// ===========================
// Classify Panel
// ===========================

function setupClassifyButtons(container, entries) {
  container.querySelectorAll('.btn-classify').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return;

      const panel = container.querySelector(`#panel-${entryId}`);
      if (!panel) return;

      // Toggle off if already open
      if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        return;
      }

      if (!isCloudEnabled()) {
        showToast('❌ 需要云端连接才能使用 AI 整理');
        return;
      }

      // Show loading
      panel.style.display = 'block';
      panel.innerHTML = `
        <div class="classify-loading">
          <span class="ai-loading">🧠</span> 正在拆解日记...
        </div>
      `;
      btn.disabled = true;
      btn.textContent = '⏳ 分析中';

      try {
        const topics = getTopicsConfig().topics;
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
          body: { text: entry.text, entryId: entry.id, topics },
        });

        btn.disabled = false;
        btn.textContent = '📋 整理';

        if (error || !data?.blocks || !Array.isArray(data.blocks)) {
          console.error('[Classify] Error:', error || data);
          panel.innerHTML = `<div class="classify-error">❌ 分析失败，请重试</div>`;
          return;
        }

        const suggestedTopics = data.suggestedTopics || [];
        renderClassifyPanel(panel, data.blocks, entry.id, topics, suggestedTopics);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '📋 整理';
        console.error('[Classify] Request failed:', err);
        panel.innerHTML = `<div class="classify-error">❌ 网络错误: ${err.message}</div>`;
      }
    });
  });
}

function renderClassifyPanel(panel, blocks, entryId, existingTopics, suggestedTopics) {
  // Build suggested topics bar (default all checked)
  const suggestBar = suggestedTopics.length > 0
    ? `<div class="classify-suggest-bar">
        <span class="classify-suggest-bar__label">💡 AI 建议新建主题：</span>
        <div class="classify-suggest-bar__tags">
          ${suggestedTopics.map(st => `
            <label class="suggest-topic-tag">
              <input type="checkbox" checked class="suggest-topic-cb" 
                data-temp-id="${st.tempId}" data-name="${escapeHtml(st.name)}" 
                data-desc="${escapeHtml(st.description || '')}">
              <span>${escapeHtml(st.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>`
    : '';

  // Build block items with all topics (existing + suggested) pre-checked by AI
  const blockItems = blocks.map((block, i) => {
    const recExisting = block.topicIds || [];
    const recSuggested = block.suggestedTopicIds || [];

    // Existing topic checkboxes
    const existingCbs = existingTopics.map(t => {
      const checked = recExisting.includes(t.id) ? 'checked' : '';
      return `<label class="topic-checkbox">
        <input type="checkbox" value="${t.id}" ${checked} class="block-topic-cb" data-block="${i}"> 
        <span>${escapeHtml(t.name)}</span>
      </label>`;
    }).join('');

    // Suggested topic checkboxes (with tempId as value, will be resolved on confirm)
    const suggestedCbs = suggestedTopics.map(st => {
      const checked = recSuggested.includes(st.tempId) ? 'checked' : '';
      return `<label class="topic-checkbox topic-checkbox--suggested">
        <input type="checkbox" ${checked} class="block-topic-cb block-suggested-cb" 
          data-block="${i}" data-temp-id="${st.tempId}" value="__suggested__${st.tempId}">
        <span class="suggested-label">✨ ${escapeHtml(st.name)}</span>
      </label>`;
    }).join('');

    return `
      <div class="classify-block" data-block-index="${i}">
        <div class="classify-block__content">${escapeHtml(block.content)}</div>
        <div class="classify-block__topics">
          <span class="classify-block__label">归入主题：</span>
          <div class="topic-checkboxes" data-block="${i}">
            ${existingCbs}${suggestedCbs}
          </div>
          <button class="btn-new-topic-inline" data-block="${i}">➕ 新主题</button>
        </div>
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="classify-panel__header">
      📋 拆解出 ${blocks.length} 个文段 — AI 已预分配主题，可调整后归档
    </div>
    ${suggestBar}
    <div class="classify-blocks">${blockItems}</div>
    <div class="classify-actions">
      <button class="btn-primary" id="confirm-classify-${entryId}">✅ 全部接受并归档</button>
      <button class="btn-outline" id="cancel-classify-${entryId}">取消</button>
    </div>
  `;

  // Toggling a suggested topic in the top bar → toggle all its checkboxes in blocks
  panel.querySelectorAll('.suggest-topic-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const tempId = cb.dataset.tempId;
      const checked = cb.checked;
      panel.querySelectorAll(`.block-suggested-cb[data-temp-id="${tempId}"]`).forEach(bcb => {
        bcb.checked = checked;
      });
    });
  });

  // New topic inline button
  panel.querySelectorAll('.btn-new-topic-inline').forEach(btn => {
    btn.addEventListener('click', () => {
      const blockIdx = parseInt(btn.dataset.block);
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '主题名称';
      input.className = 'inline-edit-input';
      input.style.width = '120px';
      btn.replaceWith(input);
      input.focus();

      const doConfirm = () => {
        const name = input.value.trim();
        if (!name) {
          const newBtn = document.createElement('button');
          newBtn.className = 'btn-new-topic-inline';
          newBtn.dataset.block = blockIdx;
          newBtn.textContent = '➕ 新主题';
          input.replaceWith(newBtn);
          return;
        }
        const newTopic = addTopic(name, '');
        panel.querySelectorAll('.topic-checkboxes').forEach(container => {
          const bi = parseInt(container.dataset.block);
          const checked = bi === blockIdx ? 'checked' : '';
          const label = document.createElement('label');
          label.className = 'topic-checkbox topic-checkbox--new';
          label.innerHTML = `<input type="checkbox" value="${newTopic.id}" ${checked} class="block-topic-cb" data-block="${bi}"> <span>${escapeHtml(name)}</span>`;
          container.appendChild(label);
        });
        input.remove();
        showToast(`✅ 已创建主题「${name}」`);
      };

      input.addEventListener('blur', doConfirm);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConfirm(); });
    });
  });

  // Confirm: create suggested topics first, then resolve tempIds → real IDs, then add notes
  panel.querySelector(`#confirm-classify-${entryId}`).addEventListener('click', () => {
    // Step 1: Create suggested topics that are still checked in the top bar
    const tempIdToRealId = {};
    panel.querySelectorAll('.suggest-topic-cb:checked').forEach(cb => {
      const tempId = cb.dataset.tempId;
      const name = cb.dataset.name;
      const desc = cb.dataset.desc;
      const newTopic = addTopic(name, desc);
      tempIdToRealId[tempId] = newTopic.id;
    });

    // Step 2: Collect notes, resolving suggested tempIds to real IDs
    const notesToAdd = [];
    blocks.forEach((block, i) => {
      const checkboxes = panel.querySelectorAll(`.block-topic-cb[data-block="${i}"]:checked`);
      const topicIds = [];
      checkboxes.forEach(cb => {
        const val = cb.value;
        if (val.startsWith('__suggested__')) {
          const tempId = val.replace('__suggested__', '');
          if (tempIdToRealId[tempId]) {
            topicIds.push(tempIdToRealId[tempId]);
          }
        } else {
          topicIds.push(val);
        }
      });
      // Deduplicate
      const unique = [...new Set(topicIds)];
      if (unique.length > 0) {
        notesToAdd.push({ content: block.content, topicIds: unique });
      }
    });

    if (notesToAdd.length === 0) {
      showToast('⚠️ 至少为一个文段选择主题');
      return;
    }

    addNotes(notesToAdd, entryId);
    const createdCount = Object.keys(tempIdToRealId).length;
    const msg = createdCount > 0
      ? `✅ 已归档 ${notesToAdd.length} 条笔记，创建了 ${createdCount} 个新主题`
      : `✅ 已归档 ${notesToAdd.length} 条笔记`;
    showToast(msg);

    // Update UI
    panel.style.display = 'none';
    const badge = panel.closest('.timeline-item').querySelector('.timeline-classified-badge');
    if (!badge) {
      const topDiv = panel.closest('.timeline-item').querySelector('.timeline-item__top > div');
      topDiv.insertAdjacentHTML('beforeend', '<span class="timeline-classified-badge">✅ 已整理</span>');
    }
    const btnEl = panel.closest('.timeline-item').querySelector('.btn-classify');
    btnEl.textContent = '🔄 重整';
  });

  // Cancel
  panel.querySelector(`#cancel-classify-${entryId}`).addEventListener('click', () => {
    panel.style.display = 'none';
  });
}

// ===========================
// Helpers
// ===========================

function buildStreakMap(entries) {
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
  div.textContent = str || '';
  return div.innerHTML;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}
