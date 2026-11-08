// ==========================================================================
// setup/setup-pricing.js - Base Rate Anchors, Markups, Channels & Event Curves
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';

export const DEFAULT_CHANNELS = [
    { name: "Direct", multiplier: 1.0, markupPct: 0 },
    { name: "Booking.com", multiplier: 1.18, markupPct: 18 },
    { name: "Hostelworld", multiplier: 1.15, markupPct: 15 },
    { name: "Agoda", multiplier: 1.18, markupPct: 18 },
    { name: "Airbnb", multiplier: 1.15, markupPct: 15 },
    { name: "Expedia", multiplier: 1.18, markupPct: 18 }
];

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
    renderChannelRulesList();
    renderEventPricingMatrix();
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
                    <input type="number" value="${rel.val || 0}" class="table-input !w-16 font-black text-center" oninput="window.masterPricing.relationships[${idx}].val = parseFloat(this.value) || 0">
                </div>
            </td>
            <td class="p-1.5">
                <input type="number" value="${rel.evtOffset || 0}" class="table-input !w-16 font-black text-center text-pink-700 bg-pink-50" oninput="window.masterPricing.relationships[${idx}].evtOffset = parseFloat(this.value) || 0">
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
        val: 0,
        evtOffset: 0
    });
    renderRelationshipsTable();
}

export function deleteRelationshipRow(idx) {
    window.masterPricing.relationships.splice(idx, 1);
    renderRelationshipsTable();
}

export function renderChannelRulesList() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;

    window.pricingRules = window.pricingRules || {};
    if (!Array.isArray(window.pricingRules.channels)) {
        if (window.pricingRules.channels && typeof window.pricingRules.channels === 'object') {
            window.pricingRules.channels = Object.entries(window.pricingRules.channels).map(([name, val]) => ({
                name,
                multiplier: typeof val === 'object' ? (val.multiplier ?? 1) : (Number(val) || 1),
                markupPct: typeof val === 'object' ? (val.markupPct ?? 0) : 0
            }));
        } else {
            window.pricingRules.channels = [...DEFAULT_CHANNELS];
        }
    }
    const channels = window.pricingRules.channels;

    container.innerHTML = channels.map((ch, idx) => ``
        <div class="flex items-center justify-between p-1.5 bg-white border border-amber-200 rounded text-xs">
            <span class="font-black text-slate-800">${ch.name}</span>
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-slate-500 font-bold">Multiplier:</span>
                <input type="number" step="0.01" value="${ch.multiplier}" class="table-input !w-16 text-center font-black" onchange="window.pricingRules.channels[${idx}].multiplier = parseFloat(this.value) || 1">
                <button type="button" onclick="window.deleteChannelRule(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer ml-1">&times;</button>
            </div>
        </div>
    `).join('');
}

export function addVerifiedChannelRule() {
    window.pricingRules = window.pricingRules || { channels: [] };
    const name = prompt("Enter sales channel name (e.g. Traveloka, Trip.com):");
    if (!name) return;
    window.pricingRules.channels.push({ name, multiplier: 1.18, markupPct: 18 });
    renderChannelRulesList();
}

export function deleteChannelRule(idx) {
    window.pricingRules.channels.splice(idx, 1);
    renderChannelRulesList();
}

// Seasonal & Event Dual-Curve Panel
let ratesSpanDays = 2;
let restrSpanDays = 6;

export function toggleEventSettings(enabled) {
    const panel = document.getElementById('event-curve-panel');
    if (panel) panel.classList.toggle('hidden', !enabled);
    if (enabled) renderEventPricingMatrix();
}

export function cycleRatesSpan() {
    ratesSpanDays = ratesSpanDays === 2 ? 3 : (ratesSpanDays === 3 ? 4 : 2);
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.innerText = `±${ratesSpanDays} Days`;
    renderEventPricingMatrix();
}

export function cycleRestrSpan() {
    restrSpanDays = restrSpanDays === 6 ? 4 : (restrSpanDays === 4 ? 8 : 6);
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = `±${restrSpanDays} Days`;
    renderEventPricingMatrix();
}

export function renderEventPricingMatrix() {
    const pThead = document.getElementById('event-price-thead');
    const pTbody = document.getElementById('event-price-tbody');
    const rThead = document.getElementById('event-restr-thead');
    const rTbody = document.getElementById('event-restr-tbody');

    if (pThead && pTbody) {
        let th = `<tr><th class="p-1 text-slate-500 uppercase text-[9px]">Category</th>`;
        for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
            th += `<th class="p-1 text-[9px] font-black ${i === 0 ? 'text-pink-700 bg-pink-100' : 'text-slate-700'}">${i === 0 ? 'PEAK' : (i > 0 ? `+${i}d` : `${i}d`)}</th>`;
        }
        th += `</tr>`;
        pThead.innerHTML = th;

        const categories = Array.from(new Set((window.roomDefinitions || []).filter(r => !r.inactive).map(r => r.category).filter(Boolean)));
        pTbody.innerHTML = categories.map(cat => {
            let row = `<tr><td class="p-1 font-bold text-slate-800 text-left">${cat}</td>`;
            for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
                row += `<td class="p-1"><input type="number" class="table-input !w-12 text-center font-black ${i === 0 ? 'bg-pink-50 border-pink-300 text-pink-900' : ''}" value="${i === 0 ? 1200 : 800}"></td>`;
            }
            row += `</tr>`;
            return row;
        }).join('');
    }

    if (rThead && rTbody) {
        let th = `<tr><th class="p-1 text-slate-500 uppercase text-[9px]">Restriction</th>`;
        for (let i = -restrSpanDays; i <= restrSpanDays; i++) {
            th += `<th class="p-1 text-[9px] font-black ${i === 0 ? 'text-indigo-700 bg-indigo-100' : 'text-slate-700'}">${i === 0 ? 'PEAK' : (i > 0 ? `+${i}d` : `${i}d`)}</th>`;
        }
        th += `</tr>`;
        rThead.innerHTML = th;

        rTbody.innerHTML = `
            <tr>
                <td class="p-1 font-bold text-slate-800 text-left">Min Stay (Nts)</td>
                ${Array.from({ length: (restrSpanDays * 2) + 1 }, (_, i) => `<td class="p-1"><input type="number" class="table-input !w-10 text-center font-black" value="${Math.abs(i - restrSpanDays) <= 1 ? 3 : 1}"></td>`).join('')}
            </tr>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.renderPricingConfig = renderPricingConfig;
    window.addRelationshipRow = addRelationshipRow;
    window.deleteRelationshipRow = deleteRelationshipRow;
    window.addVerifiedChannelRule = addVerifiedChannelRule;
    window.deleteChannelRule = deleteChannelRule;
    window.toggleEventSettings = toggleEventSettings;
    window.cycleRatesSpan = cycleRatesSpan;
    window.cycleRestrSpan = cycleRestrSpan;
}
