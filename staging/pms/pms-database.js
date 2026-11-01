// ==========================================================================
// pms/pms-database.js - Tabular Guest Database Ledger & Multi-Filters
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDue, getPaid, getCurrencySymbol } from '../core/money.js';
import { toCanonicalPropId } from '../core/properties.js';
import { getLocalYMD } from '../core/dates.js';
import { STATUS_CYCLE } from '../core/occupancy.js';
import { customAlert } from '../core/ui-dialogs.js';

// --- 1. Database Sorting State ---
let dbSortKey = "checkIn";
let dbSortAsc = false;

// --- 2. Dynamic Dropdown Population & Multi-Select Controller ---
export function initDatabaseFilters() {
    // 1. Populate Room Categories & Unassigned Checkbox
    const roomDrop = document.getElementById('db-room-dropdown');
    if (roomDrop && roomDrop.children.length === 0) {
        const hotelRooms = window.hotelRooms || [];
        const categories = [...new Set(hotelRooms.map(r => r.category || r.type).filter(Boolean))];

        let html = '';
        categories.forEach(cat => {
            html += `
                <label class="flex items-center px-2 py-1 hover:bg-slate-50 cursor-pointer text-xs font-bold text-slate-700">
                    <input type="checkbox" value="${cat}" onchange="window.updateMultiLabel('db-room-dropdown', 'db-room-label', 'ALL ROOMS'); window.renderDatabase();" class="mr-2 rounded border-slate-300 text-indigo-600 focus:ring-0">
                    <span>${cat}</span>
                </label>
            `;
        });
        html += `
            <div class="border-t border-slate-200 my-1"></div>
            <label class="flex items-center px-2 py-1 hover:bg-amber-50 cursor-pointer text-xs font-black text-amber-700">
                <input type="checkbox" value="UNASSIGNED" onchange="window.updateMultiLabel('db-room-dropdown', 'db-room-label', 'ALL ROOMS'); window.renderDatabase();" class="mr-2 rounded border-amber-300 text-amber-600 focus:ring-0">
                <span>UNASSIGNED</span>
            </label>
        `;
        roomDrop.innerHTML = html;
    }

    // 2. Populate Channel Sources Checkboxes
    const sourceDrop = document.getElementById('db-source-dropdown');
    if (sourceDrop && sourceDrop.children.length === 0) {
        const sources = ['direct', 'booking.com', 'agoda', 'hostelworld', 'airbnb', 'expedia', 'ctrip', 'walk-in', 'other'];
        sourceDrop.innerHTML = sources.map(src => `
            <label class="flex items-center px-2 py-1 hover:bg-slate-50 cursor-pointer text-xs font-bold uppercase text-slate-700">
                <input type="checkbox" value="${src}" onchange="window.updateMultiLabel('db-source-dropdown', 'db-source-label', 'ALL SOURCES'); window.renderDatabase();" class="mr-2 rounded border-slate-300 text-indigo-600 focus:ring-0">
                <span>${src}</span>
            </label>
        `).join('');
    }

    // 3. Populate Status Checkboxes (Includes 13th Status: EARLY OUT)
    const statusDrop = document.getElementById('db-status-dropdown');
    if (statusDrop && statusDrop.children.length === 0) {
        statusDrop.innerHTML = STATUS_CYCLE.map(s => `
            <label class="flex items-center px-2 py-1 hover:bg-slate-50 cursor-pointer text-xs font-bold uppercase text-slate-700">
                <input type="checkbox" value="${s.val}" onchange="window.updateMultiLabel('db-status-dropdown', 'db-status-label', 'ALL STATUS'); window.renderDatabase();" class="mr-2 rounded border-slate-300 text-indigo-600 focus:ring-0">
                <span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" style="background:${s.bg}"></span>
                <span>${s.label}</span>
            </label>
        `).join('');
    }
}

export function toggleMultiSelect(dropdownId, triggerBtn) {
    if (window.event) window.event.stopPropagation();
    initDatabaseFilters();

    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden') || dropdown.style.display === 'none';

    // Hide all open multi-select dropdowns
    document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.classList.add('hidden');
        d.style.display = 'none';
    });

    if (isHidden) {
        dropdown.classList.remove('hidden');
        dropdown.style.display = 'block';
    }
}

export function updateMultiLabel(dropdownId, labelId, defaultText) {
    const checked = document.querySelectorAll(`#${dropdownId} input[type="checkbox"]:checked`);
    const label = document.getElementById(labelId);
    if (!label) return;

    if (checked.length === 0) {
        label.innerText = defaultText;
    } else if (checked.length === 1) {
        label.innerText = checked[0].parentNode.textContent.trim().toUpperCase();
    } else {
        label.innerText = `${checked.length} SELECTED`;
    }
}

export function getMultiValues(dropdownId) {
    return Array.from(document.querySelectorAll(`#${dropdownId} input[type="checkbox"]:checked`) || []).map(cb => cb.value);
}

// --- 3. Date Presets Engine ---
export function applyDbPreset(presetVal) {
    const today = new Date();
    const ymd = (d) => getLocalYMD(d);

    let start = '', end = '';

    if (presetVal === 'today') {
        start = ymd(today);
        end = start;
    } else if (presetVal === 'tomorrow') {
        const tmrw = new Date(today);
        tmrw.setDate(today.getDate() + 1);
        start = ymd(tmrw);
        end = start;
    } else if (presetVal === 'this_week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const sDate = new Date(today.setDate(diff));
        start = ymd(sDate);
        const eDate = new Date(sDate);
        eDate.setDate(sDate.getDate() + 6);
        end = ymd(eDate);
    } else if (presetVal === 'next_week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1) + 7;
        const sDate = new Date(today.setDate(diff));
        start = ymd(sDate);
        const eDate = new Date(sDate);
        eDate.setDate(sDate.getDate() + 6);
        end = ymd(eDate);
    } else if (presetVal === 'this_month') {
        start = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
        end = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (presetVal === 'next_month') {
        start = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 1));
        end = ymd(new Date(today.getFullYear(), today.getMonth() + 2, 0));
    }

    const startEl = document.getElementById('db-filter-start');
    const endEl = document.getElementById('db-filter-end');
    if (startEl) startEl.value = start;
    if (endEl) endEl.value = end;

    renderDatabaseTable();
}

// --- 4. Filtering & Category Match Resolver ---
export function getFilteredBookings(staffList = null, currentPropertyId = null) {
    const nameFilter = (document.getElementById('db-filter-name')?.value || '').trim().toUpperCase();
    const sourceFilters = getMultiValues('db-source-dropdown');
    const statusFilters = getMultiValues('db-status-dropdown');
    const roomFilters = getMultiValues('db-room-dropdown');
    const startStr = document.getElementById('db-filter-start')?.value || '';
    const endStr = document.getElementById('db-filter-end')?.value || '';
    const minPrice = parseFloat(document.getElementById('db-filter-min')?.value) || 0;
    const maxPrice = parseFloat(document.getElementById('db-filter-max')?.value) || Infinity;
    const dueFilter = document.getElementById('db-filter-due')?.value || '';

    const curProp = toCanonicalPropId(currentPropertyId || window.currentPropertyId);
    const bookings = staffList || window.staff || [];
    const hotelRooms = window.hotelRooms || [];

    return bookings.filter(s => {
        const sProp = toCanonicalPropId(s.property);
        if (sProp !== curProp) return false;

        // Status Filter
        if (statusFilters.length > 0 && !statusFilters.includes(s.status)) return false;

        // Channel Source Filter
        if (sourceFilters.length > 0 && !sourceFilters.includes((s.source || 'direct').toLowerCase())) return false;

        // Guest Name or Booking ID Search
        const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toUpperCase();
        const bId = (s.bookId || '').toUpperCase();
        if (nameFilter && !fullName.includes(nameFilter) && !bId.includes(nameFilter)) return false;

        // Stay Window Overlap Filter
        if (startStr && s.checkOut <= startStr) return false;
        if (endStr && s.checkIn >= endStr) return false;

        // Financial Balance Due Filter
        const due = getDue(s);
        if (dueFilter === 'zero' && due > 0) return false;
        if (dueFilter === 'owes' && due <= 0) return false;

        // Price Bounds Filter
        const total = Number(s.totalPrice || 0);
        if (total < minPrice || total > maxPrice) return false;

        // Category & Unassigned Match Filter
        if (roomFilters.length > 0) {
            const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
            const isUnassigned = rList.length === 0 || rList.every(r => !r || r.trim() === "");

            if (roomFilters.includes('UNASSIGNED') && isUnassigned) {
                return true;
            }

            const matchesCategory = rList.some(roomId => {
                const hr = hotelRooms.find(r => r.id === roomId);
                const category = hr ? (hr.category || hr.type) : (s.bookedType || null);
                return category && roomFilters.includes(category);
            });

            if (!matchesCategory) return false;
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

// --- 5. Database Table Renderer ---
export function renderDatabaseTable() {
    const tbody = document.getElementById('database-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const records = getFilteredBookings(window.staff, window.currentPropertyId);
    const currency = getCurrencySymbol(window.currentPropertyConfig?.currency);

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 font-bold uppercase text-xs">No matching reservations found.</td></tr>`;
        return;
    }

    records.forEach(s => {
        const due = getDue(s);
        const paid = getPaid(s);
        const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
        const assigned = rList.filter(Boolean).join(', ') || '--';

        // Compact dates formatting: MM/DD → MM/DD
        const dIn = s.checkIn ? s.checkIn.substr(5).replace('-', '/') : '?';
        const dOut = s.checkOut ? s.checkOut.substr(5).replace('-', '/') : '?';

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-xs";
        tr.dataset.recordId = s.id;
        tr.onclick = () => {
            if (typeof window.editStaff === 'function') {
                window.editStaff(s.id);
            }
        };

        tr.innerHTML = `
            <td class="p-2 border-r border-slate-200 font-bold text-slate-800">
                ${s.firstName || ''} ${s.lastName || 'Guest'}
                ${s.bookId ? `<span class="text-[9px] text-slate-400 font-mono block">${s.bookId}</span>` : ''}
            </td>
            <td class="p-2 border-r border-slate-200 uppercase font-bold text-slate-600 text-[10px]">${s.source || 'direct'}</td>
            <td class="p-2 border-r border-slate-200 font-mono text-[11px]">${dIn} &rarr; ${dOut}</td>
            <td class="p-2 border-r border-slate-200 font-black text-slate-700">${assigned}</td>
            <td class="p-2 border-r border-slate-200 text-right font-black font-mono">${currency}${Number(s.totalPrice || 0).toLocaleString()}</td>
            <td class="p-2 border-r border-slate-200 text-right font-black font-mono text-emerald-600">${currency}${paid.toLocaleString()}</td>
            <td class="p-2 border-r border-slate-200 text-right font-black font-mono ${due > 0 ? 'text-rose-600' : 'text-slate-400'}">${currency}${due.toLocaleString()}</td>
            <td class="p-2 text-center">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white status-${s.status} shadow-xs">${s.status}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function sortDatabase(key) {
    if (dbSortKey === key) dbSortAsc = !dbSortAsc;
    else {
        dbSortKey = key;
        dbSortAsc = true;
    }
    renderDatabaseTable();
}

// --- 6. Bulk Delete Handler ---
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
                renderDatabaseTable();
                customAlert("Deleted", `Removed ${rows.length} bookings.`);
            } catch (err) {
                customAlert("Delete Failed", err.message);
            }
        }
    );
}

// Global click listener to close multi-select dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-container') && !e.target.closest('.multi-select-dropdown')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
            d.classList.add('hidden');
            d.style.display = 'none';
        });
    }
});

// --- 7. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.toggleMultiSelect = toggleMultiSelect;
    window.updateMultiLabel = updateMultiLabel;
    window.applyDbPreset = applyDbPreset;
    window.renderDatabase = renderDatabaseTable;
    window.sortDatabase = sortDatabase;
    window.bulkDelete = bulkDeleteVisible;
    window.initDatabaseFilters = initDatabaseFilters;
}
