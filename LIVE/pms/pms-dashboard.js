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
import { resolveChannelCode } from '../core/channels.js';
import { getCmStayQuote } from '../cm/cm-ripple.js';

const $ = id => document.getElementById(id);

function getChannelBadgeHtml(source) {
    const code = resolveChannelCode(source || 'WEB');
    const styles = {
        BDC: 'bg-[#003580] text-white',
        HWL: 'bg-[#F15A24] text-white',
        AGO: 'bg-[#87B2D6] text-white',
        EXP: 'bg-[#facc15] text-[#003580]',
        ABB: 'bg-[#FF5A5F] text-white',
        TRP: 'bg-[#3b82f6] text-white',
        WEB: 'bg-emerald-600 text-white',
        WLK: 'bg-slate-600 text-white'
    };
    const cls = styles[code] || 'bg-slate-700 text-white';
    return `<span class="${cls} px-1 py-0.2 rounded text-[8.5px] font-black uppercase shrink-0">${code}</span>`;
}

function getIsoSortKey(val, fallback = '') {
    if (!val) return fallback;
    if (typeof val === 'string') return val;
    if (typeof val?.toDate === 'function') return val.toDate().toISOString();
    return fallback;
}

export const renderDashboard = () => {
    const todayStr = getLocalYMD(new Date());
    const dateEl = $('dash-date-display');
    if (dateEl) dateEl.innerText = todayStr;

    const arr = [], dep = [], stay = [];
    const inboxRaw = [];
    const actRaw = [];

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
        const cIn = s.checkIn;
        const cOut = s.checkOut;
        const due = getDue(s);
        const assigned = (window.getRooms ? window.getRooms(s) : (s.rooms || [s.room])).filter(Boolean).join(',') || 'Unassigned';
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';

        const isNew = s.status === 'new';
        const isModified = s.otaAlert === 'modified' && s.status !== 'cancelled';
        const isCancelledAlert = s.status === 'cancelled' && s.otaAlert === 'cancelled';

        // 1. Collect New, Modified & Cancelled bookings for the New Bookings card
        if (isNew || isModified || isCancelledAlert) {
            const nights = (cIn && cOut) ? Math.max(1, Math.round((parseYMD(cOut) - parseYMD(cIn)) / 86400000)) : 1;
            const sortKey = getIsoSortKey(
                s.otaAlertAt,
                getIsoSortKey(s.lastEditedAt, getIsoSortKey(s.createdAt, s.bookDate || cIn || ''))
            );

            const badges = [];
            if (isCancelledAlert) {
                badges.push(`<span class="px-1 py-0.2 rounded bg-rose-600 text-white text-[8px] font-black uppercase">CANCELLED</span>`);
            } else {
                if (isNew) badges.push(`<span class="px-1 py-0.2 rounded bg-sky-600 text-white text-[8px] font-black uppercase">NEW</span>`);
                if (isModified) badges.push(`<span class="px-1 py-0.2 rounded bg-amber-500 text-slate-950 text-[8px] font-black uppercase">MODIFIED</span>`);
            }

            const freedList = Array.isArray(s.prevRooms) ? s.prevRooms.filter(Boolean) : [];
            const roomTag = isCancelledAlert
                ? `<span class="px-1 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 font-black">${freedList.length ? `Freed: ${freedList.join(', ')}` : 'Was Unassigned'}</span>`
                : `<span class="px-1 py-0.2 rounded ${assigned === 'Unassigned' ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-700 border border-slate-200'} font-black">${assigned}</span>`;

            const detailLine = (isModified && s.otaAlertSummary)
                ? `<div class="text-[9px] font-bold text-amber-900 bg-amber-100/70 px-1.5 py-0.5 rounded mt-0.5 truncate">${s.otaAlertSummary}</div>`
                : '';

            const rowBg = isCancelledAlert
                ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-100/70'
                : (isModified ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-100/70' : 'border-sky-100 hover:bg-sky-100/70');

            inboxRaw.push({
                sortKey,
                html: `
                    <div onclick="window.openInboxBookingForReview('${s.id}')" class="flex items-center justify-between py-1.5 px-1.5 border-b ${rowBg} last:border-0 rounded transition-colors gap-1.5 cursor-pointer">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1 flex-wrap">
                                ${getChannelBadgeHtml(s.source)}
                                ${badges.join('')}
                                <span class="font-black text-xs text-slate-800 truncate">${name}</span>
                            </div>
                            <div class="text-[9.5px] font-bold text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>${cIn || '--'} → ${cOut || '--'} (${nights}n)</span>
                                ${roomTag}
                                <span class="text-indigo-700 font-black">฿${(Number(s.totalPrice) || 0).toLocaleString()}</span>
                            </div>
                            ${detailLine}
                        </div>
                        <span class="px-1.5 py-0.5 bg-white text-slate-700 border border-slate-300 rounded font-black text-[9px] uppercase shrink-0 flex items-center gap-0.5">
                            Review <i data-lucide="arrow-up-right" size="11"></i>
                        </span>
                    </div>
                `
            });
        }

        if (s.status === 'cancelled' || s.status === 'no-show') return;

        const st = getStatusObj(s.status);
        const sBadge = `<span class="px-1.5 py-0.5 text-[8px] rounded uppercase font-black shadow-xs select-text ${st.strike ? 'line-through' : ''}" style="background:${st.bg}; color:${st.txt}; border: 1px solid ${st.border};">${st.label}</span>`;
        const dueBadge = due > 0 ? `<span class="text-red-500 font-black">฿${due.toFixed(2)}</span>` : `<span class="text-green-500">฿0</span>`;
        const item = `<div class="flex items-center py-1 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 gap-1.5" onclick="window.editStaff('${s.id}')"><span class="font-black text-xs w-[76px] text-slate-700 shrink-0 truncate" title="${assigned}">${assigned}</span><div class="flex-1 min-w-0 truncate leading-tight"><span class="font-black text-xs text-slate-700">${name}</span> <span class="ml-1">${sBadge}</span></div><div class="shrink-0 ml-1">${dueBadge}</div></div>`;

        if (cIn === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') arr.push(item);
        if (cOut === todayStr && s.status !== 'unconfirmed' && s.status !== 'new') {
            dep.push(item);
            if (due > 0.05 && s.status !== 'charged' && !s.alertDismissed) {
                actRaw.push({ date: cOut, html: `<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50 gap-1.5"><div class="flex items-center cursor-pointer flex-1 min-w-0 gap-1.5" onclick="window.editStaff('${s.id}')"><span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate" title="${assigned}">${assigned}</span><div class="flex-1 min-w-0 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">Out: ${cOut}</span> <span class="text-[10px] text-red-600 font-bold uppercase ml-1">OWES ฿${due.toFixed(2)}</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" data-tip="dash.dismissAlert" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-1 cursor-pointer shrink-0"><i data-lucide="check" size="14"></i></button></div>` });
            }
        }
        if (cIn < todayStr && cOut > todayStr && s.status !== 'unconfirmed' && s.status !== 'new') stay.push(item);
        if (s.status === 'unconfirmed' && !s.alertDismissed) {
            actRaw.push({ date: cIn, html: `<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50 gap-1.5"><div class="flex items-center cursor-pointer flex-1 min-w-0 gap-1.5" onclick="window.editStaff('${s.id}')"><span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate" title="${assigned}">${assigned}</span><div class="flex-1 min-w-0 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">In: ${cIn}</span> <span class="ml-1">${sBadge}</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" data-tip="dash.dismissAlert" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-1 cursor-pointer shrink-0"><i data-lucide="check" size="14"></i></button></div>` });
        }
        if (s.badCC && !s.alertDismissed && s.status !== 'left') {
            actRaw.push({ date: cIn, html: `<div class="flex items-center justify-between py-1 border-b border-orange-100 last:border-0 hover:bg-orange-50 gap-1.5"><div class="flex items-center cursor-pointer flex-1 min-w-0 gap-1.5" onclick="window.editStaff('${s.id}')"><span class="font-black text-xs text-slate-700 w-[76px] shrink-0 truncate" title="${assigned}">${assigned}</span><div class="flex-1 min-w-0 leading-tight truncate"><span class="font-black text-xs text-slate-700">${name}</span><br><span class="text-[9px] text-slate-500 font-bold">In: ${cIn}</span> <span class="text-[10px] bg-red-500 text-white px-1 rounded uppercase font-bold ml-1">BAD CC</span></div></div><button onclick="event.stopPropagation(); window.dismissAlert('${s.id}')" data-tip="dash.dismissAlert" class="p-1 text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 shadow-sm ml-1 cursor-pointer shrink-0"><i data-lucide="check" size="14"></i></button></div>` });
        }
    });

    if ($('dash-arr-count')) $('dash-arr-count').innerText = arr.length;
    if ($('dash-arr-list')) $('dash-arr-list').innerHTML = arr.length ? arr.join('') : '<div class="text-slate-400 italic text-center py-2">No arrivals</div>';
    if ($('dash-dep-count')) $('dash-dep-count').innerText = dep.length;
    if ($('dash-dep-list')) $('dash-dep-list').innerHTML = dep.length ? dep.join('') : '<div class="text-slate-400 italic text-center py-2">No departures</div>';
    if ($('dash-stay-count')) $('dash-stay-count').innerText = stay.length;
    if ($('dash-stay-list')) $('dash-stay-list').innerHTML = stay.length ? stay.join('') : '<div class="text-slate-400 italic text-center py-2">No stay-overs</div>';

    // Sort New Bookings newest-first and ensure it sits as the FIRST card
    inboxRaw.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
    const gridContainer = $('dash-cards-grid') || $('dash-arr-list')?.parentElement?.parentElement;
    let inboxCard = $('dash-new-bookings-card');
    if (gridContainer && !inboxCard) {
        inboxCard = document.createElement('div');
        inboxCard.id = 'dash-new-bookings-card';
        inboxCard.className = 'dash-card break-inside-avoid mb-2 border-sky-300 bg-sky-50/40';
        inboxCard.setAttribute('data-tip', 'dash.newBookings');
        gridContainer.insertBefore(inboxCard, gridContainer.firstElementChild);
    }
    if (inboxCard) {
        inboxCard.innerHTML = `
            <div class="dash-title flex justify-between items-center text-sky-800 border-sky-200">
                <span><i data-lucide="sparkles" size="12" class="inline mb-0.5 text-sky-600"></i> New Bookings</span>
                <span class="bg-sky-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black">${inboxRaw.length}</span>
            </div>
            <div class="space-y-0.5 text-xs max-h-[340px] overflow-y-auto no-scrollbar">
                ${inboxRaw.length ? inboxRaw.map(x => x.html).join('') : '<div class="text-slate-400 italic text-center py-2">No unreviewed bookings</div>'}
            </div>
        `;
    }

    // Sort action items strictly by trigger date (Past -> Future)
    actRaw.sort((a, b) => a.date.localeCompare(b.date));
    const actHtml = actRaw.map(x => x.html).join('');
    if ($('dash-act-list')) $('dash-act-list').innerHTML = actRaw.length ? actHtml : '<div class="text-green-500 font-black text-center py-2"><i data-lucide="check-circle" size="14" class="inline"></i> All clear!</div>';

    // Mount Price Check inputs if missing
    const ratesCard = $('dash-rates-list')?.parentElement;
    let dashPcIn = $('dash-pc-in');
    let dashPcOut = $('dash-pc-out');

    if (ratesCard && !dashPcIn) {
        ratesCard.setAttribute('data-tip', 'dash.liveChecker');
        ratesCard.innerHTML = `
            <div class="dash-title flex justify-between items-center text-indigo-700 border-indigo-200 pb-1 border-b">
                <span><i data-lucide="tags" size="12" class="inline mb-0.5"></i> Price Check</span>
                <span class="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">DEF Non-Ref</span>
            </div>
            <div class="flex gap-1 mt-1.5 mb-1.5 shrink-0">
                <input type="date" id="dash-pc-in" class="w-full text-[9px] font-bold p-0.5 border border-indigo-300 rounded outline-none text-center" onchange="window.runDashPriceCheck()">
                <input type="date" id="dash-pc-out" class="w-full text-[9px] font-bold p-0.5 border border-indigo-300 rounded outline-none text-center" onchange="window.runDashPriceCheck()">
                <input type="number" id="dash-pc-pax" value="1" min="1" data-tip="pms.pax" class="w-8 text-[9px] font-bold p-0.5 text-center border border-indigo-300 rounded outline-none" oninput="window.runDashPriceCheck()">
            </div>
            <div id="dash-rates-list" class="text-[11px] font-black space-y-0.5 text-indigo-900 flex-1 overflow-y-auto min-h-[60px] no-scrollbar"></div>
        `;
        dashPcIn = $('dash-pc-in');
        dashPcOut = $('dash-pc-out');

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

function resolveLinkedFallbackQuote(cat, checkIn, nights) {
    const rels = window.masterPricing?.relationships || [];
    const catLower = String(cat || '').trim().toLowerCase();
    const rel = rels.find(r => {
        const tgt = String(r.target || r.to || r.roomB || '').trim().toLowerCase();
        const anc = String(r.anchor || r.source || r.from || r.roomA || '').trim();
        return tgt === catLower && anc && anc !== 'unlinked';
    });
    if (!rel) return null;

    const anchorCat = rel.anchor || rel.source || rel.from || rel.roomA;
    const anchorQuote = getCmStayQuote({ checkIn, nights, roomCategory: anchorCat, planType: 'DEF_NON_REF' });
    if (!anchorQuote || !anchorQuote.complete || anchorQuote.total === null) return null;

    const op = rel.op || '+';
    const val = parseFloat(rel.val) || 0;
    let derivedTotal = anchorQuote.total;

    if (op === '+' || op === '+$') derivedTotal = anchorQuote.total + (val * nights);
    else if (op === '-' || op === '-$') derivedTotal = Math.max(0, anchorQuote.total - (val * nights));
    else if (op === '+%') derivedTotal = Math.round(anchorQuote.total * (1 + val / 100));
    else if (op === '-%') derivedTotal = Math.round(anchorQuote.total * (1 - val / 100));
    else if (op === '=') derivedTotal = val * nights;

    return {
        complete: true,
        total: Math.round(derivedTotal),
        restrictions: anchorQuote.restrictions
    };
}

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
        let quote = getCmStayQuote({ checkIn: cI, nights: n, roomCategory: cat, planType: 'DEF_NON_REF' });
        if (!quote.complete || quote.total === null) {
            const linkedQuote = resolveLinkedFallbackQuote(cat, cI, n);
            if (linkedQuote) {
                quote = {
                    ...linkedQuote,
                    restrictions: {
                        stop: quote.restrictions?.stop || linkedQuote.restrictions?.stop || false,
                        cta: quote.restrictions?.cta || linkedQuote.restrictions?.cta || false,
                        maxMinStay: Math.max(quote.restrictions?.maxMinStay || 1, linkedQuote.restrictions?.maxMinStay || 1)
                    }
                };
            }
        }

        const catUnits = hotelRooms.filter(r => (r.category || r.type) === cat);
        const isDorm = catUnits.some(r => !r.isPrivate && (r.isDorm === true || (r.rule && r.rule !== 'private') || cat.toLowerCase().includes('dorm')));
        const maxPaxPerUnit = isDorm ? 1 : (parseInt(catUnits[0]?.maxOccupancy || catUnits[0]?.occAdults || 2, 10) || 2);
        const unitsNeeded = Math.max(1, Math.ceil(pax / maxPaxPerUnit));

        const badges = [];
        if (quote.restrictions.stop) badges.push(`<span class="px-1 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-300 text-[8.5px] font-black uppercase">STOP</span>`);
        if (quote.restrictions.cta) badges.push(`<span class="px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[8.5px] font-black uppercase">CTA</span>`);
        if (quote.restrictions.maxMinStay > n) badges.push(`<span class="px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 border border-indigo-300 text-[8.5px] font-black uppercase">Min ${quote.restrictions.maxMinStay}n</span>`);

        let priceHtml = `<span class="text-slate-400 font-bold text-[10px]">No Rate</span>`;
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

export const openInboxBookingForReview = id => {
    const s = (window.staff || []).find(x => x.id === id);
    window._reviewingInboxBookingId = id;

    if (!window._dashCloseHooked && typeof window.closeGuestModal === 'function') {
        const origClose = window.closeGuestModal;
        window.closeGuestModal = (...args) => {
            const reviewId = window._reviewingInboxBookingId;
            origClose(...args);
            if (reviewId) {
                const updated = (window.staff || []).find(x => x.id === reviewId);
                const hiddenStatus = document.getElementById('guest-status-hidden')?.value;
                const isStillNew = (updated ? updated.status === 'new' : hiddenStatus === 'new');
                const hasOtaAlert = !!(updated && updated.otaAlert);
                if (!isStillNew && !hasOtaAlert) {
                    window._reviewingInboxBookingId = null;
                    if (typeof window.switchTab === 'function') {
                        window.switchTab('dashboard');
                    }
                }
            }
        };
        window._dashCloseHooked = true;
    }

    if (s?.checkIn) {
        const targetMs = parseYMD(s.checkIn) - (2 * 86400000);
        if (window.viewStart instanceof Date) {
            window.viewStart.setTime(targetMs);
        } else {
            window.viewStart = new Date(targetMs);
        }
    }

    if (typeof window.switchTab === 'function') {
        window.switchTab('calendar');
    }
    if (typeof window.editStaff === 'function') {
        window.editStaff(id);
    }
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
window.openInboxBookingForReview = openInboxBookingForReview;
window.openNewBookingForReview = openInboxBookingForReview;
window.dismissAlert = dismissAlert;
