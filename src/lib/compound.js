/**
 * Compound Interest Calculation Engine
 * 
 * Each daily entry = 1 unit deposit.
 * Deposits grow over time with compound interest.
 * Streak bonus: longer streaks = higher interest rate.
 * 
 * Formula per deposit:
 *   value = 1 × (1 + dailyRate)^daysSinceDeposit
 *   dailyRate = baseRate + min(streakAtDeposit × streakBonus, maxStreakBonus)
 *   totalAssets = sum of all deposit values
 */

const BASE_RATE = 0.003; // 0.3% per day
const STREAK_BONUS = 0.0005; // 0.05% per streak day
const MAX_STREAK_BONUS = 0.01; // 1% cap

/**
 * Calculate compound value for all entries
 * @param {Object} entries - All entries keyed by date
 * @returns {number} Total compound value
 */
export function calculateCompoundValue(entries) {
    const dates = Object.keys(entries).sort();
    if (dates.length === 0) return 0;

    const today = new Date();
    let totalValue = 0;

    // Calculate streak at each deposit date
    const streakAtDate = {};
    let currentStreak = 0;
    for (let i = 0; i < dates.length; i++) {
        if (i === 0) {
            currentStreak = 1;
        } else {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
            currentStreak = diffDays === 1 ? currentStreak + 1 : 1;
        }
        streakAtDate[dates[i]] = currentStreak;
    }

    // Calculate each deposit's current value
    for (const date of dates) {
        const depositDate = new Date(date);
        const daysSince = Math.max(0, Math.floor((today - depositDate) / (1000 * 60 * 60 * 24)));
        const streak = streakAtDate[date] || 1;
        const dailyRate = BASE_RATE + Math.min(streak * STREAK_BONUS, MAX_STREAK_BONUS);
        const value = Math.pow(1 + dailyRate, daysSince);
        totalValue += value;
    }

    return Math.round(totalValue * 10) / 10;
}

/**
 * Generate growth curve data points for Chart.js
 * @param {Object} entries - All entries keyed by date
 * @returns {{ labels: string[], data: number[] }}
 */
export function generateGrowthCurve(entries) {
    const dates = Object.keys(entries).sort();
    if (dates.length === 0) {
        return { labels: [], data: [], projectedLabels: [], projectedData: [] };
    }

    const labels = [];
    const data = [];
    const today = new Date();

    // For each historical date, calculate total compound value at that point
    const startDate = new Date(dates[0]);
    const dayCount = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

    // Calculate daily snapshots
    for (let i = 0; i < dayCount; i++) {
        const snapshotDate = new Date(startDate);
        snapshotDate.setDate(snapshotDate.getDate() + i);
        const snapshotStr = formatDateLocal(snapshotDate);

        const month = snapshotDate.getMonth() + 1;
        const day = snapshotDate.getDate();
        labels.push(`${month}/${day}`);

        // Calculate compound value at this snapshot
        let snapshotValue = 0;
        for (const date of dates) {
            if (date > snapshotStr) break;
            const depositDate = new Date(date);
            const daysSince = Math.floor((snapshotDate - depositDate) / (1000 * 60 * 60 * 24));
            if (daysSince < 0) continue;

            // Simplified: use base rate for historical projection
            const value = Math.pow(1 + BASE_RATE, daysSince);
            snapshotValue += value;
        }
        data.push(Math.round(snapshotValue * 10) / 10);
    }

    // Project 30 days into the future (assuming daily deposits continue)
    const projectedLabels = [];
    const projectedData = [];
    const currentDeposits = dates.length;

    for (let i = 1; i <= 30; i++) {
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + i);
        const month = futureDate.getMonth() + 1;
        const day = futureDate.getDate();
        projectedLabels.push(`${month}/${day}`);

        // Project: assume 1 deposit per day, all growing at base rate
        let projectedValue = 0;
        for (let j = 0; j < currentDeposits + i; j++) {
            const daysOfGrowth = currentDeposits + i - j - 1;
            projectedValue += Math.pow(1 + BASE_RATE, daysOfGrowth);
        }
        projectedData.push(Math.round(projectedValue * 10) / 10);
    }

    return { labels, data, projectedLabels, projectedData };
}

/**
 * Calculate the multiplier (how much more valuable your deposits are vs raw count)
 */
export function getMultiplier(entries) {
    const compoundValue = calculateCompoundValue(entries);
    const rawCount = Object.keys(entries).length;
    if (rawCount === 0) return 1;
    return Math.round((compoundValue / rawCount) * 100) / 100;
}

function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
