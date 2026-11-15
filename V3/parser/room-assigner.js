// ==========================================================================
// parser/room-assigner.js - Intelligent Room Suggestion & Event Tetris
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD } from '../core/dates.js';

/**
 * Intelligent room assignment engine:
 * 1. Matches requested room category.
 * 2. Enforces zero date collisions.
 * 3. Applies Event Tetris (groups guests with matching check-in/out during peak dates).
 * 4. Applies Dorm Clustering during standard low-season periods.
 * 5. Honors property ranking configuration if defined.
 * 6. Returns exact array of assigned room IDs. Any overflow returns as "" (Unassigned Tray).
 */
export function suggestRoomsForBooking(bookingParams) {
    const { checkIn, checkOut, bookedType, unitCount = 1 } = bookingParams;
    const hotelRooms = window.hotelRooms || [];
    const staffBookings = window.staff || [];
    const curProp = window.currentPropertyId;

    if (!checkIn || !checkOut || !bookedType || hotelRooms.length === 0) {
        return Array(unitCount).fill("");
    }

    const sIn = parseYMD(checkIn);
    const sOut = parseYMD(checkOut);

    // 1. Filter rooms matching the requested category
    const matchingRooms = hotelRooms.filter(r => {
        if (r.inactive) return false;
        const cat = (r.category || r.type || '').trim().toLowerCase();
        const target = bookedType.trim().toLowerCase();
        return cat === target || cat.includes(target) || target.includes(cat);
    });

    if (matchingRooms.length === 0) {
        return Array(unitCount).fill("");
    }

    // 2. Filter candidate rooms currently free of date collisions
    const availableRooms = matchingRooms.filter(room => {
        const hasCollision = staffBookings.some(b => {
            if (b.property !== curProp || b.status === 'cancelled' || b.status === 'noshow') return false;
            const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
            if (!rList.includes(room.id)) return false;

            const bIn = parseYMD(b.checkIn);
            const bOut = parseYMD(b.checkOut);
            return (sIn < bOut && bIn < sOut);
        });
        return !hasCollision;
    });

    if (availableRooms.length === 0) {
        return Array(unitCount).fill("");
    }

    // 3. Determine if stay falls within an active Property Event Peak
    const propertyEvents = window.currentPropertyConfig?.events || window.fmpDates || [];
    let isEventStay = false;
    for (let d = new Date(sIn); d < new Date(sOut); d.setDate(d.getDate() + 1)) {
        if (propertyEvents.includes(getLocalYMD(d))) {
            isEventStay = true;
            break;
        }
    }

    const isDormCategory = bookedType.toLowerCase().includes('dorm') || availableRooms.some(r => r.isDorm);

    // Helper: Retrieve all active roommate bookings for a candidate room
    const getRoommateBookings = (room) => {
        const parentId = room.parentRoom || (room.id.includes('№') ? room.id.split('№')[0].trim() : room.id);
        return staffBookings.filter(b => {
            if (b.property !== curProp || b.status === 'cancelled' || b.status === 'noshow') return false;
            const bIn = parseYMD(b.checkIn);
            const bOut = parseYMD(b.checkOut);
            if (sIn < bOut && bIn < sOut) {
                const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
                return rList.some(rid => rid.startsWith(parentId));
            }
            return false;
        });
    };

    // 4. Scoring Algorithm (Event Tetris vs Low-Season Clustering vs Priority Rank)
    availableRooms.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        const roommatesA = getRoommateBookings(a);
        const roommatesB = getRoommateBookings(b);

        if (isEventStay && isDormCategory) {
            // --- EVENT TETRIS SCORING ---
            // +50 points if another guest in the dorm checks out on the EXACT same day (turns room over at once)
            if (roommatesA.some(r => r.checkOut === checkOut)) scoreA += 50;
            if (roommatesB.some(r => r.checkOut === checkOut)) scoreB += 50;

            // +40 points if another guest arrives on the EXACT same day
            if (roommatesA.some(r => r.checkIn === checkIn)) scoreA += 40;
            if (roommatesB.some(r => r.checkIn === checkIn)) scoreB += 40;

            // Group into rooms with existing event bookings
            if (roommatesA.length > 0) scoreA += 20;
            if (roommatesB.length > 0) scoreB += 20;

        } else if (isDormCategory) {
            // --- LOW-SEASON DORM CLUSTERING ---
            // Fill active dorm rooms first to conserve AC and reduce multi-room cleaning
            if (roommatesA.length > 0 && roommatesB.length === 0) scoreA += 50;
            if (roommatesB.length > 0 && roommatesA.length === 0) scoreB += 50;
            if (roommatesA.length !== roommatesB.length) {
                scoreA += roommatesA.length * 10;
                scoreB += roommatesB.length * 10;
            }
        }

        // --- PROPERTY PRIORITY RANK TIE-BREAKER ---
        const rankA = a.priorityRank !== undefined ? a.priorityRank : 999;
        const rankB = b.priorityRank !== undefined ? b.priorityRank : 999;
        scoreA += (1000 - rankA);
        scoreB += (1000 - rankB);

        if (scoreA !== scoreB) {
            return scoreB - scoreA; // Highest score first
        }

        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    // 5. Allocate units (exact count; unfulfilled units return "")
    const allocated = [];
    for (let i = 0; i < unitCount; i++) {
        if (i < availableRooms.length) {
            allocated.push(availableRooms[i].id);
        } else {
            allocated.push(""); // Overflow safely routes to Unassigned Tray
        }
    }

    return allocated;
}
