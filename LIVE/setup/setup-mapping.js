// ==========================================================================
// setup/setup-mapping.js - Channex Room Type & Rate Plan Mapping
// Wild & Wandering Property Management System
//
// ARCHITECTURE CONTRACT:
// - Pure Step 3 UI & Mapping Binder
// - Zero raw Channex API URLs, pagination, or JSON:API payload wrappers
// - Delegates all Channex API communication strictly to ChannexClient
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';
import { ChannexClient } from '../channex.js';
import { CANONICAL_OTA_LIST, getChannelByCode, resolveChannelCode } from '../core/channels.js';

function normalizeCatName(val) {
    return String(val || '').trim().toLowerCase();
}

function findChannexMapForCategory(cat, catId = null, channexMap = window.channexMap || [], includeGhost = false) {
    const catNorm = normalizeCatName(cat);
    const matches = channexMap.filter(m => {
        if (!m || !m.channexId) return false;
        if (!includeGhost && m.isGhost) return false;
        if (catId && m.catId && m.catId === catId) return true;
        return normalizeCatName(m.pmsCategory) === catNorm;
    });
    return matches.find(m => !m.isGhost) || matches[0] || null;
}

function findGhostMapsForCategory(cat, catId = null, channexMap = window.channexMap || []) {
    const catNorm = normalizeCatName(cat);
    return channexMap.filter(m => {
        if (!m || !m.channexId || !m.isGhost) return false;
        if (catId && m.catId && m.catId === catId) return true;
        return normalizeCatName(m.pmsCategory) === catNorm;
    });
}

export async function fetchChannexData() {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return customAlert("Credentials Required", "Enter both Channex API Key and Property UUID.");
    }

    try {
        customAlert("Connecting...", "Fetching room types, rate plans, and connected channels from Channex...");

        const { rooms, ratePlans, policies, channels } = await ChannexClient.fetchPropertySetupData(propId, apiKey);

        window.channexRooms = rooms;
        window.channexRatePlans = ratePlans;
        window.channexPolicies = policies.length ? policies : (window.channexPolicies || []);
        window.channexConnectedChannels = channels.length ? channels : (window.channexConnectedChannels || []);

        renderStep3UnifiedMapping();
        customAlert("Fetched", `Loaded ${window.channexRooms.length} rooms, ${window.channexRatePlans.length} rate plans, and ${window.channexConnectedChannels.length} connected channels.`);

    } catch (err) {
        console.error("[Channex Fetch Error]:", err);
        customAlert("Fetch Failed", err.message);
    }
}

function getConnectedChannelsByCode() {
    const byCode = new Map();
    (window.channexConnectedChannels || []).forEach(c => {
        const code = resolveChannelCode(c.attributes?.channel || c.attributes?.title);
        if (!code || code === 'DEF' || code === 'WEB' || code === 'OTH') return;
        const title = (c.attributes?.title || getChannelByCode(code).name || code).trim();
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push({ id: c.id, code, title });
    });
    return byCode;
}

export function getAvailableMappingChannels() {
    const byCode = getConnectedChannelsByCode();
    const options = [
        { val: "DEF", label: "DEF - Default Rate" },
        { val: "WEB", label: "WEB - Direct Website" }
    ];

    CANONICAL_OTA_LIST.forEach(ch => {
        const conns = byCode.get(ch.code) || [];
        if (conns.length > 1) {
            conns.forEach(conn => {
                options.push({
                    val: `${ch.code}::${conn.id}`,
                    label: `${ch.code} - ${conn.title}`
                });
            });
            options.push({ val: ch.code, label: `${ch.code} - ${ch.name} (All)` });
        } else if (conns.length === 1) {
            options.push({
                val: `${ch.code}::${conns[0].id}`,
                label: `${ch.code} - ${conns[0].title}`
            });
        } else {
            options.push({ val: ch.code, label: `${ch.code} - ${ch.name}` });
        }
    });

    return options;
}

function getMappingSelectValue(mapping) {
    if (!mapping || !mapping.channel) return 'DEF';
    const byCode = getConnectedChannelsByCode();
    const conns = byCode.get(mapping.channel) || [];
    if (mapping.channelId && conns.some(c => c.id === mapping.channelId)) {
        return `${mapping.channel}::${mapping.channelId}`;
    }
    if (conns.length === 1) {
        return `${mapping.channel}::${conns[0].id}`;
    }
    return mapping.channel;
}

const AVAILABLE_POLICIES = [
    { val: "non-ref", label: "Non-Refundable" },
    { val: "ref", label: "Refundable (+%)" },
    { val: "event-non-ref", label: "Event Non-Refundable" },
    { val: "event-ref", label: "Event Refundable (+%)" },
    { val: "ignore", label: "-- Ignore / Do Not Sync --" }
];

export function detectRatePlanClassification(title, plan = null) {
    const channel = resolveChannelCode(title);
    const byCode = getConnectedChannelsByCode();
    const conns = byCode.get(channel) || [];
    let matchedConn = conns.length === 1 ? conns[0] : null;

    if (conns.length > 1) {
        const titleLower = title.toLowerCase();
        matchedConn = conns.find(c => titleLower.includes(c.title.toLowerCase())) || null;
    }

    const isEvt = /\b(event|peak|full[-_\s]?moon|fmp|pkg|package)\b/i.test(title);
    const isNonRef = /\b(non[-_\s]?ref(undable)?|nr\b|n[-_]?ref|no[-_\s]?refund|nonrefundable)\b/i.test(title);
    const isExplicitFlex = !isNonRef && /\b(flex(ible)?|ref(undable)?|free[-_\s]?cancel(lation)?|standard|std)\b/i.test(title);

    let policy = "non-ref";
    const planPolicyId = plan?.attributes?.cancellation_policy_id || plan?.relationships?.cancellation_policy?.data?.id;
    const linkedChannexPolicy = (window.channexPolicies || []).find(cp => cp.id === planPolicyId);
    const channexPolicyTitle = linkedChannexPolicy?.attributes?.title || '';

    if (isNonRef) {
        policy = isEvt ? "event-non-ref" : "non-ref";
    } else if (isExplicitFlex || /\b(flex|free|standard)\b/i.test(channexPolicyTitle)) {
        policy = isEvt ? "event-ref" : "ref";
    } else {
        policy = isEvt ? "event-non-ref" : "non-ref";
    }

    return {
        channel,
        channelId: matchedConn?.id || null,
        connectionTitle: matchedConn?.title || null,
        policy,
        isEvent: policy.startsWith('event')
    };
}

let step3ShowRates = true;
const step3ExpandedCats = new Set();

export function setStep3RateView(showRates) {
    step3ShowRates = !!showRates;
    if (step3ShowRates) step3ExpandedCats.clear();
    renderStep3UnifiedMapping();
}

export function toggleStep3CategoryRates(cat) {
    if (!cat) return;
    if (step3ExpandedCats.has(cat)) step3ExpandedCats.delete(cat);
    else step3ExpandedCats.add(cat);
    renderStep3UnifiedMapping();
}

function buildPlanTableRowsHtml(plans, cat, catId, channexRoomId, availableChannels, ghostTag = '') {
    const safeCat = cat.replace(/'/g, "\\'");
    return plans.map(plan => {
        const title = plan.attributes?.title || plan.id;
        let mapping = window.channexRateMap.find(r => r.ratePlanId === plan.id);
        const detected = detectRatePlanClassification(title, plan);

        if (!mapping) {
            mapping = {
                ratePlanId: plan.id,
                pmsCategory: cat,
                catId: catId || null,
                channexRoomId,
                ratePlanTitle: title,
                channel: detected.channel,
                channelId: detected.channelId,
                connectionTitle: detected.connectionTitle,
                product: detected.isEvent ? 'evt' : 'std',
                policy: detected.policy,
                rateType: detected.policy,
                isEvent: detected.isEvent
            };
            window.channexRateMap.push(mapping);
        } else {
            mapping.pmsCategory = cat;
            if (catId) mapping.catId = catId;
            if (!mapping.channexRoomId && channexRoomId) mapping.channexRoomId = channexRoomId;
            if (!mapping.channel || mapping.channel === "DEF" || mapping.channel === "DEFAULT") {
                if (detected.channel !== "DEF") {
                    mapping.channel = detected.channel;
                    mapping.channelId = detected.channelId;
                    mapping.connectionTitle = detected.connectionTitle;
                }
            }
            if (!mapping.policy || mapping.policy === "non-ref") {
                if (detected.policy !== "non-ref") {
                    mapping.policy = detected.policy;
                    mapping.rateType = detected.policy;
                    mapping.isEvent = detected.isEvent;
                }
            }
        }

        const selectedChannelVal = getMappingSelectValue(mapping);
        const hasSavedCustomConn = mapping.channelId && !availableChannels.some(c => c.val === selectedChannelVal);
        const channelOptsHtml = (hasSavedCustomConn
            ? [{ val: selectedChannelVal, label: `${mapping.channel} - ${mapping.connectionTitle || mapping.channelId.slice(-6)}` }, ...availableChannels]
            : availableChannels
        ).map(ch => `<option value="${ch.val}" ${selectedChannelVal === ch.val ? 'selected' : ''}>${ch.label}</option>`).join('');

        const isEventPlan = mapping.policy?.startsWith('event');
        const isFlexPolicy = mapping.policy === 'ref' || mapping.policy === 'event-ref';

        let policySelectClass = 'table-input font-bold text-xs cursor-pointer';
        if (isEventPlan) {
            policySelectClass += ' border-pink-400 text-pink-700 bg-pink-50/20';
        } else if (isFlexPolicy) {
            policySelectClass += ' border-emerald-400 text-emerald-700 bg-emerald-50/20';
        }

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-1.5 px-2">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-slate-800 text-xs">${title}</span>
                        <span class="rate-plan-badge ${isEventPlan ? 'setup-badge-event' : 'setup-badge-std'}">${isEventPlan ? 'EVENT' : 'STD'}</span>
                        ${ghostTag}
                    </div>
                    <div class="font-mono text-[9.5px] text-slate-400 mt-0.5">ID: ...${plan.id.slice(-8)}</div>
                </td>
                <td class="py-1.5 px-2">
                    <select tabindex="0" class="table-input font-bold text-xs cursor-pointer" onchange="window.updateRatePlanClassification('${plan.id}', '${safeCat}', '${channexRoomId}', '${title.replace(/'/g, "\\'")}', 'channel', this.value, this)">
                        ${channelOptsHtml}
                    </select>
                </td>
                <td class="py-1.5 px-2">
                    <select tabindex="0" class="${policySelectClass}" onchange="window.updateRatePlanClassification('${plan.id}', '${safeCat}', '${channexRoomId}', '${title.replace(/'/g, "\\'")}', 'policy', this.value, this)">
                        ${AVAILABLE_POLICIES.map(pol => `
                            <option value="${pol.val}" ${mapping.policy === pol.val ? 'selected' : ''}>${pol.label}</option>
                        `).join('')}
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

export function renderStep3UnifiedMapping() {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    container.innerHTML = '';

    const definitions = (window.roomDefinitions || []).filter(r => !r.inactive);
    const pmsCategories = Array.from(new Set(definitions.map(r => (r.category || '').trim()).filter(Boolean)));

    if (pmsCategories.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold text-xs uppercase">No PMS room categories defined yet. Complete Step 2 first.</div>`;
        return;
    }

    const catToId = new Map();
    const idToCat = new Map();
    definitions.forEach(d => {
        const c = (d.category || '').trim();
        if (c && d.catId) {
            catToId.set(c, d.catId);
            idToCat.set(d.catId, c);
        }
    });

    const activeCatSet = new Set(pmsCategories.map(c => c.toLowerCase()));

    window.channexMap = (window.channexMap || [])
        .map(m => {
            if (m.catId && idToCat.has(m.catId)) m.pmsCategory = idToCat.get(m.catId);
            const matchedCat = pmsCategories.find(c => normalizeCatName(c) === normalizeCatName(m.pmsCategory));
            if (matchedCat) {
                m.pmsCategory = matchedCat;
                if (!m.catId && catToId.has(matchedCat)) m.catId = catToId.get(matchedCat);
            }
            return m;
        })
        .filter(m => m.pmsCategory && activeCatSet.has(m.pmsCategory.trim().toLowerCase()));

    window.channexRateMap = (window.channexRateMap || [])
        .map(rp => {
            if (rp.catId && idToCat.has(rp.catId)) rp.pmsCategory = idToCat.get(rp.catId);
            const matchedCat = pmsCategories.find(c => normalizeCatName(c) === normalizeCatName(rp.pmsCategory));
            if (matchedCat) {
                rp.pmsCategory = matchedCat;
                if (!rp.catId && catToId.has(matchedCat)) rp.catId = catToId.get(matchedCat);
            }
            return rp;
        })
        .filter(rp => rp.pmsCategory && activeCatSet.has(rp.pmsCategory.trim().toLowerCase()));

    const ghostRoomIds = new Set((window.channexMap || []).filter(m => m.isGhost).map(m => m.channexId));
    const mappedChannexIds = new Set((window.channexMap || []).map(m => m.channexId).filter(Boolean));
    const unmappedChannexRooms = (window.channexRooms || []).filter(cr => cr?.id && !mappedChannexIds.has(cr.id));
    const mappedCount = pmsCategories.filter(cat => !!findChannexMapForCategory(cat, catToId.get(cat))).length;

    const toolbar = document.createElement('div');
    toolbar.className = 'flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-xs';
    toolbar.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="font-black uppercase text-slate-700">Room & Rate Mapping</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${mappedCount === pmsCategories.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}">
                ${mappedCount} / ${pmsCategories.length} Rooms Mapped • ${window.channexRateMap.length} Active Plans
            </span>
        </div>
        <div class="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 text-[10px] font-black uppercase">
            <span class="px-1.5 text-slate-400">DISPLAY:</span>
            <button type="button" onclick="window.setStep3RateView(false)" class="px-2.5 py-0.5 rounded cursor-pointer transition-colors ${!step3ShowRates ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-white'}">Rooms Only</button>
            <button type="button" onclick="window.setStep3RateView(true)" class="px-2.5 py-0.5 rounded cursor-pointer transition-colors ${step3ShowRates ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-white'}">All Rates</button>
        </div>
    `;
    container.appendChild(toolbar);

    const availableChannels = getAvailableMappingChannels();

    pmsCategories.forEach(cat => {
        const catId = catToId.get(cat) || null;
        const currentMap = findChannexMapForCategory(cat, catId);
        const ghostMaps = findGhostMapsForCategory(cat, catId);
        const isMapped = !!(currentMap && currentMap.channexId);
        const hasAnyMappedRoom = isMapped || ghostMaps.length > 0;
        const safeCatAttr = cat.replace(/'/g, "\\'");

        const card = document.createElement('div');
        card.className = isMapped ? 'mapping-card-mapped' : 'mapping-card-unmapped';

        let selectOptions = `<option value="">-- UNMAPPED / IGNORED --</option>`;
        const roomsList = window.channexRooms || [];
        if (currentMap?.channexId && !roomsList.some(cr => cr.id === currentMap.channexId)) {
            selectOptions += `<option value="${currentMap.channexId}" selected>${currentMap.channexTitle || currentMap.channexId}</option>`;
        }
        roomsList.forEach(cr => {
            const isSel = currentMap?.channexId === cr.id ? 'selected' : '';
            const ghostPrefix = ghostRoomIds.has(cr.id) ? '[GHOST] ' : '';
            selectOptions += `<option value="${cr.id}" ${isSel}>${ghostPrefix}${cr.attributes?.title || cr.id}</option>`;
        });

        const matchingPlans = isMapped
            ? (window.channexRatePlans || []).filter(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === currentMap.channexId)
            : [];

        const ghostPlanEntries = ghostMaps.flatMap(gm => {
            const plans = (window.channexRatePlans || []).filter(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === gm.channexId);
            return plans.map(plan => ({ gm, plan }));
        });

        const totalPlanCount = matchingPlans.length + ghostPlanEntries.length;
        const isCardPlansVisible = step3ShowRates || step3ExpandedCats.has(cat);

        const linkGhostSelectHtml = unmappedChannexRooms.length > 0
            ? `<select class="table-input !w-auto max-w-[200px] text-[10px] font-bold bg-white text-indigo-900 py-0.5" onchange="if(this.value){ window.addGhostRoomMapping('${safeCatAttr}', this.value); this.value=''; }" title="Link an existing unmapped Channex room type as a Ghost Room">
                <option value="">+ Link Existing Ghost Room...</option>
                ${unmappedChannexRooms.map(cr => `<option value="${cr.id}">${cr.attributes?.title || cr.id}</option>`).join('')}
               </select>`
            : '';

        const ghostStripHtml = (ghostMaps.length > 0 || unmappedChannexRooms.length > 0)
            ? `<div class="px-3 py-1.5 bg-indigo-50/80 border-b border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-black uppercase text-[8.5px]" data-tip="setup.ghostRoom">GHOST ROOMS</span>
                    ${ghostMaps.length > 0 ? ghostMaps.map(gm => {
                        const gPlanCount = (window.channexRatePlans || []).filter(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === gm.channexId).length;
                        const countCls = gPlanCount === 0
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-200';
                        return `
                            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-indigo-300 font-bold text-indigo-950">
                                <span>${gm.channexTitle || gm.channexId}</span>
                                <span class="px-1 py-0.2 rounded border text-[8.5px] font-black uppercase ${countCls}">${gPlanCount} plan${gPlanCount === 1 ? '' : 's'}</span>
                                <button type="button" onclick="window.openCreateRatePlanModal('rates', 'GHOST::${gm.channexId}')" class="px-1.5 py-0.2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[8.5px] cursor-pointer" title="Create or clone rate plans for this Ghost Room">+ Add Rates</button>
                                <button type="button" onclick="window.removeGhostRoomMapping('${gm.channexId}')" class="text-slate-400 hover:text-rose-600 font-black cursor-pointer leading-none ml-0.5" title="Unlink this Ghost Room mapping">&times;</button>
                            </span>
                        `;
                    }).join('') : `<span class="text-[10px] text-slate-500 font-semibold">None linked</span>`}
                </div>
                ${linkGhostSelectHtml}
               </div>`
            : '';

        let ratePlansHtml = '';
        if (hasAnyMappedRoom && isCardPlansVisible) {
            if (totalPlanCount > 0) {
                const primaryRows = isMapped
                    ? buildPlanTableRowsHtml(matchingPlans, cat, catId, currentMap.channexId, availableChannels)
                    : '';
                const ghostRows = ghostMaps.map(gm => {
                    const gPlans = (window.channexRatePlans || []).filter(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === gm.channexId);
                    const tag = `<span class="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 text-[8px] font-black uppercase">GHOST: ${gm.channexTitle || 'Ghost'}</span>`;
                    return buildPlanTableRowsHtml(gPlans, cat, catId, gm.channexId, availableChannels, tag);
                }).join('');

                ratePlansHtml = `
                    <div class="overflow-x-auto p-2 bg-white">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-black text-[9px] uppercase tracking-wider">
                                <tr>
                                    <th class="py-1 px-2">RATE PLAN NAME</th>
                                    <th class="py-1 px-2 w-56">SALES CHANNEL</th>
                                    <th class="py-1 px-2 w-48">CANCELLATION POLICY</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${primaryRows}
                                ${ghostRows}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                const defaultTargetKey = isMapped ? `PRIMARY::${safeCatAttr}` : `GHOST::${ghostMaps[0].channexId}`;
                ratePlansHtml = `
                    <div class="p-3 bg-white flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500">
                        <span class="italic">No rate plans attached in Channex yet. Add rate plans or click "Fetch Channex Data" to refresh.</span>
                        <button type="button" onclick="window.openCreateRatePlanModal('rates', '${defaultTargetKey}')" class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[9.5px] cursor-pointer">+ Add Rate Plans</button>
                    </div>
                `;
            }
        }

        const plansToggleBadge = (hasAnyMappedRoom && !step3ShowRates)
            ? `<button type="button" onclick="window.toggleStep3CategoryRates('${safeCatAttr}')" class="px-2 py-0.5 rounded bg-white/90 hover:bg-white text-emerald-900 border border-emerald-300 text-[9.5px] font-black uppercase cursor-pointer">
                ${totalPlanCount} Plan${totalPlanCount === 1 ? '' : 's'} ${isCardPlansVisible ? '▴' : '▸'}
               </button>`
            : '';

        card.innerHTML = `
            <div class="${isMapped ? 'mapping-header-mapped' : 'mapping-header-unmapped'}">
                <div class="flex items-center gap-2">
                    <span class="${isMapped ? 'mapping-badge-mapped' : 'mapping-badge-unmapped'}">${isMapped ? 'MAPPED ✓' : 'UNMAPPED ⚠'}</span>
                    <span class="font-black text-xs uppercase tracking-wide text-slate-900">${cat}</span>
                    ${plansToggleBadge}
                </div>
                <div class="w-64">
                    <select class="table-input font-bold bg-white text-slate-800" onchange="window.updateRoomTypeMapping('${safeCatAttr}', this.value)">
                        ${selectOptions}
                    </select>
                </div>
            </div>
            ${ghostStripHtml}
            ${ratePlansHtml}
        `;

        container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function addGhostRoomMapping(pmsCategory, channexId) {
    if (!pmsCategory || !channexId) return;
    window.channexMap = window.channexMap || [];
    window.channexRateMap = window.channexRateMap || [];

    const defMatch = (window.roomDefinitions || []).find(d => !d.inactive && normalizeCatName(d.category) === normalizeCatName(pmsCategory));
    const catId = defMatch?.catId || null;
    const cRoom = (window.channexRooms || []).find(r => r.id === channexId);
    const title = cRoom?.attributes?.title || channexId;

    window.channexMap = window.channexMap.filter(m => m.channexId !== channexId);
    window.channexMap.push({ pmsCategory, catId, channexId, channexTitle: title, isGhost: true });

    const matchingPlans = (window.channexRatePlans || []).filter(p => {
        const rId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id;
        return rId === channexId;
    });

    matchingPlans.forEach(plan => {
        const planTitle = plan.attributes?.title || plan.id;
        const detected = detectRatePlanClassification(planTitle, plan);
        window.channexRateMap = window.channexRateMap.filter(r => r.ratePlanId !== plan.id);
        window.channexRateMap.push({
            pmsCategory,
            catId,
            channexRoomId: channexId,
            ratePlanId: plan.id,
            ratePlanTitle: planTitle,
            channel: detected.channel,
            channelId: detected.channelId,
            connectionTitle: detected.connectionTitle,
            policy: detected.policy,
            rateType: detected.policy,
            isEvent: detected.isEvent,
            isGhost: true
        });
    });

    renderStep3UnifiedMapping();
}

export function removeGhostRoomMapping(channexId) {
    if (!channexId) return;
    window.channexMap = (window.channexMap || []).filter(m => m.channexId !== channexId);
    window.channexRateMap = (window.channexRateMap || []).filter(r => r.channexRoomId !== channexId);
    renderStep3UnifiedMapping();
}

export function updateRoomTypeMapping(pmsCategory, channexId) {
    window.channexMap = window.channexMap || [];
    window.channexRateMap = window.channexRateMap || [];

    const defMatch = (window.roomDefinitions || []).find(d => !d.inactive && normalizeCatName(d.category) === normalizeCatName(pmsCategory));
    const catId = defMatch?.catId || null;

    // Preserve any Ghost Room mappings attached to this category; replace only the primary room mapping
    const removedPrimaryIds = new Set(
        window.channexMap
            .filter(m => !m.isGhost && (normalizeCatName(m.pmsCategory) === normalizeCatName(pmsCategory) || (catId && m.catId === catId)))
            .map(m => m.channexId)
    );

    window.channexMap = window.channexMap.filter(m =>
        (m.isGhost && m.channexId !== channexId) ||
        (!m.isGhost && normalizeCatName(m.pmsCategory) !== normalizeCatName(pmsCategory) && (!catId || m.catId !== catId) && (!channexId || m.channexId !== channexId))
    );
    window.channexRateMap = window.channexRateMap.filter(r =>
        !removedPrimaryIds.has(r.channexRoomId) && (!channexId || r.channexRoomId !== channexId)
    );

    if (channexId) {
        const cRoom = (window.channexRooms || []).find(r => r.id === channexId);
        const title = cRoom?.attributes?.title || channexId;

        window.channexMap.push({ pmsCategory, catId, channexId, channexTitle: title, isGhost: false });

        const matchingPlans = (window.channexRatePlans || []).filter(p => {
            const rId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id;
            return rId === channexId;
        });

        matchingPlans.forEach(plan => {
            const planTitle = plan.attributes?.title || plan.id;
            const detected = detectRatePlanClassification(planTitle, plan);
            window.channexRateMap = window.channexRateMap.filter(r => r.ratePlanId !== plan.id);
            window.channexRateMap.push({
                pmsCategory,
                catId,
                channexRoomId: channexId,
                ratePlanId: plan.id,
                ratePlanTitle: planTitle,
                channel: detected.channel,
                channelId: detected.channelId,
                connectionTitle: detected.connectionTitle,
                policy: detected.policy,
                rateType: detected.policy,
                isEvent: detected.isEvent
            });
        });
    }

    renderStep3UnifiedMapping();
}

export function getDynamicBatchRateTemplates() {
    const byCode = getConnectedChannelsByCode();
    const activeCodes = Array.from(new Set(['BDC', ...byCode.keys()])).filter(c => c !== 'DEF' && c !== 'WEB');

    const templates = [
        { id: 'def_non_ref', titleTpl: 'Non-Refundable {CAT}', channel: 'DEF', channelId: null, connectionTitle: null, policy: 'non-ref', checked: true, isEvent: false },
        { id: 'def_ref', titleTpl: 'Refundable {CAT}', channel: 'DEF', channelId: null, connectionTitle: null, policy: 'ref', checked: true, isEvent: false }
    ];

    activeCodes.forEach(code => {
        const conns = byCode.get(code) || [];
        if (conns.length > 1) {
            conns.forEach(conn => {
                templates.push(
                    { id: `${code.toLowerCase()}_${conn.id}_non_ref`, titleTpl: `[${code}] ${conn.title} Non-Refundable {CAT}`, channel: code, channelId: conn.id, connectionTitle: conn.title, policy: 'non-ref', checked: true, isEvent: false },
                    { id: `${code.toLowerCase()}_${conn.id}_ref`, titleTpl: `[${code}] ${conn.title} Refundable {CAT}`, channel: code, channelId: conn.id, connectionTitle: conn.title, policy: 'ref', checked: true, isEvent: false }
                );
            });
        } else {
            const singleConn = conns[0] || null;
            templates.push(
                { id: `${code.toLowerCase()}_non_ref`, titleTpl: `[${code}] Non-Refundable {CAT}`, channel: code, channelId: singleConn?.id || null, connectionTitle: singleConn?.title || null, policy: 'non-ref', checked: true, isEvent: false },
                { id: `${code.toLowerCase()}_ref`, titleTpl: `[${code}] Refundable {CAT}`, channel: code, channelId: singleConn?.id || null, connectionTitle: singleConn?.title || null, policy: 'ref', checked: true, isEvent: false }
            );
        }
    });

    templates.push(
        { id: 'evt_non_ref', titleTpl: 'Event Non-Refundable {CAT}', channel: 'DEF', channelId: null, connectionTitle: null, policy: 'event-non-ref', checked: false, isEvent: true },
        { id: 'evt_ref', titleTpl: 'Event Refundable {CAT}', channel: 'DEF', channelId: null, connectionTitle: null, policy: 'event-ref', checked: false, isEvent: true }
    );

    return templates;
}

export function switchCreateModalTab(tab = 'rooms') {
    const btnRooms = document.getElementById('tab-btn-create-rooms');
    const btnRates = document.getElementById('tab-btn-create-rates');
    const paneRooms = document.getElementById('create-modal-pane-rooms');
    const paneRates = document.getElementById('create-modal-pane-rates');

    const isRooms = tab === 'rooms';

    if (btnRooms && btnRates) {
        btnRooms.className = isRooms
            ? "flex-1 py-1.5 text-center font-black text-[11px] uppercase border-b-2 border-indigo-600 text-indigo-700 cursor-pointer transition-colors"
            : "flex-1 py-1.5 text-center font-bold text-[11px] uppercase border-b-2 border-transparent text-slate-500 hover:text-slate-800 cursor-pointer transition-colors";

        btnRates.className = !isRooms
            ? "flex-1 py-1.5 text-center font-black text-[11px] uppercase border-b-2 border-indigo-600 text-indigo-700 cursor-pointer transition-colors"
            : "flex-1 py-1.5 text-center font-bold text-[11px] uppercase border-b-2 border-transparent text-slate-500 hover:text-slate-800 cursor-pointer transition-colors";
    }

    if (paneRooms) paneRooms.classList.toggle('hidden', !isRooms);
    if (paneRates) paneRates.classList.toggle('hidden', isRooms);
}

export function toggleGhostRoomMode(isGhost) {
    const prefixWrap = document.getElementById('crp-ghost-prefix-wrap');
    if (prefixWrap) {
        prefixWrap.classList.toggle('hidden', !isGhost);
    }
    const chks = document.querySelectorAll('.crp-roomtype-chk');
    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    chks.forEach(chk => {
        if (isGhost) {
            chk.checked = false;
        } else {
            const catId = defs.find(r => normalizeCatName(r.category) === normalizeCatName(chk.value))?.catId || null;
            chk.checked = !findChannexMapForCategory(chk.value, catId);
        }
    });
}

function getAllRateTargetEntries() {
    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const categories = Array.from(new Set(defs.map(r => (r.category || '').trim()).filter(Boolean)));
    const entries = [];

    categories.forEach(cat => {
        const catId = defs.find(r => normalizeCatName(r.category) === normalizeCatName(cat))?.catId || null;
        const primaryMap = findChannexMapForCategory(cat, catId);
        entries.push({
            key: `PRIMARY::${cat}`,
            pmsCategory: cat,
            catId,
            channexId: primaryMap?.channexId || null,
            label: cat,
            titleLabel: cat,
            isGhost: false
        });

        const ghosts = findGhostMapsForCategory(cat, catId);
        ghosts.forEach(gm => {
            const gTitle = gm.channexTitle || `Ghost ${cat}`;
            entries.push({
                key: `GHOST::${gm.channexId}`,
                pmsCategory: cat,
                catId,
                channexId: gm.channexId,
                label: gTitle,
                titleLabel: gTitle,
                isGhost: true
            });
        });
    });

    return entries;
}

export function openCreateRatePlanModal(initialTab = 'rooms', preselectedTargetKey = null) {
    const modal = document.getElementById('create-rate-plan-modal');
    if (!modal) return;

    const ghostChk = document.getElementById('crp-ghost-mode');
    const ghostPrefixWrap = document.getElementById('crp-ghost-prefix-wrap');
    const ghostPrefixInput = document.getElementById('crp-ghost-prefix');
    if (ghostChk) ghostChk.checked = false;
    if (ghostPrefixWrap) ghostPrefixWrap.classList.add('hidden');
    if (ghostPrefixInput) ghostPrefixInput.value = 'Ghost ';

    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const categories = Array.from(new Set(defs.map(r => (r.category || '').trim()).filter(Boolean)));
    const allPlans = window.channexRatePlans || [];

    const roomTypeChecklist = document.getElementById('crp-roomtype-checklist');
    if (roomTypeChecklist) {
        roomTypeChecklist.innerHTML = categories.map(cat => {
            const sameCat = defs.filter(r => normalizeCatName(r.category) === normalizeCatName(cat));
            const catId = sameCat[0]?.catId || null;
            const isDorm = sameCat.some(r => r.rule !== 'private');
            const totalBeds = sameCat.reduce((s, r) => s + parseInt(r.beds || r.units || 1, 10), 0);
            const isMapped = !!findChannexMapForCategory(cat, catId);
            const ghostCount = findGhostMapsForCategory(cat, catId).length;

            return `
                <label class="flex items-center justify-between p-2 rounded hover:bg-slate-100 cursor-pointer border border-slate-200 bg-white">
                    <div class="flex items-center gap-2 truncate">
                        <input type="checkbox" class="crp-roomtype-chk" value="${cat}" ${!isMapped ? 'checked' : ''}>
                        <span class="font-bold text-slate-800 truncate text-[11px]">${cat}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${ghostCount > 0 ? `<span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">${ghostCount} Ghost</span>` : ''}
                        <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            isDorm ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }">
                            ${isDorm ? `${totalBeds} Beds (Dorm)` : `${sameCat.length} Unit(s)`}
                        </span>
                        <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            isMapped ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }">
                            ${isMapped ? 'Mapped ✓' : 'Unmapped'}
                        </span>
                    </div>
                </label>
            `;
        }).join('');
    }

    const rateTargets = getAllRateTargetEntries();
    const rateChecklist = document.getElementById('crp-room-checklist');
    if (rateChecklist) {
        rateChecklist.innerHTML = rateTargets.map(t => {
            const isChecked = preselectedTargetKey ? t.key === preselectedTargetKey : !t.isGhost;
            return `
                <label class="flex items-center gap-1.5 font-bold cursor-pointer text-xs p-1 hover:bg-slate-100 rounded ${t.isGhost ? 'text-indigo-800' : ''}">
                    <input type="checkbox" class="crp-cat-chk" value="${t.key}" data-ghost="${t.isGhost ? 'true' : 'false'}" ${isChecked ? 'checked' : ''}>
                    <span>${t.label}</span>
                    ${t.isGhost ? `<span class="px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 text-[8px] font-black uppercase">GHOST</span>` : ''}
                    ${!t.channexId ? `<span class="text-[8.5px] font-bold text-amber-600">(Unmapped)</span>` : ''}
                </label>
            `;
        }).join('');
    }

    const cloneSourceSelect = document.getElementById('crp-clone-source');
    if (cloneSourceSelect) {
        const sourceTargets = rateTargets.filter(t => {
            if (!t.channexId) return false;
            return allPlans.some(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === t.channexId);
        });

        cloneSourceSelect.innerHTML = `<option value="">-- Select Source Room --</option>` + sourceTargets.map(t => {
            const count = allPlans.filter(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === t.channexId).length;
            return `<option value="${t.key}">${t.isGhost ? '[GHOST] ' : ''}${t.label} (${count} Plans)</option>`;
        }).join('');
    }

    const batchListEl = document.getElementById('crp-batch-plans-list');
    window.currentBatchTemplates = getDynamicBatchRateTemplates();
    if (batchListEl) {
        batchListEl.innerHTML = window.currentBatchTemplates.map((tpl, i) => `
            <label class="flex items-center justify-between p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                <div class="flex items-center gap-1.5 truncate">
                    <input type="checkbox" class="crp-batch-tpl-chk" data-idx="${i}" ${tpl.checked ? 'checked' : ''}>
                    <span class="font-bold text-slate-800 text-[10.5px] truncate">${tpl.titleTpl.replace(' {CAT}', '')}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0 text-[8.5px] font-black uppercase">
                    <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">${tpl.channel}</span>
                    <span class="px-1.5 py-0.2 rounded ${tpl.isEvent ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}">${tpl.policy}</span>
                </div>
            </label>
        `).join('');
    }

    renderOptionCChannelPills();

    switchCreateModalTab(initialTab);

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function closeCreateRatePlanModal() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function toggleAllTargetRoomTypes(mode = 'all') {
    const chks = document.querySelectorAll('.crp-roomtype-chk');
    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    chks.forEach(chk => {
        if (mode === 'all') chk.checked = true;
        else if (mode === 'none') chk.checked = false;
        else if (mode === 'unmapped') {
            const catId = defs.find(r => normalizeCatName(r.category) === normalizeCatName(chk.value))?.catId || null;
            chk.checked = !findChannexMapForCategory(chk.value, catId);
        }
    });
}

export function toggleAllTargetRooms(mode) {
    document.querySelectorAll('.crp-cat-chk').forEach(chk => {
        if (mode === 'ghosts') chk.checked = chk.dataset.ghost === 'true';
        else if (mode === 'primary') chk.checked = chk.dataset.ghost !== 'true';
        else chk.checked = !!mode;
    });
}

export function toggleBatchPresetPlans(checked) {
    document.querySelectorAll('.crp-batch-tpl-chk').forEach(chk => chk.checked = checked);
}

async function resolveChannexPolicyId(targetPolicyType, propId, apiKey) {
    if (!window.channexPolicies || window.channexPolicies.length === 0) {
        try {
            window.channexPolicies = await ChannexClient.fetchCancellationPolicies(propId, apiKey);
        } catch (e) {
            console.warn("[Channex] Policy fetch fallback failed:", e);
        }
    }

    const policies = window.channexPolicies || [];
    if (policies.length === 0) return null;

    const isFlex = targetPolicyType === 'ref' || targetPolicyType === 'event-ref';

    if (isFlex) {
        const flexPolicy = policies.find(p => {
            const t = (p.attributes?.title || '').toLowerCase();
            const logic = (p.attributes?.logic || '').toLowerCase();
            return !t.includes('non') && (t.includes('flex') || t.includes('free') || t.includes('standard') || logic !== 'non_refundable');
        });
        return flexPolicy ? flexPolicy.id : policies[0].id;
    } else {
        const nonRefPolicy = policies.find(p => {
            const t = (p.attributes?.title || '').toLowerCase();
            const logic = (p.attributes?.logic || '').toLowerCase();
            return t.includes('non') || logic === 'non_refundable';
        });
        return nonRefPolicy ? nonRefPolicy.id : policies[0].id;
    }
}

export async function executeCreateAndPushRoomTypes() {
    const chks = Array.from(document.querySelectorAll('.crp-roomtype-chk:checked')).map(c => c.value);
    if (chks.length === 0) return customAlert("Input Required", "Select at least one room category to push.");

    const apiKey = document.getElementById('chan-api-key')?.value.trim() || window.channexConfig?.apiKey;
    const propId = document.getElementById('chan-prop-id')?.value.trim() || window.channexConfig?.propId;

    if (!apiKey || !propId) {
        return customAlert("Credentials Required", "Enter both Channex API Key and Property UUID first.");
    }

    const isGhost = !!document.getElementById('crp-ghost-mode')?.checked;
    const rawPrefix = document.getElementById('crp-ghost-prefix')?.value ?? 'Ghost ';
    const ghostPrefix = isGhost ? (rawPrefix.trim() ? `${rawPrefix.trim()} ` : 'Ghost ') : '';

    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    window.channexRooms = window.channexRooms || [];
    window.channexMap = window.channexMap || [];

    try {
        customAlert("Creating in Channex...", `Pushing ${chks.length} ${isGhost ? 'ghost ' : ''}room type(s) to Channex...`);
        let createdCount = 0;

        for (const cat of chks) {
            const sameCat = defs.filter(r => normalizeCatName(r.category) === normalizeCatName(cat));
            const catId = sameCat[0]?.catId || null;
            const isDorm = sameCat.some(r => r.rule !== 'private');
            const totalBeds = sameCat.reduce((s, r) => s + parseInt(r.beds || r.units || 1, 10), 0);
            const occAdults = isDorm ? 1 : Math.max(1, parseInt(sameCat[0]?.beds || 2, 10));
            const countOfRooms = isDorm ? totalBeds : Math.max(1, sameCat.length);
            const bedCapacity = Math.max(1, parseInt(sameCat[0]?.beds || 1, 10));
            const channexTitle = isGhost ? `${ghostPrefix}${cat}`.trim() : cat;

            const res = await ChannexClient.createRoomType(propId, {
                title: channexTitle,
                count_of_rooms: countOfRooms,
                occ_adults: occAdults,
                occ_children: 0,
                occ_infants: 0,
                default_occupancy: occAdults,
                room_kind: isDorm ? 'dorm' : 'room',
                ...(isDorm ? { capacity: bedCapacity } : {})
            }, apiKey);

            if (res?.data) {
                window.channexRooms.push(res.data);

                if (isGhost) {
                    window.channexMap.push({
                        pmsCategory: cat,
                        catId,
                        channexId: res.data.id,
                        channexTitle,
                        isGhost: true
                    });
                } else {
                    const existing = findChannexMapForCategory(cat, catId);
                    if (existing) {
                        existing.pmsCategory = cat;
                        if (catId) existing.catId = catId;
                        existing.channexId = res.data.id;
                        existing.channexTitle = channexTitle;
                        existing.isGhost = false;
                    } else {
                        window.channexMap.push({
                            pmsCategory: cat,
                            catId,
                            channexId: res.data.id,
                            channexTitle,
                            isGhost: false
                        });
                    }
                }
                createdCount++;
            }
        }

        if (typeof window.savePropertyToDatabase === 'function') {
            await window.savePropertyToDatabase(false);
        }

        closeCreateRatePlanModal();
        renderStep3UnifiedMapping();
        customAlert(
            "Success",
            isGhost
                ? `Created ${createdCount} Ghost Room type(s) in Channex and linked them to your existing PMS categories.`
                : `Created ${createdCount} room type(s) in Channex and automatically paired your Step 2 categories.`
        );
    } catch (err) {
        console.error("[Create Room Types Error]:", err);
        customAlert("Creation Failed", err.message);
    }
}

export async function executeCloneRatePlans() {
    const sourceKey = document.getElementById('crp-clone-source')?.value;
    if (!sourceKey) return customAlert("Input Required", "Please select a source room to clone plans from.");

    const targetKeys = Array.from(document.querySelectorAll('.crp-cat-chk:checked')).map(c => c.value);
    if (targetKeys.length === 0) return customAlert("Input Required", "Select at least one target room.");

    const apiKey = document.getElementById('chan-api-key')?.value.trim() || window.channexConfig?.apiKey;
    const propId = document.getElementById('chan-prop-id')?.value.trim() || window.channexConfig?.propId;
    const currency = document.getElementById('prop-currency')?.value || window.currentPropertyConfig?.currency || 'THB';

    if (!apiKey || !propId) {
        return customAlert("Credentials Required", "Enter both Channex API Key and Property UUID.");
    }

    const targetLookup = new Map(getAllRateTargetEntries().map(t => [t.key, t]));
    const srcTarget = targetLookup.get(sourceKey) || targetLookup.get(`PRIMARY::${sourceKey}`);
    if (!srcTarget?.channexId) {
        return customAlert("Error", `Source "${sourceKey}" is not mapped to a Channex Room Type.`);
    }

    const allPlans = window.channexRatePlans || [];
    const sourcePlans = allPlans.filter(p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === srcTarget.channexId);

    if (sourcePlans.length === 0) {
        return customAlert("No Plans", `No primary rate plans found under "${srcTarget.label}".`);
    }

    const resolvedTargets = targetKeys.map(k => targetLookup.get(k) || targetLookup.get(`PRIMARY::${k}`)).filter(Boolean);
    const unmappedTargets = resolvedTargets.filter(t => !t.channexId);

    if (unmappedTargets.length > 0) {
        return customAlert("Target Not Mapped", `Cannot push rate plans. The following categories are not yet paired to a Channex Room Type:\n• ${unmappedTargets.map(u => u.label).join('\n• ')}`);
    }

    try {
        const totalOps = resolvedTargets.length * sourcePlans.length;
        customAlert("Cloning...", `Checking & pushing up to ${totalOps} rate plan(s) to Channex...`);
        let createdCount = 0;
        let skippedCount = 0;

        for (const tgt of resolvedTargets) {
            const existingMapped = (window.channexRateMap || []).filter(r =>
                r.channexRoomId
                    ? r.channexRoomId === tgt.channexId
                    : (!tgt.isGhost && normalizeCatName(r.pmsCategory) === normalizeCatName(tgt.pmsCategory))
            );
            const existingChannexPlans = (window.channexRatePlans || []).filter(
                p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === tgt.channexId
            );

            for (const sp of sourcePlans) {
                const spTitle = sp.attributes?.title || sp.id;
                const spDetected = detectRatePlanClassification(spTitle, sp);
                const spMap = (window.channexRateMap || []).find(r => r.ratePlanId === sp.id) || spDetected;

                let newTitle = spTitle;
                const escSource = srcTarget.titleLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(escSource, 'i').test(newTitle)) {
                    newTitle = newTitle.replace(new RegExp(escSource, 'gi'), tgt.titleLabel);
                } else {
                    newTitle = `${newTitle} ${tgt.titleLabel}`;
                }

                newTitle = newTitle.replace(/\s+Rate\b/gi, '').trim();

                const tgtChan = spMap.channel || 'DEF';
                const tgtChanId = spMap.channelId || '';
                const tgtPol = spMap.policy || 'non-ref';

                const alreadyExists =
                    existingMapped.some(r =>
                        (r.channel || 'DEF') === tgtChan &&
                        (r.channelId || '') === tgtChanId &&
                        (r.policy || 'non-ref') === tgtPol
                    ) ||
                    existingChannexPlans.some(p =>
                        (p.attributes?.title || '').trim().toLowerCase() === newTitle.toLowerCase()
                    );

                if (alreadyExists) {
                    skippedCount++;
                    continue;
                }

                const sourcePolicyId = sp.attributes?.cancellation_policy_id || sp.relationships?.cancellation_policy?.data?.id;
                const matchedPolicyId = sourcePolicyId || await resolveChannexPolicyId(spMap.policy || 'non-ref', propId, apiKey);
                const sourceSellMode = sp.attributes?.sell_mode || 'per_room';

                const res = await ChannexClient.createRatePlan(propId, {
                    title: newTitle,
                    room_type_id: tgt.channexId,
                    currency: currency,
                    sell_mode: sourceSellMode,
                    meal_type: sp.attributes?.meal_type || 'none',
                    ...(matchedPolicyId ? { cancellation_policy_id: matchedPolicyId } : {}),
                    options: sp.attributes?.options || [{ occupancy: 1, is_primary: true, rate: 0 }]
                }, apiKey);

                if (res?.data) {
                    window.channexRatePlans = window.channexRatePlans || [];
                    window.channexRatePlans.push(res.data);
                    window.channexRateMap = window.channexRateMap || [];
                    window.channexRateMap.push({
                        ratePlanId: res.data.id,
                        pmsCategory: tgt.pmsCategory,
                        catId: tgt.catId,
                        channexRoomId: tgt.channexId,
                        ratePlanTitle: newTitle,
                        channel: spMap.channel || 'DEF',
                        channelId: spMap.channelId || null,
                        connectionTitle: spMap.connectionTitle || null,
                        policy: spMap.policy || 'non-ref',
                        rateType: spMap.rateType || spMap.policy || 'non-ref',
                        isEvent: !!spMap.isEvent,
                        isGhost: !!tgt.isGhost
                    });

                    createdCount++;
                }
            }
        }

        if (typeof window.savePropertyToDatabase === 'function') {
            await window.savePropertyToDatabase(false);
        }

        closeCreateRatePlanModal();
        renderStep3UnifiedMapping();
        customAlert("Success", `Cloned ${createdCount} missing rate plan(s) from "${srcTarget.label}"${skippedCount ? ` (${skippedCount} existing skipped)` : ''}.`);
    } catch (err) {
        console.error("[Clone Rate Plans Error]:", err);
        customAlert("Cloning Failed", err.message);
    }
}

export async function executeBatchCreateRatePlans() {
    const targetKeys = Array.from(document.querySelectorAll('.crp-cat-chk:checked')).map(c => c.value);
    if (targetKeys.length === 0) return customAlert("Input Required", "Select at least one target room.");

    const chkIndices = Array.from(document.querySelectorAll('.crp-batch-tpl-chk:checked')).map(c => parseInt(c.dataset.idx, 10));
    if (chkIndices.length === 0) return customAlert("Input Required", "Select at least one rate plan template to create.");

    const apiKey = document.getElementById('chan-api-key')?.value.trim() || window.channexConfig?.apiKey;
    const propId = document.getElementById('chan-prop-id')?.value.trim() || window.channexConfig?.propId;
    const currency = document.getElementById('prop-currency')?.value || window.currentPropertyConfig?.currency || 'THB';

    if (!apiKey || !propId) {
        return customAlert("Credentials Required", "Enter both Channex API Key and Property UUID.");
    }

    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const targetLookup = new Map(getAllRateTargetEntries().map(t => [t.key, t]));
    const resolvedTargets = targetKeys.map(k => targetLookup.get(k) || targetLookup.get(`PRIMARY::${k}`)).filter(Boolean);
    const unmappedTargets = resolvedTargets.filter(t => !t.channexId);

    if (unmappedTargets.length > 0) {
        return customAlert("Target Not Mapped", `Cannot push rate plans. The following categories are not yet paired to a Channex Room Type:\n• ${unmappedTargets.map(u => u.label).join('\n• ')}\n\nUse the 'Room Types' tab to push them first.`);
    }

    const templates = window.currentBatchTemplates || getDynamicBatchRateTemplates();
    const selectedTemplates = chkIndices.map(i => templates[i]);
    const totalOps = resolvedTargets.length * selectedTemplates.length;

    try {
        customAlert("Pushing Suite...", `Checking & pushing up to ${totalOps} rate plan(s) across ${resolvedTargets.length} room(s)...`);
        let createdCount = 0;
        let skippedCount = 0;

        for (const tgt of resolvedTargets) {
            const sameCat = defs.filter(r => normalizeCatName(r.category) === normalizeCatName(tgt.pmsCategory));
            const isDorm = sameCat.some(r => r.rule !== 'private');
            const existingMapped = (window.channexRateMap || []).filter(r =>
                r.channexRoomId
                    ? r.channexRoomId === tgt.channexId
                    : (!tgt.isGhost && normalizeCatName(r.pmsCategory) === normalizeCatName(tgt.pmsCategory))
            );
            const existingChannexPlans = (window.channexRatePlans || []).filter(
                p => (p.attributes?.room_type_id || p.relationships?.room_type?.data?.id) === tgt.channexId
            );

            for (const tpl of selectedTemplates) {
                const finalTitle = tpl.titleTpl.replace(/{CAT}/g, tgt.titleLabel).trim();
                const tplChan = tpl.channel || 'DEF';
                const tplChanId = tpl.channelId || '';
                const tplPol = tpl.policy || 'non-ref';

                const alreadyExists =
                    existingMapped.some(r =>
                        (r.channel || 'DEF') === tplChan &&
                        (r.channelId || '') === tplChanId &&
                        (r.policy || 'non-ref') === tplPol
                    ) ||
                    existingChannexPlans.some(p =>
                        (p.attributes?.title || '').trim().toLowerCase() === finalTitle.toLowerCase()
                    );

                if (alreadyExists) {
                    skippedCount++;
                    continue;
                }

                const matchedPolicyId = await resolveChannexPolicyId(tpl.policy, propId, apiKey);

                const res = await ChannexClient.createRatePlan(propId, {
                    title: finalTitle,
                    room_type_id: tgt.channexId,
                    currency: currency,
                    sell_mode: isDorm ? 'per_person' : 'per_room',
                    meal_type: 'none',
                    ...(matchedPolicyId ? { cancellation_policy_id: matchedPolicyId } : {}),
                    options: [{ occupancy: 1, is_primary: true, rate: 0 }]
                }, apiKey);

                if (res?.data) {
                    window.channexRatePlans = window.channexRatePlans || [];
                    window.channexRatePlans.push(res.data);

                    window.channexRateMap = window.channexRateMap || [];
                    window.channexRateMap.push({
                        ratePlanId: res.data.id,
                        pmsCategory: tgt.pmsCategory,
                        catId: tgt.catId,
                        channexRoomId: tgt.channexId,
                        ratePlanTitle: finalTitle,
                        channel: tpl.channel,
                        channelId: tpl.channelId || null,
                        connectionTitle: tpl.connectionTitle || null,
                        policy: tpl.policy,
                        rateType: tpl.policy,
                        isEvent: tpl.isEvent,
                        isGhost: !!tgt.isGhost
                    });

                    createdCount++;
                }
            }
        }

        if (typeof window.savePropertyToDatabase === 'function') {
            await window.savePropertyToDatabase(false);
        }

        closeCreateRatePlanModal();
        renderStep3UnifiedMapping();
        customAlert("Success", `Created ${createdCount} missing rate plan(s)${skippedCount ? ` (${skippedCount} existing skipped)` : ''}.`);
    } catch (err) {
        console.error("[Batch Create Rate Plans Error]:", err);
        customAlert("Creation Failed", err.message);
    }
}

window.crpCustomChannel = 'DEF';
window.crpCustomChannelId = null;
window.crpCustomConnectionTitle = null;
window.crpCustomPolicy = 'non-ref';

export function renderOptionCChannelPills() {
    const container = document.getElementById('crp-channel-pills');
    if (!container) return;

    const byCode = getConnectedChannelsByCode();
    const configuredCodes = (window.pricingRules?.channelRules || []).map(r => r.code);

    const primaryPills = [
        { val: 'DEF', label: 'DEF' },
        { val: 'WEB', label: 'WEB' }
    ];
    const seenPrimaryCodes = new Set(['DEF', 'WEB']);

    byCode.forEach((conns, code) => {
        seenPrimaryCodes.add(code);
        if (conns.length > 1) {
            conns.forEach(c => primaryPills.push({ val: `${code}::${c.id}`, label: `${code} (${c.title})` }));
        } else if (conns.length === 1) {
            primaryPills.push({ val: `${code}::${conns[0].id}`, label: code });
        }
    });

    [...configuredCodes, 'BDC', 'HWL', 'EXP'].forEach(code => {
        if (code && !seenPrimaryCodes.has(code)) {
            seenPrimaryCodes.add(code);
            primaryPills.push({ val: code, label: code });
        }
    });

    const activeVal = window.crpCustomChannelId
        ? `${window.crpCustomChannel}::${window.crpCustomChannelId}`
        : (window.crpCustomChannel || 'DEF');

    let html = primaryPills.map(p => {
        const isSel = (activeVal === p.val);
        return `
            <button type="button" onclick="window.setOptionCChannel('${p.val}')" class="crp-c-chan-btn px-2 py-0.5 rounded text-[9px] font-black uppercase cursor-pointer border ${
                isSel ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700'
            }" data-val="${p.val}">${p.label}</button>
        `;
    }).join('');

    const otherOtas = CANONICAL_OTA_LIST.filter(ch => !seenPrimaryCodes.has(ch.code));
    const isOtherSelected = !primaryPills.some(p => p.val === activeVal);

    html += `
        <select id="crp-channel-dropdown" onchange="window.setOptionCChannel(this.value)" class="table-input font-bold text-[10px] !w-32 ml-1 ${
            isOtherSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : ''
        }">
            <option value="">+ More OTAs (${otherOtas.length})</option>
            ${otherOtas.map(ch => `
                <option value="${ch.code}" ${activeVal === ch.code ? 'selected' : ''}>${ch.code} - ${ch.name}</option>
            `).join('')}
        </select>
    `;

    container.innerHTML = html;
    updateOptionCPreview();
}

export function setOptionCChannel(rawVal) {
    if (!rawVal) return;
    if (rawVal.includes('::')) {
        const [code, connId] = rawVal.split('::');
        const conn = (getConnectedChannelsByCode().get(code) || []).find(c => c.id === connId);
        window.crpCustomChannel = code;
        window.crpCustomChannelId = connId;
        window.crpCustomConnectionTitle = conn?.title || null;
    } else {
        window.crpCustomChannel = rawVal;
        window.crpCustomChannelId = null;
        window.crpCustomConnectionTitle = null;
    }

    document.querySelectorAll('.crp-c-chan-btn').forEach(btn => {
        const isSel = btn.dataset.val === rawVal;
        btn.className = `crp-c-chan-btn px-2 py-0.5 rounded text-[9px] font-black uppercase cursor-pointer border ${
            isSel ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700'
        }`;
    });

    const dd = document.getElementById('crp-channel-dropdown');
    if (dd) {
        dd.value = rawVal;
        const isOther = Array.from(dd.options).some(o => o.value === rawVal && o.value !== "");
        dd.className = `table-input font-bold text-[10px] !w-32 ml-1 ${isOther ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : ''}`;
    }

    updateOptionCPreview();
}

export function setOptionCPolicy(pol) {
    window.crpCustomPolicy = pol;
    document.querySelectorAll('.crp-c-pol-btn').forEach(btn => {
        const isSel = btn.dataset.val === pol;
        btn.className = `crp-c-pol-btn px-2 py-0.5 rounded text-[9px] font-black uppercase cursor-pointer border ${
            isSel ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700'
        }`;
    });
    updateOptionCPreview();
}

export function getOptionCChannelPrefix(chan) {
    return (chan === 'DEF' || !chan) ? '' : `[${chan}]`;
}

export function getOptionCPolicyLabel(pol) {
    switch (pol) {
        case 'ref': return 'Refundable';
        case 'event-non-ref': return 'Event Non-Refundable';
        case 'event-ref': return 'Event Refundable';
        default: return 'Non-Refundable';
    }
}

export function updateOptionCPreview() {
    const previewEl = document.getElementById('crp-custom-preview-text');
    if (!previewEl) return;

    const chan = window.crpCustomChannel || 'DEF';
    const pol = window.crpCustomPolicy || 'non-ref';
    const customSuffix = document.getElementById('crp-custom-name')?.value.trim() || '';

    const prefix = getOptionCChannelPrefix(chan);
    const policyLabel = getOptionCPolicyLabel(pol);

    const parts = [prefix, policyLabel, customSuffix].filter(Boolean);
    previewEl.innerText = `${parts.join(' ')} [Room]`;
}

export async function executeCreateAndPushRatePlan() {
    const targetKeys = Array.from(document.querySelectorAll('.crp-cat-chk:checked')).map(c => c.value);
    if (targetKeys.length === 0) return customAlert("Input Required", "Select at least one target room.");

    const apiKey = document.getElementById('chan-api-key')?.value.trim() || window.channexConfig?.apiKey;
    const propId = document.getElementById('chan-prop-id')?.value.trim() || window.channexConfig?.propId;
    const currency = document.getElementById('prop-currency')?.value || window.currentPropertyConfig?.currency || 'THB';

    if (!apiKey || !propId) {
        return customAlert("Credentials Required", "Enter both Channex API Key and Property UUID before pushing rate plans.");
    }

    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const targetLookup = new Map(getAllRateTargetEntries().map(t => [t.key, t]));
    const resolvedTargets = targetKeys.map(k => targetLookup.get(k) || targetLookup.get(`PRIMARY::${k}`)).filter(Boolean);
    const unmapped = resolvedTargets.filter(t => !t.channexId);

    if (unmapped.length > 0) {
        return customAlert("Mapping Required", `Cannot push rate plans. The following categories are not yet paired to a Channex Room Type:\n• ${unmapped.map(u => u.label).join('\n• ')}\n\nUse the 'Room Types' tab to create them first.`);
    }

    const channel = window.crpCustomChannel || 'DEF';
    const channelId = window.crpCustomChannelId || null;
    const connectionTitle = window.crpCustomConnectionTitle || null;
    const policy = window.crpCustomPolicy || 'non-ref';
    const customSuffix = document.getElementById('crp-custom-name')?.value.trim() || '';

    const prefix = getOptionCChannelPrefix(channel);
    const policyLabel = getOptionCPolicyLabel(policy);
    const matchedPolicyId = await resolveChannexPolicyId(policy, propId, apiKey);

    try {
        customAlert("Pushing to Channex...", `Creating ${resolvedTargets.length} rate plan(s) in Channex...`);
        let createdCount = 0;

        for (const tgt of resolvedTargets) {
            const sameCat = defs.filter(r => normalizeCatName(r.category) === normalizeCatName(tgt.pmsCategory));
            const finalTitle = [prefix, policyLabel, customSuffix, tgt.titleLabel].filter(Boolean).join(' ').trim();
            const isDorm = sameCat.some(r => r.rule !== 'private');

            const res = await ChannexClient.createRatePlan(propId, {
                title: finalTitle,
                room_type_id: tgt.channexId,
                currency: currency,
                sell_mode: isDorm ? 'per_person' : 'per_room',
                meal_type: 'none',
                ...(matchedPolicyId ? { cancellation_policy_id: matchedPolicyId } : {}),
                options: [{ occupancy: 1, is_primary: true, rate: 0 }]
            }, apiKey);

            if (res?.data) {
                window.channexRatePlans = window.channexRatePlans || [];
                window.channexRatePlans.push(res.data);

                window.channexRateMap = window.channexRateMap || [];
                window.channexRateMap.push({
                    ratePlanId: res.data.id,
                    pmsCategory: tgt.pmsCategory,
                    catId: tgt.catId,
                    channexRoomId: tgt.channexId,
                    ratePlanTitle: finalTitle,
                    channel: channel,
                    channelId: channelId,
                    connectionTitle: connectionTitle,
                    policy: policy,
                    rateType: policy,
                    isEvent: policy.startsWith('event'),
                    isGhost: !!tgt.isGhost
                });

                createdCount++;
            }
        }

        if (typeof window.savePropertyToDatabase === 'function') {
            await window.savePropertyToDatabase(false);
        }

        closeCreateRatePlanModal();
        renderStep3UnifiedMapping();
        customAlert("Success", `Created and mapped ${createdCount} rate plan(s) in Channex.`);
    } catch (err) {
        console.error("[Create Rate Plan Error]:", err);
        customAlert("Creation Failed", err.message);
    }
}

export function updateRatePlanClassification(ratePlanId, pmsCategory, channexRoomId, ratePlanTitle, field, value, selectEl = null) {
    window.channexRateMap = window.channexRateMap || [];
    let mapping = window.channexRateMap.find(r => r.ratePlanId === ratePlanId);

    if (value === 'ignore') {
        const idx = window.channexRateMap.findIndex(r => r.ratePlanId === ratePlanId);
        if (idx > -1) window.channexRateMap.splice(idx, 1);
    } else {
        if (!mapping) {
            mapping = {
                ratePlanId,
                pmsCategory,
                channexRoomId,
                ratePlanTitle,
                channel: 'DEF',
                channelId: null,
                connectionTitle: null,
                policy: 'non-ref',
                rateType: 'non-ref',
                isEvent: false
            };
            window.channexRateMap.push(mapping);
        }

        if (field === 'channel') {
            if (value.includes('::')) {
                const [code, connId] = value.split('::');
                const conn = (getConnectedChannelsByCode().get(code) || []).find(c => c.id === connId);
                mapping.channel = code;
                mapping.channelId = connId;
                mapping.connectionTitle = conn?.title || null;
            } else {
                mapping.channel = value;
                mapping.channelId = null;
                mapping.connectionTitle = null;
            }
        } else {
            mapping[field] = value;
        }

        if (field === 'policy') {
            mapping.rateType = value;
            mapping.isEvent = value.startsWith('event');
            mapping.product = mapping.isEvent ? 'evt' : 'std';
        }
    }

    if (selectEl) {
        const tr = selectEl.closest('tr');
        if (tr) {
            const badge = tr.querySelector('.rate-plan-badge');
            const isEvent = mapping?.policy?.startsWith('event');
            const isFlex = mapping?.policy === 'ref' || mapping?.policy === 'event-ref';

            if (badge) {
                badge.innerText = isEvent ? 'EVENT' : 'STD';
                badge.className = `rate-plan-badge ${isEvent ? 'setup-badge-event' : 'setup-badge-std'}`;
            }

            if (field === 'policy') {
                selectEl.className = `table-input font-bold text-xs cursor-pointer ${
                    isEvent ? 'border-pink-400 text-pink-700 bg-pink-50/20' : (isFlex ? 'border-emerald-400 text-emerald-700 bg-emerald-50/20' : '')
                }`;
            }
        }
    }
}

if (typeof window !== 'undefined') {
    window.fetchChannexData = fetchChannexData;
    window.setStep3RateView = setStep3RateView;
    window.toggleStep3CategoryRates = toggleStep3CategoryRates;
    window.renderStep3UnifiedMapping = renderStep3UnifiedMapping;
    window.updateRoomTypeMapping = updateRoomTypeMapping;
    window.addGhostRoomMapping = addGhostRoomMapping;
    window.removeGhostRoomMapping = removeGhostRoomMapping;
    window.updateRatePlanClassification = updateRatePlanClassification;
    window.switchCreateModalTab = switchCreateModalTab;
    window.toggleGhostRoomMode = toggleGhostRoomMode;
    window.openCreateRatePlanModal = openCreateRatePlanModal;
    window.closeCreateRatePlanModal = closeCreateRatePlanModal;
    window.toggleAllTargetRoomTypes = toggleAllTargetRoomTypes;
    window.toggleAllTargetRooms = toggleAllTargetRooms;
    window.toggleBatchPresetPlans = toggleBatchPresetPlans;
    window.executeCreateAndPushRoomTypes = executeCreateAndPushRoomTypes;
    window.executeCloneRatePlans = executeCloneRatePlans;
    window.executeBatchCreateRatePlans = executeBatchCreateRatePlans;
    window.executeCreateAndPushRatePlan = executeCreateAndPushRatePlan;
    window.setOptionCChannel = setOptionCChannel;
    window.setOptionCPolicy = setOptionCPolicy;
    window.updateOptionCPreview = updateOptionCPreview;
}
