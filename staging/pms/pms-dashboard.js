// ==========================================================================
// pms/pms-dashboard.js - Daily Snapshot & Operational Action Items
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getLocalYMD } from '../core/dates.js';
import { getDue } from '../core/money.js';

export function renderDashboard(staffList = [], currentPropertyId = 'swims_resort', onEditBooking) {
    const todayStr = getLocalYMD(new Date());
    const dateDisplay = document.getElementById('dash-date-display');
    if (dateDisplay) dateDisplay.innerText = todayStr;

    const arr = [];
    const dep = [];
    const stay = [];
    const act = [];

    const propStaff = (staffList || []).filter(s => {
        const prop = (s.property || 'swims_resort').toLowerCase();
        return prop === currentPropertyId.toLowerCase() && s.status !== 'cancelled' && s.status !== 'noshow';
    });

    propStaff.sort((a, b) => {
        const ra = (a.rooms?.length ? a.rooms[0] : (a.room || 'ZZZ'));
        const rb = (b.rooms?.length ? b.rooms[0] : (b.room || 'ZZZ'));
        return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
    });

    propStaff.forEach(s => {
        const cIn = s.checkIn || '';
        const cOut = s.checkOut || '';
        const due = getDue(s);
        const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
        const assigned = rList.filter(Boolean).join(', ') || 'Unassigned';
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown Guest';

        const sBadge = `<span class="px-1.5 py-0.5 text-[8px] rounded text-white status-${s.status} font-black uppercase shadow-2xs">${s.status}</span>`;
        const dueBadge = due > 0 
            ? `<span class="text-rose-600 font-black">฿${due.toLocaleString()}</span>` 
            : `<span class="text-emerald-600 font-bold">฿0</span>`;

        const rowItem = `
            <div class="flex items-center py-1.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors" onclick="window.editStaff('${s.id}')">
                <span class="font-black text-xs w-[76px] text-slate-700 shrink-0 truncate" title="${assigned}">${assigned}</span>
                <div class="flex-1 truncate leading-tight pr-1">
                    <span class="font-black text-xs text-slate-800">${name}</span>
                    <span class="ml-1">${sBadge}</span>
                </div>
                <div class="shrink-0 text-right font-mono text-xs">${dueBadge}</div>
            </div>
        `;

        if (cIn === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            arr.push(rowItem);
        }
        if (cOut === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            dep.push(rowItem);
            if (due > 0 && s.status !== 'charged' && !s.alertDismissed) {
                act.push(`
                    <div class="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0 hover:bg-orange-50/70 transition-colors">
                        <div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')">
                            <span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate">${assigned}</span>
                            <div class="flex-1 leading-tight truncate">
                                <span class="font-black text-xs text-slate-800">${name}</span><br>
                                <span class="text-[9px] text-slate-400 font-bold">Checkout Today</span>
                                <span class="text-[10px] text-rose-600 font-black uppercase ml-1">OWES ฿${due}</span>
                            </div>
                        </div>
                        <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-2xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
                            <i data-lucide="check" size="13"></i>
                        </button>
                    </div>
                `);
            }
        }
        if (cIn < todayStr && cOut > todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            stay.push(rowItem);
        }

        if ((s.status === 'unconfirmed' || s.status === 'new') && !s.alertDismissed) {
            const tagColor = s.status === 'new' ? 'text-pink-600 bg-pink-50 border-pink-200' : 'text-purple-600 bg-purple-50 border-purple-200';
            act.push(`
                <div class="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0 hover:bg-orange-50/70 transition-colors">
                    <div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')">
                        <span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate">${assigned}</span>
                        <div class="flex-1 leading-tight truncate">
                            <span class="font-black text-xs text-slate-800">${name}</span><br>
                            <span class="text-[9px] text-slate-400 font-bold">In: ${cIn}</span>
                            <span class="text-[9px] ${tagColor} px-1 rounded border font-black uppercase ml-1">${s.status}</span>
                        </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-2xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
                        <i data-lucide="check" size="13"></i>
                    </button>
                </div>
            `);
        }

        if (s.badCC && !s.alertDismissed && s.status !== 'left') {
            act.push(`
                <div class="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0 hover:bg-orange-50/70 transition-colors">
                    <div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')">
                        <span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate">${assigned}</span>
                        <div class="flex-1 leading-tight truncate">
                            <span class="font-black text-xs text-slate-800">${name}</span><br>
                            <span class="text-[9px] bg-red-600 text-white font-black px-1 rounded uppercase">BAD CC</span>
                        </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-2xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
                        <i data-lucide="check" size="13"></i>
                    </button>
                </div>
            `);
        }
    });

    const setHtml = (id, list, emptyMsg) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = list.length ? list.join('') : `<div class="text-slate-400 italic text-center py-3 text-xs">${emptyMsg}</div>`;
    };

    setHtml('dash-arr-list', arr, 'No arrivals today');
    setHtml('dash-dep-list', dep, 'No departures today');
    setHtml('dash-stay-list', stay, 'No stay-overs today');
    setHtml('dash-act-list', act, 'All clear! No pending actions.');

    const arrCount = document.getElementById('dash-arr-count');
    const depCount = document.getElementById('dash-dep-count');
    const stayCount = document.getElementById('dash-stay-count');
    if (arrCount) arrCount.innerText = arr.length;
    if (depCount) depCount.innerText = dep.length;
    if (stayCount) stayCount.innerText = stay.length;

    if (window.lucide) window.lucide.createIcons();
}

export async function dismissDashboardAlert(bookingId) {
    if (!bookingId) return;
    try {
        const bRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', bookingId);
        await updateDoc(bRef, { alertDismissed: true });
        const target = (window.staff || []).find(b => b.id === bookingId);
        if (target) target.alertDismissed = true;
        renderDashboard(window.staff, window.currentPropertyId);
    } catch (err) {
        console.warn("[Dashboard Alert Dismissal Failed]:", err);
    }
}

if (typeof window !== 'undefined') {
    window.renderDashboard = () => renderDashboard(window.staff, window.currentPropertyId, window.editStaff);
    window.dismissDashboardAlert = dismissDashboardAlert;
}
