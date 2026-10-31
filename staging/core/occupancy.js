// ==========================================================================
// core/occupancy.js - The Immutable Occupancy Law & Status Palette
// Wild & Wandering Property Management System
// ==========================================================================

// --- 1. Status Classifications & High-Contrast Palette ---
export const PMS_STATUS = {
    OCCUPYING: ['here', 'future', 'new', 'blocked'],
    NON_OCCUPYING: ['cancelled', 'noshow', 'unconfirmed', 'charged', 'tocharge', 'vol', 'left'],
    SPECIAL: 'special'
};

export const STATUS_CYCLE = [
    { val: 'new', bg: '#ec4899', txt: '#ffffff', label: 'NEW' },
    { val: 'future', bg: '#7fc6f5', txt: '#1e293b', label: 'FUTURE' },
    { val: 'here', bg: '#dcfce7', txt: '#14532d', label: 'HERE' },
    { val: 'left', bg: '#aba39d', txt: '#1e293b', label: 'LEFT' },
    { val: 'cancelled', bg: '#1e293b', txt: '#fca5a5', label: 'CANCELLED' },
    { val: 'noshow', bg: '#94a3b8', txt: '#334155', label: 'NO-SHOW' },
    { val: 'special', bg: '#fef08a', txt: '#1e293b', label: 'SPECIAL' },
    { val: 'blocked', bg: '#b45309', txt: '#fef3c7', label: 'BLOCKED' },
    { val: 'charged', bg: '#1e3a8a', txt: '#38bdf8', label: 'CHARGED' },
    { val: 'tocharge', bg: '#ea580c', txt: '#ffffff', label: 'TO-CHARGE' },
    { val: 'vol', bg: '#fbcfe8', txt: '#831843', label: 'VOL' },
    { val: 'unconfirmed', bg: '#7e22ce', txt: '#ffffff', label: 'UNCONFIRMED' }
];

// --- 2. Live Inventory Occupancy Law Evaluator ---
export function isOccupyingBooking(status, hasAssignedRoom = false) {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();

    if (s === PMS_STATUS.SPECIAL) {
        return !!hasAssignedRoom;
    }

    return PMS_STATUS.OCCUPYING.includes(s);
}

// --- 3. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.PMS_STATUS = PMS_STATUS;
    window.STATUS_CYCLE = STATUS_CYCLE;
    window.isOccupyingBooking = isOccupyingBooking;
}
