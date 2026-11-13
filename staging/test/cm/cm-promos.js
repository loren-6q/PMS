// ==========================================================================
// cm/cm-promos.js - Margin-Preserving OTA Deals & Promotions Calculator
// Wild & Wandering Channel Manager
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { CANONICAL_OTA_LIST, getChannelByCode, resolveChannelCode } from '../core/channels.js';
import { getLocalYMD, parseYMD } from '../core/dates.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { evaluatePromoStack } from './cm-ripple.js';

function getOrderedChannelOptionsHtml(includeAll = true) {
    const activeCodes = new Set(
        (window.channexRateMap || []).map(r => resolveChannelCode(r.channel)).filter(c => c !== 'DEF' && c !== 'WEB')
    );
    const primaryOtas = CANONICAL_OTA_LIST.filter(o => activeCodes.has(o.code));
    const otherOtas = CANONICAL_OTA_LIST.filter(o => !activeCodes.has(o.code));

    return (includeAll ? `<option value="ALL">All Channels</option>` : '') +
        primaryOtas.map(o => `<option value="${o.code}">${o.code} - ${o.name}</option>`).join('') +
        otherOtas.map(o => `<option value="${o.code}">${o.code} - ${o.name}</option>`).join('');
}

function markPromoStayDatesDirty(rule) {
    if (!rule) return;
    window.dirtyDates = window.dirtyDates || new Set();
    const todayStr = getLocalYMD(new Date());
    const stayAlw = rule.stayAlways !== undefined ? !!rule.stayAlways : !!rule.isAlways;
    const sStart = rule.stayStart || rule.startDate || todayStr;
    const sEnd = rule.stayEnd || rule.endDate || '';

    const startStr = (!stayAlw && sStart && sStart > todayStr) ? sStart : todayStr;
    const endStr = (!stayAlw && sEnd)
        ? sEnd
        : getLocalYMD(new Date(parseYMD(todayStr) + (365 * 86400000)));

    const sU = parseYMD(startStr);
    const eU = parseYMD(endStr);
    for (let d = sU; d <= eU; d += 86400000) {
        window.dirtyDates.add(getLocalYMD(new Date(d)));
    }
}

export function detectPromoScheduleShifts(lastSyncDateStr) {
    const todayStr = getLocalYMD(new Date());
    const rules = (window.promoRules || []).filter(r => r && r.active);
    if (!lastSyncDateStr || lastSyncDateStr >= todayStr || rules.length === 0) return [];

    const channels = new Set(['BDC', 'HWL', 'AGO', 'EXP', 'ABB']);
    rules.forEach(r => { if (r.channel && r.channel !== 'ALL') channels.add(resolveChannelCode(r.channel)); });
    const rooms = (window.roomTypes && window.roomTypes.length) ? window.roomTypes : ['ALL'];

    const shiftedDates = new Set();
    const todayMs = parseYMD(todayStr);

    for (let i = 0; i <= 365; i++) {
        const dStr = getLocalYMD(new Date(todayMs + (i * 86400000)));
        let changed = false;
        for (const ch of channels) {
            for (const rm of rooms) {
                const prev = evaluatePromoStack(dStr, ch, rm, lastSyncDateStr);
                const curr = evaluatePromoStack(dStr, ch, rm, todayStr);
                if (Math.abs(prev.multiplier - curr.multiplier) > 0.0001) {
                    changed = true;
                    break;
                }
            }
            if (changed) break;
        }
        if (changed) shiftedDates.add(dStr);
    }

    const list = Array.from(shiftedDates).sort();
    if (list.length > 0) {
        window.dirtyDates = window.dirtyDates || new Set();
        list.forEach(d => window.dirtyDates.add(d));
        if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();

        const banner = document.getElementById('promo-shift-banner');
        const desc = document.getElementById('promo-shift-desc');
        if (banner && desc) {
            desc.innerText = `${list.length} stay night(s) (${list[0]} → ${list[list.length - 1]}) changed promo pricing since ${lastSyncDateStr}.`;
            banner.classList.remove('hidden');
        }
    }
    return list;
}

export function populatePromoScopeDropdown() {
    const chanEl = document.getElementById('promo-channel');
    if (chanEl) chanEl.innerHTML = getOrderedChannelOptionsHtml(true);
}

export function setPromoStackMode(isStackable) {
    const hidden = document.getElementById('promo-stackable');
    const btnNo = document.getElementById('promo-stack-btn-no');
    const btnYes = document.getElementById('promo-stack-btn-yes');
    if (hidden) hidden.value = isStackable ? 'true' : 'false';

    if (btnNo && btnYes) {
        btnNo.className = !isStackable
            ? "px-2 py-1 rounded border text-[10px] font-black uppercase cursor-pointer bg-slate-800 text-white border-slate-800"
            : "px-2 py-1 rounded border text-[10px] font-black uppercase cursor-pointer bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200";
        btnYes.className = isStackable
            ? "px-2 py-1 rounded border text-[10px] font-black uppercase cursor-pointer bg-pink-600 text-white border-pink-600"
            : "px-2 py-1 rounded border text-[10px] font-black uppercase cursor-pointer bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200";
    }
}

export function renderPromoRoomPills(selectedScopes = ['ALL']) {
    const container = document.getElementById('promo-room-pills');
    if (!container) return;

    const normalized = Array.isArray(selectedScopes) && selectedScopes.length ? selectedScopes : ['ALL'];
    const isAll = normalized.includes('ALL');
    const roomList = window.roomTypes || [];

    const allBtn = `<button type="button" data-scope="ALL" onclick="window.togglePromoRoomPill('ALL')" class="promo-scope-pill px-2 py-0.5 rounded text-[10px] font-black uppercase border cursor-pointer transition-colors ${isAll ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}">All Categories</button>`;

    const roomBtns = roomList.map(rt => {
        const active = !isAll && normalized.includes(rt);
        return `<button type="button" data-scope="${rt}" onclick="window.togglePromoRoomPill(this.dataset.scope)" class="promo-scope-pill px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}">${rt}</button>`;
    }).join('');

    container.innerHTML = allBtn + roomBtns;
}

export function togglePromoRoomPill(scopeVal) {
    const pills = Array.from(document.querySelectorAll('.promo-scope-pill'));
    if (scopeVal === 'ALL') {
        renderPromoRoomPills(['ALL']);
        return;
    }

    const current = pills
        .filter(p => p.dataset.scope !== 'ALL' && p.classList.contains('bg-indigo-600'))
        .map(p => p.dataset.scope);

    const idx = current.indexOf(scopeVal);
    if (idx > -1) current.splice(idx, 1);
    else current.push(scopeVal);

    const allRooms = window.roomTypes || [];
    if (current.length === 0 || (allRooms.length > 0 && current.length === allRooms.length)) {
        renderPromoRoomPills(['ALL']);
    } else {
        renderPromoRoomPills(current);
    }
}

export function getSelectedPromoScopes() {
    const pills = Array.from(document.querySelectorAll('.promo-scope-pill'));
    const allPill = pills.find(p => p.dataset.scope === 'ALL');
    if (allPill && allPill.classList.contains('bg-indigo-600')) return ['ALL'];

    const picked = pills
        .filter(p => p.dataset.scope !== 'ALL' && p.classList.contains('bg-indigo-600'))
        .map(p => p.dataset.scope);

    return picked.length > 0 ? picked : ['ALL'];
}

export function togglePromoBookInputs(isAlways) {
    const wrap = document.getElementById('promo-book-wrap');
    if (wrap) {
        wrap.classList.toggle('opacity-40', !!isAlways);
        wrap.classList.toggle('pointer-events-none', !!isAlways);
    }
}

export function togglePromoStayInputs(isAlways) {
    const wrap = document.getElementById('promo-stay-wrap');
    if (wrap) {
        wrap.classList.toggle('opacity-40', !!isAlways);
        wrap.classList.toggle('pointer-events-none', !!isAlways);
    }
}

export function openAddPromoModal(existingRule = null) {
    const modal = document.getElementById('promo-modal');
    if (!modal) return;

    populatePromoScopeDropdown();
    const today = getLocalYMD(new Date());

    const titleEl = document.getElementById('promo-modal-title');
    const idEl = document.getElementById('promo-rule-id');
    const chanEl = document.getElementById('promo-channel');
    const nameEl = document.getElementById('promo-name');
    const discEl = document.getElementById('promo-discount-pct');
    const advEl = document.getElementById('promo-min-advance');
    const bookAlwEl = document.getElementById('promo-book-always');
    const bookStartEl = document.getElementById('promo-book-start');
    const bookEndEl = document.getElementById('promo-book-end');
    const stayAlwEl = document.getElementById('promo-stay-always');
    const stayStartEl = document.getElementById('promo-stay-start');
    const stayEndEl = document.getElementById('promo-stay-end');
    const exclEvtEl = document.getElementById('promo-exclude-events');
    const actEl = document.getElementById('promo-active-toggle');

    if (existingRule) {
        if (titleEl) titleEl.innerText = 'Edit OTA Promotion';
        if (idEl) idEl.value = existingRule.id || '';
        if (chanEl) chanEl.value = existingRule.channel === 'ALL' ? 'ALL' : resolveChannelCode(existingRule.channel);
        if (nameEl) nameEl.value = existingRule.name || '';
        if (discEl) discEl.value = existingRule.discountPct ?? 15;
        if (advEl) advEl.value = existingRule.minAdvanceDays || 0;

        const hasBookBounds = !!(existingRule.bookStart || existingRule.bookEnd);
        const isBookAlw = existingRule.bookAlways !== undefined ? !!existingRule.bookAlways : !hasBookBounds;
        if (bookAlwEl) bookAlwEl.checked = isBookAlw;
        if (bookStartEl) bookStartEl.value = existingRule.bookStart || today;
        if (bookEndEl) bookEndEl.value = existingRule.bookEnd || today;
        togglePromoBookInputs(isBookAlw);

        const isStayAlw = existingRule.stayAlways !== undefined ? !!existingRule.stayAlways : !!existingRule.isAlways;
        if (stayAlwEl) stayAlwEl.checked = isStayAlw;
        if (stayStartEl) stayStartEl.value = existingRule.stayStart || existingRule.startDate || today;
        if (stayEndEl) stayEndEl.value = existingRule.stayEnd || existingRule.endDate || today;
        togglePromoStayInputs(isStayAlw);

        if (exclEvtEl) exclEvtEl.checked = !!existingRule.excludeEvents;

        const existingScopes = Array.isArray(existingRule.scopes) && existingRule.scopes.length
            ? existingRule.scopes
            : [existingRule.scope || 'ALL'];
        renderPromoRoomPills(existingScopes);
        setPromoStackMode(!!existingRule.stackable);
        if (actEl) actEl.checked = existingRule.active !== false;
    } else {
        if (titleEl) titleEl.innerText = 'Add OTA Promotion';
        if (idEl) idEl.value = '';
        if (chanEl) chanEl.value = 'ALL';
        if (nameEl) nameEl.value = '';
        if (discEl) discEl.value = '15';
        if (advEl) advEl.value = '0';

        if (bookAlwEl) bookAlwEl.checked = true;
        if (bookStartEl) bookStartEl.value = today;
        if (bookEndEl) bookEndEl.value = today;
        togglePromoBookInputs(true);

        if (stayAlwEl) stayAlwEl.checked = false;
        if (stayStartEl) stayStartEl.value = today;
        if (stayEndEl) stayEndEl.value = today;
        togglePromoStayInputs(false);

        if (exclEvtEl) exclEvtEl.checked = false;

        renderPromoRoomPills(['ALL']);
        setPromoStackMode(false);
        if (actEl) actEl.checked = true;
    }

    updatePromoModalMath();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function editPromoRule(idx) {
    const rule = (window.promoRules || [])[idx];
    if (rule) openAddPromoModal(rule);
}

export function updatePromoModalMath() {
    const disc = parseFloat(document.getElementById('promo-discount-pct')?.value) || 0;
    const calcEl = document.getElementById('promo-calculated-markup');
    if (!calcEl) return;
    if (disc <= 0 || disc >= 100) {
        calcEl.value = "+0%";
    } else {
        const markup = ((1 / (1 - (disc / 100))) - 1) * 100;
        calcEl.value = `+${markup.toFixed(1)}%`;
    }
}

export async function savePromoRule() {
    const name = document.getElementById('promo-name')?.value.trim();
    const discountPct = parseFloat(document.getElementById('promo-discount-pct')?.value) || 0;
    const minAdvanceDays = Math.max(0, parseInt(document.getElementById('promo-min-advance')?.value, 10) || 0);
    const channel = document.getElementById('promo-channel')?.value || 'ALL';
    const scopes = getSelectedPromoScopes();
    const stackable = document.getElementById('promo-stackable')?.value === 'true';

    const bookAlways = !!document.getElementById('promo-book-always')?.checked;
    const bookStart = document.getElementById('promo-book-start')?.value || null;
    const bookEnd = document.getElementById('promo-book-end')?.value || null;

    const stayAlways = !!document.getElementById('promo-stay-always')?.checked;
    const stayStart = document.getElementById('promo-stay-start')?.value || null;
    const stayEnd = document.getElementById('promo-stay-end')?.value || null;
    const excludeEvents = !!document.getElementById('promo-exclude-events')?.checked;
    const active = document.getElementById('promo-active-toggle')?.checked !== false;

    if (!name || discountPct <= 0 || discountPct >= 100) {
        return customAlert("Validation Error", "Please provide a promo campaign name and discount (1-99%).");
    }
    if (!bookAlways) {
        if (!bookStart || !bookEnd) return customAlert("Validation Error", "Select both Bookable From and Bookable Until dates, or check Ongoing / Now.");
        if (bookStart > bookEnd) return customAlert("Validation Error", "Bookable Until must be on or after Bookable From.");
    }
    if (!stayAlways) {
        if (!stayStart || !stayEnd) return customAlert("Validation Error", "Select both Stay From and Stay Until dates, or check Always Active.");
        if (stayStart > stayEnd) return customAlert("Validation Error", "Stay Until must be on or after Stay From.");
    }

    const rules = window.promoRules || [];
    const ruleId = document.getElementById('promo-rule-id')?.value || 'prm_' + Math.random().toString(36).substr(2, 7);

    const existingIdx = rules.findIndex(r => r.id === ruleId);
    const prevRule = existingIdx > -1 ? rules[existingIdx] : null;
    const newRule = {
        id: ruleId,
        name: name.toUpperCase(),
        channel,
        discountPct,
        minAdvanceDays,
        stackable,
        bookAlways,
        bookStart: bookAlways ? null : bookStart,
        bookEnd: bookAlways ? null : bookEnd,
        stayAlways,
        stayStart: stayAlways ? null : stayStart,
        stayEnd: stayAlways ? null : stayEnd,
        isAlways: stayAlways,
        startDate: stayAlways ? null : stayStart,
        endDate: stayAlways ? null : stayEnd,
        excludeEvents,
        scopes,
        scope: scopes.includes('ALL') ? 'ALL' : scopes.join(', '),
        active,
        updatedAt: new Date().toISOString()
    };

    if (existingIdx > -1) rules[existingIdx] = newRule;
    else rules.push(newRule);

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
        await updateDoc(propRef, { promoRules: rules });
        window.promoRules = rules;

        if (prevRule) markPromoStayDatesDirty(prevRule);
        markPromoStayDatesDirty(newRule);

        const modal = document.getElementById('promo-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        renderPromoRulesTable();
        window.markUnsavedChanges();
        renderRateMatrix();
        customAlert("Promo Saved", `Promotion "${name}" saved. Click "SAVE & SYNC" to push updated rates.`);
    } catch (err) {
        customAlert("Save Error", err.message);
    }
}

export async function togglePromoRuleActive(idx) {
    const rules = window.promoRules || [];
    const rule = rules[idx];
    if (!rule) return;

    rule.active = !rule.active;
    rule.updatedAt = new Date().toISOString();

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
        await updateDoc(propRef, { promoRules: rules });
        window.promoRules = rules;
        markPromoStayDatesDirty(rule);
        renderPromoRulesTable();
        window.markUnsavedChanges();
        renderRateMatrix();
    } catch (err) {
        customAlert("Update Failed", err.message);
    }
}

export function renderPromoStackSimulator() {
    const dateEl = document.getElementById('sim-date');
    const chanEl = document.getElementById('sim-channel');
    const roomEl = document.getElementById('sim-room');
    const outEl = document.getElementById('sim-output');
    if (!dateEl || !chanEl || !roomEl || !outEl) return;

    if (!dateEl.value) dateEl.value = getLocalYMD(new Date());

    if (chanEl.options.length === 0) {
        chanEl.innerHTML = getOrderedChannelOptionsHtml(false);
        if (Array.from(chanEl.options).some(o => o.value === 'BDC')) chanEl.value = 'BDC';
    }

    const rooms = window.roomTypes || [];
    if (roomEl.options.length !== rooms.length) {
        roomEl.innerHTML = rooms.map(rt => `<option value="${rt}">${rt}</option>`).join('');
    }

    const res = evaluatePromoStack(dateEl.value, chanEl.value, roomEl.value);
    if (res.applied.length === 0) {
        outEl.innerHTML = `<span class="text-slate-400">No promos apply today for this stay date / channel / room (0% markup).</span>`;
        return;
    }

    const parts = res.applied.map(p => `<span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white font-black text-[10px]">${p.name} (${p.discountPct}%)</span>`);
    const beatNote = res.superseded.length > 0
        ? ` <span class="text-slate-400 text-[10px]">[beat ${res.superseded.map(s => `${s.name} ${s.discountPct}%`).join(', ')}]</span>`
        : '';

    outEl.innerHTML = `
        <span class="inline-flex items-center gap-1 flex-wrap">
            ${parts.join(' <span class="text-pink-400 font-black">+</span> ')}${beatNote}
            <span class="text-slate-400 mx-1">&rarr;</span>
            <span>Eff. Disc: <strong class="text-rose-400">${res.effectiveDiscountPct.toFixed(1)}%</strong></span>
            <span class="text-slate-500 mx-0.5">|</span>
            <span>Total Markup: <strong class="text-emerald-400 font-mono">+${res.totalMarkupPct.toFixed(1)}%</strong></span>
        </span>
    `;
}

export function renderPromoRulesTable() {
    const tbody = document.getElementById('promo-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rules = window.promoRules || [];
    const today = getLocalYMD(new Date());

    if (rules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-6 text-slate-400 font-bold uppercase text-xs">No active OTA promo rules configured.</td></tr>`;
        renderPromoStackSimulator();
        return;
    }

    rules.forEach((r, idx) => {
        const hasBookBounds = !!(r.bookStart || r.bookEnd);
        const bookAlw = r.bookAlways !== undefined ? !!r.bookAlways : !hasBookBounds;
        const stayAlw = r.stayAlways !== undefined ? !!r.stayAlways : !!r.isAlways;
        const sStart = r.stayStart || r.startDate || '';
        const sEnd = r.stayEnd || r.endDate || '';

        const isNotStartedYet = !bookAlw && r.bookStart && today < r.bookStart;
        const isBookingEnded = !bookAlw && r.bookEnd && today > r.bookEnd;
        const isStayExpired = !stayAlw && sEnd && sEnd < today;
        const isCurrentlyLive = r.active && !isNotStartedYet && !isBookingEnded && !isStayExpired;

        const markup = ((1 / (1 - (r.discountPct / 100))) - 1) * 100;
        const chanLabel = r.channel === 'ALL' ? 'ALL' : `${resolveChannelCode(r.channel)} - ${getChannelByCode(r.channel).name}`;

        let bookHtml = bookAlw
            ? `<span class="text-slate-600">Ongoing</span>`
            : `<span>${r.bookStart || '--'} → ${r.bookEnd || '--'}</span>`;
        if (r.minAdvanceDays > 0) {
            bookHtml += `<span class="block text-[9.5px] text-amber-700 font-black">${r.minAdvanceDays}+ days ahead</span>`;
        }

        let stayHtml = stayAlw
            ? `<span class="text-blue-600">Always active</span>`
            : `<span>${sStart || '--'} → ${sEnd || '--'}</span>`;
        if (r.excludeEvents) {
            stayHtml += `<span class="block text-[9.5px] text-pink-700 font-black">Excl. Event Dates</span>`;
        }

        const stackBadge = r.stackable
            ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-pink-100 text-pink-800 border border-pink-200">STACKABLE</span>`
            : `<span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">MAX WINS</span>`;

        const ruleScopes = Array.isArray(r.scopes) && r.scopes.length ? r.scopes : [r.scope || 'ALL'];
        const scopeHtml = ruleScopes.includes('ALL')
            ? `<span class="font-bold text-slate-700">ALL</span>`
            : `<div class="flex flex-wrap gap-1">${ruleScopes.map(sc => `<span class="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[9.5px] font-bold">${window.displayAbbrev?.[sc] || sc}</span>`).join('')}</div>`;

        let statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-200 text-slate-600">PAUSED</span>`;
        if (r.active) {
            if (isBookingEnded || isStayExpired) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-200 text-slate-500">ENDED</span>`;
            } else if (isNotStartedYet) {
                const daysUntil = Math.round((parseYMD(r.bookStart) - parseYMD(today)) / 86400000);
                statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">IN ${daysUntil}D</span>`;
            } else if (isCurrentlyLive) {
                const endsNote = (!bookAlw && r.bookEnd)
                    ? ` • ${Math.max(0, Math.round((parseYMD(r.bookEnd) - parseYMD(today)) / 86400000))}D LEFT`
                    : '';
                statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">LIVE${endsNote}</span>`;
            }
        }

        const tr = document.createElement('tr');
        tr.className = `border-b border-slate-200 text-xs hover:bg-slate-50 ${(isBookingEnded || isStayExpired) ? 'opacity-55' : ''}`;
        tr.innerHTML = `
            <td class="p-2 font-bold text-indigo-700">${chanLabel}</td>
            <td class="p-2 font-black text-slate-800">${r.name}</td>
            <td class="p-2">${stackBadge}</td>
            <td class="p-2 font-mono text-[11px]">${bookHtml}</td>
            <td class="p-2 font-mono text-[11px]">${stayHtml}</td>
            <td class="p-2 text-center text-rose-600 font-black">${r.discountPct}%</td>
            <td class="p-2 text-center text-emerald-600 font-black font-mono">+${markup.toFixed(1)}%</td>
            <td class="p-2">${scopeHtml}</td>
            <td class="p-2 text-center">${statusBadge}</td>
            <td class="p-2 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <button type="button" onclick="window.editPromoRule(${idx})" class="text-slate-500 hover:text-indigo-600 cursor-pointer p-1" title="Edit Promo">
                        <i data-lucide="pencil" size="13"></i>
                    </button>
                    <button type="button" onclick="window.togglePromoRuleActive(${idx})" class="text-slate-500 hover:text-emerald-600 cursor-pointer p-1" title="${r.active ? 'Pause Promo' : 'Activate Promo'}">
                        <i data-lucide="${r.active ? 'power' : 'power-off'}" size="13"></i>
                    </button>
                    <button type="button" onclick="window.deletePromoRule(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-1" title="Delete Promo">
                        <i data-lucide="trash-2" size="13"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPromoStackSimulator();
    if (window.lucide) window.lucide.createIcons();
}

export async function deletePromoRule(idx) {
    customAlert("Delete Promo", "Delete this promotion rule?", true, async () => {
        const rules = window.promoRules || [];
        const removed = rules[idx];
        rules.splice(idx, 1);
        try {
            const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
            await updateDoc(propRef, { promoRules: rules });
            window.promoRules = rules;
            if (removed) markPromoStayDatesDirty(removed);
            renderPromoRulesTable();
            window.markUnsavedChanges();
            renderRateMatrix();
        } catch (err) {
            customAlert("Delete Failed", err.message);
        }
    });
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.detectPromoScheduleShifts = detectPromoScheduleShifts;
    window.setPromoStackMode = setPromoStackMode;
    window.renderPromoRoomPills = renderPromoRoomPills;
    window.togglePromoRoomPill = togglePromoRoomPill;
    window.getSelectedPromoScopes = getSelectedPromoScopes;
    window.renderPromoStackSimulator = renderPromoStackSimulator;
    window.togglePromoBookInputs = togglePromoBookInputs;
    window.togglePromoStayInputs = togglePromoStayInputs;
    window.openAddPromoModal = openAddPromoModal;
    window.editPromoRule = editPromoRule;
    window.populatePromoScopeDropdown = populatePromoScopeDropdown;
    window.updatePromoModalMath = updatePromoModalMath;
    window.savePromoRule = savePromoRule;
    window.togglePromoRuleActive = togglePromoRuleActive;
    window.renderPromoRulesTable = renderPromoRulesTable;
    window.deletePromoRule = deletePromoRule;
}
