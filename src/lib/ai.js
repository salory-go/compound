/**
 * AI Module - Calls Supabase Edge Function for entry analysis
 */
import { supabase, isCloudEnabled } from './supabase.js';

const FUNCTION_NAME = 'analyze';

/**
 * Request AI analysis for an entry.
 * @param {Object} entry - The current day's entry
 * @param {Array} recentEntries - Last 7 days of entries for context
 * @returns {Promise<string|null>} Analysis text or null on failure
 */
export async function requestAnalysis(entry, recentEntries = []) {
    if (!isCloudEnabled()) {
        console.warn('[AI] Cloud not enabled, cannot analyze');
        return null;
    }

    try {
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
            body: {
                entry_id: entry.id,
                text: entry.text,
                energy: entry.energy,
                health: entry.health,
                tomorrow: entry.tomorrow,
                history: recentEntries.map(e => ({
                    id: e.id,
                    text: e.text,
                    energy: e.energy,
                    health: e.health,
                })),
            },
        });

        if (error) {
            console.error('[AI] Edge function error:', error.message);
            return null;
        }

        return data?.analysis || null;
    } catch (e) {
        console.error('[AI] Request failed:', e.message);
        return null;
    }
}
