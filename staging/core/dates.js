// ==========================================================================
// core/dates.js - Zero-Drift UTC Date Parsers, Arithmetic & Month Tables
// Wild & Wandering Property Management System
// ==========================================================================

export const mNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const dNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Parses YYYY-MM-DD or YYYY/MM/DD string into a zero-drift UTC noon millisecond timestamp.
 * Sticking to UTC 12:00:00 prevents timezone changes across midnight.
 */
export function parseYMD(dStr) {
    if (!dStr || typeof dStr !== 'string') return NaN;
    const parts = dStr.trim().split(/[-/]/);
    if (parts.length < 3) return NaN;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return NaN;
    return Date.UTC(y, m, d, 12, 0, 0);
}

/**
 * Formats a Date object or UTC timestamp into strict ISO YYYY-MM-DD string.
 */
export function getLocalYMD(d) {
    if (!d) d = new Date();
    if (typeof d === 'string') {
        const ms = parseYMD(d);
        if (isNaN(ms)) return '';
        d = new Date(ms);
    } else if (typeof d === 'number') {
        d = new Date(d);
    }
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Returns integer day difference between two dates (end - start).
 * Uses UTC noon timestamps to guarantee zero DST or timezone drift.
 */
export function diffDays(startStr, endStr) {
    const s = parseYMD(startStr);
    const e = parseYMD(endStr);
    if (isNaN(s) || isNaN(e)) return 0;
    return Math.round((e - s) / 86400000);
}

/**
 * Adds or subtracts integer days to/from a YYYY-MM-DD string.
 * Returns the resulting YYYY-MM-DD string.
 */
export function addDays(dStr, count) {
    const ms = parseYMD(dStr);
    if (isNaN(ms)) return dStr;
    const next = new Date(ms + (count * 86400000));
    return getLocalYMD(next);
}

/**
 * Formats a YYYY-MM-DD string into localized display formats.
 */
export function formatDisplayDate(dStr, formatStr = 'DD/MM/YYYY') {
    if (!dStr) return '';
    const parts = dStr.trim().split(/[-/]/);
    if (parts.length < 3) return dStr;
    const [y, m, d] = parts;
    const mIdx = parseInt(m, 10) - 1;

    if (formatStr === 'DD/MM') return `${d}/${m}`;
    if (formatStr === 'MM/DD') return `${m}/${d}`;
    if (formatStr === 'D Mon') return `${parseInt(d, 10)} ${mNames[mIdx] || m}`;
    if (formatStr === 'D Mon YYYY') return `${parseInt(d, 10)} ${mNames[mIdx] || m} ${y}`;
    if (formatStr === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
    return `${d}/${m}/${y}`;
}

// Global window bindings for inline HTML and legacy script compatibility
if (typeof window !== 'undefined') {
    window.parseYMD = parseYMD;
    window.getLocalYMD = getLocalYMD;
    window.diffDays = diffDays;
    window.addDays = addDays;
    window.formatDisplayDate = formatDisplayDate;
    window.mNames = mNames;
    window.dNames = dNames;
}
