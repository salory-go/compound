/**
 * Compound 复利引擎 - Main Entry
 */
import './styles/main.css';
import { initRouter, getCurrentRoute } from './lib/router.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCheckin } from './pages/checkin.js';
import { renderHistory } from './pages/history.js';
import { renderTopics } from './pages/topics.js';

import { syncFromCloud, isFirstVisit } from './lib/storage.js';
import { isCloudEnabled } from './lib/supabase.js';

const app = document.getElementById('app');

// Track current route for re-render after sync
let currentRenderPage = null;

// Navigation component
function renderNav(activeRoute) {
  return `
    <div class="header">
      <div class="header__logo"><span>Compound</span> 复利引擎</div>
      <div class="header__subtitle">每日存入微小行动，看见时间的力量</div>
    </div>
    <nav class="nav">
      <button class="nav__item ${activeRoute === 'dashboard' ? 'active' : ''}" data-route="/">📊 仪表盘</button>
      <button class="nav__item ${activeRoute === 'checkin' ? 'active' : ''}" data-route="/checkin">📝 存入</button>
      <button class="nav__item ${activeRoute === 'history' ? 'active' : ''}" data-route="/history">📅 时间线</button>
      <button class="nav__item ${activeRoute === 'topics' ? 'active' : ''}" data-route="/topics">🗂 主题</button>
    </nav>
  `;
}

function renderPage(route) {
  currentRenderPage = () => renderPage(route);

  // Build layout
  const navHtml = renderNav(route);
  const pageContainer = document.createElement('div');
  pageContainer.id = 'page-content';

  app.innerHTML = navHtml;
  app.appendChild(pageContainer);

  // Setup nav events
  app.querySelectorAll('.nav__item').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.route;
    });
  });

  // Render page content
  switch (route) {
    case 'dashboard':
      renderDashboard(pageContainer);
      break;
    case 'checkin':
      renderCheckin(pageContainer);
      break;
    case 'history':
      renderHistory(pageContainer);
      break;
    case 'topics':
      renderTopics(pageContainer);
      break;
    default:
      renderDashboard(pageContainer);
  }
}

// Initialize
initRouter(renderPage);

// Cloud sync on startup
if (isCloudEnabled()) {
  console.log('%c☁️ Cloud sync enabled', 'color: #8b5cf6; font-size: 12px;');
  syncFromCloud().then(hasChanges => {
    if (hasChanges && currentRenderPage) {
      console.log('%c☁️ New data from cloud, refreshing...', 'color: #8b5cf6;');
      currentRenderPage();
    }
  });
} else {
  console.log('%c📦 Local-only mode (no Supabase config)', 'color: #6b7280; font-size: 12px;');
}

console.log('%c🌱 Compound 复利引擎 已启动', 'color: #f59e0b; font-size: 14px; font-weight: bold;');
