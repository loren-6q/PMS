// ==========================================================================
// pms/pms-bulk-import.js - Rescued Spreadsheet & CSV Bulk Import Engine
// Wild & Wandering Property Management System
// 
// Launch via DevTools: openBulkImporter()
// Launch via Keyboard: Ctrl + Alt + B
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';
import { getLocalYMD, parseYMD } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';

// --- 1. Importer Modal Lifecycle ---
export function openBulkImporter() {
    let modal = document.getElementById('bulk-import-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulk-import-modal';
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border-2 border-slate-800 flex flex-col">
                <div class="bg-slate-900 text-white p-3 font-black uppercase text-xs flex justify-between items-center">
                    <span>Spreadsheet Bulk Import Engine</span>
                    <button type="button" onclick="document.getElementById('bulk-import-modal').classList.add('hidden')" class="cursor-pointer text-slate-400 hover:text-white">&times;</button>
                </div>
                <div class="p-4 space-y-2 text-xs">
                    <p class="font-bold text-slate-600">Copy & paste rows directly from Excel or Google Sheets. <span class="text-rose-600 font-black">Header row required.</span></p>
                    <textarea id="bulk-paste-text" rows="10" class="w-full bg-slate-50 border border-slate-300 rounded font-mono text-[11px] p-2 outline-none focus:ring-2 focus:ring-indigo-500 whitespace-pre" placeholder="Reservation Number\tArrival\tDeparture\tGuest Name\tRoom\tTotal..."></textarea>
                    <div id="bulk-import-log" class="text-[11px] font-mono text-emerald-700 max-h-24 overflow-y-auto"></div>
                </div>
                <div class="p-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
                    <button type="button" onclick="document.getElementById('bulk-import-modal').classList.add('hidden')" class="px-3 py-1 bg-slate-200 text-slate-700 font-black rounded uppercase text-xs cursor-pointer">Close</button>
                    <button type="button" onclick="window.processSpreadsheetPaste()" class="px-4 py-1 bg-indigo-600 text-white font-black rounded uppercase text-xs shadow-xs cursor-pointer">Execute Import</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

// --- 2. Spreadsheet Ingestion & Normalizer ---
export async function processSpreadsheetPaste() {
    const rawText = document.getElementById('bulk-paste-text')?.value.trim();
    const logEl = document.getElementById('bulk-import-log');
    if (!rawText) return customAlert("Input Required", "Paste rows including headers into the box first.");

    const curPropRaw = window.currentPropertyId;
    if (!curPropRaw) {
        return customAlert("No Property", "No active property selected. Cannot import reservations.");
    }
    const curProp = toCanonicalPropId(curPropRaw);

    const delim = rawText.includes('\t') ? '\t' : ',';
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return customAlert("Invalid Data", "Include at least 1 header row and 1 data row.");

    const headers = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const getIdx = (keywords) => {
        for (let k of keywords) {
            const i = headers.findIndex(h => h.includes(k));
            if (i > -1) return i;
        }
        return -1;
    };

    const idx = {
        name: getIdx(['guest name', 'guest', 'name', 'customer']),
        in: getIdx(['check-in', 'arrival', 'in', 'start']),
        out: getIdx(['check-out', 'departure', 'out', 'end']),
        bookId: getIdx(['reservation number', 'booking id', 'reference', 'book number', 'conf']),
        room: getIdx(['room', 'unit', 'bed', 'dorm']),
        total: getIdx(['total', 'price', 'amount', 'rate']),
        source: getIdx(['source', 'channel', 'ota'])
    };

    if (idx.name === -1 || idx.in === -1) {
        return customAlert("Headers Missing", "Could not locate 'Guest Name' and 'Check-in' column headers.");
    }

    // Helper: Normalize date strings (supports YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
    const normalizeDate = (dStr) => {
        if (!dStr) return '';
        const clean = dStr.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
        const slashParts = clean.split(/[\/\-\.]/);
        if (slashParts.length === 3) {
            // If year is first: YYYY/MM/DD
            if (slashParts[0].length === 4) {
                return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
            }
            // Assume DD/MM/YYYY
            return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
        }
        return clean;
    };

    let successCount = 0;
    let skippedCount = 0;
    const activeRooms = (window.hotelRooms || []).map(r => r.id);
    const affectedCategories = new Set();
    let earliestIn = '9999-99-99';
    let latestOut = '0000-00-00';

    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
        const fullName = cells[idx.name] || 'Guest';
        const rawIn = cells[idx.in] || '';
        const rawOut = idx.out > -1 ? cells[idx.out] : '';
        const checkIn = normalizeDate(rawIn);
        let checkOut = normalizeDate(rawOut);

        // Fallback: If checkout missing or invalid, default to 1 night
        if (!checkOut || checkOut <= checkIn) {
            const inT = parseYMD(checkIn);
            if (!isNaN(inT)) {
                checkOut = getLocalYMD(new Date(inT + 86400000));
            } else {
                skippedCount++;
                continue;
            }
        }

        const bookId = idx.bookId > -1 ? cells[idx.bookId] : '';
        let room = idx.room > -1 ? cells[idx.room].toUpperCase() : '';
        
        // If assigned room doesn't exist in active inventory, route to Unassigned Tray
        if (room && !activeRooms.includes(room)) {
            room = ""; // Moves to unassigned tray to prevent orphaned invisible booking
        }

        const total = idx.total > -1 ? parseFloat(cells[idx.total].replace(/[^0-9.]/g, '')) || 0 : 0;
        const source = idx.source > -1 ? cells[idx.source].toLowerCase() : 'direct';

        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || 'GUEST';

        const id = 'bk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const booking = {
            id,
            property: curProp,
            firstName,
            lastName,
            checkIn,
            checkOut,
            room: room || '',
            rooms: room ? [room] : [],
            totalPrice: total,
            netPrice: Number((total * 0.82).toFixed(2)),
            bookId,
            source,
            status: 'future',
            payments: [],
            extraCharges: [],
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), booking);
        successCount++;

        if (checkIn < earliestIn) earliestIn = checkIn;
        if (checkOut > latestOut) latestOut = checkOut;
        if (room) {
            const hr = (window.hotelRooms || []).find(r => r.id === room);
            if (hr?.category) affectedCategories.add(hr.category);
        }
    }

    // Trigger Channex Auto-Sync across affected ranges
    if (successCount > 0 && typeof window.triggerAutoSync === 'function') {
        window.triggerAutoSync(earliestIn, latestOut, Array.from(affectedCategories));
    }

    if (logEl) {
        logEl.innerText = `✓ Imported ${successCount} booking(s) into ${curProp.toUpperCase()}.${skippedCount ? ` (${skippedCount} skipped due to bad dates)` : ''}`;
    }
    customAlert("Import Complete", `Loaded ${successCount} reservations.`);
}

// --- 3. Global Hotkey & Window Bridge ---
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        openBulkImporter();
    }
});

if (typeof window !== 'undefined') {
    window.openBulkImporter = openBulkImporter;
    window.processSpreadsheetPaste = processSpreadsheetPaste;
}
