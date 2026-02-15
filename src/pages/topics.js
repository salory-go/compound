/**
 * Topics Page - AI-powered theme classification and review
 */
import { getAllEntries, getEntriesSorted, getTopics, saveTopics } from '../lib/storage.js';
import { supabase, isCloudEnabled } from '../lib/supabase.js';
import { navigate } from '../lib/router.js';

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
        container.innerHTML = renderFirstTime(entryCount);
        setupClassifyHandler(container);
        return;
    }

    container.innerHTML = renderTopicsList(topicsData, entries);
    setupTopicEvents(container, topicsData, entries);
}

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

function renderFirstTime(count) {
    return `
    <div class="page-enter" style="text-align: center; padding-top: var(--space-xxl);">
      <div style="font-size: 3rem; margin-bottom: var(--space-lg);">🗂</div>
      <h2 style="margin-bottom: var(--space-md);">整理你的思考</h2>
      <p style="color: var(--text-tertiary); margin-bottom: var(--space-xl);">
        AI 会阅读你的 ${count} 条日记，找出反复出现的深层母题。
      </p>
      <button class="btn-ai" id="classify-btn" style="max-width: 300px; margin: 0 auto;">🧠 开始整理</button>
    </div>
  `;
}

function renderTopicsList(topicsData, entries) {
    const { topics, lastClassified } = topicsData;
    const timeStr = lastClassified ? new Date(lastClassified).toLocaleString('zh-CN') : '';

    const cards = topics.map((topic, i) => {
        const entryCount = topic.entryIds ? topic.entryIds.length : 0;
        return `
      <div class="topic-card" data-index="${i}">
        <div class="topic-card__header">
          <div class="topic-card__name">${escapeHtml(topic.name)}</div>
          <div class="topic-card__count">${entryCount} 条</div>
        </div>
        <div class="topic-card__desc">${escapeHtml(topic.description)}</div>
        <div class="topic-card__entries" id="topic-entries-${i}" style="display: none;"></div>
      </div>
    `;
    }).join('');

    return `
    <div class="page-enter">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div>
          <h2 style="margin: 0;">🗂 思考主题</h2>
          ${timeStr ? `<div style="color: var(--text-tertiary); font-size: 0.75rem; margin-top: 4px;">上次整理：${timeStr}</div>` : ''}
        </div>
        <button class="btn-ai btn-ai--small" id="reclassify-btn">🔄 重新整理</button>
      </div>
      <div class="topics-grid">${cards}</div>
    </div>
  `;
}

function setupTopicEvents(container, topicsData, entries) {
    // Card click to expand/collapse
    container.querySelectorAll('.topic-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            const entriesDiv = container.querySelector(`#topic-entries-${index}`);
            const isOpen = entriesDiv.style.display !== 'none';

            if (isOpen) {
                entriesDiv.style.display = 'none';
                card.classList.remove('expanded');
            } else {
                // Render entries if first time
                if (!entriesDiv.innerHTML) {
                    const topic = topicsData.topics[index];
                    const entryHtml = (topic.entryIds || []).map(id => {
                        const entry = entries[id];
                        if (!entry) return '';
                        const preview = entry.text.length > 80 ? entry.text.slice(0, 80) + '...' : entry.text;
                        return `<div class="topic-entry"><span class="topic-entry__date">${id}</span><span class="topic-entry__text">${escapeHtml(preview)}</span></div>`;
                    }).join('');
                    entriesDiv.innerHTML = entryHtml || '<div style="color: var(--text-tertiary); font-size: 0.85rem;">无关联条目</div>';
                }
                entriesDiv.style.display = 'block';
                card.classList.add('expanded');
            }
        });
    });

    // Reclassify button
    const reclassifyBtn = container.querySelector('#reclassify-btn');
    if (reclassifyBtn) {
        reclassifyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await doClassify(container, topicsData.topics);
        });
    }
}

function setupClassifyHandler(container) {
    const btn = container.querySelector('#classify-btn');
    if (btn) {
        btn.addEventListener('click', async () => {
            await doClassify(container, null);
        });
    }
}

async function doClassify(container, existingTopics) {
    if (!isCloudEnabled()) {
        showToast('❌ 需要云端连接才能使用 AI 整理');
        return;
    }

    // Show loading
    container.innerHTML = `
    <div class="page-enter" style="text-align: center; padding-top: var(--space-xxl);">
      <div style="font-size: 3rem; margin-bottom: var(--space-lg);" class="ai-loading">🧠</div>
      <h2 style="margin-bottom: var(--space-md);">正在整理...</h2>
      <p style="color: var(--text-tertiary);">AI 正在阅读你的日记，寻找深层母题</p>
    </div>
  `;

    const entries = getEntriesSorted().map(e => ({ id: e.id, text: e.text }));

    try {
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
            body: {
                entries,
                existingTopics: existingTopics || undefined,
            },
        });

        if (error) {
            console.error('[Topics] Classification error:', error.message);
            showToast('❌ 整理失败，请稍后重试');
            renderTopics(container); // re-render current state
            return;
        }

        const topics = data?.topics;
        if (!topics || !Array.isArray(topics)) {
            console.error('[Topics] Invalid response:', data);
            showToast('❌ AI 返回了无效结果');
            renderTopics(container);
            return;
        }

        // Normalize: ensure entryIds field
        const normalized = topics.map((t, i) => ({
            id: `t${i + 1}`,
            name: t.name || '未命名',
            description: t.description || '',
            entryIds: t.entry_ids || t.entryIds || [],
        }));

        const topicsData = {
            lastClassified: new Date().toISOString(),
            topics: normalized,
        };

        saveTopics(topicsData);
        showToast(`✅ 整理完成！发现 ${normalized.length} 个主题`);
        renderTopics(container);
    } catch (e) {
        console.error('[Topics] Request failed:', e);
        showToast('❌ 网络错误，请检查连接');
        renderTopics(container);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
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
