// ==========================================================================
// parser/room-assigner.js - Intelligent Room Suggestion & Event Tetris
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD } from '../core/dates.js';

// --- Helper: Extract Base Room ID (e.g., "303-1" -> "303", "303 № 2" -> "303") ---
export function getBaseRoomId(roomOrId) {
    if (!roomOrId) return '';
    if (typeof roomOrId === 'object') {
        if (roomOrId.parentRoom) return roomOrId.parentRoom;
        if (roomOrId.baseRoom) return roomOrId.baseRoom;
        roomOrId = roomOrId.id || '';
    }
    const str = String(roomOrId).trim();
    if (str.includes('№')) return str.split('№')[0].trim();
    const dashMatch = str.match(/^([A-Za-z0-9]+)[-_]/);
    if (dashMatch) return dashMatch[1];
    return str.replace(/\s*(?:bed|bunk).*$/i, '').trim();
}

export function suggestRoomsForBooking(bookingParams) {
    const { checkIn, checkOut, bookedType, unitCount = 1 } = bookingParams;
    const hotelRooms = window.hotelRooms || [];
    const staffBookings = window.staff || [];
    
    // Canonical Property ID matching
    const rawProp = window.currentPropertyId;
    const curProp = window.toCanonicalPropId ? window.toCanonicalPropId(rawProp) : (rawProp || '');

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
            const bProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
            if (bProp !== curProp || b.status === 'cancelled' || b.status === 'noshow') return false;
            
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

    // Retrieve active roommate bookings in the same physical dorm room
    const getRoommateBookings = (room) => {
        const baseRoom = getBaseRoomId(room);
        return staffBookings.filter(b => {
            const bProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
            if (bProp !== curProp || b.status === 'cancelled' || b.status === 'noshow') return false;
            
            const bIn = parseYMD(b.checkIn);
            const bOut = parseYMD(b.checkOut);
            if (sIn < bOut && bIn < sOut) {
                const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
                return rList.some(rid => getBaseRoomId(rid) === baseRoom);
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
            if (roommatesA.some(r => r.checkOut === checkOut)) scoreA += 500;
            if (roommatesB.some(r => r.checkOut === checkOut)) scoreB += 500;

            if (roommatesA.some(r => r.checkIn === checkIn)) scoreA += 400;
            if (roommatesB.some(r => r.checkIn === checkIn)) scoreB += 400;

            if (roommatesA.length > 0) scoreA += 200;
            if (roommatesB.length > 0) scoreB += 200;

        } else if (isDormCategory) {
            // --- LOW-SEASON DORM CLUSTERING ---
            // Pack occupied dorm rooms (+500 pts) to conserve AC and reduce cleaning
            if (roommatesA.length > 0 && roommatesB.length === 0) scoreA += 500;
            if (roommatesB.length > 0 && roommatesA.length === 0) scoreB += 500;
            if (roommatesA.length !== roommatesB.length) {
                scoreA += roommatesA.length * 50;
                scoreB += roommatesB.length * 50;
            }
        }

        // --- PROPERTY PRIORITY RANK TIE-BREAKER (0 to 99 pts) ---
        const rankA = a.priorityRank !== undefined ? a.priorityRank : 99;
        const rankB = b.priorityRank !== undefined ? b.priorityRank : 99;
        scoreA += Math.max(0, 100 - rankA);
        scoreB += Math.max(0, 100 - rankB);

        if (scoreA !== scoreB) {
            return scoreB - scoreA; // Highest score first
        }

        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    // 5. Allocate units
    const allocated = [];
    for (let i = 0; i < unitCount; i++) {
        if (i < availableRooms.length) {
            allocated.push(availableRooms[i].id);
        } else {
            allocated.push("");
        }
    }

    return allocated;
}

if (typeof window !== 'undefined') {
    window.suggestRoomsForBooking = suggestRoomsForBooking;
}
