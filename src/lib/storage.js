/**
 * Storage Engine - Cloud-first + Local Cache for Compound
 * 
 * Strategy:
 * - Write: Supabase (primary) → localStorage (cache)
 * - Read: localStorage (fast) → background sync from Supabase
 * - Offline: localStorage fallback → sync when online
 */

import { supabase, isCloudEnabled, getDeviceId } from './supabase.js';

const ENTRIES_KEY = 'compound_entries';
const STATS_KEY = 'compound_stats';
const SYNC_FLAG = 'compound_last_sync';

// ============================
// Entries - CRUD
// ============================

export async function saveEntry(entry) {
  // Always save to localStorage first (instant)
  const entries = getAllEntries();
  entries[entry.id] = entry;
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  recalculateStats(entries);

  // Then try cloud
  if (isCloudEnabled()) {
    try {
      const { error } = await supabase
        .from('entries')
        .upsert({
          id: entry.id,
          text: entry.text || '',
          health: entry.health || {},
          energy: entry.energy || 0,
          tomorrow: entry.tomorrow || '',
          device_id: getDeviceId(),
        }, { onConflict: 'id' });

      if (error) {
        console.warn('[Compound] Cloud save failed, data is safe locally:', error.message);
        markPendingSync(entry.id);
      } else {
        console.log('[Compound] ☁️ Saved to cloud');
      }
    } catch (e) {
      console.warn('[Compound] Cloud unreachable, data is safe locally:', e.message);
      markPendingSync(entry.id);
    }
  }

  return entry;
}

/**
 * Save AI analysis for a specific entry.
 * Updates both local cache and cloud.
 */
export async function saveAnalysis(entryId, analysis) {
  // Update local
  const entries = getAllEntries();
  if (entries[entryId]) {
    entries[entryId].analysis = analysis;
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }

  // Update cloud
  if (isCloudEnabled()) {
    try {
      await supabase
        .from('entries')
        .update({ analysis })
        .eq('id', entryId);
      console.log('[Compound] ☁️ Analysis saved to cloud');
    } catch (e) {
      console.warn('[Compound] Cloud analysis save failed:', e.message);
    }
  }
}

export function getEntry(dateStr) {
  const entries = getAllEntries();
  return entries[dateStr] || null;
}

export function getTodayEntry() {
  return getEntry(todayStr());
}

export function getYesterdayEntry() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getEntry(formatDate(yesterday));
}

export function getAllEntries() {
  try {
    return JSON.parse(localStorage.getItem(ENTRIES_KEY)) || {};
  } catch {
    return {};
  }
}

export function getEntriesSorted() {
  const entries = getAllEntries();
  return Object.values(entries).sort((a, b) => b.id.localeCompare(a.id));
}

// ============================
// Cloud Sync
// ============================

/**
 * Sync data from Supabase to local.
 * Called on app startup.
 * Returns true if new data was synced.
 */
export async function syncFromCloud() {
  if (!isCloudEnabled()) return false;

  try {
    // 1. Pull all entries from cloud
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.warn('[Compound] Cloud sync failed:', error.message);
      return false;
    }

    if (!data || data.length === 0) {
      // Cloud is empty — push local data up
      await pushLocalToCloud();
      return false;
    }

    // 2. Merge cloud data into local
    const localEntries = getAllEntries();
    let hasChanges = false;

    for (const row of data) {
      const localEntry = localEntries[row.id];
      const cloudEntry = {
        id: row.id,
        text: row.text,
        health: row.health,
        energy: row.energy,
        tomorrow: row.tomorrow,
        timestamp: new Date(row.updated_at).getTime(),
      };

      // Cloud wins if local doesn't have it or cloud is newer
      if (!localEntry || (cloudEntry.timestamp > (localEntry.timestamp || 0))) {
        localEntries[row.id] = cloudEntry;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(localEntries));
      recalculateStats(localEntries);
      console.log('[Compound] ☁️ Synced from cloud');
    }

    // 3. Push any local-only entries to cloud
    await pushLocalToCloud();

    // 4. Sync any pending entries
    await syncPending();

    localStorage.setItem(SYNC_FLAG, Date.now().toString());
    return hasChanges;
  } catch (e) {
    console.warn('[Compound] Cloud sync error:', e.message);
    return false;
  }
}

/**
 * Push local entries that don't exist in cloud yet.
 */
async function pushLocalToCloud() {
  if (!isCloudEnabled()) return;

  const localEntries = getAllEntries();
  const localIds = Object.keys(localEntries);
  if (localIds.length === 0) return;

  try {
    // Check which IDs exist in cloud
    const { data: cloudRows } = await supabase
      .from('entries')
      .select('id');

    const cloudIds = new Set((cloudRows || []).map(r => r.id));
    const missing = localIds.filter(id => !cloudIds.has(id));

    if (missing.length === 0) return;

    // Push missing entries
    const toInsert = missing.map(id => ({
      id: localEntries[id].id,
      text: localEntries[id].text || '',
      health: localEntries[id].health || {},
      energy: localEntries[id].energy || 0,
      tomorrow: localEntries[id].tomorrow || '',
      device_id: getDeviceId(),
    }));

    const { error } = await supabase
      .from('entries')
      .upsert(toInsert, { onConflict: 'id' });

    if (error) {
      console.warn('[Compound] Push to cloud failed:', error.message);
    } else {
      console.log(`[Compound] ☁️ Pushed ${missing.length} local entries to cloud`);
    }
  } catch (e) {
    console.warn('[Compound] Push error:', e.message);
  }
}

// ============================
// Pending sync (offline support)
// ============================

const PENDING_KEY = 'compound_pending_sync';

function markPendingSync(entryId) {
  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  if (!pending.includes(entryId)) {
    pending.push(entryId);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }
}

async function syncPending() {
  if (!isCloudEnabled()) return;

  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  if (pending.length === 0) return;

  const entries = getAllEntries();
  const toSync = pending
    .filter(id => entries[id])
    .map(id => ({
      id: entries[id].id,
      text: entries[id].text || '',
      health: entries[id].health || {},
      energy: entries[id].energy || 0,
      tomorrow: entries[id].tomorrow || '',
      device_id: getDeviceId(),
    }));

  if (toSync.length === 0) {
    localStorage.removeItem(PENDING_KEY);
    return;
  }

  try {
    const { error } = await supabase
      .from('entries')
      .upsert(toSync, { onConflict: 'id' });

    if (!error) {
      localStorage.removeItem(PENDING_KEY);
      console.log(`[Compound] ☁️ Synced ${toSync.length} pending entries`);
    }
  } catch (e) {
    console.warn('[Compound] Pending sync failed:', e.message);
  }
}

// ============================
// Stats (local-only, calculated)
// ============================

export function getStats() {
  try {
    const stats = JSON.parse(localStorage.getItem(STATS_KEY));
    if (stats) return stats;
  } catch { /* fallthrough */ }
  return defaultStats();
}

function defaultStats() {
  return {
    totalDeposits: 0,
    currentStreak: 0,
    longestStreak: 0,
    compoundValue: 0,
    startDate: null,
  };
}

function recalculateStats(entries) {
  const dates = Object.keys(entries).sort();
  if (dates.length === 0) {
    localStorage.setItem(STATS_KEY, JSON.stringify(defaultStats()));
    return;
  }

  const totalDeposits = dates.length;
  const startDate = dates[0];

  // Calculate current streak (from today backwards)
  let currentStreak = 0;
  const today = new Date(todayStr());
  let checkDate = new Date(today);

  if (entries[todayStr()]) {
    currentStreak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
    while (entries[formatDate(checkDate)]) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } else {
    checkDate.setDate(checkDate.getDate() - 1);
    if (entries[formatDate(checkDate)]) {
      currentStreak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
      while (entries[formatDate(checkDate)]) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  const stats = {
    totalDeposits,
    currentStreak,
    longestStreak,
    compoundValue: 0,
    startDate,
  };

  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ============================
// Helpers
// ============================

export function todayStr() {
  return formatDate(new Date());
}

export function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const today = todayStr();
  const yesterday = formatDate(new Date(Date.now() - 86400000));

  if (dateStr === today) return `${month}/${day}（今天）`;
  if (dateStr === yesterday) return `${month}/${day}（昨天）`;
  return `${month}/${day}`;
}

export function isFirstVisit() {
  return Object.keys(getAllEntries()).length === 0;
}
