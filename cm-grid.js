// ==========================================================================
// CHANNEL MANAGER CALENDAR GRID & INVENTORY (cm-grid.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-grid.js
// ==========================================================================

// Safe fallbacks to prevent module loading race conditions
window.mNames = window.mNames || ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
window.getLocalYMD = window.getLocalYMD || ((d) => (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0]);
window.parseYMD = window.parseYMD || ((str) => {
    if (!str) return 0;
    const p = str.split('-');
    return Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
});
window.roundCurrency = window.roundCurrency || ((val) => (val === "" || val == null || isNaN(val) ? "" : Math.round(Number(val))));
window.formatDisplay = window.formatDisplay || ((val) => (val === "" || val == null || isNaN(val) ? "" : window.roundCurrency(val)));

window.drillLevel = window.drillLevel || 'room'; // 'master' | 'room' | 'event' | 'rates'
window.viewDensity = window.viewDensity || 'full'; // 'avail' | 'compact' | 'minmax' | 'full'
window.channelPreviewFilter = window.channelPreviewFilter || 'ALL';
window.expandedRooms = window.expandedRooms || new Set();

// Resilient standalone inventory calculator (runs even if cm-auditor is loading)
window.calculateLiveInventory = window.calculateLiveInventory || function() {
    window.liveInventory = window.liveInventory || {};
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const rTypes = window.roomTypes || [];
    const totals = window.totalRoomsByType || {};

    for (let i = 0; i < (window.daysToRender || 42); i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dStr = window.getLocalYMD(d);
        window.liveInventory[dStr] = window.liveInventory[dStr] || {};
        rTypes.forEach(t => {
            if (window.liveInventory[dStr][t] === undefined) {
                window.liveInventory[dStr][t] = totals[t] || 0;
            }
        });
    }

    const activeStaff = (window.staff || []).filter(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        const curProp = window.currentPropertyId;
        if (sProp && curProp && sProp !== curProp) return false;
        return s.status !== 'cancelled' && s.status !== 'noshow' && s.status !== 'unconfirmed';
    });

    activeStaff.forEach(s => {
        if (!s.checkIn || !s.checkOut) return;
        const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
        const inMs = window.parseYMD(s.checkIn);
        const outMs = window.parseYMD(s.checkOut);

        for (let i = 0; i < (window.daysToRender || 42); i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dStr = window.getLocalYMD(d);
            const dMs = window.parseYMD(dStr);
            if (dMs >= inMs && dMs < outMs) {
                rList.forEach(rid => {
                    const hRoom = (window.hotelRooms || []).find(r => r.id === rid);
                    const rType = hRoom?.type || s.bookedType;
                    if (rType && window.liveInventory[dStr] && window.liveInventory[dStr][rType] !== undefined) {
                        window.liveInventory[dStr][rType] = Math.max(0, window.liveInventory[dStr][rType] - 1);
                    }
                });
            }
        }
    });
};

window.handleAvailEdit = (dateStr, room, val) => {
    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj.otaOverrides = dObj.otaOverrides || {};

    const clean = String(val).trim();
    if (clean === "") {
        delete dObj.otaOverrides[`${room}_avail`];
    } else {
        dObj.otaOverrides[`${room}_avail`] = Math.max(0, parseInt(clean, 10) || 0);
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    if (window.markUnsavedChanges) window.markUnsavedChanges();
};

window.handleCellEdit = (dateStr, room, field, val) => {
    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];

    if (room === 'GLOBAL') {
        dObj['GLOBAL'] = dObj['GLOBAL'] || { isOverride: {} };
        const cleanVal = String(val).trim();
        if (cleanVal === "" || cleanVal === "-") {
            delete dObj['GLOBAL'][field];
            if (dObj['GLOBAL'].isOverride) delete dObj['GLOBAL'].isOverride[field];
        } else {
            dObj['GLOBAL'][field] = parseInt(cleanVal, 10) || cleanVal;
            dObj['GLOBAL'].isOverride = dObj['GLOBAL'].isOverride || {};
            dObj['GLOBAL'].isOverride[field] = true;
        }
    } else {
        dObj[room] = dObj[room] || { isOverride: {} };
        const rObj = dObj[room];
        rObj.isOverride = rObj.isOverride || {};

        if (field === 'min_hybrid') {
            const clean = String(val).trim().toLowerCase();
            if (clean === "" || clean === "-") {
                delete rObj.min;
                delete rObj.min_arr;
                delete rObj.isOverride.min;
                delete rObj.isOverride.min_arr;
            } else if (clean.endsWith('a') || clean.endsWith('>') || clean.endsWith('▸')) {
                const num = parseInt(clean.replace(/[^\d]/g, ''), 10);
                if (!isNaN(num) && num > 0) {
                    rObj.min_arr = num;
                    delete rObj.min;
                    rObj.isOverride.min_arr = true;
                    delete rObj.isOverride.min;
                }
            } else {
                const num = parseInt(clean, 10);
                if (!isNaN(num) && num > 0) {
                    rObj.min = num;
                    delete rObj.min_arr;
                    rObj.isOverride.min = true;
                    delete rObj.isOverride.min_arr;
                }
            }
        } else if (field === 'max') {
            const clean = String(val).trim();
            if (clean === "" || clean === "-") {
                delete rObj.max;
                delete rObj.isOverride.max;
            } else {
                const num = parseInt(clean, 10);
                if (!isNaN(num) && num > 0) {
                    rObj.max = num;
                    rObj.isOverride.max = true;
                }
            }
        } else if (field === 'fmp') {
            const clean = String(val).trim();
            if (clean === "") {
                delete rObj.fmp;
                delete rObj.isOverride.fmp;
            } else {
                rObj.fmp = parseFloat(clean);
                rObj.isOverride.fmp = true;
                if (window.rippleDay) window.rippleDay(dateStr, room);
            }
        }
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    if (window.markUnsavedChanges) window.markUnsavedChanges();
};

window.handleOtaEdit = (dateStr, ratePlanId, room, ruleType, ruleVal, field, val, rateSource = 'std') => {
    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj.otaOverrides = dObj.otaOverrides || {};

    if (field === 'rate') {
        const clean = String(val).trim();
        if (clean === "") {
            delete dObj.otaOverrides[ratePlanId];
        } else {
            const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
            dObj.otaOverrides[ratePlanId] = window.roundCurrency(parseFloat(clean) / mult);
        }
    } else if (field === 'min') {
        const clean = String(val).trim();
        if (clean === "" || clean === "-") delete dObj.otaOverrides[`${ratePlanId}_min`];
        else dObj.otaOverrides[`${ratePlanId}_min`] = parseInt(clean, 10);
    } else if (field === 'max') {
        const clean = String(val).trim();
        if (clean === "" || clean === "-") delete dObj.otaOverrides[`${ratePlanId}_max`];
        else dObj.otaOverrides[`${ratePlanId}_max`] = parseInt(clean, 10);
    } else if (['cta', 'ctd', 'stop', 'stopSell'].includes(field)) {
        if (val === "" || val === undefined) delete dObj.otaOverrides[`${ratePlanId}_${field}`];
        else dObj.otaOverrides[`${ratePlanId}_${field}`] = !!val;
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.dirtyFields = window.dirtyFields || {};
    window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};
    window.dirtyFields[dateStr][ratePlanId] = window.dirtyFields[dateStr][ratePlanId] || new Set();
    window.dirtyFields[dateStr][ratePlanId].add(field === 'rate' ? 'rate' : 'restriction');
    if (window.markUnsavedChanges) window.markUnsavedChanges();
};

window.getCellData = (dateStr, room) => {
    const data = (window.masterPricing.timeline[dateStr] || {})[room] || {};
    if (room === 'GLOBAL') {
        return {
            min: data.min !== undefined ? data.min : "",
            max: data.max !== undefined ? data.max : "",
            min_arr: data.min_arr !== undefined ? data.min_arr : "",
            cta: data.cta || false,
            ctd: data.ctd || false,
            stopSell: data.stop || data.stopSell || false,
            isOverride: data.isOverride || {}
        };
    }
    return {
        std: data.std !== undefined ? data.std : "",
        fmp: data.fmp !== undefined ? data.fmp : "",
        min: data.min !== undefined ? data.min : "",
        max: data.max !== undefined ? data.max : "",
        min_arr: data.min_arr !== undefined ? data.min_arr : "",
        cta: data.cta || false,
        ctd: data.ctd || false,
        stopSell: data.stop || data.stopSell || false,
        isOverride: data.isOverride || {}
    };
};

window.unlockCellOverride = (dateStr, room, ratePlanId = null) => {
    if (ratePlanId) {
        if (window.masterPricing.timeline[dateStr]?.otaOverrides) {
            delete window.masterPricing.timeline[dateStr].otaOverrides[ratePlanId];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_rate`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_min`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_max`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_cta`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_ctd`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_stop`];
        }
    } else {
        const rData = window.masterPricing.timeline[dateStr]?.[room];
        if (rData) {
            if (rData.isOverride) {
                delete rData.isOverride.std;
                delete rData.isOverride.fmp;
                delete rData.isOverride.min;
                delete rData.isOverride.min_arr;
                delete rData.isOverride.max;
                delete rData.isOverride.stop;
                delete rData.isOverride.cta;
                delete rData.isOverride.ctd;
            }
            if (rData._baseStd !== undefined && rData._baseStd !== "") {
                rData.std = rData._baseStd;
            }
            if (window.healDay) window.healDay(dateStr);
            else if (window.rippleDay) window.rippleDay(dateStr, room);
        }
    }
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.renderGrid = () => {
    const tapeInput = document.getElementById('tape-start');
    if (tapeInput && !tapeInput.value) {
        tapeInput.value = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
    }
    const startStr = tapeInput?.value || (window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0]);
    if (!startStr) return;

    if (typeof window.calculateLiveInventory === 'function') {
        try { window.calculateLiveInventory(); } catch (err) { console.warn("Live inventory calculation notice:", err); }
    }

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    let dObj = new Date(startStr + "T12:00:00Z");
    const hasEvents = (window.eventDates || []).length > 0;
    const drill = window.drillLevel || 'room';
    const density = window.viewDensity || 'full';

    // 1. HEADER ROW (Single compact 140px Room/Rate header, 44px metric column eliminated)
    let trHead = `<tr class="sticky-header">
        <th class="frozen-col-header z-30 border-r-2 border-slate-600 px-2 text-left" style="width: 140px; min-width: 140px; left: 0;">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-300">Room / Rate</span>
        </th>`;

    for (let i = 0; i < window.daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dateStr = window.getLocalYMD(cur);
        const dMs = window.parseYMD(dateStr);
        let minDiff = window.getNearestEvent(dMs);

        let highlight = 'bg-slate-900 border-slate-700 text-white';
        if (hasEvents) {
            if (minDiff === 0) highlight = 'evt-peak !bg-amber-500 text-slate-900';
            else if (Math.abs(minDiff) <= 2) highlight = 'bg-amber-400 text-amber-900 border-amber-500';
        }

        const isGlobStop = !!(window.masterPricing.timeline?.[dateStr]?.GLOBAL?.stop || window.masterPricing.timeline?.[dateStr]?.GLOBAL?.stopSell);

        trHead += `<th class="px-0 py-0.5 border-b ${highlight} relative group cursor-pointer" style="width: 31px; min-width: 31px; max-width: 31px;" onclick="window.handleHeaderStopToggle('${dateStr}')" title="Click to Stop-Sell entire property on ${dateStr}">
            <span class="block text-[8px] font-bold uppercase leading-none">${window.mNames[cur.getUTCMonth()]}</span>
            <span class="block text-[11px] font-black leading-tight mt-0.5">${cur.getUTCDate()}</span>
            <div class="h-1.5 w-full flex items-center justify-center mt-0.5">
                ${isGlobStop ? '<span class="w-2 h-2 rounded-full bg-red-600 block shadow-xs" title="Entire Property Closed"></span>' : '<span class="w-1.5 h-1.5 rounded-full bg-transparent group-hover:bg-red-400/60 block"></span>'}
            </div>
        </th>`;
    }
    trHead += `</tr>`;
    head.innerHTML = trHead;

    // 2. TARGET ROOM SELECTION
    let targetRooms = [...(window.roomTypes || [])];
    const anchorPrivate = window.pricingRules?.anchorPrivate || window.savedAutofillBaselines?.anchor_p || document.getElementById('rule-anchor-private')?.value;
    const anchorD = window.pricingRules?.anchorDorm || window.savedAutofillBaselines?.anchor_d || document.getElementById('rule-anchor-dorm')?.value;

    if (drill === 'master') {
        targetRooms = [anchorPrivate, anchorD].filter(Boolean);
        if (targetRooms.length === 0 && (window.roomTypes || []).length > 0) {
            targetRooms = [window.roomTypes[0]];
        }
        targetRooms = [...new Set(targetRooms)];
    }

    let allRowsHtml = '';

    targetRooms.forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'room-group-even' : 'room-group-odd';
        const displayName = window.displayAbbrev[room] || room;
        const allMappedRates = window.channexRateMap ? window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === room) : [];

        // Apply Depth: Event Filters
        let mappedRates = allMappedRates;
        if (drill === 'event') {
            mappedRates = allMappedRates.filter(r => (r.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(r.ratePlanTitle || ''));
        }

        // Apply Channel Preview Filter
        const filterChannel = window.channelPreviewFilter || 'ALL';
        mappedRates = mappedRates.filter(rate => {
            if (filterChannel === 'ALL') return true;
            const rChan = rate.channel || (window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(rate.ratePlanTitle).channel : '');
            if (filterChannel === 'BDC') return rChan === 'Booking.com' || /bdc|booking/i.test(rate.ratePlanTitle);
            if (filterChannel === 'HW') return rChan === 'Hostelworld' || /hw|hostelworld/i.test(rate.ratePlanTitle);
            if (filterChannel === 'AGODA') return rChan === 'Agoda' || /agoda/i.test(rate.ratePlanTitle);
            if (filterChannel === 'DIRECT') return rChan === 'Direct Website' || /direct/i.test(rate.ratePlanTitle);
            return true;
        });

        const isExpanded = (drill === 'rates') || (drill === 'event') || window.expandedRooms.has(room);

        // A. AVAILABILITY ROW
        let trAvail = `<tr class="${groupClass} border-b border-slate-200">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                <div class="w-[140px] flex items-center justify-between px-1.5 h-full font-black text-slate-800 text-[11px] leading-tight">
                    <span class="truncate" title="${room}">${displayName}</span>
                    <div class="flex items-center gap-1">
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-200 px-1 py-0.2 rounded">AVAIL</span>
                        ${drill !== 'master' && mappedRates.length > 0 && density !== 'avail' ? `
                        <button onclick="window.toggleRoomExpand('${room}')" class="px-1 py-0.5 rounded bg-slate-200 hover:bg-indigo-100 text-[9px] text-slate-700 font-bold transition-colors cursor-pointer" title="Toggle sub-rates">
                            ${isExpanded ? '▼' : '▶'} ${mappedRates.length}
                        </button>` : ''}
                    </div>
                </div>
            </td>`;

        for (let i = 0; i < window.daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = window.getLocalYMD(cur);
            const live = window.liveInventory[dateStr]?.[room] !== undefined ? window.liveInventory[dateStr][room] : 0;
            const otaAvail = window.masterPricing.timeline[dateStr]?.otaOverrides?.[`${room}_avail`];
            const displayVal = otaAvail !== undefined ? otaAvail : live;
            const availColor = displayVal === 0 ? 'text-rose-600 font-black' : (displayVal <= 2 ? 'text-amber-600 font-bold' : 'text-emerald-700 font-bold');
            const overrideBg = otaAvail !== undefined ? '!bg-amber-100' : 'bg-slate-50/80';

            trAvail += `<td class="p-0 border-r border-slate-200 ${overrideBg}" style="width: 31px; min-width: 31px; max-width: 31px;">
                <input type="number" class="cell-avail-input w-full h-full text-center outline-none focus:bg-white text-[10px] ${availColor} font-bold bg-transparent tracking-tighter px-0 py-1" value="${displayVal}" onfocus="this.select()" onchange="window.handleAvailEdit('${dateStr}', '${room}', this.value)">
            </td>`;
        }
        trAvail += `</tr>`;
        allRowsHtml += trAvail;

        if (density === 'avail') return;

        // B. BASE (STANDARD) RATE ROW
        let trRate = `<tr class="${groupClass} border-b border-slate-300">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                    <span class="text-[10px] font-black text-slate-700 truncate">${drill === 'event' ? 'Base STD' : 'Base'}</span>
                    <span class="text-[7px] font-black uppercase text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-200">MASTER</span>
                </div>
            </td>`;

        for (let i = 0; i < window.daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = window.getLocalYMD(cur);
            const data = window.getCellData(dateStr, room);
            const isPinned = !!data.isOverride?.std;
            const isStopped = !!data.stopSell;
            const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
            const displayPrice = data.std !== "" && !isNaN(data.std) ? window.formatDisplay(data.std * mult) : "";

            let ctaBadge = '';
            if (data.cta && data.ctd) ctaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-purple-200 text-purple-900 leading-none" title="Closed to Both (BTH)">B</span>';
            else if (data.cta) ctaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-amber-200 text-amber-900 leading-none" title="Closed to Arrival (CTA)">A</span>';
            else if (data.ctd) ctaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-sky-200 text-sky-900 leading-none" title="Closed to Departure (CTD)">D</span>';

            const isMinArr = !!data.min_arr;
            const minVal = data.min !== "" ? data.min : (data.min_arr ? `${data.min_arr}▸` : "");
            const maxVal = data.max !== "" ? data.max : "";

            let cellClass = "rate-cell-container p-0 border-r border-slate-200 text-center relative ";
            if (isStopped) cellClass += "rate-cell-stopped ";
            else if (isPinned) cellClass += "rate-cell-pinned ";

            const showTop = density === 'minmax' || density === 'full';
            const showBottom = density === 'full';

            trRate += `<td class="${cellClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}')" onmouseenter="window.showCmTooltip(event, '${displayName} | ${dateStr}\\nPrice: ฿${displayPrice || '--'}${isPinned ? ' (Custom Override - Double-click to unlock)' : ''}\\nMin: ${minVal || '--'}, Max: ${maxVal || '--'}')" onmouseleave="window.hideCmTooltip()">
                ${showTop ? `
                <div class="flex items-center w-full h-[14px] border-b border-slate-200/70 overflow-hidden leading-none" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; width: 100% !important;">
                    <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;" class="cell-min-input text-center bg-transparent border-none text-[8px] font-black ${isMinArr ? 'text-amber-600' : 'text-slate-600'} outline-none" value="${minVal}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value)" title="Min Stay (${isMinArr ? 'On Arrival' : 'Through'})">
                    <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; border-left: 1px solid rgba(226, 232, 240, 0.8) !important;" class="cell-max-input text-center bg-transparent border-none text-[8px] text-slate-400 outline-none" value="${maxVal}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value)" title="Max Stay">
                </div>` : ''}

                <div class="${density === 'compact' ? 'h-[24px]' : 'h-[17px]'} flex items-center justify-center">
                    <input type="number" step="any" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_std" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-slate-800 px-0" value="${displayPrice}" onfocus="this.select()" onkeydown="if(event.key==='Enter' && event.altKey){ event.preventDefault(); window.handleCellPriceChange(event, '${dateStr}', '${room}', true); } else if(event.key==='Enter'){ event.preventDefault(); window.handleCellPriceChange(event, '${dateStr}', '${room}', false); }" onchange="window.handleCellPriceChange(event, '${dateStr}', '${room}', false)">
                </div>

                ${showBottom ? `
                <div class="flex items-center justify-between px-0.5 text-[7px] leading-none h-[11px] pb-0.5">
                    <button onclick="window.handleCellCtaCtdCycle('${dateStr}', '${room}')" class="cursor-pointer" title="Closed Cycle: Arrival (A), Departure (D), Both (B)">
                        ${ctaBadge || '<span class="w-2 h-2 rounded-full bg-slate-300 hover:bg-slate-400 inline-block transition-colors"></span>'}
                    </button>
                    <button onclick="window.handleCellStopToggle('${dateStr}', '${room}')" class="cursor-pointer" title="Toggle Stop-Sell">
                        ${isStopped ? '<span class="px-0.5 py-0.2 rounded text-[7px] font-black bg-rose-600 text-white">STOP</span>' : '<span class="w-2 h-2 rounded-full bg-transparent hover:bg-rose-400/60 inline-block"></span>'}
                    </button>
                </div>` : ''}
            </td>`;
        }
        trRate += `</tr>`;
        allRowsHtml += trRate;

        // C. EVENT BASE RATE (fmp) ROW (Displayed when in Event Depth or when Events are enabled)
        if ((drill === 'event' || hasEvents) && density !== 'avail') {
            let trEvtRate = `<tr class="${groupClass} border-b-2 border-slate-400 bg-pink-50/30">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 bg-pink-50/70">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                        <span class="text-[10px] font-black text-pink-700 truncate">Event EVT</span>
                        <span class="text-[7px] font-black uppercase text-pink-700 bg-pink-100 px-1 py-0.5 rounded border border-pink-300">EVT BASE</span>
                    </div>
                </td>`;

            for (let i = 0; i < window.daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = window.getLocalYMD(cur);
                const data = window.getCellData(dateStr, room);
                const isPinnedFmp = !!data.isOverride?.fmp;
                const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
                const displayFmp = data.fmp !== "" && !isNaN(data.fmp) ? window.formatDisplay(data.fmp * mult) : "";

                let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
                let peakBg = minDiff === 0 ? 'bg-amber-100/60' : (Math.abs(minDiff) <= 2 ? 'bg-yellow-50/60' : '');

                trEvtRate += `<td class="rate-cell-container p-0 border-r border-pink-200 text-center relative ${peakBg} ${isPinnedFmp ? 'rate-cell-pinned' : ''}" style="width: 31px; min-width: 31px; max-width: 31px;">
                    <div class="h-[22px] flex items-center justify-center">
                        <input type="number" step="any" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_fmp" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-pink-700 px-0" value="${displayFmp}" onfocus="this.select()" onchange="window.handleCellEdit('${dateStr}', '${room}', 'fmp', this.value)">
                    </div>
                </td>`;
            }
            trEvtRate += `</tr>`;
            allRowsHtml += trEvtRate;
        }

        // D. MAPPED RATE PLANS (IF EXPANDED IN ROOM, EVENT, OR ALL-RATES MODE)
        if (isExpanded && mappedRates.length > 0 && drill !== 'master' && density !== 'avail') {
            mappedRates.forEach((rate) => {
                const rateSource = rate.rateSource || 'std';
                const isEvtRate = (rateSource === 'evt') || /evt|fmp|event|pkg/i.test(rate.ratePlanTitle || '');
                const displayTitle = window.formatRatePlanTitle ? window.formatRatePlanTitle(rate.ratePlanTitle) : rate.ratePlanTitle;

                let trOta = `<tr class="bg-indigo-50/40 border-b border-indigo-100">
                    <td class="frozen-col !p-0 z-20 border-r-2 border-slate-400 bg-indigo-50/70">
                        <div class="w-[140px] flex items-center justify-between px-2 h-full text-left" title="${rate.ratePlanTitle}">
                            <div class="flex flex-col min-w-0 pr-1">
                                <span class="text-[9px] font-bold text-indigo-900 truncate">${displayTitle}</span>
                                <span class="text-[7px] uppercase tracking-widest ${isEvtRate ? 'text-pink-600 font-black' : 'text-indigo-500 font-bold'}">${isEvtRate ? 'EVT PKG' : 'RATE PLAN'}</span>
                            </div>
                            <span class="text-[7px] font-black uppercase text-indigo-600 bg-indigo-100 px-1 py-0.2 rounded shrink-0">OTA</span>
                        </div>
                    </td>`;

                for (let i = 0; i < window.daysToRender; i++) {
                    const cur = new Date(dObj);
                    cur.setUTCDate(cur.getUTCDate() + i);
                    const dateStr = window.getLocalYMD(cur);
                    const dayObj = window.masterPricing.timeline[dateStr] || {};
                    const otaOverride = dayObj.otaOverrides?.[rate.ratePlanId];
                    const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;

                    let calculatedRate = otaOverride;
                    if (calculatedRate === undefined) {
                        if (window.computeDynamicPlanRate) {
                            calculatedRate = window.computeDynamicPlanRate(dateStr, room, rate);
                        } else {
                            const roomData = dayObj[room] || {};
                            let basePrice = (isEvtRate && roomData.fmp && (window.eventDates || []).length > 0) ? roomData.fmp : roomData.std;
                            if (basePrice !== undefined && basePrice !== "") {
                                calculatedRate = window.applyMath(basePrice, rate.ruleType || "=", rate.ruleVal || 0);
                            }
                        }
                    }

                    const otaMin = dayObj.otaOverrides?.[`${rate.ratePlanId}_min`];
                    const otaMax = dayObj.otaOverrides?.[`${rate.ratePlanId}_max`];
                    const otaStop = !!(dayObj.otaOverrides?.[`${rate.ratePlanId}_stop`] || dayObj.otaOverrides?.[`${rate.ratePlanId}_stopSell`]);
                    const otaCta = !!dayObj.otaOverrides?.[`${rate.ratePlanId}_cta`];
                    const otaCtd = !!dayObj.otaOverrides?.[`${rate.ratePlanId}_ctd`];

                    let otaCtaBadge = '';
                    if (otaCta && otaCtd) otaCtaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-purple-200 text-purple-900 leading-none">B</span>';
                    else if (otaCta) otaCtaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-amber-200 text-amber-900 leading-none">A</span>';
                    else if (otaCtd) otaCtaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-sky-200 text-sky-900 leading-none">D</span>';

                    let cellOtaClass = "rate-cell-container p-0 border-r border-indigo-100 text-center relative ";
                    if (otaStop) cellOtaClass += "rate-cell-stopped ";
                    else if (otaOverride !== undefined) cellOtaClass += "rate-cell-pinned ";

                    const showTop = density === 'minmax' || density === 'full';
                    const showBottom = density === 'full';

                    trOta += `<td class="${cellOtaClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}', '${rate.ratePlanId}')">
                        ${showTop ? `
                        <div class="flex items-center w-full h-[14px] border-b border-indigo-100/70 overflow-hidden leading-none" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; width: 100% !important;">
                            <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;" class="cell-min-input text-center bg-transparent border-none text-[7.5px] text-indigo-700 outline-none font-bold" value="${otaMin || ''}" placeholder="-" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'min', this.value, '${rateSource}')" title="Min Stay">
                            <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; border-left: 1px solid rgba(199, 210, 254, 0.6) !important;" class="cell-max-input text-center bg-transparent border-none text-[7.5px] text-indigo-400 outline-none" value="${otaMax || ''}" placeholder="-" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'max', this.value, '${rateSource}')" title="Max Stay">
                        </div>` : ''}

                        <div class="${density === 'compact' ? 'h-[22px]' : 'h-[16px]'} flex items-center justify-center">
                            <input type="number" step="any" class="cell-price-text w-full text-center outline-none bg-transparent font-bold text-[10px] ${otaOverride !== undefined ? '!text-pink-600 font-black' : 'text-indigo-900'} px-0" value="${calculatedRate !== undefined ? window.formatDisplay(calculatedRate * mult) : ''}" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'rate', this.value, '${rateSource}')">
                        </div>

                        ${showBottom ? `
                        <div class="flex items-center justify-between px-0.5 text-[7px] leading-none h-[10px] pb-0.5">
                            <button onclick="window.handleCellCtaCtdCycle('${dateStr}', '${room}', '${rate.ratePlanId}')" class="cursor-pointer" title="Closed Cycle: Arrival (A), Departure (D), Both (B)">
                                ${otaCtaBadge || '<span class="w-2 h-2 rounded-full bg-slate-300 hover:bg-slate-400 inline-block transition-colors"></span>'}
                            </button>
                            <button onclick="window.handleCellStopToggle('${dateStr}', '${room}', '${rate.ratePlanId}')" class="cursor-pointer" title="Toggle Stop-Sell">
                                ${otaStop ? '<span class="px-0.5 py-0.2 rounded text-[7px] font-black bg-rose-600 text-white">STOP</span>' : '<span class="w-2 h-2 rounded-full bg-transparent hover:bg-rose-400/60 inline-block"></span>'}
                            </button>
                        </div>` : ''}
                    </td>`;
                }
                trOta += `</tr>`;
                allRowsHtml += trOta;
            });
        }
    });

    // 3. GLOBAL RESTRICTIONS ROW
    if (density === 'minmax' || density === 'full') {
        let globalTr = `<tr class="bg-slate-800 text-white border-t-2 border-slate-900">
            <td class="frozen-col !p-0 z-20 bg-slate-900 border-r-2 border-slate-600 px-2 py-1 flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-widest text-slate-200">GLOBAL</span>
                <span class="text-[8px] font-black text-slate-400 uppercase bg-slate-800 px-1 py-0.2 rounded">RESTR</span>
            </td>`;

        for (let i = 0; i < window.daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = window.getLocalYMD(cur);
            const gData = window.masterPricing.timeline?.[dateStr]?.GLOBAL || {};

            globalTr += `<td class="p-0 border-r border-slate-700 text-center" style="width: 31px; min-width: 31px; max-width: 31px;">
                <div class="flex items-center w-full h-[18px] px-0.5 leading-none overflow-hidden" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; width: 100% !important;">
                    <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;" class="bg-slate-700 rounded-l text-center text-[8px] font-black text-white outline-none" value="${gData.min || ''}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'min', this.value)" title="Global Min Stay">
                    <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; border-left: 1px solid rgb(71, 85, 105) !important;" class="bg-slate-700 rounded-r text-center text-[8px] font-black text-slate-400 outline-none" value="${gData.max || ''}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'max', this.value)" title="Global Max Stay">
                </div>
            </td>`;
        }
        globalTr += `</tr>`;
        allRowsHtml += globalTr;
    }

    body.innerHTML = allRowsHtml;
    if (window.lucide) window.lucide.createIcons();
};

window.setViewDensity = (density) => {
    window.viewDensity = density;
    ['avail', 'compact', 'minmax', 'full'].forEach(d => {
        const btn = document.getElementById(`density-${d}`);
        if (btn) {
            if (d === density) btn.className = "px-2 py-0.5 rounded cursor-pointer transition-colors bg-white text-indigo-700 shadow-xs font-black";
            else btn.className = "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-600 hover:bg-white";
        }
    });
    if (window.renderGrid) window.renderGrid();
};

window.setDrillLevel = (level) => {
    window.drillLevel = level;
    ['master', 'room', 'event', 'rates'].forEach(l => {
        const btn = document.getElementById(`depth-${l}`);
        if (btn) {
            if (l === level) btn.className = "px-2 py-0.5 rounded cursor-pointer transition-colors bg-white text-indigo-700 shadow-xs font-black";
            else btn.className = "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-600 hover:bg-white";
        }
    });
    if (window.renderGrid) window.renderGrid();
};

window.applyBulkGrid = (isClear = false) => {
    const s = document.getElementById('qb-start')?.value;
    const e = document.getElementById('qb-end')?.value;
    if (!s || !e) return window.customAlert("Please select Start and End dates.");
    const sU = window.parseYMD(s), eU = window.parseYMD(e);

    const rules = [];
    document.querySelectorAll('#qb-grid-body tr').forEach(tr => {
        const type = tr.dataset.type;
        const id = tr.dataset.id;
        const parent = tr.dataset.parent;
        const rType = tr.dataset.ruletype || "=";
        const rVal = parseFloat(tr.dataset.ruleval) || 0;
        const rSource = tr.dataset.ratesource || 'std';

        const getVal = (cls, isBool = false) => {
            const el = tr.querySelector('.' + cls);
            if (!el || el.disabled) return undefined;
            if (isClear) return "";
            if (el.value.trim() === "") return undefined;
            if (isBool) return ['true', '1', 'y', 'yes', 'on', 't'].includes(el.value.toLowerCase().trim());
            return parseFloat(el.value);
        };

        const rule = {
            type, id, parent, rType, rVal, rSource,
            rate: getVal('qb-val-rate'),
            min: getVal('qb-val-min'),
            max: getVal('qb-val-max'),
            min_arr: getVal('qb-val-min-arr'),
            cta: getVal('qb-val-cta', true),
            ctd: getVal('qb-val-ctd', true),
            stopSell: getVal('qb-val-stop', true)
        };

        Object.keys(rule).forEach(k => rule[k] === undefined && delete rule[k]);
        if (Object.keys(rule).length > 5) rules.push(rule);
    });

    if (rules.length === 0 && !isClear) return window.customAlert("Enter at least one value to apply in the grid.");

    for (let d = sU; d <= eU; d += 86400000) {
        let dateStr = window.getLocalYMD(new Date(d));
        window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};

        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);
        window.dirtyFields = window.dirtyFields || {};
        window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};

        rules.forEach(r => {
            if (r.type === 'global') {
                window.masterPricing.timeline[dateStr]['GLOBAL'] = window.masterPricing.timeline[dateStr]['GLOBAL'] || { isOverride: {} };
                ['min', 'max', 'min_arr', 'cta', 'ctd', 'stopSell'].forEach(f => {
                    if (r[f] !== undefined) {
                        if (r[f] === "") {
                            window.masterPricing.timeline[dateStr]['GLOBAL'][f] = ['cta', 'ctd', 'stopSell'].includes(f) ? false : "";
                            delete window.masterPricing.timeline[dateStr]['GLOBAL'].isOverride[f];
                        } else {
                            window.masterPricing.timeline[dateStr]['GLOBAL'][f] = r[f];
                            window.masterPricing.timeline[dateStr]['GLOBAL'].isOverride[f] = true;
                        }

                        (window.channexRateMap || []).forEach(rate => {
                            window.dirtyFields[dateStr][rate.ratePlanId] = window.dirtyFields[dateStr][rate.ratePlanId] || new Set();
                            let fMap = f === 'min_arr' ? 'min' : f;
                            window.dirtyFields[dateStr][rate.ratePlanId].add(fMap);
                        });
                    }
                });
            } else if (r.type === 'room') {
                window.masterPricing.timeline[dateStr][r.id] = window.masterPricing.timeline[dateStr][r.id] || { isOverride: {} };
                if (r.rate !== undefined) {
                    if (r.rate === "") {
                        window.masterPricing.timeline[dateStr][r.id].std = "";
                        window.masterPricing.timeline[dateStr][r.id].fmp = "";
                        delete window.masterPricing.timeline[dateStr][r.id].isOverride.std;
                        delete window.masterPricing.timeline[dateStr][r.id].isOverride.fmp;
                        if (window.healDay) window.healDay(dateStr);
                    } else {
                        const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
                        window.masterPricing.timeline[dateStr][r.id].std = window.roundCurrency(parseFloat(r.rate) / mult);
                        window.masterPricing.timeline[dateStr][r.id].isOverride.std = true;
                        if (window.rippleDay) window.rippleDay(dateStr, r.id);
                    }

                    (window.channexRateMap || []).filter(m => window.categoryResolver(m.pmsCategory) === r.id).forEach(rate => {
                        window.dirtyFields[dateStr][rate.ratePlanId] = window.dirtyFields[dateStr][rate.ratePlanId] || new Set();
                        window.dirtyFields[dateStr][rate.ratePlanId].add('rate');
                    });
                }

                ['min', 'max', 'min_arr', 'cta', 'ctd', 'stopSell'].forEach(f => {
                    if (r[f] !== undefined) {
                        if (r[f] === "") {
                            window.masterPricing.timeline[dateStr][r.id][f] = ['cta', 'ctd', 'stopSell'].includes(f) ? false : "";
                            delete window.masterPricing.timeline[dateStr][r.id].isOverride[f];
                        } else {
                            window.masterPricing.timeline[dateStr][r.id][f] = r[f];
                            window.masterPricing.timeline[dateStr][r.id].isOverride[f] = true;
                        }

                        (window.channexRateMap || []).filter(m => window.categoryResolver(m.pmsCategory) === r.id).forEach(rate => {
                            window.dirtyFields[dateStr][rate.ratePlanId] = window.dirtyFields[dateStr][rate.ratePlanId] || new Set();
                            let fMap = f === 'min_arr' ? 'min' : f;
                            window.dirtyFields[dateStr][rate.ratePlanId].add(fMap);
                        });
                    }
                });
            } else if (r.type === 'rate') {
                if (r.rate !== undefined) window.handleOtaEdit(dateStr, r.id, r.parent, r.rType, r.rVal, 'rate', r.rate, r.rSource);
                ['min', 'max', 'min_arr', 'cta', 'ctd', 'stopSell'].forEach(f => {
                    if (r[f] !== undefined) window.handleOtaEdit(dateStr, r.id, r.parent, r.rType, r.rVal, f, r[f], r.rSource);
                });
            }
        });
    }

    window.renderGrid();
    window.markUnsavedChanges();

    if (!isClear) {
        document.querySelectorAll('#qb-grid-body input:not([type="date"]):not([disabled])').forEach(i => i.value = "");
    }
};

window.shiftTape = (days) => {
    const current = new Date(document.getElementById('tape-start').value + "T12:00:00Z");
    current.setUTCDate(current.getUTCDate() + days);
    document.getElementById('tape-start').value = current.toISOString().split('T')[0];
    window.renderGrid();
};

window.toggleQuickBulk = (forceClose = false) => {
    const panel = document.getElementById('quick-bulk-panel');
    if (!panel) return;
    if (!forceClose && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        window.renderBulkGrid();
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
};

window.renderBulkGrid = () => {
    let html = '';
    const inptCls = "input-base !py-0.5 !px-1 text-center text-[10px] w-14 font-black transition-colors focus:bg-indigo-50 border border-transparent focus:border-indigo-300 hover:bg-slate-50 placeholder-slate-400";

    html += `<tr class="bg-slate-200 border-b border-slate-300" data-type="global" data-id="GLOBAL">
        <td class="p-1.5 font-black text-[10px] uppercase text-slate-800 border-r border-slate-300">🌍 GLOBAL (ALL ROOMS)</td>
        <td class="p-1 text-center border-r border-slate-300"><input type="text" class="${inptCls} bg-slate-100/50 cursor-not-allowed" disabled></td>
        <td class="p-1 text-center border-r border-slate-300"><input type="number" step="any" class="${inptCls} qb-val-min" placeholder="MIN"></td>
        <td class="p-1 text-center border-r border-slate-300"><input type="number" step="any" class="${inptCls} qb-val-max" placeholder="MAX"></td>
        <td class="p-1 text-center border-r border-slate-300"><input type="number" step="any" class="${inptCls} qb-val-min-arr" placeholder="MIN-A"></td>
        <td class="p-1 text-center border-r border-slate-300"><input type="text" class="${inptCls} qb-val-cta" placeholder="CTA"></td>
        <td class="p-1 text-center border-r border-slate-300"><input type="text" class="${inptCls} qb-val-ctd" placeholder="CTD"></td>
        <td class="p-1 text-center"><input type="text" class="${inptCls} qb-val-stop !placeholder-rose-400" placeholder="STOP"></td>
    </tr>`;

    (window.roomTypes || []).forEach(r => {
        html += `<tr class="bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors" data-type="room" data-id="${r}">
            <td class="p-1.5 font-bold text-[10px] text-slate-600 pl-4 border-r border-slate-200">🚪 ${window.displayAbbrev[r] || r} <span class="text-[8px] text-slate-400 font-black uppercase ml-1">(Base)</span></td>
            <td class="p-1 text-center border-r border-slate-200"><input type="number" step="any" class="${inptCls} qb-val-rate !placeholder-indigo-400" placeholder="RATE"></td>
            <td class="p-1 text-center border-r border-slate-200"><input type="number" step="any" class="${inptCls} qb-val-min" placeholder="MIN"></td>
            <td class="p-1 text-center border-r border-slate-200"><input type="number" step="any" class="${inptCls} qb-val-max" placeholder="MAX"></td>
            <td class="p-1 text-center border-r border-slate-200"><input type="number" step="any" class="${inptCls} qb-val-min-arr" placeholder="MIN-A"></td>
            <td class="p-1 text-center border-r border-slate-200"><input type="text" class="${inptCls} qb-val-cta" placeholder="CTA"></td>
            <td class="p-1 text-center border-r border-slate-200"><input type="text" class="${inptCls} qb-val-ctd" placeholder="CTD"></td>
            <td class="p-1 text-center"><input type="text" class="${inptCls} qb-val-stop !placeholder-rose-400" placeholder="STOP"></td>
        </tr>`;

        const mappedRates = (window.channexRateMap || []).filter(m => window.categoryResolver(m.pmsCategory) === r);
        mappedRates.forEach(m => {
            html += `<tr class="bg-indigo-50/20 border-b border-indigo-50 hover:bg-indigo-50/50 transition-colors" data-type="rate" data-id="${m.ratePlanId}" data-parent="${r}" data-ruletype="${m.ruleType || "="}" data-ruleval="${m.ruleVal !== undefined ? m.ruleVal : 0}" data-ratesource="${m.rateSource || 'std'}">
                <td class="p-1.5 font-bold text-[9px] text-indigo-700 pl-8 border-r border-indigo-100">↳ 📡 ${m.ratePlanTitle}</td>
                <td class="p-1 text-center border-r border-indigo-100"><input type="number" step="any" class="${inptCls} qb-val-rate !placeholder-indigo-400" placeholder="RATE"></td>
                <td class="p-1 text-center border-r border-indigo-100"><input type="number" step="any" class="${inptCls} qb-val-min" placeholder="MIN"></td>
                <td class="p-1 text-center border-r border-indigo-100"><input type="number" step="any" class="${inptCls} qb-val-max" placeholder="MAX"></td>
                <td class="p-1 text-center border-r border-indigo-100"><input type="number" step="any" class="${inptCls} qb-val-min-arr" placeholder="MIN-A"></td>
                <td class="p-1 text-center border-r border-indigo-100"><input type="text" class="${inptCls} qb-val-cta" placeholder="CTA"></td>
                <td class="p-1 text-center border-r border-indigo-100"><input type="text" class="${inptCls} qb-val-ctd" placeholder="CTD"></td>
                <td class="p-1 text-center"><input type="text" class="${inptCls} qb-val-stop !placeholder-rose-400" placeholder="STOP"></td>
            </tr>`;
        });
    });

    const qbBody = document.getElementById('qb-grid-body');
    if (qbBody) qbBody.innerHTML = html;
};

// SMART RELEVANT-FIELD TAB NAVIGATION
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        let targetSelector = '';
        if (target.classList.contains('cell-price-text')) targetSelector = '.cell-price-text';
        else if (target.classList.contains('cell-min-input')) targetSelector = '.cell-min-input';
        else if (target.classList.contains('cell-max-input')) targetSelector = '.cell-max-input';
        else if (target.classList.contains('cell-avail-input')) targetSelector = '.cell-avail-input';

        if (targetSelector) {
            e.preventDefault();
            const inputs = Array.from(document.querySelectorAll(targetSelector)).filter(i => !i.disabled && i.offsetParent !== null);
            const idx = inputs.indexOf(target);
            if (idx !== -1) {
                const nextIdx = e.shiftKey ? (idx - 1 + inputs.length) % inputs.length : (idx + 1) % inputs.length;
                const nextInput = inputs[nextIdx];
                if (nextInput) {
                    nextInput.focus();
                    if (typeof nextInput.select === 'function') nextInput.select();
                }
            }
        }
    }
});

let _resizeDebounce = null;
window.addEventListener('resize', () => {
    clearTimeout(_resizeDebounce);
    _resizeDebounce = setTimeout(() => {
        if (window.renderGrid) window.renderGrid();
    }, 200);
});
