// ==========================================================================
// core/dates.js - Zero-Drift Calendar Formatting & Proximity Calculations
// Wild & Wandering Property Management System
// ==========================================================================

export const mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Returns YYYY-MM-DD in local time without UTC day rollback.
 */
export function getLocalYMD(d) {
    if (!d) d = new Date();
    if (typeof d === 'string') {
        const trimmed = d.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        d = new Date(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00');
    } else if (typeof d === 'number') {
        d = new Date(d);
    }
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD to noon UTC milliseconds.
 */
export function parseYMD(str) {
    if (!str) return 0;
    const p = str.split('-');
    return Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
}

/**
 * Calculates day difference from the closest event date.
 */
export function getNearestEvent(targetDateMs, eventsList = (window.eventDates || [])) {
    if (!eventsList || eventsList.length === 0) return 999;
    let minDiff = Infinity;
    for (let i = 0; i < eventsList.length; i++) {
        const evtMs = parseYMD(eventsList[i]);
        const diff = Math.round((targetDateMs - evtMs) / 86400000);
        if (Math.abs(diff) < Math.abs(minDiff)) minDiff = diff;
    }
    return minDiff;
}

if (typeof window !== 'undefined') {
    window.mNames = mNames;
    window.dayNames = dayNames;
    window.getLocalYMD = getLocalYMD;
    window.parseYMD = parseYMD;
    window.getNearestEvent = getNearestEvent;
}
