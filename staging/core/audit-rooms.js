// ==========================================================================
// core/audit-rooms.js - Read-Only Database Room Format Audit Checker
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from './config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Scans all bookings in Firestore and audits room ID formats.
 * READ-ONLY: Makes ZERO writes or modifications to the database.
 */
export async function auditDatabaseRoomFormats(propertyFilter = null) {
    console.log("%c[DB Room Auditor] Starting read-only inspection...", "color: #3b82f6; font-weight: bold;");
    
    try {
        const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
        const totalBookings = staffSnap.docs.length;
        
        let compliantCount = 0;
        let unassignedCount = 0;
        let legacyCount = 0;
        const legacyBookings = [];

        staffSnap.docs.forEach(docSnap => {
            const b = docSnap.data();
            const bProp = b.property || 'swims_resort';
            
            if (propertyFilter && bProp.toLowerCase() !== propertyFilter.toLowerCase()) {
                return;
            }

            const rList = Array.isArray(b.rooms) && b.rooms.length > 0 
                ? b.rooms 
                : (b.room ? [b.room] : []);

            if (rList.length === 0 || rList.every(r => !r || r.trim() === "")) {
                unassignedCount++;
                return;
            }

            rList.forEach(rawRoom => {
                if (!rawRoom || rawRoom.trim() === "") return;
                const r = String(rawRoom).trim();

                // Dorm bed check: Does it have the canonical '№' with 2-digit zero-padded number?
                const isDorm = /dorm|quad|bed|bunk/i.test(b.bookedType || '') || /№|C30[1-4]|-[1-4]$|^[A-D]\d{1,2}$/i.test(r);

                if (isDorm) {
                    const isCanonicalDorm = /№\s*\d{2}$/.test(r);
                    if (isCanonicalDorm) {
                        compliantCount++;
                    } else {
                        legacyCount++;
                        legacyBookings.push({
                            bookingId: b.bookId || docSnap.id,
                            guestName: `${b.firstName || ''} ${b.lastName || ''}`.trim() || 'Unknown',
                            property: bProp,
                            currentRawRoom: r,
                            suggestedCanonical: suggestCanonicalFormat(r, b.bookedType),
                            checkIn: b.checkIn || '--',
                            checkOut: b.checkOut || '--',
                            status: b.status || '--'
                        });
                    }
                } else {
                    // Private room: As long as it is a clean trimmed string without legacy shims, it is compliant
                    compliantCount++;
                }
            });
        });

        console.log(`%c[Audit Summary] ${totalBookings} Total Bookings Checked:`, "font-weight: bold;");
        console.log(`✓ Compliant assignments: ${compliantCount}`);
        console.log(`ℹ Unassigned slots (Tray): ${unassignedCount}`);
        console.log(`⚠ Non-standard / Legacy formats found: ${legacyCount}`);

        if (legacyBookings.length > 0) {
            console.warn("The following bookings contain legacy room assignment strings that should be migrated:");
            console.table(legacyBookings);
        } else {
            console.log("%c✓ All bookings conform to the canonical room standard! No migration needed.", "color: #10b981; font-weight: bold;");
        }

        return { compliantCount, unassignedCount, legacyCount, legacyBookings };

    } catch (err) {
        console.error("[DB Room Auditor Error]:", err);
    }
}

function suggestCanonicalFormat(legacyRoom, bookedType = '') {
    const r = String(legacyRoom).trim();
    
    // Pattern 1: 'C301-1' or 'C301-01' -> 'Dorm A № 01'
    const dashMatch = r.match(/^(?:C)?(\d+)[-_](\d+)$/i);
    if (dashMatch) {
        return `Room ${dashMatch[1]} № ${dashMatch[2].padStart(2, '0')}`;
    }

    // Pattern 2: 'A01' or 'B2' -> 'Dorm A № 01'
    const letterNumMatch = r.match(/^([A-Za-z])(\d{1,2})$/);
    if (letterNumMatch) {
        return `Dorm ${letterNumMatch[1].toUpperCase()} № ${letterNumMatch[2].padStart(2, '0')}`;
    }

    // Pattern 3: 'Dorm A Bed 1' -> 'Dorm A № 01'
    const bedMatch = r.match(/(.*?)(?:\s+Bed\s+|\s+Bunk\s+)(\d+)$/i);
    if (bedMatch) {
        return `${bedMatch[1].trim()} № ${bedMatch[2].padStart(2, '0')}`;
    }

    // Pattern 4: Has № but unpadded e.g. 'Dorm A № 1' -> 'Dorm A № 01'
    const unpaddedMatch = r.match(/(.*?)\s*№\s*(\d+)$/);
    if (unpaddedMatch) {
        return `${unpaddedMatch[1].trim()} № ${unpaddedMatch[2].padStart(2, '0')}`;
    }

    return `${r} (Check parent room)`;
}

// Attach to window so you can run it on demand from the DevTools console
if (typeof window !== 'undefined') {
    window.auditDatabaseRoomFormats = auditDatabaseRoomFormats;
}
