/**
 * Topics Page v4 - Topic management + article-mode note display
 * 
 * Features:
 * - Topic management bar (add/edit/delete topics with descriptions)
 * - Article-mode notes: continuous flow with sequence numbers
 * - Hover effect: note "pops up" as card
 * - Filter by topic tag
 */
import { getTopicsConfig, getTopicNotes, addTopic, updateTopic, deleteTopic, updateNote, deleteNote, migrateTopicsV3toV4 } from '../lib/storage.js';

let activeTopicId = null; // null = show all

export function renderTopics(container) {
  migrateTopicsV3toV4();

  const config = getTopicsConfig();
  const notesData = getTopicNotes();
  const { topics } = config;
  const { notes } = notesData;

  if (topics.length === 0 && notes.length === 0) {
    renderEmpty(container);
    return;
  }

  renderMain(container, topics, notes);
}

// ===========================
// Empty State
// ===========================

function renderEmpty(container) {
  container.innerHTML = `
    <div class="page-enter" style="text-align: center; padding-top: var(--space-xxl);">
      <div style="font-size: 3rem; margin-bottom: var(--space-lg);">📭</div>
      <h2 style="margin-bottom: var(--space-md);">还没有主题</h2>
      <p style="color: var(--text-tertiary); margin-bottom: var(--space-xl);">
        去时间线对日记点「📋 整理」开始分类，<br>或者先创建几个主题。
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button class="btn-primary" onclick="location.hash='/history'">📅 去时间线</button>
        <button class="btn-outline" id="create-first-topic">➕ 创建主题</button>
      </div>
    </div>
  `;

  container.querySelector('#create-first-topic').addEventListener('click', () => {
    promptNewTopic(container);
  });
}

// ===========================
// Main View
// ===========================

function renderMain(container, topics, notes) {
  // Filter notes
  const filteredNotes = activeTopicId
    ? notes.filter(n => n.topicIds.includes(activeTopicId))
    : notes;

  // Sort by timestamp desc
  const sortedNotes = [...filteredNotes].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  // Topic tags
  const tagItems = topics.map(t => {
    const count = notes.filter(n => n.topicIds.includes(t.id)).length;
    const active = activeTopicId === t.id ? 'topic-tag--active' : '';
    return `<button class="topic-tag ${active}" data-topic-id="${t.id}">
      ${esc(t.name)} <span class="topic-tag__count">${count}</span>
    </button>`;
  }).join('');

  const totalNotes = notes.length;
  const allActive = !activeTopicId ? 'topic-tag--active' : '';

  container.innerHTML = `
    <div class="page-enter">
      <div class="topics-header">
        <div>
          <h2 style="margin: 0;">🗂 思考主题</h2>
          <div style="color: var(--text-tertiary); font-size: 0.75rem; margin-top: 4px;">
            ${topics.length} 个主题 · ${totalNotes} 条笔记
          </div>
        </div>
      </div>

      <div class="topic-tags-bar">
        <button class="topic-tag ${allActive}" data-topic-id="__all__">全部 <span class="topic-tag__count">${totalNotes}</span></button>
        ${tagItems}
        <button class="topic-tag topic-tag--add" id="add-topic-btn">➕ 新增</button>
      </div>

      ${activeTopicId ? renderTopicMeta(topics.find(t => t.id === activeTopicId)) : ''}

      <div class="article-notes">
        ${sortedNotes.length === 0
      ? '<div style="text-align:center; color:var(--text-tertiary); padding: var(--space-xl);">暂无笔记</div>'
      : sortedNotes.map((note, i) => renderArticleNote(note, i + 1, topics)).join('')
    }
      </div>
    </div>
  `;

  setupTopicEvents(container, topics, notes);
}

function renderTopicMeta(topic) {
  if (!topic) return '';
  return `
    <div class="topic-meta">
      <div class="topic-meta__name">
        <span>${esc(topic.name)}</span>
        <button class="note-action edit-topic-name-btn" data-topic-id="${topic.id}" title="编辑主题名">✏️</button>
      </div>
      <div class="topic-meta__desc" data-topic-id="${topic.id}">
        ${topic.description ? esc(topic.description) : '<span style="opacity:0.4">点击添加描述，帮助 AI 更准确分类</span>'}
      </div>
      <button class="btn-outline btn-outline--danger topic-delete-btn" data-topic-id="${topic.id}" style="margin-top: 8px; font-size: 0.75rem; padding: 4px 12px;">
        🗑 删除此主题
      </button>
    </div>
  `;
}

function renderArticleNote(note, index, topics) {
  const topicNames = note.topicIds
    .map(id => topics.find(t => t.id === id))
    .filter(Boolean)
    .map(t => `<span class="note-topic-tag">${esc(t.name)}</span>`)
    .join('');

  return `
    <div class="article-note" data-note-id="${note.id}">
      <div class="article-note__index">${index}</div>
      <div class="article-note__body">
        <div class="article-note__content">${esc(note.content)}</div>
        <div class="article-note__footer">
          <span class="article-note__source">${note.source}</span>
          <div class="article-note__topics">${topicNames}</div>
        </div>
      </div>
      <div class="article-note__actions">
        <button class="note-action edit-note-btn" data-note-id="${note.id}" title="编辑">✏️</button>
        <button class="note-action delete-note-btn" data-note-id="${note.id}" title="删除">🗑</button>
      </div>
    </div>
  `;
}

// ===========================
// Events
// ===========================

function setupTopicEvents(container, topics, notes) {
  // Topic tag filter
  container.querySelectorAll('.topic-tag:not(.topic-tag--add)').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = tag.dataset.topicId;
      activeTopicId = id === '__all__' ? null : id;
      renderTopics(container);
    });
  });

  // Add topic
  container.querySelector('#add-topic-btn')?.addEventListener('click', () => {
    promptNewTopic(container);
  });

  // Edit topic name
  container.querySelectorAll('.edit-topic-name-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const topicId = btn.dataset.topicId;
      const topic = topics.find(t => t.id === topicId);
      const nameEl = btn.previousElementSibling;

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
          updateTopic(topicId, { name: newName });
        }
        renderTopics(container);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); });
    });
  });

  // Edit topic description (click on desc area)
  container.querySelectorAll('.topic-meta__desc').forEach(descEl => {
    descEl.addEventListener('click', () => {
      const topicId = descEl.dataset.topicId;
      const topic = topics.find(t => t.id === topicId);

      const textarea = document.createElement('textarea');
      textarea.className = 'inline-edit-textarea';
      textarea.value = topic.description || '';
      textarea.placeholder = '描述这个主题的范围，帮助 AI 更准确分类...';
      descEl.replaceWith(textarea);
      textarea.focus();
      autoResize(textarea);

      const save = () => {
        const newDesc = textarea.value.trim();
        updateTopic(topicId, { description: newDesc });
        renderTopics(container);
      };
      textarea.addEventListener('blur', save);
      textarea.addEventListener('input', () => autoResize(textarea));
    });
  });

  // Delete topic
  container.querySelectorAll('.topic-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const topicId = btn.dataset.topicId;
      const topic = topics.find(t => t.id === topicId);
      const noteCount = notes.filter(n => n.topicIds.includes(topicId)).length;

      btn.innerHTML = `确认删除「${esc(topic.name)}」？(${noteCount} 条笔记受影响)`;
      btn.style.background = 'rgba(239, 68, 68, 0.2)';

      btn.addEventListener('click', () => {
        deleteTopic(topicId);
        activeTopicId = null;
        showToast(`🗑 已删除主题「${topic.name}」`);
        renderTopics(container);
      }, { once: true });
    });
  });

  // Edit note
  container.querySelectorAll('.edit-note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      const noteEl = btn.closest('.article-note');
      const contentEl = noteEl.querySelector('.article-note__content');
      const note = notes.find(n => n.id === noteId);

      const textarea = document.createElement('textarea');
      textarea.className = 'inline-edit-textarea';
      textarea.value = note.content;
      contentEl.replaceWith(textarea);
      textarea.focus();
      autoResize(textarea);

      const save = () => {
        const newContent = textarea.value.trim();
        if (newContent && newContent !== note.content) {
          updateNote(noteId, { content: newContent });
        }
        renderTopics(container);
      };
      textarea.addEventListener('blur', save);
      textarea.addEventListener('input', () => autoResize(textarea));
    });
  });

  // Delete note
  container.querySelectorAll('.delete-note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      const noteEl = btn.closest('.article-note');

      noteEl.style.opacity = '0.3';
      const actionsEl = noteEl.querySelector('.article-note__actions');
      actionsEl.innerHTML = `
        <button class="note-action confirm-del">✓</button>
        <button class="note-action cancel-del">✗</button>
      `;

      actionsEl.querySelector('.confirm-del').addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteNote(noteId);
        showToast('🗑 已删除');
        renderTopics(container);
      });
      actionsEl.querySelector('.cancel-del').addEventListener('click', (ev) => {
        ev.stopPropagation();
        renderTopics(container);
      });
    });
  });
}

function promptNewTopic(container) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '输入主题名称...';
  input.className = 'inline-edit-input';
  input.style.cssText = 'max-width: 250px; margin: 12px auto; display: block;';

  const addBtn = container.querySelector('#add-topic-btn') || container.querySelector('#create-first-topic');
  if (addBtn) {
    addBtn.replaceWith(input);
  } else {
    container.appendChild(input);
  }
  input.focus();

  const save = () => {
    const name = input.value.trim();
    if (name) {
      addTopic(name, '');
      showToast(`✅ 已创建主题「${name}」`);
    }
    renderTopics(container);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
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
