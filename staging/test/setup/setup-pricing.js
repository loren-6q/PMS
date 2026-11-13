// ==========================================================================
// setup/setup-pricing.js - Base Rate Anchors, Markups, Channels & Event Curves
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';
import { CANONICAL_OTA_LIST, getChannelByCode, normalizeChannelRules, resolveChannelCode } from '../core/channels.js';

const parseJson = v => (typeof v === 'string' ? JSON.parse(v || '{}') : (v || {}));

export function renderPricingConfig() {
    window.masterPricing = parseJson(window.masterPricing);
    window.pricingRules = parseJson(window.pricingRules);
    window.savedAutofillBaselines = parseJson(window.savedAutofillBaselines);

    window.masterPricing.relationships = window.masterPricing.relationships || window.pricingRules.relationships || [];
    window.pricingRules.relationships = window.masterPricing.relationships;
    window.pricingRules.channelRules = normalizeChannelRules(window.pricingRules.channelRules);

    const rules = window.pricingRules;
    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const categories = Array.from(new Set(defs.map(r => r.category).filter(Boolean)));

    // 1. Dynamic Master Anchor Channel Dropdown
    renderMasterDriverSelect();

    // 2. Room Anchors (Dorm & Private)
    const dormSel = document.getElementById('anchor-dorm-select');
    const privSel = document.getElementById('anchor-private-select');
    const dormCats = Array.from(new Set(defs.filter(r => r.rule !== 'private').map(r => r.category)));
    const privCats = Array.from(new Set(defs.filter(r => r.rule === 'private').map(r => r.category)));

    if (dormSel) {
        const list = dormCats.length ? dormCats : categories;
        dormSel.innerHTML = '<option value="">-- Select Master Dorm --</option>' +
            list.map(c => `<option value="${c}" ${rules.anchorDorm === c ? 'selected' : ''}>${c}</option>`).join('');
        dormSel.onchange = () => {
            rules.anchorDorm = dormSel.value;
            window.savedAutofillBaselines.anchor_d = dormSel.value;
            renderEventPricingMatrix();
        };
    }

    if (privSel) {
        const list = privCats.length ? privCats : categories;
        privSel.innerHTML = '<option value="">-- Select Master Private --</option>' +
            list.map(c => `<option value="${c}" ${rules.anchorPrivate === c ? 'selected' : ''}>${c}</option>`).join('');
        privSel.onchange = () => {
            rules.anchorPrivate = privSel.value;
            window.savedAutofillBaselines.anchor_p = privSel.value;
            renderEventPricingMatrix();
        };
    }

    // 3. Refundable Markups
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

    // 4. Sync Event Pricing Toggle & Curves
    const evtToggle = document.getElementById('toggle-events');
    const isEventsOn = window.enableEventRates !== undefined
        ? !!window.enableEventRates
        : ((window.currentPropertyConfig?.events || []).length > 0);
    window.enableEventRates = isEventsOn;

    if (evtToggle) evtToggle.checked = isEventsOn;
    toggleEventSettings(isEventsOn, false);

    renderRelationshipsTable(categories);
    renderChannelRulesList();
    renderEventPricingMatrix();
}

export function renderMasterDriverSelect() {
    const md = document.getElementById('rule-master-driver');
    if (!md) return;

    const rules = window.pricingRules || {};
    const configuredChannels = rules.channelRules || [];
    const currentMaster = rules.masterDriver || 'WEB';

    md.innerHTML = configuredChannels.map(c => {
        const isSelected = (currentMaster === c.code);
        return `<option value="${c.code}" ${isSelected ? 'selected' : ''}>${c.code} (${c.name})</option>`;
    }).join('');

    md.onchange = () => {
        rules.masterDriver = md.value;
        renderChannelRulesList();
    };
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

    const masterCode = window.pricingRules.masterDriver || 'WEB';

    window.pricingRules.channelRules.forEach((cr, idx) => {
        const isMaster = (cr.code === masterCode);
        const isBase = cr.code === 'DEF' || cr.code === 'DIR' || cr.code === 'WEB';
        const isLocked = isMaster || isBase;

        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-1.5 px-2 bg-white border border-slate-200 rounded text-xs hover:bg-slate-50 transition-colors";
        row.innerHTML = `
            <div>
                <span class="font-black text-slate-800 text-xs">${cr.name}</span>
                ${isMaster ? '<span class="ml-1 text-[8px] bg-indigo-100 text-indigo-700 font-black px-1.5 py-0.2 rounded uppercase">Master Driver (1:1)</span>' : ''}
                <span class="block text-[9px] text-slate-400 font-semibold uppercase">${cr.sub || cr.code}</span>
            </div>
            <div class="flex items-center gap-1.5">
                <select class="table-input font-bold text-[10px] !w-24 text-center cursor-pointer" onchange="window.updateChannelOp(${idx}, this.value, this)" ${isLocked ? 'disabled' : ''}>
                    <option value="sync" ${cr.op === 'sync' || isMaster ? 'selected' : ''}>SYNC (==)</option>
                    <option value="+%" ${cr.op === '+%' && !isMaster ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${cr.op === '-%' && !isMaster ? 'selected' : ''}>- %</option>
                    <option value="+$" ${cr.op === '+$' && !isMaster ? 'selected' : ''}>+ $</option>
                    <option value="-$" ${cr.op === '-$' && !isMaster ? 'selected' : ''}>- $</option>
                </select>
                <input type="number" class="table-input font-black text-center !w-16" value="${isMaster ? 0 : (cr.val || 0)}" oninput="window.pricingRules.channelRules[${idx}].val = parseFloat(this.value) || 0" ${isLocked || cr.op === 'sync' ? 'disabled' : ''}>
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

export function addVerifiedChannelRule() {
    openAddChannelModal();
}

export function openAddChannelModal() {
    const modal = document.getElementById('add-channel-modal');
    const select = document.getElementById('add-channel-select');
    if (!modal || !select) return;

    window.pricingRules = parseJson(window.pricingRules);
    const existingCodes = new Set((window.pricingRules.channelRules || []).map(r => r.code));

    const connectedCodes = new Set(
        (window.channexConnectedChannels || []).map(c => resolveChannelCode(c.attributes?.channel || c.attributes?.title))
    );

    const available = CANONICAL_OTA_LIST.filter(ch => !existingCodes.has(ch.code));

    if (available.length === 0) {
        return customAlert("All Channels Added", "All supported OTA channels are already configured.");
    }

    available.sort((a, b) => {
        const aConn = connectedCodes.has(a.code) ? 1 : 0;
        const bConn = connectedCodes.has(b.code) ? 1 : 0;
        return bConn - aConn;
    });

    select.innerHTML = '<option value="">-- Choose Channel --</option>' +
        available.map(ch => {
            const isConn = connectedCodes.has(ch.code);
            return `<option value="${ch.code}">${isConn ? '★ ' : ''}${ch.name} (${ch.code})</option>`;
        }).join('');

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
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
    renderMasterDriverSelect();
}

export function deleteChannelRule(idx) {
    if (!window.pricingRules?.channelRules) return;
    window.pricingRules.channelRules.splice(idx, 1);
    renderChannelRulesList();
    renderMasterDriverSelect();
}

// --- Seasonal & Event Dual-Curve Panel (Master Anchors & Full Restrictions) ---
let ratesSpanDays = 2;
let restrSpanDays = 7;

const offsetTag = off => (off < 0 ? `m${Math.abs(off)}` : (off === 0 ? '0' : `p${off}`));

export function updateEventBaseline(key, value) {
    window.savedAutofillBaselines = parseJson(window.savedAutofillBaselines);
    if (value === "" || value === null || value === undefined) {
        delete window.savedAutofillBaselines[key];
    } else {
        window.savedAutofillBaselines[key] = value;
    }
}

export function toggleEventSettings(enabled, shouldRender = true) {
    window.enableEventRates = !!enabled;
    const panel = document.getElementById('event-curve-panel');
    if (panel) panel.classList.toggle('hidden', !enabled);
    if (enabled && shouldRender) renderEventPricingMatrix();
}

export function cycleRatesSpan() {
    ratesSpanDays = ratesSpanDays === 2 ? 3 : (ratesSpanDays === 3 ? 4 : 2);
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.innerText = `±${ratesSpanDays} Days`;
    renderEventPricingMatrix();
}

export function cycleRestrSpan() {
    restrSpanDays = restrSpanDays === 7 ? 4 : (restrSpanDays === 4 ? 2 : 7);
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = `±${restrSpanDays} Days`;
    renderEventPricingMatrix();
}

export function renderEventPricingMatrix() {
    window.savedAutofillBaselines = parseJson(window.savedAutofillBaselines);
    const b = window.savedAutofillBaselines;

    const ratesPill = document.getElementById('rates-span-pill');
    if (ratesPill) ratesPill.innerText = `±${ratesSpanDays} Days`;

    const restrPill = document.getElementById('restr-span-pill');
    if (restrPill) restrPill.innerText = `±${restrSpanDays} Days`;

    const pThead = document.getElementById('event-price-thead');
    const pTbody = document.getElementById('event-price-tbody');
    const rThead = document.getElementById('event-restr-thead');
    const rTbody = document.getElementById('event-restr-tbody');

    // 1. Peak Pricing Curve Table (Std Base + EVT Pkg + Offset Curve)
    if (pThead && pTbody) {
        let th = `<tr>
            <th class="p-1 text-slate-500 uppercase text-[9px] text-left">Master Anchor</th>
            <th class="p-1 text-[9px] font-black text-slate-600 uppercase">Std Base</th>
            <th class="p-1 text-[9px] font-black text-pink-700 bg-pink-50 uppercase">EVT Pkg</th>`;
        for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
            const label = i === 0 ? 'PEAK (0)' : (i > 0 ? `+${i}d` : `${i}d`);
            th += `<th class="p-1 text-[9px] font-black ${i === 0 ? 'text-amber-800 bg-amber-100' : 'text-slate-700'}">${label}</th>`;
        }
        th += '</tr>';
        pThead.innerHTML = th;

        const segments = [
            { seg: 'd', cat: window.pricingRules?.anchorDorm || 'Standard Dorm', badge: 'DORM', defBase: 199, defPkg: 200, defPeak: 2499 },
            { seg: 'p', cat: window.pricingRules?.anchorPrivate || 'Deluxe Private King', badge: 'PRIV', defBase: 899, defPkg: 1000, defPeak: 5999 }
        ];

        pTbody.innerHTML = segments.map(({ seg, cat, badge, defBase, defPkg, defPeak }) => {
            const baseVal = b[`${seg}_base`] !== undefined ? b[`${seg}_base`] : defBase;
            const pkgVal = b[`${seg}_pkg`] !== undefined ? b[`${seg}_pkg`] : defPkg;

            let row = `<tr>
                <td class="p-1 font-bold text-slate-800 text-left text-xs whitespace-nowrap">${cat} <span class="text-[8px] text-indigo-600 uppercase font-black">(${badge})</span></td>
                <td class="p-1"><input type="number" class="table-input !w-14 text-center font-bold" value="${baseVal}" oninput="window.updateEventBaseline('${seg}_base', parseFloat(this.value) || 0)"></td>
                <td class="p-1 bg-pink-50/50"><input type="number" class="table-input table-input-pink !w-14 text-center font-black" value="${pkgVal}" oninput="window.updateEventBaseline('${seg}_pkg', parseFloat(this.value) || 0)"></td>`;

            for (let i = -ratesSpanDays; i <= ratesSpanDays; i++) {
                const isPeak = (i === 0);
                const key = `${seg}_${offsetTag(i)}`;
                const fallback = isPeak ? defPeak : (Math.abs(i) === 1 ? Math.round((defBase + defPeak) * 0.35) : Math.round((defBase + defPeak) * 0.2));
                const val = b[key] !== undefined ? b[key] : fallback;
                row += `<td class="p-1 ${isPeak ? 'bg-amber-50' : ''}"><input type="number" class="table-input !w-14 text-center font-black ${isPeak ? '!border-amber-400 !text-amber-900' : ''}" value="${val}" oninput="window.updateEventBaseline('${key}', parseFloat(this.value) || 0)"></td>`;
            }
            row += '</tr>';
            return row;
        }).join('');
    }

    // 2. Peak Stay Restrictions Curve Table (Min, Min on Arrival, Max, CTA, CTD)
    if (rThead && rTbody) {
        const offsets = [];
        for (let i = -restrSpanDays; i <= restrSpanDays; i++) offsets.push(i);

        let th = '<tr><th class="p-1 text-slate-500 uppercase text-[9px] text-left">Restriction Rule</th>';
        offsets.forEach(off => {
            const label = off === 0 ? 'PEAK (0)' : (off > 0 ? `+${off}d` : `${off}d`);
            th += `<th class="p-1 text-[9px] font-black ${off === 0 ? 'text-indigo-700 bg-indigo-100' : 'text-slate-700'}">${label}</th>`;
        });
        th += '</tr>';
        rThead.innerHTML = th;

        const numRows = [
            { prefix: 'r_min', label: 'Min Stay (Through)', cls: 'text-pink-800' },
            { prefix: 'r_minarr', label: 'Min on Arrival', cls: 'text-amber-700' },
            { prefix: 'r_max', label: 'Max Stay (Nts)', cls: 'text-slate-700' }
        ];

        const boolRows = [
            { prefix: 'r_cta', label: 'Close to Arrival (CTA)' },
            { prefix: 'r_ctd', label: 'Close to Departure (CTD)' }
        ];

        let html = numRows.map(r => {
            let tr = `<tr><td class="p-1 font-bold text-slate-800 text-left whitespace-nowrap">${r.label}</td>`;
            offsets.forEach(off => {
                const key = `${r.prefix}_${offsetTag(off)}`;
                const val = b[key] !== undefined && b[key] !== '' ? b[key] : '';
                tr += `<td class="p-1 ${off === 0 ? 'bg-indigo-50/40' : ''}">
                    <input type="number" min="1" class="table-input !w-10 text-center font-black ${r.cls}" value="${val}" placeholder="--" oninput="window.updateEventBaseline('${key}', this.value === '' ? '' : (parseInt(this.value, 10) || ''))">
                </td>`;
            });
            tr += '</tr>';
            return tr;
        }).join('');

        html += boolRows.map(r => {
            let tr = `<tr><td class="p-1 font-bold text-slate-800 text-left whitespace-nowrap">${r.label}</td>`;
            offsets.forEach(off => {
                const key = `${r.prefix}_${offsetTag(off)}`;
                const checked = !!b[key];
                tr += `<td class="p-1 ${off === 0 ? 'bg-indigo-50/40' : ''}">
                    <input type="checkbox" class="row-checkbox cursor-pointer" ${checked ? 'checked' : ''} onchange="window.updateEventBaseline('${key}', this.checked)">
                </td>`;
            });
            tr += '</tr>';
            return tr;
        }).join('');

        rTbody.innerHTML = html;
    }
}

if (typeof window !== 'undefined') {
    window.renderPricingConfig = renderPricingConfig;
    window.renderMasterDriverSelect = renderMasterDriverSelect;
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
    window.updateEventBaseline = updateEventBaseline;
    window.toggleEventSettings = toggleEventSettings;
    window.cycleRatesSpan = cycleRatesSpan;
    window.cycleRestrSpan = cycleRestrSpan;
}
