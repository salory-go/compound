/**
 * Dashboard Page - The main view
 * Shows stats, growth curve, quote, health snapshot, and CTA
 */
import { Chart, registerables } from 'chart.js';
import { getStats, getAllEntries, getEntriesSorted, getTodayEntry, getYesterdayEntry, isFirstVisit, saveAnalysis } from '../lib/storage.js';
import { calculateCompoundValue, generateGrowthCurve, getMultiplier } from '../lib/compound.js';
import { getTodayQuote } from '../lib/quotes.js';
import { navigate } from '../lib/router.js';
import { requestAnalysis } from '../lib/ai.js';

Chart.register(...registerables);

let chartInstance = null;

const HEALTH_LABELS = {
  sleptEarly: { icon: '🌙', label: '早睡' },
  wokeEarly: { icon: '☀️', label: '早起' },
  reading: { icon: '📚', label: '阅读' },
  sideProject: { icon: '💻', label: '副业' },
  exercised: { icon: '🏃', label: '运动' },
  meditation: { icon: '🧘', label: '冥想' },
};

export function renderDashboard(container) {
  const entries = getAllEntries();
  const stats = getStats();
  const todayEntry = getTodayEntry();
  const quote = getTodayQuote();
  const compoundValue = calculateCompoundValue(entries);
  const multiplier = getMultiplier(entries);
  const yesterdayEntry = getYesterdayEntry();

  // First visit welcome
  if (isFirstVisit()) {
    container.innerHTML = renderWelcome();
    setupWelcomeEvents(container);
    return;
  }

  container.innerHTML = `
    <div class="page-enter">
      <!-- Yesterday's Plan Reminder -->
      ${renderYesterdayReminder(yesterdayEntry, todayEntry)}

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="card stat-card">
          <div class="stat-card__icon">🔥</div>
          <div class="stat-card__value animate-in" id="streak-value">${stats.currentStreak}</div>
          <div class="stat-card__label">连续天数</div>
        </div>
        <div class="card stat-card">
          <div class="stat-card__icon">📊</div>
          <div class="stat-card__value animate-in" id="deposits-value">${stats.totalDeposits}</div>
          <div class="stat-card__label">总存入</div>
        </div>
        <div class="card stat-card card--glow">
          <div class="stat-card__icon">💰</div>
          <div class="stat-card__value animate-in" id="compound-value">${compoundValue}</div>
          <div class="stat-card__label">复利资产</div>
        </div>
      </div>

      <!-- Today's Entry Preview -->
      ${todayEntry ? renderTodayPreview(todayEntry) : ''}

      <!-- AI Analysis -->
      ${todayEntry ? renderAISection(todayEntry) : ''}

      <!-- Growth Curve -->
      <div class="card mb-lg">
        <div class="section-label">📈 成长曲线 ${multiplier > 1 ? `<span style="color: var(--accent)">×${multiplier} 复利倍数</span>` : ''}</div>
        <div class="chart-container">
          <canvas id="growth-chart"></canvas>
        </div>
      </div>

      <!-- Quote -->
      <div class="card quote-card mb-lg">
        <div class="quote-card__text">${quote.text}</div>
        <div class="quote-card__author">—— ${quote.author}</div>
      </div>

      <!-- CTA Button -->
      <button class="btn-primary mt-lg" id="checkin-btn">
        ${todayEntry ? '✏️ 编辑今日存入' : '📝 今日存入'}
      </button>
    </div>
  `;

  // Initialize chart
  setTimeout(() => {
    initChart(entries);
  }, 100);

  // Events
  container.querySelector('#checkin-btn').addEventListener('click', () => {
    navigate('/checkin');
  });

  // Today's preview expand/collapse
  const previewToggle = container.querySelector('#today-preview-toggle');
  if (previewToggle) {
    const previewText = container.querySelector('#today-preview-text');
    previewToggle.addEventListener('click', () => {
      const isExpanded = previewText.classList.toggle('expanded');
      const label = previewToggle.querySelector('span:first-child');
      const arrow = previewToggle.querySelector('.timeline-toggle__arrow');
      label.textContent = isExpanded ? '收起' : '展开全文';
      arrow.classList.toggle('expanded', isExpanded);
    });
    // Hide toggle if text fits
    requestAnimationFrame(() => {
      if (previewText.scrollHeight <= previewText.clientHeight + 2) {
        previewToggle.style.display = 'none';
      }
    });
  }

  // AI Analysis button
  const aiBtn = container.querySelector('#ai-analyze-btn');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
      const todayData = getTodayEntry();
      if (!todayData) return;

      // Show loading state
      aiBtn.disabled = true;
      aiBtn.innerHTML = '<span class="ai-loading">🤖 正在分析中...</span>';

      // Get recent entries for context (last 7 days, excluding today)
      const recent = getEntriesSorted()
        .filter(e => e.id !== todayData.id)
        .slice(0, 7);

      const analysis = await requestAnalysis(todayData, recent);

      if (analysis) {
        // Save analysis to local + cloud
        await saveAnalysis(todayData.id, analysis);

        // Render the analysis card
        const aiSection = container.querySelector('#ai-section');
        if (aiSection) {
          aiSection.innerHTML = renderAnalysisCard(analysis);
        }
      } else {
        aiBtn.disabled = false;
        aiBtn.innerHTML = '🤖 AI 点评';
        // Show error toast
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = '❌ 分析失败，请稍后重试';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    });
  }
}

function renderWelcome() {
  return `
    <div class="welcome page-enter">
      <div class="welcome__emoji">🌱</div>
      <h1 class="welcome__title">欢迎来到 Compound</h1>
      <p class="welcome__desc">
        这里是你的个人成长银行。<br/>
        每天存入一点思考和行动，<br/>
        时间会用复利回报你。
      </p>
      <p class="welcome__desc" style="font-size: 0.85rem; color: var(--text-tertiary);">
        不需要完美，不需要很多。<br/>
        关键是：开始，然后不停。
      </p>
      <button class="btn-primary" id="start-btn">
        🚀 开始第一笔存入
      </button>
    </div>
  `;
}

function renderHealthSnapshot(entry) {
  if (!entry.health) return '';

  const tags = Object.entries(HEALTH_LABELS).map(([key, { icon, label }]) => {
    const done = entry.health[key];
    return `<span class="health-tag health-tag--${done ? 'done' : 'miss'}">${icon} ${label}</span>`;
  }).join('');

  const energyEmojis = ['', '😫', '😕', '😐', '🙂', '😊'];
  const energyDisplay = entry.energy ? energyEmojis[entry.energy] : '';

  return `
    <div class="card mb-lg">
      <div class="section-label">🏥 今日健康快照 ${energyDisplay ? `<span style="margin-left: 8px">${energyDisplay}</span>` : ''}</div>
      <div class="health-snapshot">${tags}</div>
    </div>
  `;
}

function renderTodayPreview(entry) {
  if (!entry.text) return '';
  return `
    <div class="card mb-lg today-preview">
      <div class="section-label">📝 今日存入</div>
      <div class="timeline-text" id="today-preview-text">${escapeHtml(entry.text)}</div>
      <button class="timeline-toggle" id="today-preview-toggle">
        <span>展开全文</span>
        <span class="timeline-toggle__arrow">▼</span>
      </button>
    </div>
  `;
}

function renderYesterdayReminder(yesterdayEntry, todayEntry) {
  // Only show if yesterday had a plan AND today hasn't been recorded yet
  if (!yesterdayEntry?.tomorrow || todayEntry) return '';
  return `
    <div class="card mb-lg" style="border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.04);">
      <div class="section-label">📌 昨天的你说：</div>
      <div style="font-size: 0.95rem; color: var(--text-accent); line-height: 1.7;">“${escapeHtml(yesterdayEntry.tomorrow)}”</div>
    </div>
  `;
}

function renderAISection(entry) {
  if (entry.analysis) {
    return `<div id="ai-section">${renderAnalysisCard(entry.analysis)}</div>`;
  }
  return `
    <div id="ai-section">
      <button class="btn-ai" id="ai-analyze-btn">🤖 AI 点评</button>
    </div>
  `;
}

function renderAnalysisCard(analysis) {
  return `
    <div class="card mb-lg ai-card">
      <div class="section-label" style="color: var(--ai-accent, #a78bfa);">🤖 AI 成长教练</div>
      <div class="ai-card__text">${escapeHtml(analysis)}</div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initChart(entries) {
  const canvas = document.getElementById('growth-chart');
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const { labels, data, projectedLabels, projectedData } = generateGrowthCurve(entries);

  if (labels.length === 0) return;

  const ctx = canvas.getContext('2d');

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');

  const projectedGradient = ctx.createLinearGradient(0, 0, 0, 200);
  projectedGradient.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
  projectedGradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

  const datasets = [
    {
      label: '实际成长',
      data: data,
      borderColor: '#f59e0b',
      backgroundColor: gradient,
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: labels.length > 30 ? 0 : 3,
      pointBackgroundColor: '#f59e0b',
      pointBorderColor: '#0a0a12',
      pointBorderWidth: 2,
    }
  ];

  // Add projected line if we have data
  if (projectedData.length > 0) {
    datasets.push({
      label: '预计成长（若每日存入）',
      data: [...new Array(labels.length).fill(null), ...projectedData],
      borderColor: 'rgba(139, 92, 246, 0.5)',
      backgroundColor: projectedGradient,
      borderWidth: 2,
      borderDash: [5, 5],
      fill: true,
      tension: 0.4,
      pointRadius: 0,
    });
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...labels, ...projectedLabels],
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: projectedData.length > 0,
          position: 'bottom',
          labels: {
            color: 'rgba(240, 240, 245, 0.5)',
            font: { size: 11, family: 'Inter' },
            boxWidth: 20,
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 30, 0.95)',
          titleColor: '#f0f0f5',
          bodyColor: 'rgba(240, 240, 245, 0.7)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
            label: (ctx) => {
              if (ctx.raw === null) return '';
              return ` 复利资产: ${ctx.raw}`;
            }
          }
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: {
            color: 'rgba(240, 240, 245, 0.3)',
            font: { size: 10, family: 'Inter' },
            maxTicksLimit: 8,
          },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: {
            color: 'rgba(240, 240, 245, 0.3)',
            font: { size: 10, family: 'Inter' },
          },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}

function setupWelcomeEvents(container) {
  container.querySelector('#start-btn').addEventListener('click', () => {
    navigate('/checkin');
  });
}
