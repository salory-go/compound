/**
 * Simple Hash Router
 * Routes: #/ (dashboard), #/checkin (check-in), #/history (history)
 */

let currentRoute = '';
let routeHandler = null;

const routes = {
    '/': 'dashboard',
    '/checkin': 'checkin',
    '/history': 'history',
};

export function initRouter(handler) {
    routeHandler = handler;
    window.addEventListener('hashchange', onHashChange);
    // Initial route
    onHashChange();
}

export function navigate(path) {
    window.location.hash = path;
}

export function getCurrentRoute() {
    return currentRoute;
}

function onHashChange() {
    const hash = window.location.hash.slice(1) || '/';
    const route = routes[hash] || 'dashboard';

    if (route !== currentRoute) {
        currentRoute = route;
        if (routeHandler) {
            routeHandler(route);
        }
    }
}
