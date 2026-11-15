// ==========================================================================
// setup/setup-mapping.js - Channex Room Type & Primary Rate Plan Mapping
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';
import { ChannexClient } from '../channex.js';

export async function fetchChannexInventory() {
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

        // Filter out derived/OTA plans: only map primary base rate plans
        window.channexRatePlans = allPlans.filter(p => {
            const attr = p.attributes || {};
            const rel = p.relationships || {};
            const hasChannel = !!(rel.channel?.data?.id || attr.channel_id);
            const hasParent = !!(rel.parent_rate_plan?.data?.id || attr.parent_rate_plan_id);
            return !hasChannel && !hasParent && !attr.ui_read_only && !attr.is_derived;
        });

        renderUnifiedMappingCards();
        customAlert("Fetched", `Loaded ${window.channexRooms.length} room types and ${window.channexRatePlans.length} primary rate plans.`);

    } catch (err) {
        console.error("[Channex Fetch Error]:", err);
        customAlert("Fetch Failed", err.message);
    }
}

export function renderUnifiedMappingCards() {
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

    pmsCategories.forEach(cat => {
        const currentMap = window.channexMap.find(m => m.pmsCategory === cat);
        const isMapped = !!(currentMap && currentMap.channexId);

        const card = document.createElement('div');
        card.className = `p-3 rounded-lg border mb-2 flex items-center justify-between gap-3 ${
            isMapped ? 'bg-emerald-50/50 border-emerald-300' : 'bg-white border-slate-300'
        }`;

        let selectOptions = `<option value="">-- UNMAPPED / IGNORED --</option>`;
        (window.channexRooms || []).forEach(cr => {
            const isSel = currentMap?.channexId === cr.id ? 'selected' : '';
            selectOptions += `<option value="${cr.id}" ${isSel}>${cr.attributes?.title || cr.id}</option>`;
        });

        card.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    isMapped ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                }">${isMapped ? 'MAPPED ✓' : 'UNMAPPED ⚠'}</span>
                <span class="font-black text-xs text-slate-800 uppercase">${cat}</span>
            </div>
            <div class="w-64">
                <select class="table-input font-bold" onchange="window.updateRoomMapping('${cat}', this.value)">
                    ${selectOptions}
                </select>
            </div>
        `;

        container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function updateRoomMapping(pmsCategory, channexId) {
    window.channexMap = window.channexMap || [];
    const idx = window.channexMap.findIndex(m => m.pmsCategory === pmsCategory);

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
    }

    renderUnifiedMappingCards();
}

if (typeof window !== 'undefined') {
    window.fetchChannexData = fetchChannexInventory;
    window.renderUnifiedMappingCards = renderUnifiedMappingCards;
    window.updateRoomMapping = updateRoomMapping;
}
