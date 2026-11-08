// ==========================================================================
// core/occupancy.js - The Immutable Occupancy Law & Status Palette
// Wild & Wandering Property Management System
// ==========================================================================

// --- 1. The 13 Canonical Statuses & Master Palette ---
export const STATUS_CYCLE = [
    { val: 'new',         label: 'NEW',         bg: '#ec4899', txt: '#ffffff', border: '#db2777' },
    { val: 'future',      label: 'FUTURE',      bg: '#7fc6f5', txt: '#1e293b', border: '#38bdf8' },
    { val: 'here',        label: 'HERE',        bg: '#dcfce7', txt: '#14532d', border: '#86efac' },
    { val: 'left',        label: 'LEFT',        bg: '#aba39d', txt: '#1e293b', border: '#78716c' },
    { val: 'early out',   label: 'EARLY OUT',   bg: '#f97316', txt: '#ffffff', border: '#ea580c' },
    { val: 'cancelled',   label: 'CANCELLED',   bg: '#1e293b', txt: '#fca5a5', border: '#0f172a', strike: true },
    { val: 'no-show',     label: 'NO-SHOW',     bg: '#94a3b8', txt: '#334155', border: '#64748b' },
    { val: 'special',     label: 'SPECIAL',     bg: '#fef08a', txt: '#1e293b', border: '#fde047' },
    { val: 'blocked',     label: 'BLOCKED',     bg: '#b45309', txt: '#fef3c7', border: '#92400e' },
    { val: 'to-charge',   label: 'TO-CHARGE',   bg: '#ea580c', txt: '#ffffff', border: '#c2410c' },
    { val: 'charged',     label: 'CHARGED',     bg: '#1e3a8a', txt: '#38bdf8', border: '#172554' },
    { val: 'vol',         label: 'VOL',         bg: '#fbcfe8', txt: '#831843', border: '#f472b6' },
    { val: 'unconfirmed', label: 'UNCONFIRMED', bg: '#7e22ce', txt: '#ffffff', border: '#6b21a8' }
];

export const STATUS_ORDER = STATUS_CYCLE.map(s => s.val);

// --- 2. Live Inventory Occupancy Law ---
export const PMS_STATUS = {
    OCCUPYING: ['here', 'future', 'new', 'blocked'],
    NON_OCCUPYING: ['cancelled', 'no-show', 'unconfirmed', 'charged', 'to-charge', 'vol', 'left', 'early out'],
    SPECIAL: 'special'
};

export function isOccupyingBooking(status, hasAssignedRoom = false) {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();

    if (s === PMS_STATUS.SPECIAL) {
        return !!hasAssignedRoom;
    }

    return PMS_STATUS.OCCUPYING.includes(s);
}

// --- 3. Pure Direct Status Styling Engine ---
export function getStatusObj(status) {
    const raw = String(status || 'future').trim().toLowerCase();
    return STATUS_CYCLE.find(s => s.val === raw) || STATUS_CYCLE[1];
}

export function getNextStatus(currentStatus) {
    const current = String(currentStatus || 'future').trim().toLowerCase();
    let idx = STATUS_CYCLE.findIndex(s => s.val === current);
    if (idx === -1) idx = 1;
    return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length].val;
}

export function applyStatusStyle(element, status, applyText = false) {
    if (!element) return;
    const theme = getStatusObj(status);

    element.style.backgroundColor = theme.bg;
    element.style.color = theme.txt;
    element.style.borderColor = theme.border;

    if (theme.strike) {
        element.style.textDecoration = 'line-through';
    } else {
        element.style.textDecoration = 'none';
    }

    if (applyText) {
        element.textContent = theme.label;
    }
}

// --- 4. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.PMS_STATUS = PMS_STATUS;
    window.STATUS_CYCLE = STATUS_CYCLE;
    window.STATUS_ORDER = STATUS_ORDER;
    window.isOccupyingBooking = isOccupyingBooking;
    window.getStatusObj = getStatusObj;
    window.getNextStatus = getNextStatus;
    window.applyStatusStyle = applyStatusStyle;
}
