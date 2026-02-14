/**
 * Supabase Client - Cloud persistence for Compound
 * 
 * Configuration: Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * in a .env file at the project root.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only create client if configured
export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export function isCloudEnabled() {
    return supabase !== null;
}

/**
 * Get or create a persistent device ID for anonymous usage.
 * This identifies the device without requiring login.
 */
export function getDeviceId() {
    const KEY = 'compound_device_id';
    let id = localStorage.getItem(KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(KEY, id);
    }
    return id;
}
