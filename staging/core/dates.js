// ==========================================================================
// core/dates.js - Strict Zero-Drift UTC Date & Time Utilities
// Wild & Wandering Property Management System
// ==========================================================================

export const mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Strict UTC-noon timestamp parser. Completely immune to browser timezone offsets.
 * @param {string|number|Date} input - 'YYYY-MM-DD' string or Date
 * @returns {number} Unix UTC epoch in milliseconds at 12:00:00 UTC
 */
export function parseYMD(input) {
    if (!input) return 0;
    if (typeof input === 'number') return input;
    if (input instanceof Date) {
        return Date.UTC(input.getFullYear(), input.getMonth(), input.getDate(), 12, 0, 0);
    }
    const clean = String(input).split('T')[0].trim();
    const parts = clean.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return 0;
    return Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

/**
 * Converts any Date object or string into strict 'YYYY-MM-DD' without timezone drift.
 * @param {Date|string|number} d 
 * @returns {string} 'YYYY-MM-DD'
 */
export function getLocalYMD(d) {
    if (!d) d = new Date();
    if (typeof d === 'string') {
        const trimmed = d.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        d = new Date(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00Z');
    } else if (typeof d === 'number') {
        d = new Date(d);
    }
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getDaysDifference(startYMD, endYMD) {
    const s = parseYMD(startYMD);
    const e = parseYMD(endYMD);
    if (!s || !e) return 0;
    return Math.round((e - s) / 86400000);
}

export function addDaysYMD(startYMD, days) {
    const s = parseYMD(startYMD);
    if (!s) return getLocalYMD(new Date());
    const nextDate = new Date(s + (days * 86400000));
    return getLocalYMD(nextDate);
}

// Window Bridge for inline HTML event attributes
if (typeof window !== 'undefined') {
    window.parseYMD = parseYMD;
    window.getLocalYMD = getLocalYMD;
    window.mNames = mNames;
    window.getDaysDifference = getDaysDifference;
    window.addDaysYMD = addDaysYMD;
}
