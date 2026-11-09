// ==========================================================================
// setup/setup-pricing.js - Base Rate Anchors, Markups, Channels & Event Curves
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';

export const DEFAULT_CHANNELS = [
    { name: "DEFAULT", sub: "Standard OTA Pipe", op: "sync", val: 0, locked: true },
    { name: "DIRECT", sub: "Direct Website Engine", op: "sync", val: 0, locked: true },
    { name: "Booking.com", sub: "BDC Channel", op: "+%", val: 0, locked: false },
    { name: "Hostelworld", sub: "HW Channel", op: "+%", val: 0, locked: false },
    { name: "Agoda", sub: "Agoda Channel", op: "+%", val: 0, locked: false },
    { name: "Direct Website", sub: "Custom Channel", op: "-%", val: 10, locked: false },
    { name: "Expedia", sub: "Custom Channel", op: "+%", val: 0, locked: false }
];

export function renderPricingConfig() {
    window.pricingRules = window.pricingRules || {};
    window.masterPricing = window.masterPricing || {};

    // Synchronize relationships array across pricingRules and masterPricing
    window.pricingRules.relationships = window.pricingRules.relationships || window.masterPricing.relationships || [];
    window.masterPricing.relationships = window.pricingRules.relationships;

    const rules = window.pricingRules;
    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const categories = Array.from(new Set(defs.map(r => r.category).filter(Boolean)));

    // 1. Base Rate Anchors & Master Channel
    const mdSelect = document.getElementById('rule-master-driver');
    if (mdSelect) {
        if (rules.masterDriver) mdSelect.value = rules.masterDriver;
        mdSelect.onchange = () => {
            rules.masterDriver = mdSelect.value;
            renderChannelRulesList();
        };
    }

    const dormAnchorSel = document.getElementById('anchor-dorm-select');
    const privAnchorSel = document.getElementById('anchor-private-select');

    const dormCats = Array.from(new Set(defs.filter(r => r.rule !== 'private').map(r => r.category)));
    const privCats = Array.from(new Set(defs.filter(r => r.rule === 'private').map(r => r.category)));

    if (dormAnchorSel) {
        const list = dormCats.length ? dormCats : categories;
        dormAnchorSel.innerHTML = '<option value="">-- Select Master Dorm --</option>' +
            list.map(c => '<option value="' + c + '" ' + (rules.anchorDorm === c ? 'selected' : '') + '>' + c + '</option>').join('');
        dormAnchorSel.onchange = () => { rules.anchorDorm = dormAnchorSel.value; };
    }

    if (privAnchorSel) {
        const list = privCats.length ? privCats : categories;
        privAnchorSel.innerHTML = '<option value="">-- Select Master Private --</option>' +
            list.map(c => '<option value="' + c + '" ' + (rules.anchorPrivate === c ? 'selected' : '') + '>' + c + '</option>').join('');
        privAnchorSel.onchange = () => { rules.anchorPrivate = privAnchorSel.value; };
    }

    // 2. Refundable Markups
    const stdRef = document.getElementById('rule-std-ref');
    const evtRef = document.getElementById('rule-evt-ref');
    if (stdRef) {
        stdRef.value = rules.stdRefundableMarkup ?? 25;
        stdRef.oninput = () => { rules.stdRefundableMarkup = parseFloat(stdRef.value) || 0; };
    }
    if (evtRef) {
        evtRef.value = rules.evtRefundableMarkup ?? 25;
        evtRef.oninput = () => { rules.evtRefundableMarkup = parseFloat(evtRef.value) || 0; };
    }

    renderRelationshipsTable(categories);
    renderChannelRulesList();
    renderEventPricingMatrix();
}

export function renderRelationshipsTable(categories = null) {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!categories) {
        const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
        categories = Array.from(new Set(defs.map(r => r.category).filter(Boolean)));
    }

    const rels = window.pricingRules?.relationships || [];

    rels.forEach((rel, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50/60 transition-colors";

        const stdOp = rel.stdOp || rel.type || 'sync';
        const stdVal = rel.stdVal ?? rel.val ?? 0;
        const evtOp = rel.evtOp || (rel.evtOffset ? '+%' : 'sync');
        const evtVal = rel.evtVal ?? rel.evtOffset ?? 0;

        const anchorOpts = categories.map(c => '<option value="' + c + '" ' + (rel.anchor === c ? 'selected' : '') + '>' + c + '</option>').join('');
        const targetOpts = categories.map(c => '<option value="' + c + '" ' + (rel.target === c ? 'selected' : '') + '>' + c + '</option>').join('');

        let html = '';
        html += '<td class="py-1 px-2">';
        html += '  <select class="table-input font-bold" onchange="window.pricingRules.relationships[' + idx + '].anchor = this.value">';
        html += '    <option value="">-- Select Anchor --</option>' + anchorOpts;
        html += '  </select>';
        html += '</td>';

        html += '<td class="py-1 px-2">';
        html += '  <select class="table-input font-bold text-indigo-700" onchange="window.pricingRules.relationships[' + idx + '].target = this.value">';
        html += '    <option value="">-- Select Target --</option>' + targetOpts;
        html += '  </select>';
        html += '</td>';

        html += '<td class="py-1 px-2">';
        html += '  <div class="flex items-center gap-1">';
        html += '    <select class="table-input font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateRelRule(' + idx + ', \'stdOp\', this.value, this)">';
        html += '      <option value="sync" ' + (stdOp === 'sync' || stdOp === '=' ? 'selected' : '') + '>SYNC (==)</option>';
        html += '      <option value="+%" ' + (stdOp === '+%' ? 'selected' : '') + '>+ %</option>';
        html += '      <option value="-%" ' + (stdOp === '-%' ? 'selected' : '') + '>- %</option>';
        html += '      <option value="+$" ' + (stdOp === '+$' || stdOp === '+' ? 'selected' : '') + '>+ ฿</option>';
        html += '      <option value="-$" ' + (stdOp === '-$' || stdOp === '-' ? 'selected' : '') + '>- ฿</option>';
        html += '    </select>';
        html += '    <input type="number" class="table-input font-black text-center !w-16" value="' + stdVal + '" oninput="window.pricingRules.relationships[' + idx + '].stdVal = parseFloat(this.value) || 0; window.pricingRules.relationships[' + idx + '].val = window.pricingRules.relationships[' + idx + '].stdVal;" ' + (stdOp === 'sync' || stdOp === '=' ? 'disabled' : '') + '>';
        html += '  </div>';
        html += '</td>';

        html += '<td class="py-1 px-2">';
        html += '  <div class="flex items-center gap-1">';
        html += '    <select class="table-input table-input-pink font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateRelRule(' + idx + ', \'evtOp\', this.value, this)">';
        html += '      <option value="sync" ' + (evtOp === 'sync' || evtOp === '=' ? 'selected' : '') + '>SYNC (==)</option>';
        html += '      <option value="+%" ' + (evtOp === '+%' ? 'selected' : '') + '>+ %</option>';
        html += '      <option value="-%" ' + (evtOp === '-%' ? 'selected' : '') + '>- %</option>';
        html += '      <option value="+$" ' + (evtOp === '+$' || evtOp === '+' ? 'selected' : '') + '>+ ฿</option>';
        html += '      <option value="-$" ' + (evtOp === '-$' || evtOp === '-' ? 'selected' : '') + '>- ฿</option>';
        html += '    </select>';
        html += '    <input type="number" class="table-input table-input-pink font-black text-center !w-16" value="' + evtVal + '" oninput="window.pricingRules.relationships[' + idx + '].evtVal = parseFloat(this.value) || 0; window.pricingRules.relationships[' + idx + '].evtOffset = window.pricingRules.relationships[' + idx + '].evtVal;" ' + (evtOp === 'sync' || evtOp === '=' ? 'disabled' : '') + '>';
        html += '  </div>';
        html += '</td>';

        html += '<td class="py-1 px-2 text-center">';
        html += '  <button type="button" onclick="window.deleteRelationshipRow(' + idx + ')" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5" title="Delete Rule">';
        html += '    <i data-lucide="trash-2" size="13"></i>';
        html += '  </button>';
        html += '</td>';

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function updateRelRule(idx, field, value, selectEl) {
    const rel = window.pricingRules?.relationships?.[idx];
    if (!rel) return;
    rel[field] = value;
    if (field === 'stdOp') {
        rel.type = value;
        const input = selectEl.nextElementSibling;
        if (input) input.disabled = (value === 'sync' || value === '=');
    } else if (field === 'evtOp') {
        const input = selectEl.nextElementSibling;
        if (input) input.disabled = (value === 'sync' || value === '=');
    }
}

export function addRelationshipRow() {
    window.pricingRules = window.pricingRules || {};
    window.pricingRules.relationships = window.pricingRules.relationships || [];
    window.masterPricing = window.masterPricing || {};
    window.masterPricing.relationships = window.pricingRules.relationships;

    const categories = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    window.pricingRules.relationships.push({
        anchor: categories[0] || '',
        target: categories[1] || categories[0] || '',
        stdOp: 'sync',
        stdVal: 0,
        evtOp: 'sync',
        evtVal: 0,
        type: '=',
        val: 0,
        evtOffset: 0
    });
    renderRelationshipsTable(categories);
}

export function deleteRelationshipRow(idx) {
    if (!window.pricingRules?.relationships) return;
    window.pricingRules.relationships.splice(idx, 1);
    if (window.masterPricing) window.masterPricing.relationships = window.pricingRules.relationships;
    renderRelationshipsTable();
}

export function renderChannelRulesList() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;
    container.innerHTML = '';

    window.pricingRules = window.pricingRules || {};

    if (!Array.isArray(window.pricingRules.channelRules) || window.pricingRules.channelRules.length === 0) {
        if (Array.isArray(window.pricingRules.channels)) {
            window.pricingRules.channelRules = window.pricingRules.channels.map(c => {
                const op = c.op || (c.type === '=' ? 'sync' : (c.type || '+%'));
                return {
                    name: c.name || c.channel,
                    sub: c.sub || (c.name === 'DEFAULT' ? 'Standard OTA Pipe' : (c.name === 'DIRECT' ? 'Direct Website Engine' : 'Custom Channel')),
                    op: op,
                    val: c.val ?? (c.markupPct || 0),
                    locked: c.locked || (c.name === 'DEFAULT' || c.name === 'DIRECT')
                };
            });
        } else {
            window.pricingRules.channelRules = JSON.parse(JSON.stringify(DEFAULT_CHANNELS));
        }
    }

    const rules = window.pricingRules.channelRules;

    rules.forEach((cr, idx) => {
        const isLocked = cr.locked || cr.name === 'DEFAULT' || cr.name === 'DIRECT';
        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-1.5 px-2 bg-white border border-slate-200 rounded text-xs hover:bg-slate-50 transition-colors";

        let html = '';
        html += '<div>';
        html += '  <span class="font-black text-slate-800 text-xs">' + cr.name + '</span>';
        html += '  <span class="block text-[9px] text-slate-400 font-semibold uppercase">' + (cr.sub || 'Custom Channel') + '</span>';
        html += '</div>';
        html += '<div class="flex items-center gap-1.5">';
        html += '  <select class="table-input font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateChannelOp(' + idx + ', this.value, this)" ' + (isLocked ? 'disabled' : '') + '>';
        html += '    <option value="sync" ' + (cr.op === 'sync' ? 'selected' : '') + '>SYNC (==)</option>';
        html += '    <option value="+%" ' + (cr.op === '+%' ? 'selected' : '') + '>+ %</option>';
        html += '    <option value="-%" ' + (cr.op === '-%' ? 'selected' : '') + '>- %</option>';
        html += '    <option value="+$" ' + (cr.op === '+$' ? 'selected' : '') + '>+ $</option>';
        html += '    <option value="-$" ' + (cr.op === '-$' ? 'selected' : '') + '>- $</option>';
        html += '  </select>';
        html += '  <input type="number" class="table-input font-black text-center !w-16" value="' + (cr.val || 0) + '" oninput="window.pricingRules.channelRules[' + idx + '].val = parseFloat(this.value) || 0" ' + (isLocked || cr.op === 'sync' ? 'disabled' : '') + '>';
        if (isLocked) {
            html += '<span class="w-4"></span>';
        } else {
            html += '  <button type="button" onclick="window.deleteChannelRule(' + idx + ')" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5 ml-1" title="Delete Channel">';
            html += '    <i data-lucide="trash-2" size="13"></i>';
            html += '  </button>';
        }
        html += '</div>';

        row.innerHTML = html;
        container.appendChild(row);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function updateChannelOp(idx, value, selectEl) {
    const cr = window.pricingRules?.channelRules?.[idx];
    if (!cr) return;
    cr.op = value;
    const input = selectEl.nextElementSibling;
    if (input) input.disabled = (value === 'sync');
}

export function addVerifiedChannelRule() {
    window.pricingRules = window.pricingRules || {};
    window.pricingRules.channelRules = window.pricingRules.channelRules || [];

    const name = prompt("Enter sales channel name (e.g. Traveloka, Trip.com, Airbnb):");
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    if (window.pricingRules.channelRules.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
        return customAlert("Duplicate Channel", '"' + trimmed + '" is already configured.');
    }

    window.pricingRules.channelRules.push({
        name: trimmed,
        sub: 'Custom Channel',
        op: '+%',
        val: 0,
        locked: false
    });

    renderChannelRulesList();
}

export function deleteChannelRule(idx) {
    if (!window.pricingRules?.channelRules) return;
    window.pricingRules.channelRules.splice(idx, 1);
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
    if (pill) pill.innerText = '±' + ratesSpanDays + ' Days';
    renderEventPricingMatrix();
}

export function cycleRestrSpan() {
    restrSpanDays = restrSpanDays === 6 ? 4 : (restrSpanDays === 4 ? 8 : 6);
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = '±' + restrSpanDays + ' Days';
    renderEventPricingMatrix();
}

export function renderEventPricingMatrix() {
    const pThead = document.getElementById('event-price-thead');
    const pTbody = document.getElementById('event-price-tbody');
    const rThead = document.getElementById('event-restr-thead');
    const rTbody = document.getElementById('event-restr-tbody');

    if (pThead && pTbody) {
        let th = '<tr><th class="p-1 text-slate-500 uppercase text-[9px] text-left">Category</th>';
        for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
            const label = i === 0 ? 'PEAK' : (i > 0 ? '+' + i + 'd' : i + 'd');
            const cls = i === 0 ? 'text-pink-700 bg-pink-100' : 'text-slate-700';
            th += '<th class="p-1 text-[9px] font-black ' + cls + '">' + label + '</th>';
        }
        th += '</tr>';
        pThead.innerHTML = th;

        const categories = Array.from(new Set((window.roomDefinitions || []).filter(r => !r.inactive).map(r => r.category).filter(Boolean)));
        let tbodyHtml = '';
        categories.forEach(cat => {
            tbodyHtml += '<tr><td class="p-1 font-bold text-slate-800 text-left">' + cat + '</td>';
            for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
                const isPeak = i === 0;
                tbodyHtml += '<td class="p-1"><input type="number" class="table-input !w-12 text-center font-black ' + (isPeak ? 'table-input-pink' : '') + '" value="' + (isPeak ? 1200 : 800) + '"></td>';
            }
            tbodyHtml += '</tr>';
        });
        pTbody.innerHTML = tbodyHtml;
    }

    if (rThead && rTbody) {
        let th = '<tr><th class="p-1 text-slate-500 uppercase text-[9px] text-left">Restriction</th>';
        for (let i = -restrSpanDays; i <= restrSpanDays; i++) {
            const label = i === 0 ? 'PEAK' : (i > 0 ? '+' + i + 'd' : i + 'd');
            const cls = i === 0 ? 'text-indigo-700 bg-indigo-100' : 'text-slate-700';
            th += '<th class="p-1 text-[9px] font-black ' + cls + '">' + label + '</th>';
        }
        th += '</tr>';
        rThead.innerHTML = th;

        let trHtml = '<tr><td class="p-1 font-bold text-slate-800 text-left">Min Stay (Nts)</td>';
        for (let i = 0; i <= restrSpanDays * 2; i++) {
            const val = Math.abs(i - restrSpanDays) <= 1 ? 3 : 1;
            trHtml += '<td class="p-1"><input type="number" class="table-input !w-10 text-center font-black" value="' + val + '"></td>';
        }
        trHtml += '</tr>';
        rTbody.innerHTML = trHtml;
    }
}

if (typeof window !== 'undefined') {
    window.renderPricingConfig = renderPricingConfig;
    window.renderRelationshipsTable = renderRelationshipsTable;
    window.updateRelRule = updateRelRule;
    window.addRelationshipRow = addRelationshipRow;
    window.deleteRelationshipRow = deleteRelationshipRow;
    window.renderChannelRulesList = renderChannelRulesList;
    window.updateChannelOp = updateChannelOp;
    window.addVerifiedChannelRule = addVerifiedChannelRule;
    window.deleteChannelRule = deleteChannelRule;
    window.toggleEventSettings = toggleEventSettings;
    window.cycleRatesSpan = cycleRatesSpan;
    window.cycleRestrSpan = cycleRestrSpan;
}
