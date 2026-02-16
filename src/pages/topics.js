/**
 * Topics Page - Knowledge base with AI-powered split-and-file + git-like review
 * 
 * Three view states:
 * 1. Empty: No topics yet, show "start" button
 * 2. Library: Browse topics + notes, inline editing
 * 3. Review: AI proposals staging area, accept/reject individual notes
 */
import { getAllEntries, getEntriesSorted, getTopics, saveTopics } from '../lib/storage.js';
import { supabase, isCloudEnabled } from '../lib/supabase.js';

const FUNCTION_NAME = 'classify';

export function renderTopics(container) {
  const topicsData = getTopics();
  const entries = getAllEntries();
  const entryCount = Object.keys(entries).length;

  if (entryCount === 0) {
    container.innerHTML = renderEmpty();
    return;
  }

  if (!topicsData || !topicsData.topics || topicsData.topics.length === 0) {
    renderFirstTime(container, entryCount);
    return;
  }

  renderLibrary(container, topicsData);
}

// ===========================
// Empty State
// ===========================

function renderEmpty() {
  return `
    <div class="page-enter" style="text-align: center; padding-top: var(--space-xxl);">
      <div style="font-size: 3rem; margin-bottom: var(--space-lg);">📭</div>
      <h2 style="margin-bottom: var(--space-md);">还没有日记</h2>
      <p style="color: var(--text-tertiary); margin-bottom: var(--space-xl);">先存入几天日记，再来整理主题吧。</p>
      <button class="btn-primary" onclick="location.hash='/checkin'">📝 去存入</button>
    </div>
  `;
}

// ===========================
// First Time
// ===========================

function renderFirstTime(container, count) {
  container.innerHTML = `
    <div class="page-enter" style="text-align: center; padding-top: var(--space-xxl);">
      <div style="font-size: 3rem; margin-bottom: var(--space-lg);">🗂</div>
      <h2 style="margin-bottom: var(--space-md);">整理你的思考</h2>
      <p style="color: var(--text-tertiary); margin-bottom: var(--space-xl);">
        AI 会阅读你的 <strong>${count}</strong> 条日记，拆解出独立观点，归入主题。
      </p>
      <button class="btn-ai" id="classify-btn" style="max-width: 300px; margin: 0 auto;">🧠 开始整理</button>
    </div>
  `;
  container.querySelector('#classify-btn').addEventListener('click', () => doClassify(container));
}

// ===========================
// Library View (main view)
// ===========================

function renderLibrary(container, topicsData) {
  const { topics, processedEntryIds = [] } = topicsData;

  // Check for unprocessed entries
  const allEntryIds = Object.keys(getAllEntries());
  const unprocessed = allEntryIds.filter(id => !processedEntryIds.includes(id));
  const hasNew = unprocessed.length > 0;

  const topicCards = topics.map((topic, ti) => {
    const noteItems = (topic.notes || []).map((note, ni) => `
      <div class="topic-note" data-topic="${ti}" data-note="${ni}">
        <div class="topic-note__header">
          <span class="topic-note__source">${note.source}</span>
          <div class="topic-note__actions">
            <button class="note-action edit-note-btn" title="编辑">✏️</button>
            <button class="note-action delete-note-btn" title="删除">🗑</button>
          </div>
        </div>
        <div class="topic-note__content">${esc(note.content)}</div>
      </div>
    `).join('');

    return `
      <div class="topic-card" data-topic-index="${ti}">
        <div class="topic-card__header">
          <div class="topic-card__name" data-topic="${ti}">${esc(topic.name)}</div>
          <div class="topic-card__meta">
            <span class="topic-card__count">${(topic.notes || []).length} 条</span>
            <button class="note-action edit-topic-btn" data-topic="${ti}" title="编辑主题名">✏️</button>
          </div>
        </div>
        <div class="topic-card__desc">${esc(topic.description)}</div>
        <div class="topic-notes">${noteItems}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="page-enter">
      <div class="topics-header">
        <div>
          <h2 style="margin: 0;">🗂 思考主题</h2>
          <div style="color: var(--text-tertiary); font-size: 0.75rem; margin-top: 4px;">
            ${topics.length} 个主题 · ${topics.reduce((s, t) => s + (t.notes || []).length, 0)} 条笔记
          </div>
        </div>
        <button class="btn-ai btn-ai--small" id="classify-btn">
          ${hasNew ? `🧠 整理新日记 (${unprocessed.length})` : '🧠 重新整理全部'}
        </button>
      </div>
      ${hasNew ? `<div class="topics-hint">📌 有 ${unprocessed.length} 条新日记未整理</div>` : ''}
      <div class="topics-grid">${topicCards}</div>
    </div>
  `;

  setupLibraryEvents(container, topicsData, hasNew);
}

function setupLibraryEvents(container, topicsData, hasNew) {
  // Classify button
  container.querySelector('#classify-btn').addEventListener('click', () => {
    doClassify(container, hasNew ? false : true);
  });

  // Edit topic name
  container.querySelectorAll('.edit-topic-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ti = parseInt(btn.dataset.topic);
      const topic = topicsData.topics[ti];
      const nameEl = container.querySelector(`.topic-card__name[data-topic="${ti}"]`);

      // Replace with input
      const input = document.createElement('input');
      input.type = 'text';
      input.value = topic.name;
      input.className = 'inline-edit-input';
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      const save = () => {
        const newName = input.value.trim();
        if (newName && newName !== topic.name) {
          topicsData.topics[ti].name = newName;
          saveTopics(topicsData);
        }
        renderLibrary(container, getTopics());
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); });
    });
  });

  // Edit note
  container.querySelectorAll('.edit-note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteEl = btn.closest('.topic-note');
      const ti = parseInt(noteEl.dataset.topic);
      const ni = parseInt(noteEl.dataset.note);
      const contentEl = noteEl.querySelector('.topic-note__content');
      const note = topicsData.topics[ti].notes[ni];

      const textarea = document.createElement('textarea');
      textarea.className = 'inline-edit-textarea';
      textarea.value = note.content;
      contentEl.replaceWith(textarea);
      textarea.focus();
      autoResize(textarea);

      const save = () => {
        const newContent = textarea.value.trim();
        if (newContent && newContent !== note.content) {
          topicsData.topics[ti].notes[ni].content = newContent;
          saveTopics(topicsData);
        }
        renderLibrary(container, getTopics());
      };
      textarea.addEventListener('blur', save);
      textarea.addEventListener('input', () => autoResize(textarea));
    });
  });

  // Delete note
  container.querySelectorAll('.delete-note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteEl = btn.closest('.topic-note');
      const ti = parseInt(noteEl.dataset.topic);
      const ni = parseInt(noteEl.dataset.note);

      noteEl.style.opacity = '0.3';
      noteEl.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0;">
        <span style="color:var(--text-tertiary); font-size:0.85rem;">确认删除？</span>
        <div>
          <button class="note-action confirm-delete">✓ 确认</button>
          <button class="note-action cancel-delete">✗ 取消</button>
        </div>
      </div>`;

      noteEl.querySelector('.confirm-delete').addEventListener('click', (ev) => {
        ev.stopPropagation();
        topicsData.topics[ti].notes.splice(ni, 1);
        // Remove empty topics
        if (topicsData.topics[ti].notes.length === 0) {
          topicsData.topics.splice(ti, 1);
        }
        saveTopics(topicsData);
        renderLibrary(container, getTopics());
      });
      noteEl.querySelector('.cancel-delete').addEventListener('click', (ev) => {
        ev.stopPropagation();
        renderLibrary(container, getTopics());
      });
    });
  });
}

// ===========================
// Review Mode (git-like staging)
// ===========================

function renderReview(container, proposals) {
  // Group by topic
  const groups = {};
  proposals.forEach((p, i) => {
    const key = p.topic;
    if (!groups[key]) {
      groups[key] = { topic: p.topic, desc: p.topicDesc, isNew: p.isNew, items: [] };
    }
    groups[key].items.push({ ...p, index: i });
  });

  const groupList = Object.values(groups);
  const newCount = groupList.filter(g => g.isNew).length;
  const existingCount = groupList.length - newCount;

  const groupCards = groupList.map(group => {
    const badge = group.isNew
      ? '<span class="review-badge review-badge--new">🆕 新建主题</span>'
      : '<span class="review-badge review-badge--add">📌 追加</span>';

    const items = group.items.map(item => `
      <label class="review-item">
        <input type="checkbox" class="review-checkbox" data-index="${item.index}" checked>
        <div class="review-item__body">
          <span class="review-item__source">[${item.source}]</span>
          <span class="review-item__content">${esc(item.content)}</span>
        </div>
      </label>
    `).join('');

    return `
      <div class="review-group">
        <div class="review-group__header">
          ${badge}
          <span class="review-group__name">${esc(group.topic)}</span>
          <span class="review-group__desc">— ${esc(group.desc)}</span>
        </div>
        <div class="review-group__items">${items}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="page-enter">
      <div class="review-header">
        <h2 style="margin: 0;">📋 整理结果</h2>
        <div style="color: var(--text-tertiary); font-size: 0.8rem; margin-top: 4px;">
          ${proposals.length} 条笔记 → ${groupList.length} 个主题
          ${newCount > 0 ? `（${newCount} 个新建）` : ''}
        </div>
      </div>
      <div class="review-actions-top">
        <label class="review-select-all">
          <input type="checkbox" id="select-all" checked> 全选
        </label>
      </div>
      <div class="review-groups">${groupCards}</div>
      <div class="review-actions">
        <button class="btn-primary" id="merge-btn">✅ 确认合并</button>
        <button class="btn-outline" id="discard-btn">❌ 放弃</button>
      </div>
    </div>
  `;

  // Select all
  container.querySelector('#select-all').addEventListener('change', (e) => {
    container.querySelectorAll('.review-checkbox').forEach(cb => { cb.checked = e.target.checked; });
  });

  // Merge
  container.querySelector('#merge-btn').addEventListener('click', () => {
    const selected = [];
    container.querySelectorAll('.review-checkbox:checked').forEach(cb => {
      selected.push(proposals[parseInt(cb.dataset.index)]);
    });

    if (selected.length === 0) {
      showToast('⚠️ 至少选择一条笔记');
      return;
    }

    mergeProposals(selected);
    showToast(`✅ 已合并 ${selected.length} 条笔记`);
    renderTopics(container);
  });

  // Discard
  container.querySelector('#discard-btn').addEventListener('click', () => {
    showToast('已放弃本次整理');
    renderTopics(container);
  });
}

function mergeProposals(accepted) {
  const topicsData = getTopics() || { processedEntryIds: [], topics: [] };

  for (const p of accepted) {
    // Find or create topic
    let topic = topicsData.topics.find(t => t.name === p.topic);
    if (!topic) {
      topic = {
        id: `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: p.topic,
        description: p.topicDesc,
        notes: [],
      };
      topicsData.topics.push(topic);
    }

    // Add note
    topic.notes.push({
      id: `n${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: p.source,
      content: p.content,
      ts: Date.now(),
    });

    // Mark source as processed
    if (!topicsData.processedEntryIds.includes(p.source)) {
      topicsData.processedEntryIds.push(p.source);
    }
  }

  saveTopics(topicsData);
}

// ===========================
// Classify (call AI)
// ===========================

async function doClassify(container, forceAll = false) {
  if (!isCloudEnabled()) {
    showToast('❌ 需要云端连接才能使用 AI 整理');
    return;
  }

  const topicsData = getTopics() || { processedEntryIds: [], topics: [] };
  const allEntries = getEntriesSorted();

  // Determine which entries to process
  let entriesToProcess;
  if (forceAll) {
    entriesToProcess = allEntries;
  } else {
    entriesToProcess = allEntries.filter(e => !topicsData.processedEntryIds.includes(e.id));
    if (entriesToProcess.length === 0) {
      entriesToProcess = allEntries; // fallback to all
    }
  }

  // Loading
  container.innerHTML = `
    <div class="page-enter" style="text-align: center; padding-top: var(--space-xxl);">
      <div style="font-size: 3rem; margin-bottom: var(--space-lg);" class="ai-loading">🧠</div>
      <h2 style="margin-bottom: var(--space-md);">正在拆解...</h2>
      <p style="color: var(--text-tertiary);">AI 正在阅读 ${entriesToProcess.length} 条日记，提取原子笔记</p>
    </div>
  `;

  const entries = entriesToProcess.map(e => ({ id: e.id, text: e.text }));
  const existingTopics = topicsData.topics.map(t => ({ name: t.name, description: t.description }));

  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: { entries, existingTopics: existingTopics.length > 0 ? existingTopics : undefined },
    });

    if (error) {
      console.error('[Topics] Classification error:', error);
      showToast('❌ 整理失败，请稍后重试');
      renderTopics(container);
      return;
    }

    const proposals = data?.proposals;
    if (!proposals || !Array.isArray(proposals) || proposals.length === 0) {
      console.error('[Topics] Invalid response:', data);
      showToast('❌ AI 未返回有效结果');
      renderTopics(container);
      return;
    }

    renderReview(container, proposals);
  } catch (e) {
    console.error('[Topics] Request failed:', e);
    showToast('❌ 网络错误，请检查连接');
    renderTopics(container);
  }
}

// ===========================
// Utilities
// ===========================

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
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
