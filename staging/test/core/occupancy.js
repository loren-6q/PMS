// ==========================================================================
// core/occupancy.js - Reservation Occupancy Rules & Net Inventory Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD } from './dates.js';

export const NON_OCCUPYING_STATUSES = new Set([
    'cancelled',
    'canceled',
    'noshow',
    'no_show',
    'unconfirmed',
    'charged'
]);

export function isOccupyingBooking(status = '', isUnassigned = false) {
    const s = String(status).toLowerCase().trim();
    if (NON_OCCUPYING_STATUSES.has(s)) return false;
    if (s === 'special' && isUnassigned) return false;
    return true;
}

/**
 * Computes net live inventory per room category over a date horizon.
 */
export function calculateLiveInventory({
    staffList = (window.staff || []),
    roomTypes = (window.roomTypes || []),
    totalRoomsByType = (window.totalRoomsByType || {}),
    hotelRooms = (window.hotelRooms || []),
    startDateYMD = getLocalYMD(new Date()),
    daysCount = 90,
    currentPropertyId = (window.currentPropertyId || '')
} = {}) {
    const startMs = parseYMD(startDateYMD) || Date.now();
    const inventory = {};

    for (let i = -7; i < daysCount; i++) {
        const curD = new Date(startMs + (i * 86400000));
        const dStr = getLocalYMD(curD);
        inventory[dStr] = {};

        const occupied = {};
        roomTypes.forEach(rt => { occupied[rt] = 0; });

        if (Array.isArray(staffList)) {
            for (let j = 0; j < staffList.length; j++) {
                const s = staffList[j];
                if (!s) continue;

                if (currentPropertyId && s.property && s.property !== currentPropertyId) {
                    continue;
                }

                const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
                const isUnassigned = rList.length === 0 || rList[0] === "";

                if (!isOccupyingBooking(s.status, isUnassigned)) continue;

                const cIn = s.checkIn || s.start || s.startDate;
                const cOut = s.checkOut || s.end || s.endDate;

                if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                    let cat = null;
                    if (!isUnassigned && rList.length > 0) {
                        const hRoom = hotelRooms.find(hr => hr.id === rList[0]);
                        if (hRoom && hRoom.type) cat = hRoom.type;
                    }
                    if (!cat) cat = s.bookedType || s.category || s.roomType;

                    if (cat) {
                        const matchedRt = roomTypes.find(rt => rt.toLowerCase() === cat.toLowerCase());
                        if (matchedRt) {
                            if (matchedRt.toLowerCase().includes('dorm')) {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + parseInt(s.pax || s.bedCount || 1, 10);
                            } else {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + Math.max(1, rList.length);
                            }
                        }
                    }
                }
            }
        }

        roomTypes.forEach(rt => {
            const cap = totalRoomsByType[rt] || 1;
            const occ = occupied[rt] || 0;
            inventory[dStr][rt] = Math.max(0, cap - occ);
        });
    }

    window.liveInventory = inventory;
    return inventory;
}

if (typeof window !== 'undefined') {
    window.isOccupyingBooking = isOccupyingBooking;
    window.calculateLiveInventory = calculateLiveInventory;
}
