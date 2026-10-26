// ==========================================================================
// CHANNEL MANAGER CALENDAR GRID & INVENTORY (cm-grid.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-grid.js
// ==========================================================================

window.daysToRender = window.daysToRender || 35;
window.bulkScopeMode = window.bulkScopeMode || 'anchors'; // 'anchors' | 'all'

// --- 0. HELPER FORMATTERS & INVENTORY CALCULATOR ---
window.formatMinStayInput = (val) => {
    if (!val) return "";
    const clean = String(val).trim();
    if (!clean || clean === "-") return "";
    if (/(\d+)\s*(a|>|▸)/i.test(clean)) {
        const match = clean.match(/(\d+)/);
        return match ? `${match[1]}▸` : clean;
    }
    const match = clean.match(/(\d+)/);
    return match ? match[1] : clean;
};

window.calculateLiveInventory = () => {
    window.liveInventory = window.liveInventory || {};
    const curProp = window.currentPropertyId;
    const staffList = (window.staff && window.staff.length > 0)
        ? window.staff
        : (window.bookings || window.reservations || window.masterPricing?.bookings || []);
    const roomTypes = window.roomTypes || [];
    const hotelRooms = window.hotelRooms || [];
    const totalRoomsByType = window.totalRoomsByType || {};

    const capByType = {};
    roomTypes.forEach(rt => {
        if (totalRoomsByType[rt]) {
            capByType[rt] = totalRoomsByType[rt];
        } else {
            const count = hotelRooms.filter(r => r && r.type === rt).length;
            if (count > 0) {
                capByType[rt] = count;
            } else {
                const m = rt.match(/(\d+)\s*(-|\s*)(bed|bunk|dorm)/i);
                capByType[rt] = m ? parseInt(m[1], 10) : 1;
            }
        }
    });

    const startInput = document.getElementById('tape-start')?.value || (window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0]);
    const startMs = (window.parseYMD ? window.parseYMD(startInput) : new Date(startInput).getTime()) || Date.now();

    for (let i = -7; i < 90; i++) {
        const curD = new Date(startMs + (i * 86400000));
        const dStr = window.getLocalYMD ? window.getLocalYMD(curD) : curD.toISOString().split('T')[0];
        window.liveInventory[dStr] = window.liveInventory[dStr] || {};

        const occupied = {};
        roomTypes.forEach(rt => { occupied[rt] = 0; });

        if (Array.isArray(staffList)) {
            for (let j = 0; j < staffList.length; j++) {
                const s = staffList[j];
                if (!s) continue;

                const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                if (sProp && curProp && sProp !== curProp) continue;

                const status = (s.status || '').toLowerCase();
                if (['cancelled', 'noshow', 'unconfirmed', 'charged'].includes(status)) continue;

                const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
                const isUnassigned = rList.length === 0 || rList[0] === "";
                if (status === 'special' && isUnassigned) continue;

                const cIn = s.checkIn || s.start || s.startDate;
                const cOut = s.checkOut || s.end || s.endDate;

                if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                    let cat = null;
                    if (!isUnassigned && rList.length > 0) {
                        const hRoom = hotelRooms.find(hr => hr.id === rList[0]);
                        if (hRoom && hRoom.type) cat = hRoom.type;
                    }
                    if (!cat) {
                        cat = (window.resolveRoomCategory && window.resolveRoomCategory(s.bookedType))
                            || s.bookedType
                            || s.category
                            || s.roomType;
                    }
                    if (cat) {
                        const matchedRt = roomTypes.find(rt => rt.toLowerCase() === cat.toLowerCase() || cat.toLowerCase().includes(rt.toLowerCase()) || rt.toLowerCase().includes(cat.toLowerCase()));
                        if (matchedRt) {
                            if (matchedRt.toLowerCase().includes('dorm')) {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + parseInt(s.pax || s.bedCount || 1, 10);
                            } else {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + Math.max(1, rList.length);
                            }
                        }
                    }
                }
            }
        }

        roomTypes.forEach(rt => {
            const cap = capByType[rt] || 1;
            const occ = occupied[rt] || 0;
            window.liveInventory[dStr][rt] = Math.max(0, cap - occ);
        });
    }
};

window.handleAvailEdit = (dateStr, room, val) => {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
    if (val === "" || isNaN(parseInt(val, 10))) {
        delete window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`];
    } else {
        window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`] = parseInt(val, 10);
    }
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.handleCellPriceChange = (e, dateStr, room, isPinnedToggle = false) => {
    const input = e ? (e.target || e) : null;
    if (!input) return;
    const val = String(input.value || '').trim();

    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline = window.masterPricing.timeline || {};
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    if (val === "" || isNaN(parseFloat(val))) {
        delete rData.std;
        delete rData.isOverride.std;
        if (window.healDay) window.healDay(dateStr);
    } else {
        const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
        const price = window.roundCurrency(parseFloat(val) / mult);
        rData.std = price;

        // Custom override: Pin the cell yellow with corner tag
        rData.isOverride.std = true;

        // In Ripple Mode, propagate to linked rooms (forcing update through to target rooms)
        if (window.editMode === 'ripple' && window.rippleDay) {
            window.rippleDay(dateStr, room, true);
        }
    }

    // Mark dirty so Save & Sync sends this date to Channex
    window.dirtyDates = window.dirtyDates || new Set();
    window.syncedDates = window.syncedDates || new Set();
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.handleCellEdit = (dateStr, room, field, val, isEvt = false) => {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    if (field === 'min_hybrid') {
        const clean = String(val).trim();
        const prefix = isEvt ? 'evt_' : '';
        if (!clean || clean === "-" || clean === "0") {
            delete rData[`${prefix}min`];
            delete rData[`${prefix}min_arr`];
            delete rData.isOverride[`${prefix}min`];
            delete rData.isOverride[`${prefix}min_arr`];
        } else if (/(\d+)\s*(a|>|▸)/i.test(clean)) {
            const match = clean.match(/(\d+)/);
            const num = match ? parseInt(match[1], 10) : "";
            rData[`${prefix}min_arr`] = num;
            delete rData[`${prefix}min`];
            rData.isOverride[`${prefix}min_arr`] = true;
            delete rData.isOverride[`${prefix}min`];
        } else {
            const match = clean.match(/(\d+)/);
            const num = match ? parseInt(match[1], 10) : "";
            rData[`${prefix}min`] = num;
            delete rData[`${prefix}min_arr`];
            rData.isOverride[`${prefix}min`] = true;
            delete rData.isOverride[`${prefix}min_arr`];
        }
    } else if (field === 'max' || field === 'max_hybrid') {
        const clean = String(val).trim();
        const prefix = isEvt ? 'evt_' : '';
        if (!clean || clean === "-" || clean === "0") {
            delete rData[`${prefix}max`];
            delete rData[`${prefix}max_arr`];
            delete rData.isOverride[`${prefix}max`];
            delete rData.isOverride[`${prefix}max_arr`];
        } else if (/(\d+)\s*(a|>|▸)/i.test(clean)) {
            const match = clean.match(/(\d+)/);
            const num = match ? parseInt(match[1], 10) : "";
            rData[`${prefix}max_arr`] = num;
            delete rData[`${prefix}max`];
            rData.isOverride[`${prefix}max_arr`] = true;
            delete rData.isOverride[`${prefix}max`];
        } else {
            const match = clean.match(/(\d+)/);
            const num = match ? parseInt(match[1], 10) : "";
            rData[`${prefix}max`] = num;
            delete rData[`${prefix}max_arr`];
            rData.isOverride[`${prefix}max`] = true;
            delete rData.isOverride[`${prefix}max_arr`];
        }
    } else if (field === 'min') {
        if (!val || val === "-") {
            delete rData.min;
            delete rData.isOverride.min;
        } else {
            rData.min = parseInt(val, 10);
            rData.isOverride.min = true;
        }
    } else if (field === 'fmp') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete rData.fmp;
            delete rData.isOverride.fmp;
            if (window.healDay) window.healDay(dateStr);
        } else {
            const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
            rData.fmp = window.roundCurrency(parseFloat(val) / mult);
            rData.isOverride.fmp = true;
        }
    } else if (field === 'fmp_ref') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete rData.fmp_ref;
            delete rData.isOverride.fmp_ref;
        } else {
            const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
            rData.fmp_ref = window.roundCurrency(parseFloat(val) / mult);
            rData.isOverride.fmp_ref = true;
        }
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.handleOtaEdit = (dateStr, ratePlanId, room, ruleType, ruleVal, field, val, rateSource = 'std') => {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
    const overrides = window.masterPricing.timeline[dateStr].otaOverrides;

    if (field === 'rate') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete overrides[ratePlanId];
            delete overrides[`${ratePlanId}_rate`];
        } else {
            const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
            overrides[ratePlanId] = window.roundCurrency(parseFloat(val) / mult);
            overrides[`${ratePlanId}_rate`] = overrides[ratePlanId];
        }
    } else if (field === 'min') {
        if (val === "" || val === "-") {
            delete overrides[`${ratePlanId}_min`];
        } else {
            overrides[`${ratePlanId}_min`] = parseInt(val, 10);
        }
    } else if (field === 'max') {
        if (val === "" || val === "-") {
            delete overrides[`${ratePlanId}_max`];
        } else {
            overrides[`${ratePlanId}_max`] = parseInt(val, 10);
        }
    } else if (field === 'cta') {
        overrides[`${ratePlanId}_cta`] = !!val;
    } else if (field === 'ctd') {
        overrides[`${ratePlanId}_ctd`] = !!val;
    } else if (field === 'stop' || field === 'stopSell') {
        overrides[`${ratePlanId}_stop`] = !!val;
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.drillLevel = window.drillLevel || 'room';
window.viewDensity = window.viewDensity || 'full';
window.channelPreviewFilter = window.channelPreviewFilter || 'ALL';
window.expandedRooms = window.expandedRooms || new Set();

window.toggleRoomExpand = (room) => {
    if (window.expandedRooms.has(room)) {
        window.expandedRooms.delete(room);
    } else {
        window.expandedRooms.add(room);
    }
    if (window.renderGrid) window.renderGrid();
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

// UNIFIED 5-STATE RESTRICTION HELPER: OPEN -> CTA -> CTD -> BOTH -> STOP -> OPEN
window.cycleUnifiedRestriction = (dateStr, room, ratePlanId = null, isEvt = false) => {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];

    if (ratePlanId) {
        dObj.otaOverrides = dObj.otaOverrides || {};
        const cta = !!dObj.otaOverrides[`${ratePlanId}_cta`];
        const ctd = !!dObj.otaOverrides[`${ratePlanId}_ctd`];
        const stop = !!dObj.otaOverrides[`${ratePlanId}_stop`];

        if (!cta && !ctd && !stop) { // OPEN -> CTA
            dObj.otaOverrides[`${ratePlanId}_cta`] = true;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = false;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        } else if (cta && !ctd && !stop) { // CTA -> CTD
            dObj.otaOverrides[`${ratePlanId}_cta`] = false;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = true;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        } else if (!cta && ctd && !stop) { // CTD -> BOTH
            dObj.otaOverrides[`${ratePlanId}_cta`] = true;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = true;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        } else if (cta && ctd && !stop) { // BOTH -> STOP
            dObj.otaOverrides[`${ratePlanId}_cta`] = false;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = false;
            dObj.otaOverrides[`${ratePlanId}_stop`] = true;
        } else { // STOP -> OPEN
            dObj.otaOverrides[`${ratePlanId}_cta`] = false;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = false;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        }
    } else {
        dObj[room] = dObj[room] || { isOverride: {} };
        const rData = dObj[room];
        rData.isOverride = rData.isOverride || {};

        const cta = isEvt ? (rData.evt_cta !== undefined ? !!rData.evt_cta : !!dObj.evtRestrictions?.cta) : !!rData.cta;
        const ctd = isEvt ? (rData.evt_ctd !== undefined ? !!rData.evt_ctd : !!dObj.evtRestrictions?.ctd) : !!rData.ctd;
        const stop = isEvt ? !!(rData.evt_stop || rData.evt_stopSell) : !!(rData.stop || rData.stopSell);

        const pfx = isEvt ? 'evt_' : '';

        if (!cta && !ctd && !stop) { // OPEN -> CTA
            rData[`${pfx}cta`] = true;
            rData[`${pfx}ctd`] = false;
            rData[`${pfx}stop`] = false;
            rData[`${pfx}stopSell`] = false;
            rData.isOverride[`${pfx}cta`] = true;
            rData.isOverride[`${pfx}ctd`] = false;
            rData.isOverride[`${pfx}stop`] = false;
        } else if (cta && !ctd && !stop) { // CTA -> CTD
            rData[`${pfx}cta`] = false;
            rData[`${pfx}ctd`] = true;
            rData[`${pfx}stop`] = false;
            rData[`${pfx}stopSell`] = false;
            rData.isOverride[`${pfx}cta`] = false;
            rData.isOverride[`${pfx}ctd`] = true;
            rData.isOverride[`${pfx}stop`] = false;
        } else if (!cta && ctd && !stop) { // CTD -> BOTH
            rData[`${pfx}cta`] = true;
            rData[`${pfx}ctd`] = true;
            rData[`${pfx}stop`] = false;
            rData[`${pfx}stopSell`] = false;
            rData.isOverride[`${pfx}cta`] = true;
            rData.isOverride[`${pfx}ctd`] = true;
            rData.isOverride[`${pfx}stop`] = false;
        } else if (cta && ctd && !stop) { // BOTH -> STOP
            rData[`${pfx}cta`] = false;
            rData[`${pfx}ctd`] = false;
            rData[`${pfx}stop`] = true;
            rData[`${pfx}stopSell`] = true;
            rData.isOverride[`${pfx}cta`] = false;
            rData.isOverride[`${pfx}ctd`] = false;
            rData.isOverride[`${pfx}stop`] = true;
        } else { // STOP -> OPEN
            rData[`${pfx}cta`] = false;
            rData[`${pfx}ctd`] = false;
            rData[`${pfx}stop`] = false;
            rData[`${pfx}stopSell`] = false;
            rData.isOverride[`${pfx}cta`] = false;
            rData.isOverride[`${pfx}ctd`] = false;
            rData.isOverride[`${pfx}stop`] = false;
        }
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.getUnifiedRestrictionBadgeHtml = (cta, ctd, stop) => {
    if (stop) {
        return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-rose-600 text-white leading-none tracking-tight">STOP</span>';
    }
    if (cta && ctd) {
        return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-purple-200 text-purple-900 leading-none tracking-tight">CTB</span>';
    }
    if (cta) {
        return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-amber-200 text-amber-900 leading-none tracking-tight">CTA</span>';
    }
    if (ctd) {
        return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-sky-200 text-sky-900 leading-none tracking-tight">CTD</span>';
    }
    return '<span class="w-1.5 h-1.5 rounded-full bg-slate-300 hover:bg-slate-400 inline-block transition-colors"></span>';
};

window.renderGrid = () => {
    const tapeInput = document.getElementById('tape-start');
    if (tapeInput && !tapeInput.value) {
        tapeInput.value = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
    }
    const startStr = tapeInput?.value || (window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0]);
    if (!startStr) return;

    window.calculateLiveInventory();

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    let dObj = new Date(startStr + "T12:00:00Z");
    
    const isEventsActive = window.isEventPricingEnabled ? window.isEventPricingEnabled() : ((window.eventDates || []).length > 0);
    const hasEvents = isEventsActive && (window.eventDates || []).length > 0;
    
    let drill = window.drillLevel || 'room';
    if (!isEventsActive && drill === 'event') {
        drill = 'room';
        window.drillLevel = 'room';
    }

    const depthEvtBtn = document.getElementById('depth-event');
    if (depthEvtBtn) {
        depthEvtBtn.style.display = isEventsActive ? 'inline-block' : 'none';
    }

    const density = window.viewDensity || 'full';

    // 1. HEADER ROW
    let trHead = `<tr class="sticky-header">
        <th class="frozen-col-header z-30 border-r-2 border-slate-600 px-2 text-left" style="width: 140px; min-width: 140px; left: 0;">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-300">Room / Rate</span>
        </th>`;

    for (let i = 0; i < window.daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dateStr = window.getLocalYMD(cur);
        const dMs = window.parseYMD(dateStr);
        let minDiff = window.getNearestEvent ? window.getNearestEvent(dMs) : 999;

        let highlight = 'bg-slate-900 border-slate-700 text-white';
        if (hasEvents) {
            if (minDiff === 0) highlight = 'evt-peak !bg-amber-500 text-slate-900';
            else if (Math.abs(minDiff) <= 2) highlight = 'bg-amber-400 text-amber-900 border-amber-500';
        }

        const isGlobStop = !!(window.masterPricing?.timeline?.[dateStr]?.GLOBAL?.stop || window.masterPricing?.timeline?.[dateStr]?.GLOBAL?.stopSell);

        trHead += `<th class="px-0 py-0.5 border-b ${highlight} relative group cursor-pointer" style="width: 31px; min-width: 31px; max-width: 31px;" onclick="window.cycleUnifiedRestriction('${dateStr}', 'GLOBAL')" title="Click to cycle restrictions for entire property on ${dateStr}">
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

        let mappedRates = allMappedRates;
        if (drill === 'event') {
            mappedRates = allMappedRates.filter(r => (r.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(r.ratePlanTitle || ''));
        }

        const filterChannel = window.channelPreviewFilter || 'ALL';
        mappedRates = mappedRates.filter(rate => {
            if (filterChannel === 'ALL') return true;
            const rChan = rate.channel || (window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(rate.ratePlanTitle).channel : '');
            if (filterChannel === 'BDC') return rChan === 'Booking.com' || /bdc|booking/i.test(rate.ratePlanTitle);
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
                        ${allMappedRates.length > 0 && drill !== 'rates' && drill !== 'master' ? `
                        <button onclick="window.toggleRoomExpand('${room}')" class="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 cursor-pointer" title="Expand/Collapse Rates">
                            <i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}" size="12"></i>
                        </button>` : ''}
                        <span class="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">AVL</span>
                    </div>
                </div>
            </td>`;

        for (let i = 0; i < window.daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = window.getLocalYMD(cur);
            const live = window.liveInventory[dateStr]?.[room] !== undefined ? window.liveInventory[dateStr][room] : 0;
            const otaAvail = window.masterPricing?.timeline?.[dateStr]?.otaOverrides?.[`${room}_avail`];
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

        // B. BASE RATE ROW
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

            const isMinArr = !!data.min_arr;
            const minVal = data.min !== "" ? data.min : (data.min_arr ? `${data.min_arr}▸` : "");
            const maxVal = data.max !== "" ? data.max : "";

            let cellClass = "rate-cell-container p-0 border-r border-slate-200 text-center relative ";
            if (isStopped) cellClass += "rate-cell-stopped ";
            else if (isPinned) cellClass += "rate-cell-pinned !bg-amber-100 ";

            const showTop = density === 'minmax' || density === 'full';
            const showBottom = density === 'full';
            const unifiedPillHtml = window.getUnifiedRestrictionBadgeHtml(data.cta, data.ctd, data.stopSell);

            trRate += `<td class="${cellClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}')" onmouseenter="window.showCmTooltip(event, '${displayName} | ${dateStr}\\nPrice: ฿${displayPrice || '--'}${isPinned ? ' (Custom Override - Double-click to unlock)' : ''}\\nMin: ${minVal || '--'}, Max: ${maxVal || '--'}')" onmouseleave="window.hideCmTooltip()">
                ${showTop ? `
                <div class="flex items-center w-full h-[14px] border-b border-slate-200/70 overflow-hidden leading-none" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; width: 100% !important;">
                    <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;" class="cell-min-input text-center bg-transparent border-none text-[8px] font-black ${isMinArr ? 'text-amber-600' : 'text-slate-600'} outline-none" value="${minVal}" placeholder="-" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value)" title="Min Stay (${isMinArr ? 'On Arrival' : 'Through'})">
                    <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; border-left: 1px solid rgba(226, 232, 240, 0.8) !important;" class="cell-max-input text-center bg-transparent border-none text-[8px] text-slate-400 outline-none" value="${maxVal}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value)" title="Max Stay">
                </div>` : ''}

                <div class="${density === 'compact' ? 'h-[24px]' : 'h-[17px]'} flex items-center justify-center">
                    <input type="number" step="any" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_std" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] ${isPinned ? '!text-amber-900 font-black' : 'text-slate-800'} px-0" value="${displayPrice}" onfocus="this.select()" onkeydown="if(event.key==='Enter' && event.altKey){ event.preventDefault(); window.handleCellPriceChange(event, '${dateStr}', '${room}', true); } else if(event.key==='Enter'){ event.preventDefault(); window.handleCellPriceChange(event, '${dateStr}', '${room}', false); }" onchange="window.handleCellPriceChange(event, '${dateStr}', '${room}', false)">
                </div>

                ${showBottom ? `
                <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[11px] pb-0.5">
                    <button onclick="window.cycleUnifiedRestriction('${dateStr}', '${room}')" class="cursor-pointer w-full flex items-center justify-center" title="Cycle Restriction: Open -> CTA -> CTD -> Both -> Stop">
                        ${unifiedPillHtml}
                    </button>
                </div>` : ''}
            </td>`;
        }
        trRate += `</tr>`;
        allRowsHtml += trRate;

        // C. DUAL EVENT RATES: Render ONLY if property has event pricing enabled
        if (isEventsActive && hasEvents && density !== 'avail') {
            let trEvtNonRef = `<tr class="${groupClass} border-b border-pink-200 bg-pink-50/40">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 bg-pink-50/80">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                        <span class="text-[10px] font-black text-pink-800 truncate">EVT Non-Ref</span>
                        <span class="text-[7px] font-black uppercase text-pink-700 bg-pink-100 px-1 py-0.5 rounded border border-pink-300">EVT BASE</span>
                    </div>
                </td>`;

            for (let i = 0; i < window.daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = window.getLocalYMD(cur);
                const data = window.getCellData(dateStr, room);
                const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                const roomObj = dayObj[room] || {};
                const evtRestr = dayObj.evtRestrictions || {};

                const isPinnedFmp = !!data.isOverride?.fmp;
                const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
                const displayFmp = data.fmp !== "" && !isNaN(data.fmp) ? window.formatDisplay(data.fmp * mult) : "";

                const evtMin = roomObj.evt_min !== undefined && roomObj.evt_min !== "" ? roomObj.evt_min : (evtRestr.min || "");
                const evtMinArr = roomObj.evt_min_arr !== undefined && roomObj.evt_min_arr !== "" ? roomObj.evt_min_arr : (evtRestr.min_arr || "");
                const evtMax = roomObj.evt_max !== undefined && roomObj.evt_max !== "" ? roomObj.evt_max : (evtRestr.max || "");
                const isEvtMinArr = !!evtMinArr;
                const displayEvtMin = evtMin !== "" ? evtMin : (evtMinArr ? `${evtMinArr}▸` : "");

                const evtCta = roomObj.evt_cta !== undefined ? !!roomObj.evt_cta : !!evtRestr.cta;
                const evtCtd = roomObj.evt_ctd !== undefined ? !!roomObj.evt_ctd : !!evtRestr.ctd;
                const isEvtStop = !!(roomObj.evt_stop || roomObj.evt_stopSell);

                let minDiff = window.getNearestEvent ? window.getNearestEvent(window.parseYMD(dateStr)) : 999;
                let peakBg = minDiff === 0 ? 'bg-amber-100/70' : (Math.abs(minDiff) <= 2 ? 'bg-pink-100/50' : '');

                let cellClass = `rate-cell-container p-0 border-r border-pink-200 text-center relative ${peakBg} `;
                if (isEvtStop) cellClass += "rate-cell-stopped ";
                else if (isPinnedFmp) cellClass += "rate-cell-pinned ";

                const showTop = density === 'minmax' || density === 'full';
                const showBottom = density === 'full';
                const evtPillHtml = window.getUnifiedRestrictionBadgeHtml(evtCta, evtCtd, isEvtStop);

                trEvtNonRef += `<td class="${cellClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}', null, true)" onmouseenter="window.showCmTooltip(event, '${displayName} | EVT Non-Ref\\nPrice: ฿${displayFmp || '--'}\\nMin: ${displayEvtMin || '--'}, Max: ${evtMax || '--'}')" onmouseleave="window.hideCmTooltip()">
                    ${showTop ? `
                    <div class="flex items-center w-full h-[14px] border-b border-pink-200/80 overflow-hidden leading-none" style="display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; width: 100% !important;">
                        <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;" class="cell-min-input text-center bg-transparent border-none text-[8px] font-black ${isEvtMinArr ? 'text-amber-600' : 'text-pink-800'} outline-none" value="${displayEvtMin}" placeholder="-" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value, true)" title="Event Min Stay">
                        <input type="text" size="1" style="flex: 1 1 0px !important; width: 0 !important; min-width: 0 !important; max-width: 50% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; border-left: 1px solid rgba(244, 114, 182, 0.6) !important;" class="cell-max-input text-center bg-transparent border-none text-[8px] text-pink-400 outline-none" value="${evtMax}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value, true)" title="Event Max Stay">
                    </div>` : ''}

                    <div class="${density === 'compact' ? 'h-[24px]' : 'h-[17px]'} flex items-center justify-center">
                        <input type="number" step="any" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_fmp" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-pink-800 px-0" value="${displayFmp}" onfocus="this.select()" onchange="window.handleCellEdit('${dateStr}', '${room}', 'fmp', this.value)">
                    </div>

                    ${showBottom ? `
                    <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[11px] pb-0.5">
                        <button onclick="window.cycleUnifiedRestriction('${dateStr}', '${room}', null, true)" class="cursor-pointer w-full flex items-center justify-center" title="Cycle Event Restriction">
                            ${evtPillHtml}
                        </button>
                    </div>` : ''}
                </td>`;
            }
            trEvtNonRef += `</tr>`;
            allRowsHtml += trEvtNonRef;

            // Row C2: EVT Refundable
            let trEvtRef = `<tr class="${groupClass} border-b-2 border-slate-400 bg-pink-100/30">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 bg-pink-100/70">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                        <span class="text-[10px] font-black text-pink-900 truncate">EVT Ref (+%)</span>
                        <span class="text-[7px] font-black uppercase text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded border border-emerald-300">EVT REF</span>
                    </div>
                </td>`;

            for (let i = 0; i < window.daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = window.getLocalYMD(cur);
                const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                const roomObj = dayObj[room] || {};

                const eType = window.pricingRules?.evtRefType || '+%';
                const eVal = window.pricingRules?.evtRefVal !== undefined ? window.pricingRules.evtRefVal : 25;

                let calculatedEvtRef = roomObj.fmp_ref;
                if (calculatedEvtRef === undefined && roomObj.fmp !== undefined && roomObj.fmp !== "") {
                    calculatedEvtRef = window.applyMath(roomObj.fmp, eType, eVal);
                }

                const isPinnedFmpRef = !!roomObj.isOverride?.fmp_ref;
                const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
                const displayFmpRef = calculatedEvtRef !== undefined && calculatedEvtRef !== "" && !isNaN(calculatedEvtRef)
                    ? window.formatDisplay(calculatedEvtRef * mult)
                    : "";

                let minDiff = window.getNearestEvent ? window.getNearestEvent(window.parseYMD(dateStr)) : 999;
                let peakBg = minDiff === 0 ? 'bg-amber-100/80' : (Math.abs(minDiff) <= 2 ? 'bg-pink-100/60' : '');

                let cellClass = `rate-cell-container p-0 border-r border-pink-200 text-center relative ${peakBg} `;
                if (isPinnedFmpRef) cellClass += "rate-cell-pinned ";

                trEvtRef += `<td class="${cellClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}', null, true)" onmouseenter="window.showCmTooltip(event, '${displayName} | EVT Refundable\\nPrice: ฿${displayFmpRef || '--'}')" onmouseleave="window.hideCmTooltip()">
                    <div class="h-[22px] flex items-center justify-center">
                        <input type="number" step="any" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-pink-900 px-0" value="${displayFmpRef}" onfocus="this.select()" onchange="window.handleCellEdit('${dateStr}', '${room}', 'fmp_ref', this.value)">
                    </div>
                </td>`;
            }
            trEvtRef += `</tr>`;
            allRowsHtml += trEvtRef;
        }

        // D. MAPPED RATE PLANS
        if (isExpanded && mappedRates.length > 0 && drill !== 'master' && density !== 'avail') {
            mappedRates.forEach((rate) => {
                const rateSource = rate.rateSource || 'std';
                const isEvtRate = (rateSource === 'evt') || /evt|fmp|event|pkg/i.test(rate.ratePlanTitle || '');
                const info = window.formatCleanRateTitle ? window.formatCleanRateTitle(rate.ratePlanTitle, room) : { planLabel: rate.ratePlanTitle };
                const rChan = rate.channel || info.channel || (window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(rate.ratePlanTitle).channel : 'Direct Website');
                const badge = window.getChannelBadgeHtml ? window.getChannelBadgeHtml(rChan) : '';

                let trOta = `<tr class="bg-indigo-50/40 border-b border-indigo-100">
                    <td class="frozen-col !p-0 z-20 border-r-2 border-slate-400 bg-indigo-50/70">
                        <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left" title="${rate.ratePlanTitle}">
                            <div class="flex items-center gap-1.5 min-w-0 pr-1">
                                ${badge}
                                <div class="flex flex-col min-w-0">
                                    <span class="text-[9px] font-black text-indigo-950 truncate leading-tight">${info.planLabel}</span>
                                    <span class="text-[6.5px] uppercase tracking-widest ${isEvtRate ? 'text-pink-600 font-black' : (rate.policy === 'ref' ? 'text-emerald-700 font-bold' : 'text-slate-500 font-bold')}">${isEvtRate ? 'EVT PKG' : (rate.policy === 'ref' ? 'REF (+%)' : 'NON-REF')}</span>
                                </div>
                            </div>
                            <span class="text-[7px] font-black uppercase text-indigo-600 bg-indigo-100 px-1 py-0.2 rounded shrink-0">OTA</span>
                        </div>
                    </td>`;

                for (let i = 0; i < window.daysToRender; i++) {
                    const cur = new Date(dObj);
                    cur.setUTCDate(cur.getUTCDate() + i);
                    const dateStr = window.getLocalYMD(cur);
                    const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                    const otaOverride = dayObj.otaOverrides?.[rate.ratePlanId];
                    const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;

                    let calculatedRate = otaOverride;
                    if (calculatedRate === undefined) {
                        if (window.computeDynamicPlanRate) {
                            calculatedRate = window.computeDynamicPlanRate(dateStr, room, rate);
                        } else {
                            const roomData = dayObj[room] || {};
                            let basePrice = (isEvtRate && roomData.fmp && hasEvents) ? roomData.fmp : roomData.std;
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

                    let cellOtaClass = "rate-cell-container p-0 border-r border-indigo-100 text-center relative ";
                    if (otaStop) cellOtaClass += "rate-cell-stopped ";
                    else if (otaOverride !== undefined) cellOtaClass += "rate-cell-pinned ";

                    const showTop = density === 'minmax' || density === 'full';
                    const showBottom = density === 'full';
                    const otaPillHtml = window.getUnifiedRestrictionBadgeHtml(otaCta, otaCtd, otaStop);

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
                        <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[10px] pb-0.5">
                            <button onclick="window.cycleUnifiedRestriction('${dateStr}', '${room}', '${rate.ratePlanId}')" class="cursor-pointer w-full flex items-center justify-center" title="Cycle OTA Restriction">
                                ${otaPillHtml}
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
            const gData = window.masterPricing?.timeline?.[dateStr]?.GLOBAL || {};

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

window.shiftTape = (days) => {
    const current = new Date(document.getElementById('tape-start').value + "T12:00:00Z");
    current.setUTCDate(current.getUTCDate() + days);
    document.getElementById('tape-start').value = current.toISOString().split('T')[0];
    window.renderGrid();
};

// --- COMPACT BULK UPDATE ENGINE ---
window.setBulkScopeMode = (mode) => {
    window.bulkScopeMode = mode;
    const btnAnchors = document.getElementById('qb-scope-anchors');
    const btnAll = document.getElementById('qb-scope-all');
    if (btnAnchors && btnAll) {
        if (mode === 'anchors') {
            btnAnchors.className = "px-2 py-0.5 rounded cursor-pointer transition-colors bg-indigo-600 text-white shadow-xs font-black";
            btnAll.className = "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-400 hover:text-white";
        } else {
            btnAnchors.className = "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-400 hover:text-white";
            btnAll.className = "px-2 py-0.5 rounded cursor-pointer transition-colors bg-indigo-600 text-white shadow-xs font-black";
        }
    }
    window.renderBulkGrid();
};

window.toggleQuickBulk = (forceClose = false) => {
    const panel = document.getElementById('quick-bulk-panel');
    if (!panel) return;
    if (!forceClose && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        
        const today = new Date();
        const qbStart = document.getElementById('qb-start');
        const qbEnd = document.getElementById('qb-end');
        if (qbStart && !qbStart.value) qbStart.value = window.getLocalYMD(today);
        if (qbEnd && !qbEnd.value) {
            const next30 = new Date(today);
            next30.setDate(today.getDate() + 30);
            qbEnd.value = window.getLocalYMD(next30);
        }

        window.renderBulkGrid();
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
};

window.cycleBulkRowPill = (btn) => {
    if (!btn) return;
    const states = ['open', 'cta', 'ctd', 'both', 'stop'];
    const cur = btn.dataset.state || 'open';
    const next = states[(states.indexOf(cur) + 1) % states.length];
    btn.dataset.state = next;

    const labels = {
        open: '<span class="hidden sm:inline">Open</span><span class="sm:hidden">Open</span>',
        cta: '<span class="hidden sm:inline">Closed to Arrival</span><span class="sm:hidden">CTA</span>',
        ctd: '<span class="hidden sm:inline">Closed to Departure</span><span class="sm:hidden">CTD</span>',
        both: '<span class="hidden sm:inline">Closed to Both</span><span class="sm:hidden">CTB</span>',
        stop: '<span class="hidden sm:inline">Stop Sell</span><span class="sm:hidden">Stop</span>'
    };

    const classes = {
        open: 'bg-slate-800 text-slate-400 border-slate-700',
        cta: 'bg-amber-400/20 text-amber-300 border-amber-500',
        ctd: 'bg-sky-400/20 text-sky-300 border-sky-500',
        both: 'bg-purple-400/20 text-purple-300 border-purple-500',
        stop: 'bg-rose-600 text-white border-rose-500'
    };

    btn.className = `qb-val-pill w-full sm:w-36 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-xs ${classes[next]}`;
    btn.innerHTML = labels[next];
};

window.renderBulkGrid = () => {
    const qbBody = document.getElementById('qb-grid-body');
    if (!qbBody) return;

    const inptCls = "input-base !py-1 !px-1.5 text-center text-xs w-full font-black bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:bg-slate-800 focus:border-indigo-500";
    const pillBtn = `<button type="button" data-state="open" onclick="window.cycleBulkRowPill(this)" class="qb-val-pill w-full sm:w-36 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-xs bg-slate-800 text-slate-400 border-slate-700">Open</button>`;

    let html = '';

    // 1. GLOBAL Row (Restrictions only, rate disabled)
    html += `
    <tr class="bg-slate-950/80 font-black text-slate-200" data-type="global" data-id="GLOBAL">
        <td class="p-2 border-r border-slate-800 font-black uppercase text-amber-400">
            🌍 GLOBAL (All Rooms - Restrictions)
        </td>
        <td class="p-1 border-r border-slate-800 text-center">
            <input type="text" disabled placeholder="--" class="${inptCls} !bg-slate-950 !text-slate-600 cursor-not-allowed">
        </td>
        <td class="p-1 border-r border-slate-800 text-center">
            <input type="text" class="${inptCls} qb-val-min text-amber-400" placeholder="e.g. 3 or 3▸" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);">
        </td>
        <td class="p-1 border-r border-slate-800 text-center">
            <input type="text" class="${inptCls} qb-val-max text-slate-300" placeholder="e.g. 14 or 14▸" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);">
        </td>
        <td class="p-1 text-center">
            ${pillBtn}
        </td>
    </tr>`;

    // 2. Room Rows (Anchors Only vs All Rooms)
    let roomsToRender = [...(window.roomTypes || [])];
    const anchorP = window.pricingRules?.anchorPrivate || window.savedAutofillBaselines?.anchor_p || '';
    const anchorD = window.pricingRules?.anchorDorm || window.savedAutofillBaselines?.anchor_d || '';

    if (window.bulkScopeMode === 'anchors') {
        roomsToRender = [anchorP, anchorD].filter(Boolean);
        if (roomsToRender.length === 0 && (window.roomTypes || []).length > 0) {
            roomsToRender = [window.roomTypes[0]];
        }
        roomsToRender = [...new Set(roomsToRender)];
    }

    roomsToRender.forEach(r => {
        const displayName = window.displayAbbrev[r] || r;
        const isAnchor = (r === anchorP || r === anchorD);
        html += `
        <tr class="bg-slate-900/40 hover:bg-slate-800/80 text-white transition-colors" data-type="room" data-id="${r}">
            <td class="p-2 border-r border-slate-800 font-bold text-slate-200 truncate" title="${r}">
                ${displayName} ${isAnchor ? '<span class="text-[8px] font-black uppercase bg-indigo-900/70 border border-indigo-700 text-indigo-300 px-1 py-0.2 rounded ml-1">ANCHOR</span>' : ''}
            </td>
            <td class="p-1 border-r border-slate-800 text-center">
                <input type="number" step="any" class="${inptCls} qb-val-rate !text-emerald-400" placeholder="--">
            </td>
            <td class="p-1 border-r border-slate-800 text-center">
                <input type="text" class="${inptCls} qb-val-min text-amber-400" placeholder="e.g. 3 or 3▸" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);">
            </td>
            <td class="p-1 border-r border-slate-800 text-center">
                <input type="text" class="${inptCls} qb-val-max text-slate-300" placeholder="e.g. 14 or 14▸" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);">
            </td>
            <td class="p-1 text-center">
                ${pillBtn}
            </td>
        </tr>`;
    });

    qbBody.innerHTML = html;
};

window.applyBulkGrid = (isClear = false) => {
    const s = document.getElementById('qb-start')?.value;
    const e = document.getElementById('qb-end')?.value;
    if (!s || !e) return window.customAlert("Please select Start and End dates.");
    if (s > e) return window.customAlert("End date must be on or after Start date.");

    const sU = window.parseYMD(s), eU = window.parseYMD(e);
    const rows = document.querySelectorAll('#qb-grid-body tr');

    const roomUpdates = [];
    let globalRule = null;

    rows.forEach(tr => {
        const type = tr.dataset.type;
        const id = tr.dataset.id;

        const rateInput = tr.querySelector('.qb-val-rate');
        const minInput = tr.querySelector('.qb-val-min');
        const maxInput = tr.querySelector('.qb-val-max');
        const pill = tr.querySelector('.qb-val-pill');

        const rate = (rateInput && rateInput.value.trim() !== "") ? parseFloat(rateInput.value) : undefined;
        
        let min = undefined;
        let min_arr = undefined;
        if (minInput && minInput.value.trim() !== "") {
            const rawMin = minInput.value.trim();
            if (/(\d+)\s*(a|>|▸)/i.test(rawMin)) {
                const match = rawMin.match(/(\d+)/);
                min_arr = match ? parseInt(match[1], 10) : undefined;
            } else {
                const match = rawMin.match(/(\d+)/);
                min = match ? parseInt(match[1], 10) : undefined;
            }
        }

        let max = undefined;
        let max_arr = undefined;
        if (maxInput && maxInput.value.trim() !== "") {
            const rawMax = maxInput.value.trim();
            if (/(\d+)\s*(a|>|▸)/i.test(rawMax)) {
                const match = rawMax.match(/(\d+)/);
                max_arr = match ? parseInt(match[1], 10) : undefined;
            } else {
                const match = rawMax.match(/(\d+)/);
                max = match ? parseInt(match[1], 10) : undefined;
            }
        }

        const pillState = pill?.dataset.state || 'open';

        let cta = undefined;
        let ctd = undefined;
        let stop = undefined;

        if (pillState === 'cta') { cta = true; ctd = false; stop = false; }
        else if (pillState === 'ctd') { cta = false; ctd = true; stop = false; }
        else if (pillState === 'both') { cta = true; ctd = true; stop = false; }
        else if (pillState === 'stop') { cta = false; ctd = false; stop = true; }

        const rule = { id, rate, min, min_arr, max, max_arr, cta, ctd, stop, pillState };

        if (type === 'global') {
            globalRule = rule;
        } else if (type === 'room') {
            roomUpdates.push(rule);
        }
    });

    const hasAnyInput = isClear 
        || (globalRule && (globalRule.min !== undefined || globalRule.max !== undefined || globalRule.min_arr !== undefined || globalRule.max_arr !== undefined || globalRule.pillState !== 'open'))
        || roomUpdates.some(r => r.rate !== undefined || r.min !== undefined || r.max !== undefined || r.min_arr !== undefined || r.max_arr !== undefined || r.pillState !== 'open');

    if (!hasAnyInput) {
        return window.customAlert("Enter at least one value or select a restriction pill state to apply across the dates.");
    }

    for (let d = sU; d <= eU; d += 86400000) {
        let dateStr = window.getLocalYMD(new Date(d));
        window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
        const dObj = window.masterPricing.timeline[dateStr];

        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);

        // 1. Apply Global Restrictions
        if (globalRule) {
            dObj['GLOBAL'] = dObj['GLOBAL'] || { isOverride: {} };
            if (isClear) {
                delete dObj['GLOBAL'].min;
                delete dObj['GLOBAL'].max;
                delete dObj['GLOBAL'].min_arr;
                delete dObj['GLOBAL'].max_arr;
                delete dObj['GLOBAL'].cta;
                delete dObj['GLOBAL'].ctd;
                delete dObj['GLOBAL'].stop;
                delete dObj['GLOBAL'].stopSell;
                dObj['GLOBAL'].isOverride = {};
            } else {
                if (globalRule.min !== undefined) { dObj['GLOBAL'].min = globalRule.min; dObj['GLOBAL'].isOverride.min = true; delete dObj['GLOBAL'].min_arr; }
                if (globalRule.min_arr !== undefined) { dObj['GLOBAL'].min_arr = globalRule.min_arr; dObj['GLOBAL'].isOverride.min_arr = true; delete dObj['GLOBAL'].min; }
                if (globalRule.max !== undefined) { dObj['GLOBAL'].max = globalRule.max; dObj['GLOBAL'].isOverride.max = true; delete dObj['GLOBAL'].max_arr; }
                if (globalRule.max_arr !== undefined) { dObj['GLOBAL'].max_arr = globalRule.max_arr; dObj['GLOBAL'].isOverride.max_arr = true; delete dObj['GLOBAL'].max; }
                
                if (globalRule.pillState !== 'open') {
                    dObj['GLOBAL'].cta = globalRule.cta;
                    dObj['GLOBAL'].ctd = globalRule.ctd;
                    dObj['GLOBAL'].stop = globalRule.stop;
                    dObj['GLOBAL'].stopSell = globalRule.stop;
                    dObj['GLOBAL'].isOverride.cta = true;
                    dObj['GLOBAL'].isOverride.ctd = true;
                    dObj['GLOBAL'].isOverride.stop = true;
                }
            }
        }

        // 2. Apply Room-specific lines
        roomUpdates.forEach(r => {
            const rt = r.id;
            dObj[rt] = dObj[rt] || { isOverride: {} };
            const rData = dObj[rt];
            rData.isOverride = rData.isOverride || {};

            if (isClear) {
                delete rData.std;
                delete rData.min;
                delete rData.max;
                delete rData.min_arr;
                delete rData.max_arr;
                delete rData.cta;
                delete rData.ctd;
                delete rData.stop;
                delete rData.stopSell;
                rData.isOverride = {};
            } else {
                if (r.rate !== undefined) {
                    const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
                    rData.std = window.roundCurrency(r.rate / mult);
                    rData.isOverride.std = true;
                    if (window.rippleDay) window.rippleDay(dateStr, rt);
                }
                if (r.min !== undefined) {
                    rData.min = r.min;
                    delete rData.min_arr;
                    rData.isOverride.min = true;
                    delete rData.isOverride.min_arr;
                }
                if (r.min_arr !== undefined) {
                    rData.min_arr = r.min_arr;
                    delete rData.min;
                    rData.isOverride.min_arr = true;
                    delete rData.isOverride.min;
                }
                if (r.max !== undefined) {
                    rData.max = r.max;
                    delete rData.max_arr;
                    rData.isOverride.max = true;
                    delete rData.isOverride.max_arr;
                }
                if (r.max_arr !== undefined) {
                    rData.max_arr = r.max_arr;
                    delete rData.max;
                    rData.isOverride.max_arr = true;
                    delete rData.isOverride.max;
                }
                if (r.pillState !== 'open') {
                    rData.cta = r.cta;
                    rData.ctd = r.ctd;
                    rData.stop = r.stop;
                    rData.stopSell = r.stop;
                    rData.isOverride.cta = true;
                    rData.isOverride.ctd = true;
                    rData.isOverride.stop = true;
                }
            }
        });
    }

    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();

    if (!isClear) {
        document.querySelectorAll('#qb-grid-body input[type="number"], #qb-grid-body input[type="text"]').forEach(i => { i.value = ''; });
        document.querySelectorAll('.qb-val-pill').forEach(btn => {
            btn.dataset.state = 'open';
            btn.className = "qb-val-pill w-full sm:w-36 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-xs bg-slate-800 text-slate-400 border-slate-700";
            btn.innerHTML = "Open";
        });
    }

    window.customAlert(isClear 
        ? "Overrides cleared across the selected date range!" 
        : `Bulk updates applied successfully across ${s} → ${e}!\n\nClick "SAVE & SYNC" to push changes to Channex.`);
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
            window.isUserTyping = true;
            clearTimeout(window.typingTimeout);
            window.typingTimeout = setTimeout(() => { window.isUserTyping = false; }, 800);

            const inputs = Array.from(document.querySelectorAll(targetSelector)).filter(i => !i.disabled && (i.offsetParent !== null || i.getClientRects().length > 0));
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
