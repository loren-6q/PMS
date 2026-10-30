// ==========================================================================
// pms/pms-database.js - Tabular Guest Database Ledger & Multi-Filters
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDue, getPaid } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';

let dbSortKey = "checkIn";
let dbSortAsc = false;

export function toggleMultiSelect(dropdownId, triggerBtn) {
    if (window.event) window.event.stopPropagation();
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden') || dropdown.style.display === 'none';
    document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.classList.add('hidden');
        d.style.display = 'none';
    });

    if (isHidden) {
        const rect = triggerBtn.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.top = (rect.bottom + window.scrollY + 2) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.width = Math.max(rect.width, 160) + 'px';
        dropdown.classList.remove('hidden');
        dropdown.style.display = 'block';
    }
}

export function updateMultiLabel(dropdownId, labelId, defaultText) {
    const checked = document.querySelectorAll(`#${dropdownId} input[type="checkbox"]:checked`);
    const label = document.getElementById(labelId);
    if (!label) return;
    if (checked.length === 0) label.innerText = defaultText;
    else if (checked.length === 1) label.innerText = checked[0].parentNode.textContent.trim().toUpperCase();
    else label.innerText = `${checked.length} SELECTED`;
}

export function getMultiValues(dropdownId) {
    return Array.from(document.querySelectorAll(`#${dropdownId} input[type="checkbox"]:checked`) || []).map(cb => cb.value);
}

export function applyDbPreset(presetVal) {
    const today = new Date();
    const ymd = (d) => {
        const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        return o.toISOString().split('T')[0];
    };

    let start = '', end = '';
    if (presetVal === 'today') {
        start = ymd(today); end = start;
    } else if (presetVal === 'tomorrow') {
        const tmrw = new Date(today); tmrw.setDate(today.getDate() + 1);
        start = ymd(tmrw); end = start;
    } else if (presetVal === 'this_week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const sDate = new Date(today.setDate(diff));
        start = ymd(sDate);
        const eDate = new Date(sDate); eDate.setDate(sDate.getDate() + 6);
        end = ymd(eDate);
    } else if (presetVal === 'this_month') {
        start = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
        end = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    }

    const startEl = document.getElementById('db-filter-start');
    const endEl = document.getElementById('db-filter-end');
    if (startEl) startEl.value = start;
    if (endEl) endEl.value = end;
    renderDatabaseTable();
}

export function getFilteredBookings(staffList = [], currentPropertyId = 'swims_resort') {
    const nameFilter = (document.getElementById('db-filter-name')?.value || '').trim().toUpperCase();
    const sourceFilters = getMultiValues('db-source-dropdown');
    const statusFilters = getMultiValues('db-status-dropdown');
    const roomFilters = getMultiValues('db-room-dropdown');
    const startStr = document.getElementById('db-filter-start')?.value || '';
    const endStr = document.getElementById('db-filter-end')?.value || '';
    const minPrice = parseFloat(document.getElementById('db-filter-min')?.value) || 0;
    const maxPrice = parseFloat(document.getElementById('db-filter-max')?.value) || Infinity;
    const dueFilter = document.getElementById('db-filter-due')?.value || '';

    return (staffList || []).filter(s => {
        const prop = (s.property || 'swims_resort').toLowerCase();
        if (prop !== currentPropertyId.toLowerCase()) return false;

        if (statusFilters.length > 0 && !statusFilters.includes(s.status)) return false;
        if (sourceFilters.length > 0 && !sourceFilters.includes(s.source)) return false;

        const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toUpperCase();
        const bId = (s.bookId || '').toUpperCase();
        if (nameFilter && !fullName.includes(nameFilter) && !bId.includes(nameFilter)) return false;

        if (startStr && s.checkOut <= startStr) return false;
        if (endStr && s.checkIn >= endStr) return false;

        const due = getDue(s);
        if (dueFilter === 'zero' && due > 0) return false;
        if (dueFilter === 'owes' && due <= 0) return false;

        const total = Number(s.totalPrice || 0);
        if (total < minPrice || total > maxPrice) return false;

        if (roomFilters.length > 0) {
            const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
            const hasMatch = rList.some(r => roomFilters.includes(r));
            const hasUnassigned = roomFilters.includes('UNASSIGNED') && (rList.length === 0 || rList[0] === "");
            if (!hasMatch && !hasUnassigned) return false;
        }

        return true;
    }).sort((a, b) => {
        let vA = a[dbSortKey] || '';
        let vB = b[dbSortKey] || '';

        if (dbSortKey === 'name') {
            vA = `${a.firstName || ''} ${a.lastName || ''}`.toUpperCase();
            vB = `${b.firstName || ''} ${b.lastName || ''}`.toUpperCase();
        } else if (dbSortKey === 'totalPrice') {
            vA = Number(a.totalPrice || 0);
            vB = Number(b.totalPrice || 0);
        } else if (dbSortKey === 'due') {
            vA = getDue(a);
            vB = getDue(b);
        } else if (dbSortKey === 'paid') {
            vA = getPaid(a);
            vB = getPaid(b);
        } else if (dbSortKey === 'room') {
            vA = a.rooms?.[0] || a.room || 'ZZZ';
            vB = b.rooms?.[0] || b.room || 'ZZZ';
        }

        if (vA < vB) return dbSortAsc ? -1 : 1;
        if (vA > vB) return dbSortAsc ? 1 : -1;
        return 0;
    });
}

export function renderDatabaseTable() {
    const tbody = document.getElementById('database-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const records = getFilteredBookings(window.staff || [], window.currentPropertyId || 'swims_resort');

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 font-bold uppercase text-xs">No matching reservations found.</td></tr>`;
        return;
    }

    records.forEach(s => {
        const due = getDue(s);
        const paid = getPaid(s);
        const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
        const assigned = rList.filter(Boolean).join(', ') || '--';

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-xs";
        tr.dataset.recordId = s.id;
        tr.onclick = () => {
            if (typeof window.editStaff === 'function') window.editStaff(s.id);
        };

        tr.innerHTML = `
            <td class="p-2 border-r border-slate-200 font-bold text-slate-800">
                ${s.firstName || ''} ${s.lastName || 'Guest'}
                ${s.bookId ? `<span class="text-[9px] text-slate-400 font-mono block">${s.bookId}</span>` : ''}
            </td>
            <td class="p-2 border-r border-slate-200 uppercase font-bold text-slate-600 text-[10px]">${s.source || 'direct'}</td>
            <td class="p-2 border-r border-slate-200 font-mono text-[11px]">${s.checkIn || '?'} &rarr; ${s.checkOut || '?'}</td>
            <td class="p-2 border-r border-slate-200 font-black text-slate-700">${assigned}</td>
            <td class="p-2 border-r border-slate-200 text-right font-black font-mono">฿${Number(s.totalPrice || 0).toLocaleString()}</td>
            <td class="p-2 border-r border-slate-200 text-right font-black font-mono text-emerald-600">฿${paid.toLocaleString()}</td>
            <td class="p-2 border-r border-slate-200 text-right font-black font-mono ${due > 0 ? 'text-rose-600' : 'text-slate-400'}">฿${due.toLocaleString()}</td>
            <td class="p-2 text-center">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white status-${s.status} shadow-2xs">${s.status}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function sortDatabase(key) {
    if (dbSortKey === key) dbSortAsc = !dbSortAsc;
    else {
        dbSortKey = key;
        dbSortAsc = true;
    }
    renderDatabaseTable();
}

export function bulkDeleteVisible() {
    const rows = document.querySelectorAll('#database-body tr[data-record-id]');
    if (!rows.length) return customAlert("No Records", "No bookings currently visible to delete.");

    customAlert(
        "Bulk Delete",
        `Permanently delete ${rows.length} visible booking(s)? This cannot be undone.`,
        true,
        async () => {
            try {
                for (let tr of rows) {
                    const id = tr.dataset.recordId;
                    if (id) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
                }
                customAlert("Deleted", `Removed ${rows.length} bookings.`);
            } catch (err) {
                customAlert("Delete Failed", err.message);
            }
        }
    );
}

// Global click handler to close multi-select dropdowns
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-container') && !e.target.closest('.multi-select-dropdown')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
            d.classList.add('hidden');
            d.style.display = 'none';
        });
    }
});

if (typeof window !== 'undefined') {
    window.toggleMultiSelect = toggleMultiSelect;
    window.updateMultiLabel = updateMultiLabel;
    window.applyDbPreset = applyDbPreset;
    window.renderDatabase = renderDatabaseTable;
    window.sortDatabase = sortDatabase;
    window.bulkDelete = bulkDeleteVisible;
}
