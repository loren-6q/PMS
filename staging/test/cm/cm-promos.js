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

function markPromoDatesDirty(rule) {
    if (!rule) return;
    window.dirtyDates = window.dirtyDates || new Set();
    const todayStr = getLocalYMD(new Date());
    const startStr = (!rule.isAlways && rule.startDate && rule.startDate > todayStr) ? rule.startDate : todayStr;
    const endStr = (!rule.isAlways && rule.endDate)
        ? rule.endDate
        : getLocalYMD(new Date(parseYMD(todayStr) + (365 * 86400000)));

    const sU = parseYMD(startStr);
    const eU = parseYMD(endStr);
    for (let d = sU; d <= eU; d += 86400000) {
        window.dirtyDates.add(getLocalYMD(new Date(d)));
    }
}

export function populatePromoScopeDropdown() {
    const scopeEl = document.getElementById('promo-room-scope');
    if (scopeEl) {
        scopeEl.innerHTML = `<option value="ALL">All Categories</option>` +
            (window.roomTypes || []).map(t => `<option value="${t}">${t}</option>`).join('');
    }

    const chanEl = document.getElementById('promo-channel');
    if (chanEl) {
        const activeCodes = new Set(
            (window.channexRateMap || []).map(r => resolveChannelCode(r.channel)).filter(c => c !== 'DEF' && c !== 'WEB')
        );
        const primaryOtas = CANONICAL_OTA_LIST.filter(o => activeCodes.has(o.code));
        const otherOtas = CANONICAL_OTA_LIST.filter(o => !activeCodes.has(o.code));

        chanEl.innerHTML = `<option value="ALL">All Channels</option>` +
            primaryOtas.map(o => `<option value="${o.code}">${o.code} - ${o.name}</option>`).join('') +
            otherOtas.map(o => `<option value="${o.code}">${o.code} - ${o.name}</option>`).join('');
    }
}

export function togglePromoDateInputs(isAlways) {
    const wrap = document.getElementById('promo-date-wrap');
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
    const scopeEl = document.getElementById('promo-room-scope');
    const alwEl = document.getElementById('promo-always-active');
    const startEl = document.getElementById('promo-start-date');
    const endEl = document.getElementById('promo-end-date');
    const actEl = document.getElementById('promo-active-toggle');

    if (existingRule) {
        if (titleEl) titleEl.innerText = 'Edit OTA Promotion';
        if (idEl) idEl.value = existingRule.id || '';
        if (chanEl) chanEl.value = existingRule.channel === 'ALL' ? 'ALL' : resolveChannelCode(existingRule.channel);
        if (nameEl) nameEl.value = existingRule.name || '';
        if (discEl) discEl.value = existingRule.discountPct ?? 15;
        if (scopeEl) scopeEl.value = existingRule.scope || 'ALL';
        const isAlw = !!existingRule.isAlways;
        if (alwEl) alwEl.checked = isAlw;
        if (startEl) startEl.value = existingRule.startDate || today;
        if (endEl) endEl.value = existingRule.endDate || today;
        if (actEl) actEl.checked = existingRule.active !== false;
        togglePromoDateInputs(isAlw);
    } else {
        if (titleEl) titleEl.innerText = 'Add OTA Promotion';
        if (idEl) idEl.value = '';
        if (chanEl) chanEl.value = 'ALL';
        if (nameEl) nameEl.value = '';
        if (discEl) discEl.value = '15';
        if (scopeEl) scopeEl.value = 'ALL';
        if (alwEl) alwEl.checked = false;
        if (startEl) startEl.value = today;
        if (endEl) endEl.value = today;
        if (actEl) actEl.checked = true;
        togglePromoDateInputs(false);
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
    const channel = document.getElementById('promo-channel')?.value || 'ALL';
    const scope = document.getElementById('promo-room-scope')?.value || 'ALL';
    const isAlways = !!document.getElementById('promo-always-active')?.checked;
    const startDate = document.getElementById('promo-start-date')?.value || null;
    const endDate = document.getElementById('promo-end-date')?.value || null;
    const active = document.getElementById('promo-active-toggle')?.checked !== false;

    if (!name || discountPct <= 0 || discountPct >= 100) {
        return customAlert("Validation Error", "Please provide a promo campaign name and discount (1-99%).");
    }
    if (!isAlways) {
        if (!startDate || !endDate) {
            return customAlert("Validation Error", "Please select both a Start Date and an End Date, or check Always Active.");
        }
        if (startDate > endDate) {
            return customAlert("Validation Error", "End Date must be on or after Start Date.");
        }
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
        isAlways,
        startDate: isAlways ? null : startDate,
        endDate: isAlways ? null : endDate,
        scope,
        active,
        updatedAt: new Date().toISOString()
    };

    if (existingIdx > -1) rules[existingIdx] = newRule;
    else rules.push(newRule);

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
        await updateDoc(propRef, { promoRules: rules });
        window.promoRules = rules;

        if (prevRule) markPromoDatesDirty(prevRule);
        markPromoDatesDirty(newRule);

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
        markPromoDatesDirty(rule);
        renderPromoRulesTable();
        window.markUnsavedChanges();
        renderRateMatrix();
    } catch (err) {
        customAlert("Update Failed", err.message);
    }
}

export function renderPromoRulesTable() {
    const tbody = document.getElementById('promo-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rules = window.promoRules || [];
    const today = getLocalYMD(new Date());

    if (rules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 font-bold uppercase text-xs">No active OTA promo rules configured.</td></tr>`;
        return;
    }

    rules.forEach((r, idx) => {
        const isExpired = !r.isAlways && r.endDate && r.endDate < today;
        const isCurrentlyActive = r.active && !isExpired;
        const markup = ((1 / (1 - (r.discountPct / 100))) - 1) * 100;
        const dateDisplay = r.isAlways ? '<span class="text-blue-600">ALWAYS ACTIVE</span>' : `${r.startDate || '--'} → ${r.endDate || '--'}`;
        const chanLabel = r.channel === 'ALL' ? 'ALL' : `${resolveChannelCode(r.channel)} - ${getChannelByCode(r.channel).name}`;

        const tr = document.createElement('tr');
        tr.className = `border-b border-slate-200 text-xs hover:bg-slate-50 ${isExpired ? 'opacity-60' : ''}`;
        tr.innerHTML = `
            <td class="p-2 font-bold text-indigo-700">${chanLabel}</td>
            <td class="p-2 font-black text-slate-800">${r.name}</td>
            <td class="p-2 font-mono text-[11px]">${dateDisplay}</td>
            <td class="p-2 text-center text-rose-600 font-black">${r.discountPct}%</td>
            <td class="p-2 text-center text-emerald-600 font-black font-mono">+${markup.toFixed(1)}%</td>
            <td class="p-2 font-bold">${r.scope}</td>
            <td class="p-2 text-center">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${isCurrentlyActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">
                    ${isExpired ? 'EXPIRED' : (r.active ? 'ACTIVE' : 'OFF')}
                </span>
            </td>
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
            if (removed) markPromoDatesDirty(removed);
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
    window.togglePromoDateInputs = togglePromoDateInputs;
    window.openAddPromoModal = openAddPromoModal;
    window.editPromoRule = editPromoRule;
    window.populatePromoScopeDropdown = populatePromoScopeDropdown;
    window.updatePromoModalMath = updatePromoModalMath;
    window.savePromoRule = savePromoRule;
    window.togglePromoRuleActive = togglePromoRuleActive;
    window.renderPromoRulesTable = renderPromoRulesTable;
    window.deletePromoRule = deletePromoRule;
}
