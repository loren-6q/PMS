// ==========================================================================
// parser/room-assigner.js - Intelligent Room Suggestion & Event Tetris
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD } from '../core/dates.js';

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

const TIER_MODIFIERS = [
    'partial', 'side', 'semi', 'garden', 'ocean', 'sea', 'beach', 'beachfront',
    'pool', 'mountain', 'deluxe', 'standard', 'superior', 'budget', 'economy', 'family', 'suite'
];

function normalizeCategoryString(str) {
    return String(str || '').toLowerCase()
        .replace(/\b(rooms?|with|balcony|terrace|the|a|an)\b/g, '')
        .replace(/[\s\-_]+/g, '')
        .trim();
}

function hasModifierMismatch(a, b) {
    const la = String(a || '').toLowerCase();
    const lb = String(b || '').toLowerCase();
    for (const mod of TIER_MODIFIERS) {
        const re = new RegExp(`\\b${mod}`, 'i');
        if (re.test(la) !== re.test(lb)) return true;
    }
    return false;
}

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

    // 2. Exact space/filler-normalized match ("Partial Oceanview King Room" == "Partial Ocean View King")
    const normRaw = normalizeCategoryString(rawCat);
    if (normRaw) {
        for (const c of cats) {
            if (normalizeCategoryString(c) === normRaw) return c;
        }
    }

    // 3. Safe substring match (blocks modifier mismatches like Partial vs Oceanview)
    for (const c of cats) {
        if (hasModifierMismatch(rawCat, c)) continue;
        const lowerC = c.trim().toLowerCase();
        if (lowerRaw.includes(lowerC) || lowerC.includes(lowerRaw)) return c;
    }

    // 4. Safe normalized substring match
    if (normRaw) {
        for (const c of cats) {
            if (hasModifierMismatch(rawCat, c)) continue;
            const normC = normalizeCategoryString(c);
            if (normC && (normRaw.includes(normC) || normC.includes(normRaw))) {
                return c;
            }
        }
    }

    return rawCat;
}

export function suggestRoomsForBooking(bookingParams) {
    const { checkIn, checkOut, bookedType, bookedTypes, roomHintsList, unitCount = 1 } = bookingParams;
    const rawRooms = (window.hotelRooms && window.hotelRooms.length)
        ? window.hotelRooms
        : (window.rooms || window.currentPropertyConfig?.rooms || []);

    const staffBookings = window.staff || [];
    
    const rawProp = window.currentPropertyId;
    const curProp = window.toCanonicalPropId ? window.toCanonicalPropId(rawProp) : (rawProp || '');

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

    const sIn = parseYMD(checkIn);
    const sOut = parseYMD(checkOut);

    // Precompute occupied room IDs (uppercase)
    const occupiedSet = new Set();
    staffBookings.forEach(b => {
        const bProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
        if (bProp !== curProp) return;

        const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
        const isUnassigned = rList.length === 0 || rList[0] === "";
        const isOccupying = window.isOccupyingBooking
            ? window.isOccupyingBooking(b.status, isUnassigned)
            : (b.status !== 'cancelled' && b.status !== 'noshow');

        if (!isOccupying) return;

        if (sIn < parseYMD(b.checkOut) && parseYMD(b.checkIn) < sOut) {
            rList.forEach(rid => {
                if (rid) occupiedSet.add(String(rid).trim().toUpperCase());
            });
        }
    });

    const propertyEvents = window.currentPropertyConfig?.events || window.fmpDates || [];
    let isEventStay = false;
    for (let d = new Date(sIn); d < new Date(sOut); d.setDate(d.getDate() + 1)) {
        if (propertyEvents.includes(getLocalYMD(d))) {
            isEventStay = true;
            break;
        }
    }

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

    const availableCategories = [...new Set(
        hotelRooms.flatMap(r => [r.category, r.type]).filter(Boolean)
    )];

    const alreadyClaimedInBooking = new Set();
    const allocated = [];

    for (let i = 0; i < unitCount; i++) {
        const rawTarget = slotTargets[i] || "";
        const slotHints = (Array.isArray(roomHintsList) && Array.isArray(roomHintsList[i]))
            ? roomHintsList[i].map(h => String(h).trim().toUpperCase())
            : [];

        let matchingRooms = [];

        // 1. Strict match against the resolved canonical PMS category
        if (rawTarget) {
            const matchedCat = matchCategoryName(rawTarget, availableCategories);
            const resolvedLower = matchedCat.trim().toLowerCase();
            const resolvedNorm = normalizeCategoryString(matchedCat);

            matchingRooms = hotelRooms.filter(r => {
                const c1 = (r.category || '').trim().toLowerCase();
                const c2 = (r.type || '').trim().toLowerCase();
                if (c1 === resolvedLower || c2 === resolvedLower) return true;
                if (resolvedNorm) {
                    if (c1 && !hasModifierMismatch(matchedCat, c1) && normalizeCategoryString(c1) === resolvedNorm) return true;
                    if (c2 && !hasModifierMismatch(matchedCat, c2) && normalizeCategoryString(c2) === resolvedNorm) return true;
                }
                return false;
            });
        }

        // 2. Fallback: Match directly via parenthetical room number hints
        if (matchingRooms.length === 0 && slotHints.length > 0) {
            const hintSet = new Set(slotHints);
            matchingRooms = hotelRooms.filter(r => hintSet.has(String(r.id).trim().toUpperCase()));
        }

        if (matchingRooms.length === 0) {
            allocated.push("");
            continue;
        }

        // 3. Filter candidate rooms free of date collisions and not yet claimed by an earlier slot
        const availableRooms = matchingRooms.filter(room => {
            const upperId = String(room.id).trim().toUpperCase();
            if (alreadyClaimedInBooking.has(upperId)) return false;
            return !occupiedSet.has(upperId);
        });

        if (availableRooms.length === 0) {
            allocated.push("");
            continue;
        }

        const isDormCategory = rawTarget.toLowerCase().includes('dorm') || availableRooms.some(r => r.isDorm);

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
        alreadyClaimedInBooking.add(String(chosen.id).trim().toUpperCase());
        allocated.push(chosen.id);
    }

    return allocated;
}

if (typeof window !== 'undefined') {
    window.suggestRoomsForBooking = suggestRoomsForBooking;
    window.matchCategoryName = matchCategoryName;
}
