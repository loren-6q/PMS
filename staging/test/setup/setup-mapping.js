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

        // Resolve all rate plans that belong to this Channex Room Type
        let ratePlansHtml = '';
        if (isMapped) {
            const matchingPlans = (window.channexRatePlans || []).filter(p => {
                const rId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id;
                return rId === currentMap.channexId;
            });

            if (matchingPlans.length > 0) {
                ratePlansHtml = `
                    <div class="mt-1 pt-2 border-t border-emerald-200">
                        <div class="text-[9.5px] font-black uppercase text-emerald-900 tracking-wider mb-1 flex items-center justify-between">
                            <span>Inherited Rate Plans (${matchingPlans.length})</span>
                            <span class="text-slate-400 font-mono text-[9px] lowercase">Channex Room: ${currentMap.channexId.slice(0, 8)}...</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            ${matchingPlans.map(plan => `
                                <div class="p-1.5 bg-white border border-emerald-200 rounded flex items-center justify-between gap-2 shadow-2xs">
                                    <div class="flex items-center gap-1.5 truncate">
                                        <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                                        <span class="font-bold text-slate-800 text-[11px] truncate">${plan.attributes?.title || plan.id}</span>
                                    </div>
                                    <span class="font-mono text-[9px] text-slate-400 bg-slate-50 px-1 py-0.2 rounded border border-slate-200 shrink-0">${plan.id.slice(0, 8)}</span>
                                </div>
                            `).join('')}
                        </div>
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

if (typeof window !== 'undefined') {
    window.fetchChannexData = fetchChannexData;
    window.renderStep3UnifiedMapping = renderStep3UnifiedMapping;
    window.updateRoomTypeMapping = updateRoomTypeMapping;
    window.openCreateRatePlanModal = openCreateRatePlanModal;
    window.closeCreateRatePlanModal = closeCreateRatePlanModal;
    window.applyRatePlanPreset = applyRatePlanPreset;
    window.toggleAllTargetRooms = toggleAllTargetRooms;
    window.executeCreateAndPushRatePlan = executeCreateAndPushRatePlan;
}
