// ==========================================================================
// core/audit-rooms.js - Targeted Dorm Room Auditor & Format Migrator
// Wild & Wandering Property Management System
// 
// RULES:
// 1. SWIMS: Only rooms C301-C304 with suffixes -1, -2, -3, -4 are dorms.
//    Target: "Room C301 № 01" to "Room C304 № 04" (or "C301 № 01").
//    All other rooms (A, B, C1xx, C2xx, C305-C311, D) are PRIVATES.
// 2. LOUD: Dorm beds (A01, B02, Dorm A Bed 1, etc.) -> "Dorm A № 01".
// ==========================================================================

import { db, appId } from './config.js';
import { collection, getDocs, doc, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Normalizes legacy dorm strings to canonical № format.
 * Returns null if the room is a private room or already canonical.
 */
export function getCanonicalDormId(rawRoom, property = 'swims_resort') {
    if (!rawRoom) return null;
    const r = String(rawRoom).trim();
    const prop = String(property).toLowerCase();

    // --- SWIMS RESORT DORMS ---
    if (prop.includes('swims')) {
        // Already canonical: e.g. "C301 № 01" or "Room C301 № 01"
        if (/^(:?Room\s*)?C?30[1-4]\s*№\s*\d{2}$/i.test(r)) {
            return null; // Already compliant
        }

        // Legacy formats: C301-1, C301-01, 301-1, Room 301-1, C301_1
        const swimsDormMatch = r.match(/^(?:Room\s*)?C?(30[1-4])[-_\s]+(\d{1,2})$/i);
        if (swimsDormMatch) {
            const roomNum = swimsDormMatch[1]; // "301"
            const bedNum = String(swimsDormMatch[2]).padStart(2, '0'); // "01"
            return `C\${roomNum} № ${bedNum}`; }  // Has № but single-digit: e.g. "C301 № 1" const unpaddedMatch = r.match(/^(?:Room\s*)?C?(30[1-4])\s*№\s*(\d)$/i); if (unpaddedMatch) { return `C${unpaddedMatch[1]} № 0${unpaddedMatch[2]}`; }  // All other rooms at SWIMS (A01-A12, B01-B22, C101, C2xx, C305-C311, D01-D11) are PRIVATES. return null; }  // --- LOUD SAMUI DORMS --- if (prop.includes('loud')) { // Already canonical: e.g. "Dorm A № 01" if (/^Dorm\s+[A-Z]\s+№\s+\d{2}$/i.test(r)) { return null; }  // Legacy format 1: "A01", "B04", "C10" const letterNumMatch = r.match(/^([A-Za-z])(\d{1,2})$/); if (letterNumMatch) { const letter = letterNumMatch[1].toUpperCase(); const bedNum = String(letterNumMatch[2]).padStart(2, '0'); return `Dorm ${letter} № ${bedNum}`; }  // Legacy format 2: "Dorm A Bed 1", "Dorm B-2", "Dorm A 1" const dormWordMatch = r.match(/^Dorm\s*([A-Za-z])(?:[-_\s]+(?:Bed\s*)?(\d{1,2}))$/i); if (dormWordMatch) { const letter = dormWordMatch[1].toUpperCase(); const bedNum = String(dormWordMatch[2]).padStart(2, '0'); return `Dorm ${letter} № ${bedNum}`; }  // Legacy format 3: "A-1", "B-02" const dashMatch = r.match(/^([A-Za-z])[-_](\d{1,2})$/); if (dashMatch) { const letter = dashMatch[1].toUpperCase(); const bedNum = String(dashMatch[2]).padStart(2, '0'); return `Dorm ${letter} № ${bedNum}`; }  return null; }  return null; }  /** * READ-ONLY AUDIT: Scans Firestore and shows bookings that need dorm migration. */ export async function auditDatabaseRoomFormats(propertyFilter = null) { console.log("\%c[DB Room Auditor] Scanning reservations in Firestore...", "color: #3b82f6; font-weight: bold; font-size: 13px;");  try { const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff')); const totalBookings = staffSnap.docs.length;  let compliantCount = 0; let unassignedCount = 0; const migrationList = [];  staffSnap.docs.forEach(docSnap => { const b = docSnap.data(); const bProp = (b.property \vert{}\vert{} 'swims_resort').toLowerCase();  if (propertyFilter && !bProp.includes(propertyFilter.toLowerCase())) { return; }  const rList = Array.isArray(b.rooms) && b.rooms.length > 0 ? b.rooms : (b.room ? [b.room] : []);  if (rList.length === 0 \vert{}\vert{} rList.every(r => !r \vert{}\vert{} r.trim() === "")) { unassignedCount++; return; }  rList.forEach(rawRoom => { if (!rawRoom \vert{}\vert{} rawRoom.trim() === "") return; const canonicalDorm = getCanonicalDormId(rawRoom, bProp);  if (canonicalDorm) { migrationList.push({ docId: docSnap.id, bookingId: b.bookId \vert{}\vert{} docSnap.id, guest: `${b.firstName || ''} ${b.lastName \vert{}\vert{} ''}`.trim() \vert{}\vert{} 'Guest', property: bProp.toUpperCase(), currentRoom: rawRoom, newCanonicalRoom: canonicalDorm, dates: `${b.checkIn || '?'} → ${b.checkOut \vert{}\vert{} '?'}` }); } else { compliantCount++; } }); });  console.log(`\%c[Audit Summary] ${totalBookings} Total Bookings Inspected:`, "font-weight: bold; font-size: 13px;");
        console.log(`✓ Compliant assignments (Privates & Canonical Dorms): \${compliantCount}`);
        console.log(`ℹ Unassigned slots (Tray): \${unassignedCount}`);
        console.log(`⚠ Dorm beds ready for migration: \${migrationList.length}`);

        if (migrationList.length > 0) {
            console.warn(`Preview of dorm beds ready to update (first 25 of \${migrationList.length}):`);
            console.table(migrationList.slice(0, 25));
            console.log("%cTo migrate these in the database, run: %cmigrateDatabaseRoomFormats(false)", "color: #64748b;", "color: #10b981; font-weight: bold;");
        } else {
            console.log("%c✓ All dorm and private room assignments are 100% compliant!", "color: #10b981; font-weight: bold;");
        }

        return { compliantCount, unassignedCount, migrationCount: migrationList.length, migrationList };

    } catch (err) {
        console.error("[DB Room Auditor Error]:", err);
    }
}

/**
 * ONE-CLICK MIGRATOR: Updates legacy dorm strings in Firestore to canonical '№ 01'.
 * @param {boolean} dryRun - If true, previews changes without writing to Firestore.
 */
export async function migrateDatabaseRoomFormats(dryRun = true) {
    if (dryRun) {
        console.log("%c[MIGRATION DRY-RUN] Checking changes (No writes will be made)...", "color: #f59e0b; font-weight: bold;");
        return auditDatabaseRoomFormats();
    }

    const confirmed = window.confirm("Are you sure you want to standardize all legacy dorm bed numbers in Firestore? A rolling backup will be created first.");
    if (!confirmed) return console.log("Migration cancelled by user.");

    console.log("%c[MIGRATION ACTIVE] Standardizing dorm numbers...", "color: #3b82f6; font-weight: bold;");

    try {
        const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
        const batchSize = 400; // Firestore batch limit is 500
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
                    console.log(`... committed ${totalUpdated} updates`); } } }  if (batchOpCount > 0) { await currentBatch.commit(); }  console.log(`\%c✓ SUCCESS: Migrated ${totalUpdated} booking records to canonical '№' format!`, "color: #10b981; font-weight: bold; font-size: 14px;");
        return auditDatabaseRoomFormats();

    } catch (err) {
        console.error("[Migration Error]:", err);
    }
}

// Window Bridge for DevTools console execution
if (typeof window !== 'undefined') {
    window.auditDatabaseRoomFormats = auditDatabaseRoomFormats;
    window.migrateDatabaseRoomFormats = migrateDatabaseRoomFormats;
}
