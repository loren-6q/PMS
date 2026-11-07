// ==========================================================================
// core/status-theme.js - Single Source of Truth for PMS Statuses & Colors
// Wild & Wandering Property Management System
// ==========================================================================

export const STATUS_ORDER = [
    'new',
    'future',
    'here',
    'left',
    'early out',
    'cancelled',
    'no-show',
    'special',
    'blocked',
    'to-charge',
    'charged',
    'vol',
    'unconfirmed'
];

export const STATUS_THEMES = {
    'new': {
        key: 'new',
        label: 'NEW',
        bg: '#ec4899',
        text: '#ffffff',
        border: '#db2777'
    },
    'future': {
        key: 'future',
        label: 'FUTURE',
        bg: '#7fc6f5',
        text: '#1e293b',
        border: '#38bdf8'
    },
    'here': {
        key: 'here',
        label: 'HERE',
        bg: '#dcfce7',
        text: '#14532d',
        border: '#86efac'
    },
    'left': {
        key: 'left',
        label: 'LEFT',
        bg: '#aba39d',
        text: '#1e293b',
        border: '#78716c'
    },
    'early out': {
        key: 'early out',
        label: 'EARLY OUT',
        bg: '#f97316',
        text: '#ffffff',
        border: '#ea580c'
    },
    'cancelled': {
        key: 'cancelled',
        label: 'CANCELLED',
        bg: '#1e293b',
        text: '#fca5a5',
        border: '#0f172a',
        strike: true
    },
    'no-show': {
        key: 'no-show',
        label: 'NO-SHOW',
        bg: '#94a3b8',
        text: '#334155',
        border: '#64748b'
    },
    'special': {
        key: 'special',
        label: 'SPECIAL',
        bg: '#fef08a',
        text: '#1e293b',
        border: '#fde047'
    },
    'blocked': {
        key: 'blocked',
        label: 'BLOCKED',
        bg: '#b45309',
        text: '#fef3c7',
        border: '#92400e'
    },
    'to-charge': {
        key: 'to-charge',
        label: 'TO-CHARGE',
        bg: '#ea580c',
        text: '#ffffff',
        border: '#c2410c'
    },
    'charged': {
        key: 'charged',
        label: 'CHARGED',
        bg: '#1e3a8a',
        text: '#38bdf8',
        border: '#172554'
    },
    'vol': {
        key: 'vol',
        label: 'VOL',
        bg: '#fbcfe8',
        text: '#831843',
        border: '#f472b6'
    },
    'unconfirmed': {
        key: 'unconfirmed',
        label: 'UNCONFIRMED',
        bg: '#7e22ce',
        text: '#ffffff',
        border: '#6b21a8'
    }
};

const STATUS_ALIASES = {
    'confirmed': 'future',
    'in-house': 'here',
    'checked-in': 'here',
    'checked-out': 'left',
    'departed': 'left',
    'canceled': 'cancelled',
    'noshow': 'no-show',
    'early-out': 'early out',
    'earlyout': 'early out'
};

/**
 * Normalizes any status input and returns the exact styling theme.
 */
export function getStatusTheme(status) {
    const raw = String(status || 'future').toLowerCase().trim();
    const canonicalKey = STATUS_ALIASES[raw] || raw;
    return STATUS_THEMES[canonicalKey] || STATUS_THEMES['future'];
}

/**
 * Cycles to the next status in order (used by modal cycle button).
 */
export function getNextStatus(currentStatus) {
    const currentTheme = getStatusTheme(currentStatus);
    const currIdx = STATUS_ORDER.indexOf(currentTheme.key);
    const nextIdx = (currIdx + 1) % STATUS_ORDER.length;
    return STATUS_ORDER[nextIdx];
}

/**
 * Direct DOM helper: styles any element (button, bar, pill) with 100% accuracy.
 */
export function applyStatusStyle(element, status, applyText = false) {
    if (!element) return;
    const theme = getStatusTheme(status);

    element.style.backgroundColor = theme.bg;
    element.style.color = theme.text;
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

// Window attachments for legacy / inline scripts
if (typeof window !== 'undefined') {
    window.STATUS_ORDER = STATUS_ORDER;
    window.STATUS_THEMES = STATUS_THEMES;
    window.getStatusTheme = getStatusTheme;
    window.getNextStatus = getNextStatus;
    window.applyStatusStyle = applyStatusStyle;
}
