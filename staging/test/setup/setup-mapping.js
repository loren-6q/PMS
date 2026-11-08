// ==========================================================================
// setup/setup-mapping.js - Channex Room Type & Rate Plan Mapping
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';
import { ChannexClient } from '../channex.js';

export async function fetchChannexData() {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return customAlert("Credentials Required", "Enter both Channex API Key and Property UUID.");
    }

    try {
        customAlert("Connecting...", "Fetching room types and primary rate plans from Channex...");
        
        const rJson = await ChannexClient.request(`/room_types?filter[property_id]=${propId}&pagination[limit]=100`, {}, apiKey);
        window.channexRooms = rJson.data || [];

        const pJson = await ChannexClient.request(`/rate_plans?filter[property_id]=${propId}&pagination[limit]=100`, {}, apiKey);
        const allPlans = pJson.data || [];

        // Primary base plans only
        window.channexRatePlans = allPlans.filter(p => {
            const attr = p.attributes || {};
            const rel = p.relationships || {};
            const hasChannel = !!(rel.channel?.data?.id || attr.channel_id);
            const hasParent = !!(rel.parent_rate_plan?.data?.id || attr.parent_rate_plan_id);
            return !hasChannel && !hasParent && !attr.ui_read_only && !attr.is_derived;
        });

        renderStep3UnifiedMapping();
        customAlert("Fetched", `Loaded ${window.channexRooms.length} room types and ${window.channexRatePlans.length} primary rate plans.`);

    } catch (err) {
        console.error("[Channex Fetch Error]:", err);
        customAlert("Fetch Failed", err.message);
    }
}

const AVAILABLE_CHANNELS = [
    { val: "DEFAULT", label: "DEFAULT (General OTAs)" },
    { val: "Booking.com", label: "Booking.com" },
    { val: "Hostelworld", label: "Hostelworld" },
    { val: "Agoda", label: "Agoda" },
    { val: "Airbnb", label: "Airbnb" },
    { val: "Expedia", label: "Expedia" },
    { val: "Direct", label: "Direct (Website)" }
];

const AVAILABLE_POLICIES = [
    { val: "non-ref", label: "Non-Refundable" },
    { val: "ref", label: "Refundable (+%)" },
    { val: "event-non-ref", label: "Event Non-Refundable" },
    { val: "event-ref", label: "Event Refundable (+%)" },
    { val: "ignore", label: "-- Ignore / Do Not Sync --" }
];

export function renderStep3UnifiedMapping() {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    container.innerHTML = '';

    const definitions = window.roomDefinitions || [];
    const pmsCategories = Array.from(new Set(definitions.filter(r => !r.inactive).map(r => r.category).filter(Boolean)));

    if (pmsCategories.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold text-xs uppercase">No PMS room categories defined yet. Complete Step 2 first.</div>`;
        return;
    }

    window.channexMap = window.channexMap || [];
    window.channexRateMap = window.channexRateMap || [];

    pmsCategories.forEach(cat => {
        const currentMap = window.channexMap.find(m => m.pmsCategory === cat);
        const isMapped = !!(currentMap && currentMap.channexId);

        const card = document.createElement('div');
        card.className = `p-3 rounded-lg border mb-2 flex flex-col gap-2 ${
            isMapped ? 'bg-emerald-50/50 border-emerald-300' : 'bg-white border-slate-300'
        }`;

        // Build room options - ensures saved selection displays even if fresh fetch has not run yet
        let selectOptions = `<option value="">-- UNMAPPED / IGNORED --</option>`;
        const roomsList = window.channexRooms || [];
        if (currentMap?.channexId && !roomsList.some(cr => cr.id === currentMap.channexId)) {
            selectOptions += `<option value="${currentMap.channexId}" selected>${currentMap.channexTitle || currentMap.channexId}</option>`;
        }
        roomsList.forEach(cr => {
            const isSel = currentMap?.channexId === cr.id ? 'selected' : '';
            selectOptions += `<option value="${cr.id}" ${isSel}>${cr.attributes?.title || cr.id}</option>`;
        });

        // Resolve and map rate plans belonging to this Channex Room Type
        let ratePlansHtml = '';
        if (isMapped) {
            const matchingPlans = (window.channexRatePlans || []).filter(p => {
                const rId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id;
                return rId === currentMap.channexId;
            });

            if (matchingPlans.length > 0) {
                ratePlansHtml = `
                    <div class="mt-2 pt-2 border-t border-emerald-200 overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-black text-[9px] uppercase tracking-wider">
                                <tr>
                                    <th class="py-1 px-2">RATE PLAN NAME</th>
                                    <th class="py-1 px-2 w-48">SALES CHANNEL</th>
                                    <th class="py-1 px-2 w-48">CANCELLATION POLICY</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${matchingPlans.map(plan => {
                                    const title = plan.attributes?.title || plan.id;
                                    let mapping = window.channexRateMap.find(r => r.ratePlanId === plan.id);

                                    if (!mapping) {
                                        const isBdc = /booking\.com|bdc/i.test(title);
                                        const isFlex = /flex|ref/i.test(title);
                                        const isEvt = /event|peak|pkg/i.test(title);

                                        mapping = {
                                            ratePlanId: plan.id,
                                            pmsCategory: cat,
                                            channexRoomId: currentMap.channexId,
                                            ratePlanTitle: title,
                                            channel: isBdc ? "Booking.com" : "DEFAULT",
                                            policy: isEvt ? (isFlex ? "event-ref" : "event-non-ref") : (isFlex ? "ref" : "non-ref"),
                                            isEvent: isEvt
                                        };
                                        window.channexRateMap.push(mapping);
                                    }

                                    const isEventPlan = mapping.policy?.startsWith('event');
                                    const isFlexPolicy = mapping.policy === 'ref' || mapping.policy === 'event-ref';

                                    let policySelectClass = 'table-input font-bold text-xs';
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
                                                    <span class="px-1.5 py-0.2 rounded font-black text-[9px] uppercase ${
                                                        isEventPlan ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }">${isEventPlan ? 'EVENT RATE' : 'STD RATE'}</span>
                                                </div>
                                                <div class="font-mono text-[9.5px] text-slate-400 mt-0.5">ID: ...${plan.id.slice(-8)}</div>
                                            </td>
                                            <td class="py-1.5 px-2">
                                                <select class="table-input font-bold text-xs cursor-pointer" onchange="window.updateRatePlanClassification('${plan.id}', '${cat}', '${currentMap.channexId}', '${title.replace(/'/g, "\\'")}', 'channel', this.value)">
                                                    ${AVAILABLE_CHANNELS.map(ch => `
                                                        <option value="${ch.val}" ${mapping.channel === ch.val ? 'selected' : ''}>${ch.label}</option>
                                                    `).join('')}
                                                </select>
                                            </td>
                                            <td class="py-1.5 px-2">
                                                <select class="${policySelectClass} cursor-pointer" onchange="window.updateRatePlanClassification('${plan.id}', '${cat}', '${currentMap.channexId}', '${title.replace(/'/g, "\\'")}', 'policy', this.value)">
                                                    ${AVAILABLE_POLICIES.map(pol => `
                                                        <option value="${pol.val}" ${mapping.policy === pol.val ? 'selected' : ''}>${pol.label}</option>
                                                    `).join('')}
                                                </select>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                ratePlansHtml = `
                    <div class="mt-1 pt-1.5 border-t border-slate-200 text-[10px] text-slate-400 italic">
                        No primary rate plans attached to this room type in Channex. Click "Fetch Channex Data" above to refresh.
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        isMapped ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                    }">${isMapped ? 'MAPPED ✓' : 'UNMAPPED ⚠'}</span>
                    <span class="font-black text-xs text-slate-800 uppercase">${cat}</span>
                </div>
                <div class="w-64">
                    <select class="table-input font-bold" onchange="window.updateRoomTypeMapping('${cat}', this.value)">
                        ${selectOptions}
                    </select>
                </div>
            </div>
            ${ratePlansHtml}
        `;

        container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function updateRoomTypeMapping(pmsCategory, channexId) {
    window.channexMap = window.channexMap || [];
    window.channexRateMap = window.channexRateMap || [];

    const idx = window.channexMap.findIndex(m => m.pmsCategory === pmsCategory);

    // Clear previous rate plan bindings for this category
    window.channexRateMap = window.channexRateMap.filter(r => r.pmsCategory !== pmsCategory);

    if (!channexId) {
        if (idx > -1) window.channexMap.splice(idx, 1);
    } else {
        const cRoom = (window.channexRooms || []).find(r => r.id === channexId);
        const title = cRoom?.attributes?.title || channexId;

        if (idx > -1) {
            window.channexMap[idx].channexId = channexId;
            window.channexMap[idx].channexTitle = title;
        } else {
            window.channexMap.push({ pmsCategory, channexId, channexTitle: title });
        }

        // Auto-bind all primary rate plans that belong to this Channex room type
        const matchingPlans = (window.channexRatePlans || []).filter(p => {
            const rId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id;
            return rId === channexId;
        });

        matchingPlans.forEach(plan => {
            window.channexRateMap.push({
                pmsCategory,
                channexRoomId: channexId,
                ratePlanId: plan.id,
                ratePlanTitle: plan.attributes?.title || plan.id
            });
        });
    }

    renderStep3UnifiedMapping();
}

export function openCreateRatePlanModal() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (!modal) return;

    const categories = Array.from(new Set((window.roomDefinitions || []).filter(r => !r.inactive).map(r => r.category).filter(Boolean)));
    const listEl = document.getElementById('crp-room-checklist');
    if (listEl) {
        listEl.innerHTML = categories.map(c => `
            <label class="flex items-center gap-1.5 font-bold cursor-pointer text-xs p-1 hover:bg-slate-100 rounded">
                <input type="checkbox" class="crp-cat-chk" value="${c}" checked>
                <span>${c}</span>
            </label>
        `).join('');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeCreateRatePlanModal() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) modal.classList.add('hidden');
}

export function applyRatePlanPreset(title, channel, policy) {
    const titleInput = document.getElementById('crp-title');
    if (titleInput) titleInput.value = title;
}

export function toggleAllTargetRooms(checked) {
    document.querySelectorAll('.crp-cat-chk').forEach(chk => chk.checked = checked);
}

export function executeCreateAndPushRatePlan() {
    const title = document.getElementById('crp-title')?.value.trim();
    if (!title) return customAlert("Input Required", "Enter a rate plan title.");

    const chks = document.querySelectorAll('.crp-cat-chk:checked');
    if (chks.length === 0) return customAlert("Input Required", "Select at least one room category.");

    window.channexRateMap = window.channexRateMap || [];
    chks.forEach(chk => {
        const cat = chk.value;
        const planId = `plan_${Math.random().toString(36).substr(2, 8)}`;
        window.channexRateMap.push({
            pmsCategory: cat,
            ratePlanId: planId,
            ratePlanTitle: `${cat} - ${title}`
        });
    });

    closeCreateRatePlanModal();
    customAlert("Rate Plans Bound", `Generated internal plan bindings for ${chks.length} category(ies).`);
}

export function updateRatePlanClassification(ratePlanId, pmsCategory, channexRoomId, ratePlanTitle, field, value) {
    window.channexRateMap = window.channexRateMap || [];
    let mapping = window.channexRateMap.find(r => r.ratePlanId === ratePlanId);

    if (value === 'ignore') {
        const idx = window.channexRateMap.findIndex(r => r.ratePlanId === ratePlanId);
        if (idx > -1) window.channexRateMap.splice(idx, 1);
        renderStep3UnifiedMapping();
        return;
    }

    if (!mapping) {
        mapping = {
            ratePlanId,
            pmsCategory,
            channexRoomId,
            ratePlanTitle,
            channel: 'DEFAULT',
            policy: 'non-ref',
            rateType: 'non-ref',
            isEvent: false
        };
        window.channexRateMap.push(mapping);
    }

    mapping[field] = value;
    if (field === 'policy') {
        mapping.rateType = value;
        mapping.isEvent = value.startsWith('event');
    }

    renderStep3UnifiedMapping();
}

if (typeof window !== 'undefined') {
    window.fetchChannexData = fetchChannexData;
    window.renderStep3UnifiedMapping = renderStep3UnifiedMapping;
    window.updateRoomTypeMapping = updateRoomTypeMapping;
    window.updateRatePlanClassification = updateRatePlanClassification;
    window.openCreateRatePlanModal = openCreateRatePlanModal;
    window.closeCreateRatePlanModal = closeCreateRatePlanModal;
    window.applyRatePlanPreset = applyRatePlanPreset;
    window.toggleAllTargetRooms = toggleAllTargetRooms;
    window.executeCreateAndPushRatePlan = executeCreateAndPushRatePlan;
}
