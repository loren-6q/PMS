// ==========================================================================
// cm/cm-promos.js - Margin-Preserving OTA Deals & Promotions Calculator
// Wild & Wandering Channel Manager
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';

export function openAddPromoModal() {
    const modal = document.getElementById('promo-modal');
    if (!modal) return;
    document.getElementById('promo-rule-id').value = '';
    document.getElementById('promo-name').value = '';
    document.getElementById('promo-discount-pct').value = '15';
    updatePromoModalMath();

    modal.classList.add('active');
    modal.style.display = 'flex';
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
    const isAlways = document.getElementById('promo-always-active')?.checked;
    const startDate = document.getElementById('promo-start-date')?.value || null;
    const endDate = document.getElementById('promo-end-date')?.value || null;
    const scope = document.getElementById('promo-room-scope')?.value || 'ALL';

    if (!name || discountPct <= 0 || discountPct >= 100) {
        return customAlert("Validation Error", "Please provide a promo name and discount (1-99%).");
    }

    const rules = window.promoRules || [];
    rules.push({
        id: 'prm_' + Math.random().toString(36).substr(2, 7),
        name: name.toUpperCase(),
        channel,
        discountPct,
        isAlways,
        startDate: isAlways ? null : startDate,
        endDate: isAlways ? null : endDate,
        scope,
        active: true
    });

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
        await updateDoc(propRef, { promoRules: rules });
        window.promoRules = rules;

        document.getElementById('promo-modal').classList.remove('active');
        document.getElementById('promo-modal').style.display = 'none';

        renderPromoRulesTable();
        renderRateMatrix();
        customAlert("Promo Saved", `Promotion "${name}" added.`);
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
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 font-bold uppercase text-xs">No active OTA promo rules configured.</td></tr>`;
        return;
    }

    rules.forEach((r, idx) => {
        const markup = ((1 / (1 - (r.discountPct / 100))) - 1) * 100;
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200 text-xs";
        tr.innerHTML = `
            <td class="p-2 font-bold text-indigo-700">${r.channel}</td>
            <td class="p-2 font-black text-slate-800">${r.name}</td>
            <td class="p-2 text-center text-rose-600 font-black">${r.discountPct}%</td>
            <td class="p-2 text-center text-emerald-600 font-black font-mono">+${markup.toFixed(1)}%</td>
            <td class="p-2 font-bold">${r.scope}</td>
            <td class="p-2 text-center">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">
                    ${r.active ? 'ACTIVE' : 'OFF'}
                </span>
            </td>
            <td class="p-2 text-center">
                <button type="button" onclick="window.deletePromoRule(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export async function deletePromoRule(idx) {
    const rules = window.promoRules || [];
    rules.splice(idx, 1);
    const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId);
    await updateDoc(propRef, { promoRules: rules });
    renderPromoRulesTable();
    renderRateMatrix();
}

if (typeof window !== 'undefined') {
    window.openAddPromoModal = openAddPromoModal;
    window.updatePromoModalMath = updatePromoModalMath;
    window.savePromoRule = savePromoRule;
    window.renderPromoRulesTable = renderPromoRulesTable;
    window.deletePromoRule = deletePromoRule;
}
