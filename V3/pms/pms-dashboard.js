// ==========================================================================
// pms/pms-dashboard.js - Daily Snapshot, Rates Card & Action Items
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getLocalYMD, parseYMD } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';
import { getDue } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';

// --- 1. Master Dashboard Renderer ---
export function renderDashboard(staffList = null, currentPropertyId = null, onEditBooking = null) {
    const todayStr = getLocalYMD(new Date());
    const dateDisplay = document.getElementById('dash-date-display');
    if (dateDisplay) dateDisplay.innerText = todayStr;

    const curProp = currentPropertyId || window.currentPropertyId;
    if (!curProp) {
        setHtml('dash-arr-list', [], 'No property selected');
        setHtml('dash-dep-list', [], 'No property selected');
        setHtml('dash-stay-list', [], 'No property selected');
        setHtml('dash-act-list', [], 'Select a property to view action items');
        return;
    }

    const canonicalCurrent = toCanonicalPropId(curProp);
    const bookings = staffList || window.staff || [];
    const editHandler = onEditBooking || window.editStaff || window.openGuestModal;

    const arr = [];
    const dep = [];
    const stay = [];
    const act = [];

    // Filter active reservations strictly for the active property
    const propStaff = bookings.filter(s => {
        const sProp = toCanonicalPropId(s.property);
        return sProp === canonicalCurrent && s.status !== 'cancelled' && s.status !== 'noshow';
    });

    // Sort alphabetically by primary assigned room
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
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Guest';

        const sBadge = `<span class="px-1.5 py-0.5 text-[8px] rounded text-white status-${s.status} font-black uppercase shadow-xs">${s.status}</span>`;
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

        // 1. Arrivals Today
        if (cIn === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            arr.push(rowItem);
        }

        // 2. Departures Today
        if (cOut === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            dep.push(rowItem);
        }

        // 3. Stayovers Today
        if (cIn < todayStr && cOut > todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            stay.push(rowItem);
        }

        // --- 4. ACTION ITEMS ---
        // A. Checkout today with balance due
        if (cOut === todayStr && due > 0 && s.status !== 'charged' && s.status !== 'left' && s.status !== 'early' && !s.alertDismissed) {
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
                    <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
                        <i data-lucide="check" size="13"></i>
                    </button>
                </div>
            `);
        }

        // B. Overdue checkout (departure date in the past, but still marked 'here')
        if (cOut < todayStr && s.status === 'here' && !s.alertDismissed) {
            act.push(`
                <div class="flex items-center justify-between py-1.5 border-b border-red-100 last:border-0 bg-red-50/50 hover:bg-red-50 transition-colors">
                    <div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')">
                        <span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate">${assigned}</span>
                        <div class="flex-1 leading-tight truncate">
                            <span class="font-black text-xs text-red-900">${name}</span><br>
                            <span class="text-[9px] text-red-600 font-black uppercase">OVERDUE OUT (${cOut})</span>
                            ${due > 0 ? `<span class="text-[10px] text-rose-600 font-black ml-1">OWES ฿${due}</span>` : ''}
                        </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
                        <i data-lucide="check" size="13"></i>
                    </button>
                </div>
            `);
        }

        // C. New or Unconfirmed reservations requiring front desk action
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
                    <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
                        <i data-lucide="check" size="13"></i>
                    </button>
                </div>
            `);
        }

        // D. Bad Credit Card alert
        if (s.badCC && !s.alertDismissed && s.status !== 'left' && s.status !== 'early') {
            act.push(`
                <div class="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0 hover:bg-orange-50/70 transition-colors">
                    <div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')">
                        <span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate">${assigned}</span>
                        <div class="flex-1 leading-tight truncate">
                            <span class="font-black text-xs text-slate-800">${name}</span><br>
                            <span class="text-[9px] bg-red-600 text-white font-black px-1 rounded uppercase">BAD CC</span>
                        </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); window.dismissDashboardAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-xs ml-2 cursor-pointer shrink-0" title="Dismiss Alert">
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

    renderTodayRatesCard(todayStr);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// --- 2. Live Dynamic Rates & Event Package Card ---
export function renderTodayRatesCard(todayStr) {
    const listEl = document.getElementById('dash-rates-list');
    if (!listEl) return;

    const roomTypes = window.roomTypes || [...new Set((window.hotelRooms || []).map(r => r.category || r.type).filter(Boolean))];
    const currency = window.currentPropertyConfig?.currencySymbol || '฿';
    let rHtml = '';

    const matrixDay = window.masterPricing?.timeline?.[todayStr];
    const propertyEvents = window.currentPropertyConfig?.events || window.fmpDates || [];
    const todayMs = parseYMD(todayStr);

    // Look ahead 3 to 4 days for an upcoming event peak
    let upcomingEvent = null;
    for (let i = 0; i <= 4; i++) {
        const checkYMD = getLocalYMD(new Date(todayMs + (i * 86400000)));
        if (propertyEvents.includes(checkYMD)) {
            upcomingEvent = {
                date: checkYMD,
                daysAway: i
            };
            break;
        }
    }

    roomTypes.forEach(t => {
        let basePrice = null;
        if (matrixDay && matrixDay[t] && matrixDay[t].std) {
            basePrice = matrixDay[t].std;
        } else if (window.dailyRates && window.dailyRates[t]) {
            basePrice = window.dailyRates[t];
        }

        if (basePrice !== null) {
            let eventBadgeHtml = '';

            // If an event is within 3-4 days, calculate the package pricing
            if (upcomingEvent && window.masterPricing?.timeline) {
                const eventDayObj = window.masterPricing.timeline[upcomingEvent.date];
                const roomEventData = eventDayObj?.[t] || {};
                const eventMinStay = parseInt(roomEventData.eventMinStay || roomEventData.min || 2, 10);
                const eventNightly = roomEventData.eventRate || roomEventData.std || basePrice;
                const packageTotal = eventNightly * eventMinStay;

                const daysAwayLabel = upcomingEvent.daysAway === 0 ? 'TODAY' : `in ${upcomingEvent.daysAway}d`;
                eventBadgeHtml = `
                    <div class="text-[9px] font-bold text-pink-700 bg-pink-100/70 border border-pink-200 rounded px-1.5 py-0.5 mt-0.5 flex justify-between">
                        <span>Event (${daysAwayLabel}, ${eventMinStay}nt min):</span>
                        <span class="font-black">${currency}${eventNightly}/nt (${currency}${packageTotal.toLocaleString()} total)</span>
                    </div>
                `;
            }

            rHtml += `
                <div class="py-1 border-b border-indigo-100 last:border-0">
                    <div class="flex justify-between items-center">
                        <span class="truncate pr-2 font-bold text-slate-700 text-xs">${t}</span>
                        <span class="font-black text-indigo-900 font-mono text-xs">${currency}${Number(basePrice).toLocaleString()}</span>
                    </div>
                    ${eventBadgeHtml}
                </div>
            `;
        }
    });

    listEl.innerHTML = rHtml || '<div class="text-slate-400 italic text-center py-2 text-xs">No rates loaded for today.</div>';
}

// --- 3. Dashboard Alert Dismissal Handler ---
export async function dismissDashboardAlert(bookingId) {
    if (!bookingId) return;

    // Optimistic in-memory update: remove alert immediately from screen
    const target = (window.staff || []).find(b => b.id === bookingId);
    if (target) target.alertDismissed = true;

    renderDashboard(window.staff, window.currentPropertyId, window.editStaff);

    // Commit dismissal to Firestore in background
    try {
        const bRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', bookingId);
        await updateDoc(bRef, { alertDismissed: true });
    } catch (err) {
        console.warn("[Dashboard Alert Dismissal Failed]:", err);
    }
}

// --- 4. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.renderDashboard = () => renderDashboard(window.staff, window.currentPropertyId, window.editStaff);
    window.renderTodayRatesCard = renderTodayRatesCard;
    window.dismissDashboardAlert = dismissDashboardAlert;
}
