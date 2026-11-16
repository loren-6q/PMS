// ==========================================================================
// pms/pms-dashboard.js - Operational Daily Overview & Live Rate Snapshots
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getLocalYMD } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';
import { getStatusObj } from '../core/occupancy.js';
import { getDue } from '../core/money.js';
import { getCmStayQuote } from '../cm/cm-ripple.js';

// --- DOM Selector Helper ---
const $ = id => document.getElementById(id);

// --------------------------------------------------------------------------
// 1. DAILY OVERVIEW & OPERATIONS DASHBOARD RENDERER
// --------------------------------------------------------------------------

export const renderDashboard = () => {
    const todayStr = getLocalYMD(new Date());
    const dateEl = $('dash-date-display');
    if (dateEl) dateEl.innerText = todayStr;

    const arr = [], dep = [], stay = [], act = [];

    const staff = window.staff || [];
    const curProp = toCanonicalPropId(window.currentPropertyId || '');

    const sortedStaff = [...staff]
        .filter(x => toCanonicalPropId(x.property) === curProp)
        .sort((a, b) => {
            const ra = a.rooms?.[0] || a.room || 'ZZZ';
            const rb = b.rooms?.[0] || b.room || 'ZZZ';
            return ra.localeCompare(rb);
        });

    sortedStaff.forEach(s => {
        if (s.status === 'cancelled' || s.status === 'no-show') return;

        const cIn = s.checkIn;
        const cOut = s.checkOut;
        const due = getDue(s);
        const assigned = (window.getRooms ? window.getRooms(s) : (s.rooms || [s.room])).filter(Boolean).join(',') || 'Unassigned';
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';

        const st = getStatusObj(s.status);
        const sBadge = `<span class="px-1.5 py-0.5 text-[8px] rounded uppercase font-black shadow-xs select-text ${st.strike ? 'line-through' : ''}" style="background:${st.bg}; color:${st.txt}; border: 1px solid ${st.border};">${st.label}</span>`;
        const dueBadge = due > 0 ? `<span class="text-red-500 font-black">฿${due.toFixed(2)}</span>` : `<span class="text-green-500">฿0</span>`;
        const item = `<div class="flex items-center py-1 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm w-[72px] text-slate-700 shrink-0">${assigned}</span><div class="flex-1 truncate leading-tight"><span class="font-black text-xs text-slate-700">${name}</span> <span class="ml-1">${sBadge}</span></div><div class="shrink-0 ml-1">${dueBadge}</div></div>`;

        if (cIn === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') arr.push(item);
        if (cOut === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            dep.push(item);
            if (due > 0.05 && s.status !== 'charged' && !s.alertDismissed) {
                act.push(`<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50"><div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm text-slate-700 w-[72px] shrink-0">${assigned}</span><div class="flex-1 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">Out: ${cOut}</span> <span class="text-[10px] text-red-600 font-bold uppercase ml-1">OWES ฿${due.toFixed(2)}</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-2 cursor-pointer shrink-0" title="Dismiss"><i data-lucide="check" size="14"></i></button></div>`);
            }
        }
        if (cIn < todayStr && cOut > todayStr && s.status !== 'unconfirmed' && s.status !== 'new') stay.push(item);
        if ((s.status === 'unconfirmed' || s.status === 'new') && !s.alertDismissed) {
            act.push(`<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50"><div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm text-slate-700 w-[72px] shrink-0">${assigned}</span><div class="flex-1 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">In: ${cIn}</span> <span class="ml-1">${sBadge}</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-2 cursor-pointer shrink-0" title="Dismiss"><i data-lucide="check" size="14"></i></button></div>`);
        }
        if (s.badCC && !s.alertDismissed && s.status !== 'left') {
            act.push(`<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50"><div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm text-slate-700 w-[72px] shrink-0">${assigned}</span><div class="flex-1 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">In: ${cIn}</span> <span class="text-[10px] bg-red-500 text-white px-1 rounded uppercase font-bold ml-1">BAD CC</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-2 cursor-pointer shrink-0" title="Dismiss"><i data-lucide="check" size="14"></i></button></div>`);
        }
    });

    if ($('dash-arr-count')) $('dash-arr-count').innerText = arr.length;
    if ($('dash-arr-list')) $('dash-arr-list').innerHTML = arr.length ? arr.join('') : '<div class="text-slate-400 italic text-center py-2">No arrivals</div>';
    if ($('dash-dep-count')) $('dash-dep-count').innerText = dep.length;
    if ($('dash-dep-list')) $('dash-dep-list').innerHTML = dep.length ? dep.join('') : '<div class="text-slate-400 italic text-center py-2">No departures</div>';
    if ($('dash-stay-count')) $('dash-stay-count').innerText = stay.length;
    if ($('dash-stay-list')) $('dash-stay-list').innerHTML = stay.length ? stay.join('') : '<div class="text-slate-400 italic text-center py-2">No stay-overs</div>';
    if ($('dash-act-list')) $('dash-act-list').innerHTML = act.length ? act.join('') : '<div class="text-green-500 font-black text-center py-2"><i data-lucide="check-circle" size="14" class="inline"></i> All clear!</div>';

    // Today's CM DIR Non-Ref Rates Card (1-day default; extendable to 2-, 3-, 4-day rates)
    let rHtml = '';
    const roomTypes = window.roomTypes || [];
    roomTypes.forEach(t => {
        const quote = getCmStayQuote({ checkIn: todayStr, nights: 1, roomCategory: t, planType: 'DIR_NON_REF' });
        const priceLabel = quote.complete && quote.total !== null
            ? `฿${quote.total.toLocaleString()}`
            : `<span class="text-slate-400 font-bold">--</span>`;
        rHtml += `<div class="flex justify-between items-center py-1 border-b border-indigo-100 last:border-0"><span class="truncate pr-2">${t}</span><span>${priceLabel}</span></div>`;
    });
    if ($('dash-rates-list')) $('dash-rates-list').innerHTML = rHtml || '<span class="text-slate-400 italic text-center mt-2">No room categories configured.</span>';
    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// 2. OPERATIONAL ALERTS & DISMISSAL ACTIONS
// --------------------------------------------------------------------------

export const dismissAlert = async id => {
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), { alertDismissed: true });
        const staff = window.staff || [];
        const s = staff.find(x => x.id === id);
        if (s) s.alertDismissed = true;
        renderDashboard();
    } catch (e) {
        console.error("Failed to dismiss alert:", e);
    }
};

// --------------------------------------------------------------------------
// 3. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

window.renderDashboard = renderDashboard;
window.dismissAlert = dismissAlert;
