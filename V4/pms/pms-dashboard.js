// ==========================================================================
// pms/pms-dashboard.js - Operational Daily Overview & Live Rate Snapshots
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { parseYMD, getLocalYMD } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';
import { getStatusObj } from '../core/occupancy.js';
import { getDue } from '../core/money.js';
import { getCmStayQuote } from '../cm/cm-ripple.js';

const $ = id => document.getElementById(id);

export const renderDashboard = () => {
    const todayStr = getLocalYMD(new Date());
    const dateEl = $('dash-date-display');
    if (dateEl) dateEl.innerText = todayStr;

    const arr = [], dep = [], stay = [];
    const actRaw = []; // Store raw action items with their trigger date for sorting

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
                actRaw.push({ date: cOut, html: `<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50"><div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm text-slate-700 w-[72px] shrink-0">${assigned}</span><div class="flex-1 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">Out: ${cOut}</span> <span class="text-[10px] text-red-600 font-bold uppercase ml-1">OWES ฿${due.toFixed(2)}</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-2 cursor-pointer shrink-0" title="Dismiss"><i data-lucide="check" size="14"></i></button></div>` });
            }
        }
        if (cIn < todayStr && cOut > todayStr && s.status !== 'unconfirmed' && s.status !== 'new') stay.push(item);
        if ((s.status === 'unconfirmed' || s.status === 'new') && !s.alertDismissed) {
            actRaw.push({ date: cIn, html: `<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50"><div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm text-slate-700 w-[72px] shrink-0">${assigned}</span><div class="flex-1 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">In: ${cIn}</span> <span class="ml-1">${sBadge}</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-2 cursor-pointer shrink-0" title="Dismiss"><i data-lucide="check" size="14"></i></button></div>` });
        }
        if (s.badCC && !s.alertDismissed && s.status !== 'left') {
            actRaw.push({ date: cIn, html: `<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50"><div class="flex items-center cursor-pointer flex-1 min-w-0" onclick="window.editStaff('${s.id}')"><span class="font-black text-sm text-slate-700 w-[72px] shrink-0">${assigned}</span><div class="flex-1 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">In: ${cIn}</span> <span class="text-[10px] bg-red-500 text-white px-1 rounded uppercase font-bold ml-1">BAD CC</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-2 cursor-pointer shrink-0" title="Dismiss"><i data-lucide="check" size="14"></i></button></div>` });
        }
    });

    if ($('dash-arr-count')) $('dash-arr-count').innerText = arr.length;
    if ($('dash-arr-list')) $('dash-arr-list').innerHTML = arr.length ? arr.join('') : '<div class="text-slate-400 italic text-center py-2">No arrivals</div>';
    if ($('dash-dep-count')) $('dash-dep-count').innerText = dep.length;
    if ($('dash-dep-list')) $('dash-dep-list').innerHTML = dep.length ? dep.join('') : '<div class="text-slate-400 italic text-center py-2">No departures</div>';
    if ($('dash-stay-count')) $('dash-stay-count').innerText = stay.length;
    if ($('dash-stay-list')) $('dash-stay-list').innerHTML = stay.length ? stay.join('') : '<div class="text-slate-400 italic text-center py-2">No stay-overs</div>';

    // Sort action items strictly by trigger date (Past -> Future)
    actRaw.sort((a, b) => a.date.localeCompare(b.date));
    const actHtml = actRaw.map(x => x.html).join('');
    if ($('dash-act-list')) $('dash-act-list').innerHTML = actRaw.length ? actHtml : '<div class="text-green-500 font-black text-center py-2"><i data-lucide="check-circle" size="14" class="inline"></i> All clear!</div>';

    // Mount Dynamic Rate Checker inputs if missing
    let dashPcIn = $('dash-pc-in');
    let dashPcOut = $('dash-pc-out');
    let dashPcPax = $('dash-pc-pax');
    const ratesCard = $('dash-rates-list')?.parentElement;

    if (ratesCard && !dashPcIn) {
        ratesCard.innerHTML = `
            <div class="dash-title flex justify-between items-center text-indigo-700 border-indigo-200 pb-1 border-b">
                <span><i data-lucide="tags" size="12" class="inline mb-0.5"></i> Live CM Checker</span>
                <span class="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">DEF Non-Ref</span>
            </div>
            <div class="flex gap-1 mt-1.5 mb-1.5 shrink-0">
                <input type="date" id="dash-pc-in" class="w-full text-[9px] font-bold p-0.5 border border-indigo-300 rounded outline-none text-center" onchange="window.runDashPriceCheck()">
                <input type="date" id="dash-pc-out" class="w-full text-[9px] font-bold p-0.5 border border-indigo-300 rounded outline-none text-center" onchange="window.runDashPriceCheck()">
                <input type="number" id="dash-pc-pax" value="1" min="1" class="w-8 text-[9px] font-bold p-0.5 text-center border border-indigo-300 rounded outline-none" title="PAX" oninput="window.runDashPriceCheck()">
            </div>
            <div id="dash-rates-list" class="text-[11px] font-black space-y-0.5 text-indigo-900 flex-1 overflow-y-auto min-h-[60px] no-scrollbar"></div>
        `;
        dashPcIn = $('dash-pc-in');
        dashPcOut = $('dash-pc-out');
        dashPcPax = $('dash-pc-pax');

        // Set defaults to Today -> Tomorrow
        if (dashPcIn && dashPcOut) {
            dashPcIn.value = todayStr;
            const tmrw = new Date();
            tmrw.setDate(tmrw.getDate() + 1);
            dashPcOut.value = getLocalYMD(tmrw);
        }
    }

    runDashPriceCheck();
    if (window.lucide) window.lucide.createIcons();
};

export const runDashPriceCheck = () => {
    const cI = $('dash-pc-in')?.value;
    const cO = $('dash-pc-out')?.value;
    const pax = Math.max(1, parseInt($('dash-pc-pax')?.value, 10) || 1);
    const resultsEl = $('dash-rates-list');
    if (!cI || !cO || !resultsEl) return;

    if (cO <= cI) {
        resultsEl.innerHTML = `<div class="text-center py-2 text-rose-500 font-bold text-[10px] uppercase">Invalid Date Range</div>`;
        return;
    }

    const n = Math.max(1, Math.round((parseYMD(cO) - parseYMD(cI)) / 86400000));
    const roomTypes = window.roomTypes || [];
    const hotelRooms = (window.hotelRooms || []).filter(r => !r.inactive);

    if (roomTypes.length === 0) {
        resultsEl.innerHTML = `<div class="text-center py-2 text-slate-400 font-bold uppercase text-[10px]">No room categories.</div>`;
        return;
    }

    resultsEl.innerHTML = roomTypes.map(cat => {
        const quote = getCmStayQuote({ checkIn: cI, nights: n, roomCategory: cat, planType: 'DEF_NON_REF' });
        const catUnits = hotelRooms.filter(r => (r.category || r.type) === cat);
        const isDorm = catUnits.some(r => !r.isPrivate && (r.isDorm === true || (r.rule && r.rule !== 'private') || cat.toLowerCase().includes('dorm')));
        const maxPaxPerUnit = isDorm ? 1 : (parseInt(catUnits[0]?.maxOccupancy || catUnits[0]?.occAdults || 2, 10) || 2);
        const unitsNeeded = Math.max(1, Math.ceil(pax / maxPaxPerUnit));

        const badges = [];
        if (quote.restrictions.stop) badges.push(`<span class="px-1 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-300 text-[8.5px] font-black uppercase">STOP</span>`);
        if (quote.restrictions.cta) badges.push(`<span class="px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[8.5px] font-black uppercase">CTA</span>`);
        if (quote.restrictions.maxMinStay > n) badges.push(`<span class="px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 border border-indigo-300 text-[8.5px] font-black uppercase">Min ${quote.restrictions.maxMinStay}n</span>`);

        let priceHtml = `<span class="text-slate-400 font-bold text-[10px]">No CM Rate</span>`;
        if (quote.complete && quote.total !== null) {
            const multiUnitTotal = quote.total * unitsNeeded;
            priceHtml = `
                <div class="text-right leading-tight">
                    <div class="text-[11px] font-black text-indigo-700">฿${multiUnitTotal.toLocaleString()}</div>
                    ${unitsNeeded > 1 ? `<div class="text-[8.5px] font-bold text-slate-500">${unitsNeeded}× ฿${quote.total.toLocaleString()}</div>` : ''}
                </div>
            `;
        }

        return `
            <div class="flex items-center justify-between py-1 border-b border-indigo-100 last:border-0 gap-2">
                <div class="min-w-0 flex-1 leading-tight">
                    <div class="font-black text-[10px] text-slate-700 truncate">${cat}</div>
                    <div class="flex items-center gap-0.5 flex-wrap mt-[1px]">
                        ${badges.join('')}
                    </div>
                </div>
                <div class="shrink-0">${priceHtml}</div>
            </div>
        `;
    }).join('');
};

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

window.renderDashboard = renderDashboard;
window.runDashPriceCheck = runDashPriceCheck;
window.dismissAlert = dismissAlert;
