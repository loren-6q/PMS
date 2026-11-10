// ==========================================================================
// setup/setup-pricing.js - Base Rate Anchors, Markups, Channels & Event Curves
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';
import { CHANNELS, CANONICAL_OTA_LIST, getChannelByCode, normalizeChannelRules } from '../core/channels.js';

const parseJson = v => (typeof v === 'string' ? JSON.parse(v || '{}') : (v || {}));

export function renderPricingConfig() {
    window.masterPricing = parseJson(window.masterPricing);
    window.pricingRules = parseJson(window.pricingRules);

    window.masterPricing.relationships = window.masterPricing.relationships || window.pricingRules.relationships || [];
    window.pricingRules.relationships = window.masterPricing.relationships;

    const rules = window.pricingRules;
    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const categories = Array.from(new Set(defs.map(r => r.category).filter(Boolean)));

    // 1. Master Driver & Anchors
    const md = document.getElementById('rule-master-driver');
    if (md) {
        if (rules.masterDriver) md.value = rules.masterDriver;
        md.onchange = () => { rules.masterDriver = md.value; renderChannelRulesList(); };
    }

    const dormSel = document.getElementById('anchor-dorm-select');
    const privSel = document.getElementById('anchor-private-select');
    const dormCats = Array.from(new Set(defs.filter(r => r.rule !== 'private').map(r => r.category)));
    const privCats = Array.from(new Set(defs.filter(r => r.rule === 'private').map(r => r.category)));

    if (dormSel) {
        const list = dormCats.length ? dormCats : categories;
        dormSel.innerHTML = '<option value="">-- Select Master Dorm --</option>' +
            list.map(c => `<option value="${c}" ${rules.anchorDorm === c ? 'selected' : ''}>${c}</option>`).join('');
        dormSel.onchange = () => { rules.anchorDorm = dormSel.value; renderEventPricingMatrix(); };
    }

    if (privSel) {
        const list = privCats.length ? privCats : categories;
        privSel.innerHTML = '<option value="">-- Select Master Private --</option>' +
            list.map(c => `<option value="${c}" ${rules.anchorPrivate === c ? 'selected' : ''}>${c}</option>`).join('');
        privSel.onchange = () => { rules.anchorPrivate = privSel.value; renderEventPricingMatrix(); };
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

// --- Bidirectional Pricing Links ---
export function renderRelationshipsTable(categories = null) {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!categories) {
        const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
        categories = Array.from(new Set(defs.map(r => r.category).filter(Boolean)));
    }

    const rels = window.masterPricing?.relationships || [];

    rels.forEach((rel, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50/60 transition-colors";

        const stdOp = rel.type || '=';
        const stdVal = rel.val ?? 0;
        const evtOp = rel.typeFmp || '=';
        const evtVal = rel.valFmp ?? 0;

        const anchorOpts = categories.map(c => `<option value="${c}" ${rel.anchor === c ? 'selected' : ''}>${c}</option>`).join('');
        const targetOpts = categories.map(c => `<option value="${c}" ${rel.target === c ? 'selected' : ''}>${c}</option>`).join('');

        tr.innerHTML = `
            <td class="py-1 px-2">
                <select class="table-input font-bold" onchange="window.masterPricing.relationships[${idx}].anchor = this.value">
                    <option value="">-- Select Anchor --</option>${anchorOpts}
                </select>
            </td>
            <td class="py-1 px-2">
                <select class="table-input font-bold text-indigo-700" onchange="window.masterPricing.relationships[${idx}].target = this.value">
                    <option value="">-- Select Target --</option>${targetOpts}
                </select>
            </td>
            <td class="py-1 px-2">
                <div class="flex items-center gap-1">
                    <select class="table-input font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateRelRule(${idx}, 'std', this.value, this)">
                        <option value="=" ${stdOp === '=' ? 'selected' : ''}>SYNC (==)</option>
                        <option value="+%" ${stdOp === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${stdOp === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${stdOp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${stdOp === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" class="table-input font-black text-center !w-16" value="${stdVal}" oninput="window.masterPricing.relationships[${idx}].val = parseFloat(this.value) || 0" ${stdOp === '=' ? 'disabled' : ''}>
                </div>
            </td>
            <td class="py-1 px-2">
                <div class="flex items-center gap-1">
                    <select class="table-input table-input-pink font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateRelRule(${idx}, 'evt', this.value, this)">
                        <option value="=" ${evtOp === '=' ? 'selected' : ''}>SYNC (==)</option>
                        <option value="+%" ${evtOp === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${evtOp === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${evtOp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${evtOp === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" class="table-input table-input-pink font-black text-center !w-16" value="${evtVal}" oninput="window.masterPricing.relationships[${idx}].valFmp = parseFloat(this.value) || 0" ${evtOp === '=' ? 'disabled' : ''}>
                </div>
            </td>
            <td class="py-1 px-2 text-center">
                <button type="button" onclick="window.deleteRelationshipRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5" title="Delete Rule">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function updateRelRule(idx, type, value, selectEl) {
    const rel = window.masterPricing?.relationships?.[idx];
    if (!rel) return;
    if (type === 'std') rel.type = value;
    else rel.typeFmp = value;
    const input = selectEl.nextElementSibling;
    if (input) input.disabled = (value === '=');
}

export function addRelationshipRow() {
    window.masterPricing = parseJson(window.masterPricing);
    window.masterPricing.relationships = window.masterPricing.relationships || [];
    window.pricingRules.relationships = window.masterPricing.relationships;

    const categories = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    window.masterPricing.relationships.push({
        anchor: categories[0] || '', target: categories[1] || categories[0] || '',
        type: '=', val: 0, typeFmp: '=', valFmp: 0
    });
    renderRelationshipsTable(categories);
}

export function deleteRelationshipRow(idx) {
    if (!window.masterPricing?.relationships) return;
    window.masterPricing.relationships.splice(idx, 1);
    renderRelationshipsTable();
}

// --- Sales Channel Adjustments ---
export function renderChannelRulesList() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;
    container.innerHTML = '';

    window.pricingRules = parseJson(window.pricingRules);
    window.pricingRules.channelRules = normalizeChannelRules(window.pricingRules.channelRules);

    window.pricingRules.channelRules.forEach((cr, idx) => {
        const isLocked = cr.locked || cr.code === 'DEF' || cr.code === 'DIR' || cr.code === 'WEB';
        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-1.5 px-2 bg-white border border-slate-200 rounded text-xs hover:bg-slate-50 transition-colors";
        row.innerHTML = `
            <div>
                <span class="font-black text-slate-800 text-xs">${cr.name}</span>
                <span class="block text-[9px] text-slate-400 font-semibold uppercase">${cr.sub || cr.code}</span>
            </div>
            <div class="flex items-center gap-1.5">
                <select class="table-input font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateChannelOp(${idx}, this.value, this)" ${isLocked ? 'disabled' : ''}>
                    <option value="sync" ${cr.op === 'sync' ? 'selected' : ''}>SYNC (==)</option>
                    <option value="+%" ${cr.op === '+%' ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${cr.op === '-%' ? 'selected' : ''}>- %</option>
                    <option value="+$" ${cr.op === '+$' ? 'selected' : ''}>+ $</option>
                    <option value="-$" ${cr.op === '-$' ? 'selected' : ''}>- $</option>
                </select>
                <input type="number" class="table-input font-black text-center !w-16" value="${cr.val || 0}" oninput="window.pricingRules.channelRules[${idx}].val = parseFloat(this.value) || 0" ${isLocked || cr.op === 'sync' ? 'disabled' : ''}>
                ${isLocked ? '<span class="w-4"></span>' : `
                    <button type="button" onclick="window.deleteChannelRule(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5 ml-1" title="Delete Channel">
                        <i data-lucide="trash-2" size="13"></i>
                    </button>
                `}
            </div>
        `;
        container.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function updateChannelOp(idx, value, selectEl) {
    const cr = window.pricingRules?.channelRules?.[idx];
    if (!cr) return;
    cr.op = value;
    const input = selectEl.nextElementSibling;
    if (input) input.disabled = (value === 'sync');
}

// Canonical Channel Modal Trigger
export function addVerifiedChannelRule() {
    openAddChannelModal();
}

export function openAddChannelModal() {
    const modal = document.getElementById('add-channel-modal');
    const select = document.getElementById('add-channel-select');
    if (!modal || !select) return;

    window.pricingRules = parseJson(window.pricingRules);
    const existingCodes = new Set((window.pricingRules.channelRules || []).map(r => r.code));

    // Offer only canonical channels that haven't already been added
    const available = CANONICAL_OTA_LIST.filter(ch => !existingCodes.has(ch.code));

    if (available.length === 0) {
        return customAlert("All Channels Added", "All supported OTA channels are already configured.");
    }

    select.innerHTML = '<option value="">-- Choose an OTA Channel --</option>' +
        available.map(ch => `<option value="${ch.code}">${ch.name} (${ch.code} • ${ch.sub})</option>`).join('');

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
}

export function closeAddChannelModal() {
    const modal = document.getElementById('add-channel-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function confirmAddChannel() {
    const select = document.getElementById('add-channel-select');
    const code = select?.value;
    if (!code) return customAlert("Selection Required", "Please select a channel to add.");

    const meta = getChannelByCode(code);
    window.pricingRules = parseJson(window.pricingRules);
    window.pricingRules.channelRules = window.pricingRules.channelRules || [];
    window.pricingRules.channelRules.push({
        code: meta.code,
        name: meta.name,
        sub: meta.sub || "Custom Channel",
        op: '+%',
        val: 0,
        locked: false
    });

    closeAddChannelModal();
    renderChannelRulesList();
}

export function deleteChannelRule(idx) {
    if (!window.pricingRules?.channelRules) return;
    window.pricingRules.channelRules.splice(idx, 1);
    renderChannelRulesList();
}

// --- Seasonal & Event Dual-Curve Panel (Master Anchors Only) ---
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
        let th = '<tr><th class="p-1 text-slate-500 uppercase text-[9px] text-left">Master Anchor</th>';
        for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
            const label = i === 0 ? 'PEAK' : (i > 0 ? `+${i}d` : `${i}d`);
            th += `<th class="p-1 text-[9px] font-black ${i === 0 ? 'text-pink-700 bg-pink-100' : 'text-slate-700'}">${label}</th>`;
        }
        th += '</tr>';
        pThead.innerHTML = th;

        // Ripple from Master Anchors (Dorm & Private) only
        const anchors = [
            window.pricingRules?.anchorDorm || 'Standard Dorm',
            window.pricingRules?.anchorPrivate || 'Deluxe Private King'
        ].filter(Boolean);

        pTbody.innerHTML = anchors.map(cat => {
            let row = `<tr><td class="p-1 font-bold text-slate-800 text-left text-xs">${cat} <span class="text-[9px] text-indigo-600 uppercase font-black">(Anchor)</span></td>`;
            for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
                const isPeak = (i === 0);
                row += `<td class="p-1"><input type="number" class="table-input !w-12 text-center font-black ${isPeak ? 'table-input-pink' : ''}" value="${isPeak ? 1200 : 800}"></td>`;
            }
            row += '</tr>';
            return row;
        }).join('');
    }

    if (rThead && rTbody) {
        let th = '<tr><th class="p-1 text-slate-500 uppercase text-[9px] text-left">Restriction</th>';
        for (let i = -restrSpanDays; i <= restrSpanDays; i++) {
            const label = i === 0 ? 'PEAK' : (i > 0 ? `+${i}d` : `${i}d`);
            th += `<th class="p-1 text-[9px] font-black ${i === 0 ? 'text-indigo-700 bg-indigo-100' : 'text-slate-700'}">${label}</th>`;
        }
        th += '</tr>';
        rThead.innerHTML = th;

        let tr = '<tr><td class="p-1 font-bold text-slate-800 text-left">Min Stay (Nts)</td>';
        for (let i = 0; i <= restrSpanDays * 2; i++) {
            const val = Math.abs(i - restrSpanDays) <= 1 ? 3 : 1;
            tr += `<td class="p-1"><input type="number" class="table-input !w-10 text-center font-black" value="${val}"></td>`;
        }
        tr += '</tr>';
        rTbody.innerHTML = tr;
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
    window.openAddChannelModal = openAddChannelModal;
    window.closeAddChannelModal = closeAddChannelModal;
    window.confirmAddChannel = confirmAddChannel;
    window.deleteChannelRule = deleteChannelRule;
    window.toggleEventSettings = toggleEventSettings;
    window.cycleRatesSpan = cycleRatesSpan;
    window.cycleRestrSpan = cycleRestrSpan;
}
