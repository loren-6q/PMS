// ==========================================================================
// core/audit-rooms.js - Targeted Dorm Room Auditor & Format Migrator
// Wild & Wandering Property Management System
// 
// RULES:
// 1. SWIMS: Only rooms C301-C304 (or 301-304) with -1, -2, -3, -4 are dorms.
//    Target: "C301 № 01" through "C304 № 04".
//    All other rooms (A, B, C1xx, C2xx, C305-C311, D) are PRIVATES.
// 2. LOUD: Dorm beds (A01, B02, Dorm A Bed 1, etc.) -> "Dorm A № 01".
// ==========================================================================

import { db, appId } from './config.js';
import { collection, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Checks if a room assignment string is a legacy dorm bed format.
 * If yes, returns the standardized canonical string.
 * If already compliant or a private room, returns null.
 */
export function getCanonicalDormId(rawRoom, property = 'swims_resort') {
    if (!rawRoom) return null;
    const r = String(rawRoom).trim();
    const prop = String(property).toLowerCase();

    // 1. SWIMS RESORT
    if (prop.includes('swims')) {
        // Already canonical: e.g. "C301 № 01" or "301 № 01"
        if (/^C?30[1-4]\s*№\s*\d{2}$/i.test(r)) {
            return null;
        }

        // SWIMS Dorms: C301-C304 (or 301-304) with -1, -2, -3, -4
        // Matches: "C301-1", "301-1", "C301 - 1", "C301-01", "302_2"
        const swimsMatch = r.match(/^C?(30[1-4])\s*[-_]\s*(\d{1,2})$/i);
        if (swimsMatch) {
            const roomNum = swimsMatch[1];
            const bedNum = String(swimsMatch[2]).padStart(2, '0');
            return `C${roomNum} № ${bedNum}`;
        }

        // Single digit unpadded №: "C301 № 1" -> "C301 № 01"
        const unpaddedMatch = r.match(/^C?(30[1-4])\s*№\s*(\d)$/i);
        if (unpaddedMatch) {
            return `C${unpaddedMatch[1]} № 0${unpaddedMatch[2]}`;
        }

        // Everything else at SWIMS (A, B, C1xx, C2xx, C305-C311, D) is PRIVATE.
        return null;
    }

    // 2. LOUD SAMUI
    if (prop.includes('loud')) {
        // Already canonical: e.g. "Dorm A № 01"
        if (/^Dorm\s+[A-Za-z]\s+№\s+\d{2}$/i.test(r)) {
            return null;
        }

        // Legacy format 1: "A01", "B04", "C12", "A1"
        const letterNumMatch = r.match(/^([A-Za-z])(\d{1,2})$/);
        if (letterNumMatch) {
            const letter = letterNumMatch[1].toUpperCase();
            const bedNum = String(letterNumMatch[2]).padStart(2, '0');
            return `Dorm ${letter} № ${bedNum}`;
        }

        // Legacy format 2: "Dorm A Bed 1", "Dorm B-2", "Dorm A 1", "Dorm A-01"
        const dormWordMatch = r.match(/^Dorm\s*([A-Za-z])(?:[-_\s]+(?:Bed\s*)?(\d{1,2}))$/i);
        if (dormWordMatch) {
            const letter = dormWordMatch[1].toUpperCase();
            const bedNum = String(dormWordMatch[2]).padStart(2, '0');
            return `Dorm ${letter} № ${bedNum}`;
        }

        // Legacy format 3: "A-1", "B-02"
        const dashMatch = r.match(/^([A-Za-z])[-_](\d{1,2})$/);
        if (dashMatch) {
            const letter = dashMatch[1].toUpperCase();
            const bedNum = String(dashMatch[2]).padStart(2, '0');
            return `Dorm ${letter} № ${bedNum}`;
        }

        return null;
    }

    return null;
}

/**
 * Read-Only Audit of bookings in Firestore.
 */
export async function auditDatabaseRoomFormats(propertyFilter = null) {
    console.log("%c[DB Room Auditor] Inspecting reservations in Firestore...", "color: #3b82f6; font-weight: bold; font-size: 13px;");
    
    try {
        const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
        const totalBookings = staffSnap.docs.length;
        
        let compliantCount = 0;
        let unassignedCount = 0;
        const migrationList = [];

        for (const docSnap of staffSnap.docs) {
            const b = docSnap.data();
            const bProp = (b.property || 'swims_resort').toLowerCase();
            
            if (propertyFilter && !bProp.includes(propertyFilter.toLowerCase())) {
                continue;
            }

            const rList = Array.isArray(b.rooms) && b.rooms.length > 0 
                ? b.rooms 
                : (b.room ? [b.room] : []);

            if (rList.length === 0 || rList.every(r => !r || String(r).trim() === "")) {
                unassignedCount++;
                continue;
            }

            for (const rawRoom of rList) {
                if (!rawRoom || String(rawRoom).trim() === "") continue;
                const canonicalDorm = getCanonicalDormId(rawRoom, bProp);

                if (canonicalDorm) {
                    migrationList.push({
                        docId: docSnap.id,
                        bookingId: b.bookId || docSnap.id,
                        guest: `${b.firstName || ''} ${b.lastName || ''}`.trim() || 'Guest',
                        property: bProp.toUpperCase(),
                        currentRoom: rawRoom,
                        newCanonicalRoom: canonicalDorm,
                        dates: `${b.checkIn || '?'} → ${b.checkOut || '?'}`
                    });
                } else {
                    compliantCount++;
                }
            }
        }

        console.log(`%c[Audit Summary] ${totalBookings} Total Bookings Inspected:`, "font-weight: bold; font-size: 13px;");
        console.log(`✓ Compliant assignments (All Privates & Canonical Dorms): ${compliantCount}`);
        console.log(`ℹ Unassigned slots (Waitlist/Tray): ${unassignedCount}`);
        console.log(`⚠ Dorm beds ready for migration: ${migrationList.length}`);

        if (migrationList.length > 0) {
            console.warn(`Preview of dorm beds ready to standardize (first 25 of ${migrationList.length}):`);
            console.table(migrationList.slice(0, 25));
            console.log("%cTo migrate these in the database, run: %cmigrateDatabaseRoomFormats(false)", "color: #64748b;", "color: #10b981; font-weight: bold;");
        } else {
            console.log("%c✓ 100% of dorm beds and private rooms are compliant!", "color: #10b981; font-weight: bold;");
        }

        return { compliantCount, unassignedCount, migrationCount: migrationList.length, migrationList };

    } catch (err) {
        console.error("[DB Room Auditor Error]:", err);
    }
}

/**
 * Updates legacy dorm strings in Firestore to canonical '№ 01'.
 * Set dryRun = false to perform live writes.
 */
export async function migrateDatabaseRoomFormats(dryRun = true) {
    if (dryRun) {
        console.log("%c[MIGRATION DRY-RUN] Checking changes (No writes will be made)...", "color: #f59e0b; font-weight: bold;");
        return auditDatabaseRoomFormats();
    }

    const confirmed = window.confirm("Are you sure you want to standardize all legacy dorm bed numbers in Firestore?");
    if (!confirmed) {
        console.log("Migration cancelled by user.");
        return;
    }

    console.log("%c[MIGRATION ACTIVE] Standardizing dorm numbers...", "color: #3b82f6; font-weight: bold;");

    try {
        const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
        const batchSize = 400;
        let currentBatch = writeBatch(db);
        let batchOpCount = 0;
        let totalUpdated = 0;

        for (const docSnap of staffSnap.docs) {
            const b = docSnap.data();
            const bProp = (b.property || 'swims_resort').toLowerCase();
            const rList = Array.isArray(b.rooms) && b.rooms.length > 0 ? b.rooms : (b.room ? [b.room] : []);

            let hasChange = false;
            const updatedRooms = rList.map(rawRoom => {
                const canonical = getCanonicalDormId(rawRoom, bProp);
                if (canonical && canonical !== rawRoom) {
                    hasChange = true;
                    return canonical;
                }
                return rawRoom;
            });

            if (hasChange) {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', docSnap.id);
                currentBatch.update(docRef, {
                    rooms: updatedRooms,
                    room: updatedRooms[0] || "",
                    lastMigratedAt: new Date().toISOString()
                });

                batchOpCount++;
                totalUpdated++;

                if (batchOpCount >= batchSize) {
                    await currentBatch.commit();
                    currentBatch = writeBatch(db);
                    batchOpCount = 0;
                    console.log(`... committed ${totalUpdated} updates`);
                }
            }
        }

        if (batchOpCount > 0) {
            await currentBatch.commit();
        }

        console.log(`%c✓ SUCCESS: Migrated ${totalUpdated} booking records to canonical '№' format!`, "color: #10b981; font-weight: bold; font-size: 14px;");
        return auditDatabaseRoomFormats();

    } catch (err) {
        console.error("[Migration Error]:", err);
    }
}

if (typeof window !== 'undefined') {
    window.auditDatabaseRoomFormats = auditDatabaseRoomFormats;
    window.migrateDatabaseRoomFormats = migrateDatabaseRoomFormats;
}
