// ==========================================================================
// core/occupancy.js - The Immutable Occupancy Law
// Wild & Wandering Property Management System
// ==========================================================================

/**
 * Universal Status Definitions
 * ONLY Occupying statuses deduct from physical inventory.
 * Non-occupying statuses NEVER reduce live availability or trigger Channex deductions.
 */
export const PMS_STATUS = {
    OCCUPYING: ['here', 'future', 'new'],
    NON_OCCUPYING: ['cancelled', 'noshow', 'unconfirmed', 'charged', 'tocharge', 'vol', 'blocked'],
    SPECIAL: 'special'
};

export const STATUS_CYCLE = [
    { val: 'new', bg: '#ec4899', txt: '#ffffff', label: 'NEW' },
    { val: 'future', bg: '#7fc6f5', txt: '#1e293b', label: 'CONFIRMED' },
    { val: 'here', bg: '#dcfce7', txt: '#14532d', label: 'CHECKED IN' },
    { val: 'left', bg: '#aba39d', txt: '#1e293b', label: 'CHECKED OUT' },
    { val: 'cancelled', bg: '#c3c5c9', txt: '#64748b', label: 'CANCELLED' },
    { val: 'noshow', bg: '#e5e7eb', txt: '#64748b', label: 'NO SHOW' },
    { val: 'special', bg: '#fef08a', txt: '#1e293b', label: 'SPECIAL' },
    { val: 'blocked', bg: '#475569', txt: '#ffffff', label: 'MAINTENANCE' },
    { val: 'tocharge', bg: '#ea580c', txt: '#ffffff', label: 'TO CHARGE' },
    { val: 'charged', bg: '#0f172a', txt: '#fbbf24', label: 'CHARGED' },
    { val: 'vol', bg: '#fbcfe8', txt: '#831843', label: 'VOLUNTEER' },
    { val: 'unconfirmed', bg: '#f3e8ff', txt: '#581c87', label: 'UNCONFIRMED' }
];

/**
 * Single Source of Truth for space occupancy.
 * @param {string} status - Reservation status string
 * @param {boolean} hasAssignedRoom - Whether physical room ID is assigned
 * @returns {boolean} True if booking physically occupies space
 */
export function isOccupyingBooking(status, hasAssignedRoom = false) {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();
    
    // Explicit non-occupying statuses
    if (PMS_STATUS.NON_OCCUPYING.includes(s)) return false;
    
    // Special bookings only occupy if a room is assigned
    if (s === PMS_STATUS.SPECIAL) return !!hasAssignedRoom;
    
    // 'here', 'future', 'new' occupy
    return PMS_STATUS.OCCUPYING.includes(s) || s === 'left';
}

if (typeof window !== 'undefined') {
    window.PMS_STATUS = PMS_STATUS;
    window.STATUS_CYCLE = STATUS_CYCLE;
    window.isOccupyingBooking = isOccupyingBooking;
}
