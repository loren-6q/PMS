// ==========================================================================
// cm/cm-promos.js - Margin-Preserving OTA Deals & Promotions Calculator
// Wild & Wandering Channel Manager
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { CANONICAL_OTA_LIST, getChannelByCode, resolveChannelCode } from '../core/channels.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';

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

export function openAddPromoModal() {
    const modal = document.getElementById('promo-modal');
    if (!modal) return;

    populatePromoScopeDropdown();
    const idEl = document.getElementById('promo-rule-id');
    const nameEl = document.getElementById('promo-name');
    const discEl = document.getElementById('promo-discount-pct');

    if (idEl) idEl.value = '';
    if (nameEl) nameEl.value = '';
    if (discEl) discEl.value = '15';

    updatePromoModalMath();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
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

    if (!name || discountPct <= 0 || discountPct >= 100) {
        return customAlert("Validation Error", "Please provide a promo campaign name and discount (1-99%).");
    }

    const rules = window.promoRules || [];
    const ruleId = document.getElementById('promo-rule-id')?.value || 'prm_' + Math.random().toString(36).substr(2, 7);

    const existingIdx = rules.findIndex(r => r.id === ruleId);
    const newRule = {
        id: ruleId,
        name: name.toUpperCase(),
        channel,
        discountPct,
        isAlways: true,
        startDate: null,
        endDate: null,
        scope,
        active: true,
        updatedAt: new Date().toISOString()
    };

    if (existingIdx > -1) rules[existingIdx] = newRule;
    else rules.push(newRule);

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
        await updateDoc(propRef, { promoRules: rules });
        window.promoRules = rules;

        const modal = document.getElementById('promo-modal');
        if (modal) modal.classList.add('hidden');

        renderPromoRulesTable();
        window.markUnsavedChanges();
        renderRateMatrix();
        customAlert("Promo Saved", `Promotion "${name}" saved.`);
    } catch (err) {
        customAlert("Save Error", err.message);
    }
}

export function renderPromoRulesTable() {
    const tbody = document.getElementById('promo-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rules = window.promoRules || [];
    if (rules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 font-bold uppercase text-xs">No active OTA promo rules configured.</td></tr>`;
        return;
    }

    rules.forEach((r, idx) => {
        const markup = ((1 / (1 - (r.discountPct / 100))) - 1) * 100;
        const dateDisplay = r.isAlways ? '<span class="text-blue-600">ALWAYS ACTIVE</span>' : `${r.startDate || '--'} → ${r.endDate || '--'}`;
        const chanLabel = r.channel === 'ALL' ? 'ALL' : `${resolveChannelCode(r.channel)} - ${getChannelByCode(r.channel).name}`;

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200 text-xs";
        tr.innerHTML = `
            <td class="p-2 font-bold text-indigo-700">${chanLabel}</td>
            <td class="p-2 font-black text-slate-800">${r.name}</td>
            <td class="p-2 font-mono text-[11px]">${dateDisplay}</td>
            <td class="p-2 text-center text-rose-600 font-black">${r.discountPct}%</td>
            <td class="p-2 text-center text-emerald-600 font-black font-mono">+${markup.toFixed(1)}%</td>
            <td class="p-2 font-bold">${r.scope}</td>
            <td class="p-2 text-center">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">
                    ${r.active ? 'ACTIVE' : 'OFF'}
                </span>
            </td>
            <td class="p-2 text-center">
                <button type="button" onclick="window.deletePromoRule(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

export async function deletePromoRule(idx) {
    customAlert("Delete Promo", "Delete this promotion rule?", true, async () => {
        const rules = window.promoRules || [];
        rules.splice(idx, 1);
        try {
            const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
            await updateDoc(propRef, { promoRules: rules });
            window.promoRules = rules;
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
    window.openAddPromoModal = openAddPromoModal;
    window.populatePromoScopeDropdown = populatePromoScopeDropdown;
    window.updatePromoModalMath = updatePromoModalMath;
    window.savePromoRule = savePromoRule;
    window.renderPromoRulesTable = renderPromoRulesTable;
    window.deletePromoRule = deletePromoRule;
}
