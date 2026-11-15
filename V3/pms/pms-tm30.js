// ==========================================================================
// pms/pms-tm30.js - Regulatory Reporting & Thai Immigration TM.30 Generator
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getLocalYMD } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';
import { customAlert } from '../core/ui-dialogs.js';

// --- 1. Domestic Country Isolation (Non-Alien Filter) ---
export function isForeignGuest(guest, hostCountry = 'TH') {
    if (!guest.country) return true; // Treat unknown as foreigner to prompt verification
    const c = guest.country.trim().toUpperCase();
    if (hostCountry === 'TH') {
        return !['TH', 'THA', 'THAILAND', 'THAI'].includes(c);
    }
    return c !== hostCountry;
}

// --- 2. TM30 Record Compiler & Pre-Flight Validator ---
export function compileTm30Records(staffList = null, currentPropertyId = null, targetDate = null) {
    const checkDate = targetDate || document.getElementById('tm30-filter-date')?.value || getLocalYMD(new Date());
    const curProp = toCanonicalPropId(currentPropertyId || window.currentPropertyId);
    const bookings = staffList || window.staff || [];
    const hostCountry = (window.currentPropertyConfig?.country || 'TH').toUpperCase();

    const candidates = [];

    bookings.forEach(s => {
        const sProp = toCanonicalPropId(s.property);
        if (sProp !== curProp) return;
        if (['cancelled', 'noshow', 'unconfirmed'].includes(s.status)) return;

        // Check if guest checked in on target date or was in-house
        if (s.checkIn === checkDate || (s.checkIn <= checkDate && s.checkOut > checkDate)) {
            if (isForeignGuest(s, hostCountry)) {
                const missingFields = [];
                if (!s.passport && !s.passportNumber) missingFields.push('Passport No');
                if (!s.country) missingFields.push('Nationality');
                if (!s.firstName) missingFields.push('First Name');
                if (!s.lastName) missingFields.push('Last Name');

                candidates.push({
                    booking: s,
                    isReady: missingFields.length === 0,
                    missingFields: missingFields,
                    alreadyReported: !!s.tm30Reported
                });
            }
        }
    });

    return { checkDate, candidates };
}

// --- 3. TM30 UI Table Renderer ---
export function renderTm30Table() {
    const tbody = document.getElementById('tm30-body');
    const summaryEl = document.getElementById('tm30-summary-bar');
    if (!tbody) return;

    const { checkDate, candidates } = compileTm30Records();
    tbody.innerHTML = '';

    if (candidates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-bold uppercase text-xs">No foreign guests scheduled or staying on ${checkDate}.</td></tr>`;
        if (summaryEl) summaryEl.innerHTML = '';
        return;
    }

    let readyCount = 0;
    let missingCount = 0;
    let reportedCount = 0;

    candidates.forEach(item => {
        const s = item.booking;
        if (item.alreadyReported) reportedCount++;
        else if (item.isReady) readyCount++;
        else missingCount++;

        const tr = document.createElement('tr');
        tr.className = `border-b border-slate-200 hover:bg-slate-50 transition-colors text-xs ${item.alreadyReported ? 'opacity-60 bg-slate-50/50' : ''}`;

        const statusBadge = item.alreadyReported
            ? `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">REPORTED</span>`
            : (item.isReady 
                ? `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-300">READY</span>`
                : `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300" title="Missing: ${item.missingFields.join(', ')}">INCOMPLETE</span>`);

        const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
        const roomStr = rList.filter(Boolean).join(', ') || 'Unassigned';

        tr.innerHTML = `
            <td class="p-2 border-r border-slate-200 text-center">
                <input type="checkbox" value="${s.id}" class="tm30-select-box rounded border-slate-300 text-indigo-600 focus:ring-0" ${item.alreadyReported ? '' : 'checked'}>
            </td>
            <td class="p-2 border-r border-slate-200 font-bold text-slate-800 cursor-pointer hover:text-indigo-600" onclick="window.editStaff('${s.id}')">
                ${s.firstName || ''} ${s.lastName || 'Guest'}
                ${item.missingFields.length ? `<span class="text-[9px] text-rose-600 font-mono block">Missing: ${item.missingFields.join(', ')}</span>` : ''}
            </td>
            <td class="p-2 border-r border-slate-200 font-mono text-[11px]">${s.passport || s.passportNumber || '--'}</td>
            <td class="p-2 border-r border-slate-200 font-bold uppercase text-slate-600 text-[10px]">${s.country || '--'}</td>
            <td class="p-2 border-r border-slate-200 font-mono text-[11px]">${s.checkIn} &rarr; ${s.checkOut}</td>
            <td class="p-2 border-r border-slate-200 font-black text-slate-700">${roomStr}</td>
            <td class="p-2 text-center">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });

    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="flex items-center gap-4 text-xs font-bold">
                <span class="text-slate-600">Total Foreigners: <b>${candidates.length}</b></span>
                <span class="text-blue-600">Ready to File: <b>${readyCount}</b></span>
                <span class="text-rose-600">Incomplete: <b>${missingCount}</b></span>
                <span class="text-emerald-600">Previously Filed: <b>${reportedCount}</b></span>
            </div>
        `;
    }
}

// --- 4. Official Thai Immigration Bureau Section 38 Batch CSV Exporter ---
export function exportTm30Csv() {
    const selectedIds = Array.from(document.querySelectorAll('.tm30-select-box:checked') || []).map(cb => cb.value);
    if (selectedIds.length === 0) {
        return customAlert("No Selection", "Please select at least one guest record to export.");
    }

    const curProp = window.currentPropertyConfig || {};
    const hotelCode = curProp.tm30HotelCode || curProp.hotelCode || "";
    const bookings = (window.staff || []).filter(s => selectedIds.includes(s.id));

    // Official Section 38 Thai Immigration Batch Header
    const headers = [
        "RecordNo", "HotelCode", "FirstName", "MiddleName", "LastName", 
        "Gender", "NationalityCode", "PassportNo", "DateOfBirth", 
        "CheckInDate", "CheckInTime", "CheckOutDate", "RoomNo"
    ];

    const rows = [headers];

    bookings.forEach((b, idx) => {
        const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
        const cleanRoom = (rList[0] || '101').replace(/[^a-zA-Z0-9]/g, '');

        // Formats check-in date as DD/MM/YYYY for immigration portal
        const formatImmDate = (ymdStr) => {
            if (!ymdStr) return '';
            const p = ymdStr.split('-');
            return `${p[2]}/${p[1]}/${p[0]}`;
        };

        const row = [
            idx + 1,
            hotelCode,
            `"${(b.firstName || '').trim().toUpperCase()}"`,
            `"${(b.middleName || '').trim().toUpperCase()}"`,
            `"${(b.lastName || 'GUEST').trim().toUpperCase()}"`,
            b.gender || 'M',
            (b.country || 'OTH').trim().toUpperCase(),
            `"${(b.passport || b.passportNumber || '').trim().toUpperCase()}"`,
            b.dob ? formatImmDate(b.dob) : '',
            formatImmDate(b.checkIn),
            "14:00",
            formatImmDate(b.checkOut),
            `"${cleanRoom}"`
        ];
        rows.push(row);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const todayStr = getLocalYMD(new Date());

    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TM30_${hotelCode || 'IMM'}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    customAlert("Export Successful", `Generated official TM30 CSV batch file for ${bookings.length} guest(s).\n\nUpload this file directly to tm30.immigration.go.th.`);
}

// --- 5. Mark as Reported in Firestore ---
export async function markSelectedAsReported() {
    const selectedIds = Array.from(document.querySelectorAll('.tm30-select-box:checked') || []).map(cb => cb.value);
    if (selectedIds.length === 0) {
        return customAlert("No Selection", "Please select at least one guest record to mark as reported.");
    }

    customAlert(
        "Confirm Filing",
        `Mark ${selectedIds.length} guest(s) as officially filed with Immigration?`,
        true,
        async () => {
            try {
                const now = new Date().toISOString();
                for (let id of selectedIds) {
                    const bRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', id);
                    await updateDoc(bRef, {
                        tm30Reported: true,
                        tm30ReportedAt: now
                    });
                    const localBooking = (window.staff || []).find(x => x.id === id);
                    if (localBooking) {
                        localBooking.tm30Reported = true;
                        localBooking.tm30ReportedAt = now;
                    }
                }
                renderTm30Table();
                customAlert("Updated", `Marked ${selectedIds.length} reservation(s) as reported.`);
            } catch (err) {
                customAlert("Update Error", err.message);
            }
        }
    );
}

// --- 6. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.renderTm30Table = renderTm30Table;
    window.exportTm30Csv = exportTm30Csv;
    window.markTm30Reported = markSelectedAsReported;
}
