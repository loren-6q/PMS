// ==========================================================================
// setup/setup-pricing.js - Base Rate Anchors, Markups, Channels & Event Curves
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';

export function renderPricingConfig() {
    const definitions = window.roomDefinitions || [];
    const categories = Array.from(new Set(definitions.filter(r => !r.inactive).map(r => r.category).filter(Boolean)));

    const dormAnchorSel = document.getElementById('anchor-dorm-select');
    const privAnchorSel = document.getElementById('anchor-private-select');

    if (dormAnchorSel) {
        const dorms = categories.filter(c => c.toLowerCase().includes('dorm') || c.toLowerCase().includes('bed'));
        const list = dorms.length ? dorms : categories;
        dormAnchorSel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    if (privAnchorSel) {
        const privates = categories.filter(c => !c.toLowerCase().includes('dorm') && !c.toLowerCase().includes('bed'));
        const list = privates.length ? privates : categories;
        privAnchorSel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    renderRelationshipsTable();
}

export function renderRelationshipsTable() {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.masterPricing = window.masterPricing || { relationships: [] };
    const relationships = window.masterPricing.relationships || [];
    const categories = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));

    relationships.forEach((rel, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 text-xs";

        const anchorOpts = categories.map(c => `<option value="${c}" ${c === rel.anchor ? 'selected' : ''}>${c}</option>`).join('');
        const targetOpts = categories.map(c => `<option value="${c}" ${c === rel.target ? 'selected' : ''}>${c}</option>`).join('');

        tr.innerHTML = `
            <td class="p-1.5"><select class="table-input font-bold" onchange="window.masterPricing.relationships[${idx}].anchor = this.value">${anchorOpts}</select></td>
            <td class="p-1.5"><select class="table-input font-bold" onchange="window.masterPricing.relationships[${idx}].target = this.value">${targetOpts}</select></td>
            <td class="p-1.5">
                <div class="flex items-center gap-1">
                    <select class="table-input !w-20 font-black text-center" onchange="window.masterPricing.relationships[${idx}].type = this.value">
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" value="${rel.val || 0}" class="table-input !w-20 font-black text-center" oninput="window.masterPricing.relationships[${idx}].val = parseFloat(this.value) || 0">
                </div>
            </td>
            <td class="text-center p-1.5">
                <button type="button" onclick="window.deleteRelationshipRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function addRelationshipRow() {
    window.masterPricing = window.masterPricing || { relationships: [] };
    const categories = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    window.masterPricing.relationships.push({
        anchor: categories[0] || 'Room',
        target: categories[1] || categories[0] || 'Room',
        type: '=',
        val: 0
    });
    renderRelationshipsTable();
}

export function deleteRelationshipRow(idx) {
    window.masterPricing.relationships.splice(idx, 1);
    renderRelationshipsTable();
}

if (typeof window !== 'undefined') {
    window.renderPricingConfig = renderPricingConfig;
    window.addRelationshipRow = addRelationshipRow;
    window.deleteRelationshipRow = deleteRelationshipRow;
}
