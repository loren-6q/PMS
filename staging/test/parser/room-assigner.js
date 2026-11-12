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

// --- Helper: Fuzzy Match OTA Category Name to Active PMS Category ---
export function matchCategoryName(rawCat, availableCategories = []) {
    if (!rawCat || !Array.isArray(availableCategories) || availableCategories.length === 0) {
        return rawCat;
    }

    const cats = [...new Set(availableCategories.filter(Boolean))].sort((a, b) => b.length - a.length);
    const lowerRaw = rawCat.trim().toLowerCase();

    // 1. Exact case-insensitive match
    for (const c of cats) {
        if (c.trim().toLowerCase() === lowerRaw) return c;
    }

    // 2. Substring match ("gardenview twin room" includes "gardenview twin")
    for (const c of cats) {
        const lowerC = c.trim().toLowerCase();
        if (lowerRaw.includes(lowerC) || lowerC.includes(lowerRaw)) return c;
    }

    // 3. Space/hyphen/filler-word normalized match ("Gardenview Twin Room" -> "Garden View Twin")
    const normalize = (s) => s.toLowerCase()
        .replace(/\b(rooms?|with|balcony|terrace|the|a|an)\b/g, '')
        .replace(/[\s\-_]+/g, '');

    const normRaw = normalize(rawCat);
    if (normRaw) {
        for (const c of cats) {
            const normC = normalize(c);
            if (normC && (normRaw === normC || normRaw.includes(normC) || normC.includes(normRaw))) {
                return c;
            }
        }
    }

    return rawCat;
}

export function suggestRoomsForBooking(bookingParams) {
    const { checkIn, checkOut, bookedType, bookedTypes, unitCount = 1 } = bookingParams;
    const rawRooms = (window.hotelRooms && window.hotelRooms.length)
        ? window.hotelRooms
        : (window.rooms || window.currentPropertyConfig?.rooms || []);

    const staffBookings = window.staff || [];
    
    // Canonical Property ID matching
    const rawProp = window.currentPropertyId;
    const curProp = window.toCanonicalPropId ? window.toCanonicalPropId(rawProp) : (rawProp || '');

    // Filter rooms to active property if property tag exists on room objects
    const hotelRooms = rawRooms.filter(r => {
        if (r.inactive) return false;
        if (r.property && curProp) {
            const rProp = window.toCanonicalPropId ? window.toCanonicalPropId(r.property) : r.property;
            return rProp === curProp;
        }
        return true;
    });

    if (!checkIn || !checkOut || hotelRooms.length === 0) {
        return Array(unitCount).fill("");
    }

    // Build per-slot category targets (supports multi-room mixed categories)
    const slotTargets = [];
    for (let i = 0; i < unitCount; i++) {
        if (Array.isArray(bookedTypes) && bookedTypes[i]) {
            slotTargets.push(bookedTypes[i]);
        } else if (bookedType) {
            slotTargets.push(bookedType);
        } else {
            slotTargets.push("");
        }
    }

    if (slotTargets.every(t => !t)) {
        return Array(unitCount).fill("");
    }

    const sIn = parseYMD(checkIn);
    const sOut = parseYMD(checkOut);

    // Determine if stay falls within an active Property Event Peak
    const propertyEvents = window.currentPropertyConfig?.events || window.fmpDates || [];
    let isEventStay = false;
    for (let d = new Date(sIn); d < new Date(sOut); d.setDate(d.getDate() + 1)) {
        if (propertyEvents.includes(getLocalYMD(d))) {
            isEventStay = true;
            break;
        }
    }

    // Helper: Retrieve active roommate bookings in the same physical dorm room
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

    const availableCategories = [...new Set(hotelRooms.map(r => r.category || r.type).filter(Boolean))];
    const alreadyClaimedInBooking = new Set();
    const allocated = [];

    for (let i = 0; i < unitCount; i++) {
        const rawTarget = slotTargets[i];
        if (!rawTarget) {
            allocated.push("");
            continue;
        }

        const resolvedTarget = matchCategoryName(rawTarget, availableCategories).trim().toLowerCase();

        // 1. Filter rooms matching this slot's category
        const matchingRooms = hotelRooms.filter(r => {
            const cat = (r.category || r.type || '').trim().toLowerCase();
            return cat === resolvedTarget || cat.includes(resolvedTarget) || resolvedTarget.includes(cat);
        });

        if (matchingRooms.length === 0) {
            allocated.push("");
            continue;
        }

        // 2. Filter candidate rooms free of date collisions AND not already claimed by an earlier slot in this booking
        const availableRooms = matchingRooms.filter(room => {
            if (alreadyClaimedInBooking.has(room.id)) return false;

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
            allocated.push("");
            continue;
        }

        const isDormCategory = resolvedTarget.includes('dorm') || availableRooms.some(r => r.isDorm);

        // 3. Score candidate rooms
        availableRooms.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            const roommatesA = getRoommateBookings(a);
            const roommatesB = getRoommateBookings(b);

            if (isEventStay && isDormCategory) {
                if (roommatesA.some(r => r.checkOut === checkOut)) scoreA += 500;
                if (roommatesB.some(r => r.checkOut === checkOut)) scoreB += 500;

                if (roommatesA.some(r => r.checkIn === checkIn)) scoreA += 400;
                if (roommatesB.some(r => r.checkIn === checkIn)) scoreB += 400;

                if (roommatesA.length > 0) scoreA += 200;
                if (roommatesB.length > 0) scoreB += 200;
            } else if (isDormCategory) {
                if (roommatesA.length > 0 && roommatesB.length === 0) scoreA += 500;
                if (roommatesB.length > 0 && roommatesA.length === 0) scoreB += 500;
                if (roommatesA.length !== roommatesB.length) {
                    scoreA += roommatesA.length * 50;
                    scoreB += roommatesB.length * 50;
                }
            }

            const rankA = a.priorityRank !== undefined ? a.priorityRank : 99;
            const rankB = b.priorityRank !== undefined ? b.priorityRank : 99;
            scoreA += Math.max(0, 100 - rankA);
            scoreB += Math.max(0, 100 - rankB);

            if (scoreA !== scoreB) {
                return scoreB - scoreA;
            }

            return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
        });

        const chosen = availableRooms[0];
        alreadyClaimedInBooking.add(chosen.id);
        allocated.push(chosen.id);
    }

    return allocated;
}

if (typeof window !== 'undefined') {
    window.suggestRoomsForBooking = suggestRoomsForBooking;
    window.matchCategoryName = matchCategoryName;
}
