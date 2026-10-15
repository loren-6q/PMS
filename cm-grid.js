// ==========================================================================
// CHANNEL MANAGER CALENDAR GRID & INVENTORY (cm-grid.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-grid.js
// ==========================================================================

window.drillLevel = window.drillLevel || 'room'; // 'master' | 'room' | 'event' | 'rates'
window.viewDensity = window.viewDensity || 'full'; // 'avail' | 'compact' | 'minmax' | 'full'
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
            rData.std = "";
            rData.fmp = "";
        }
        if (window.healDay) window.healDay(dateStr);
    }
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.updateDOMCell = (dateStr, room) => {
    const bId = `inp_${dateStr}_${room.replace(/\s+/g, '')}`;
    const data = window.getCellData(dateStr, room);
    const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
    const isDirtyDate = window.dirtyDates.has(dateStr);
    const isSyncedDate = window.syncedDates.has(dateStr);

    const applyState = (el, isBool = false, targetId = null, targetField = null) => {
        if (!el) return;
        let target = isBool ? el.closest('td') : el;
        if (!target) return;

        let isActuallyDirty = false;
        if (targetId && targetField && window.dirtyFields?.[dateStr]?.[targetId]?.has(targetField)) {
            isActuallyDirty = true;
        } else if (isDirtyDate && !targetId) {
            isActuallyDirty = true;
        }

        if (isActuallyDirty) {
            if (isBool) target.classList.add('override-cell-highlight', '!bg-orange-100');
            else target.classList.add('is-dirty', '!bg-orange-50');
            target.classList.remove('is-synced');
        } else if (isSyncedDate) {
            target.classList.add('is-synced');
            if (isBool) target.classList.remove('override-cell-highlight', '!bg-orange-100');
            else target.classList.remove('is-dirty', '!bg-orange-50');
        } else {
            target.classList.remove('is-dirty', 'is-synced', 'override-cell-highlight', '!bg-orange-100', '!bg-orange-50');
        }
    };

    if (room !== 'GLOBAL') {
        const elStd = document.getElementById(`${bId}_std`);
        if (elStd) {
            elStd.value = data.std !== "" && !isNaN(data.std) ? window.formatDisplay(data.std * mult) : "";
            const td = elStd.closest('td');
            if (td) {
                if (data.isOverride.std) td.classList.add('rate-cell-pinned');
                else td.classList.remove('rate-cell-pinned');

                if (data.stopSell) td.classList.add('rate-cell-stopped');
                else td.classList.remove('rate-cell-stopped');
            }
            applyState(elStd, false, room, 'rate');
        }
    }
};

window.calculateLiveInventory = () => {
    const oldInventoryStr = JSON.stringify(window.liveInventory || {});
    window.liveInventory = {};
    window.viewDates = [];

    const container = document.getElementById('grid-container');
    const availableWidth = container ? container.clientWidth - 185 : (window.innerWidth - 185);
    window.daysToRender = Math.max(30, Math.floor(availableWidth / 31));

    const startStr = document.getElementById('tape-start')?.value || new Date().toISOString().split('T')[0];
    const today = new Date(startStr + "T12:00:00Z");

    for (let i = 0; i < window.daysToRender; i++) {
        let d = new Date(today);
        d.setUTCDate(d.getUTCDate() + i);
        let dStr = window.getLocalYMD(d);
        window.viewDates.push(dStr);

        window.liveInventory[dStr] = {};
        (window.roomTypes || []).forEach(t => {
            window.liveInventory[dStr][t] = window.totalRoomsByType[t] || 0;
        });
    }

    const activeStaff = (window.staff || []).filter(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        const isOcc = window.isOccupyingBooking
            ? window.isOccupyingBooking(s.status)
            : (s.status !== 'cancelled' && s.status !== 'noshow' && s.status !== 'unconfirmed' && s.status !== 'charged');
        return sProp === window.currentPropertyId && isOcc;
    });

    activeStaff.forEach(s => {
        if (!s.checkIn || !s.checkOut) return;
        const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
        const isUnassigned = rList.length === 0 || rList[0] === "";
        if (s.status === 'special' && isUnassigned) return;

        const inMs = window.parseYMD(s.checkIn);
        const outMs = window.parseYMD(s.checkOut);
        const typesToDeduct = [];

        if (!isUnassigned) {
            rList.forEach(rid => {
                const uiId = window.dbToUiRoom(rid);
                const roomDef = (window.hotelRooms || []).find(hr => hr.id === uiId || hr.id === rid);
                if (roomDef && roomDef.type) typesToDeduct.push(roomDef.type);
            });
        } else if (s.bookedType) {
            const inferred = window.resolveRoomCategory(s.bookedType);
            if (inferred) {
                let dedCount = inferred.toLowerCase().includes('dorm') ? (s.pax || 1) : Math.max(1, rList.length);
                for (let k = 0; k < dedCount; k++) typesToDeduct.push(inferred);
            }
        }

        window.viewDates.forEach(dStr => {
            const dMs = window.parseYMD(dStr);
            if (dMs >= inMs && dMs < outMs) {
                typesToDeduct.forEach(t => {
                    if (window.liveInventory[dStr] && window.liveInventory[dStr][t] !== undefined && window.liveInventory[dStr][t] > 0) {
                        window.liveInventory[dStr][t]--;
                    }
                });
            }
        });
    });

    if (oldInventoryStr !== "{}" && oldInventoryStr !== "undefined") {
        try {
            const oldInvObj = JSON.parse(oldInventoryStr);
            let changesFound = false;

            Object.keys(window.liveInventory).forEach(dStr => {
                Object.keys(window.liveInventory[dStr]).forEach(room => {
                    const oldVal = oldInvObj[dStr] ? oldInvObj[dStr][room] : null;
                    const newVal = window.liveInventory[dStr][room];

                    if (oldVal !== null && oldVal !== undefined && newVal < oldVal) {
                        window.dirtyDates.add(dStr);
                        window.syncedDates.delete(dStr);
                        window.dirtyFields = window.dirtyFields || {};
                        window.dirtyFields[dStr] = window.dirtyFields[dStr] || {};
                        window.dirtyFields[dStr][room] = window.dirtyFields[dStr][room] || new Set();
                        window.dirtyFields[dStr][room].add('avail');
                        changesFound = true;
                    }
                });
            });

            if (changesFound) {
                window.markUnsavedChanges();
            }
        } catch (e) {
            console.error("Error parsing old inventory:", e);
        }
    }
};

window.renderGrid = () => {
    const startStr = document.getElementById('tape-start')?.value;
    if (!startStr) return;

    window.calculateLiveInventory();

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    let dObj = new Date(startStr + "T12:00:00Z");
    const hasEvents = (window.eventDates || []).length > 0;
    const drill = window.drillLevel || 'room';
    const density = window.viewDensity || 'full';

    // 1. HEADER ROW (Single clean 140px Room/Rate header, Metric column removed)
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

    // 2. ROOM SELECTION (Master shows Private & Dorm Anchor; Event shows only rooms with EVT rates)
    let targetRooms = [...(window.roomTypes || [])];
    const anchorPrivate = window.savedAutofillBaselines?.anchor_p || document.getElementById('w-anchor-private')?.value;
    const anchorD = window.savedAutofillBaselines?.anchor_d || document.getElementById('w-anchor-dorm')?.value;

    if (drill === 'master') {
        targetRooms = [anchorPrivate, anchorD].filter(Boolean);
        if (targetRooms.length === 0 && (window.roomTypes || []).length > 0) {
            targetRooms = [window.roomTypes[0]];
        }
        targetRooms = [...new Set(targetRooms)];
    } else if (drill === 'event') {
        // In Event Depth, show rooms that have mapped event rate plans (or fall back to all rooms if none mapped yet)
        const roomsWithEvt = (window.roomTypes || []).filter(r => {
            const rates = (window.channexRateMap || []).filter(m => window.categoryResolver(m.pmsCategory) === r);
            return rates.some(rate => (rate.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(rate.ratePlanTitle || ''));
        });
        if (roomsWithEvt.length > 0) {
            targetRooms = roomsWithEvt;
        }
    }

    let allRowsHtml = '';

    targetRooms.forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'room-group-even' : 'room-group-odd';
        const displayName = window.displayAbbrev[room] || room;
        const allMappedRates = window.channexRateMap ? window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === room) : [];

        // Apply Depth: Event Filters (Only EVT rate plans appear under each room)
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
                        ${drill !== 'master' && drill !== 'event' && mappedRates.length > 0 && density !== 'avail' ? `
                        <button onclick="window.toggleRoomExpand('${room}')" class="px-1 py-0.5 rounded bg-slate-200 hover:bg-indigo-100 text-[9px] text-slate-700 font-bold transition-colors cursor-pointer" title="Toggle rate plan breakdown">
                            ${isExpanded ? '▼' : '▶'} ${mappedRates.length}
                        </button>` : ''}
                        ${drill === 'event' ? '<span class="text-[7px] font-black uppercase text-pink-600 bg-pink-100 px-1 py-0.2 rounded">EVT</span>' : ''}
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

        // B. MASTER ROOM DRIVER / BASE (STANDARD) RATE (MULTI-ZONE CELL)
        let trRate = `<tr class="${groupClass} border-b-2 border-slate-400">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                    <span class="text-[10px] font-black text-slate-700 truncate">${drill === 'event' ? 'Std Base' : 'Base'}</span>
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

            trRate += `<td class="${cellClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}')" onmouseenter="window.showCmTooltip(event, '${displayName} | ${dateStr}\\nPrice: ฿${displayPrice || '--'}${isPinned ? ' (Custom Override - Double-click to unlock)' : ''}\\nMin: ${minVal || '--'}${isMinArr ? ' (Arrival)' : ''}, Max: ${maxVal || '--'}\\nStop: ${isStopped ? 'YES' : 'NO'}')" onmouseleave="window.hideCmTooltip()">
                ${showTop ? `
                <!-- TOP: Two clearly separated columns for Min and Max Stay -->
                <div class="grid grid-cols-2 px-0.5 leading-none h-[11px] pt-0.5 border-b border-slate-100">
                    <input type="text" class="cell-min-input w-full bg-transparent border-none text-left p-0 text-[8px] font-black ${isMinArr ? 'text-amber-600' : 'text-slate-500'} outline-none" value="${minVal}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value)" title="Min Stay (type number, or 'a' or '>' for On Arrival)">
                    <input type="text" class="cell-max-input w-full bg-transparent border-none text-right p-0 text-[8px] text-slate-400 outline-none" value="${maxVal}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value)" title="Max Stay">
                </div>` : ''}

                <!-- MID: Clickable Price Input -->
                <div class="${density === 'compact' ? 'h-[24px]' : 'h-[17px]'} flex items-center justify-center">
                    <input type="number" step="any" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_std" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-slate-800 px-0" value="${displayPrice}" onfocus="this.select()" onkeydown="if(event.key==='Enter' && event.altKey){ event.preventDefault(); window.handleCellPriceChange(event, '${dateStr}', '${room}', true); } else if(event.key==='Enter'){ event.preventDefault(); window.handleCellPriceChange(event, '${dateStr}', '${room}', false); }" onchange="window.handleCellPriceChange(event, '${dateStr}', '${room}', false)">
                </div>

                ${showBottom ? `
                <!-- BOTTOM: A/D/B cycle badge & Stop-Sell trigger -->
                <div class="flex items-center justify-between px-0.5 text-[7px] leading-none h-[11px] pb-0.5">
                    <button onclick="window.handleCellCtaCtdCycle('${dateStr}', '${room}')" class="cursor-pointer" title="Click to cycle Closed to Arrival (A), Departure (D), or Both (B)">
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

        // C. MAPPED RATE PLANS (IF EXPANDED IN ROOM, EVENT, OR ALL-RATES MODE)
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
                    if (otaCta && otaCtd) otaCtaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-purple-200 text-purple-900 leading-none" title="Closed to Both (BTH)">B</span>';
                    else if (otaCta) otaCtaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-amber-200 text-amber-900 leading-none" title="Closed to Arrival (CTA)">A</span>';
                    else if (otaCtd) otaCtaBadge = '<span class="px-1 py-0.2 rounded text-[8px] font-black bg-sky-200 text-sky-900 leading-none" title="Closed to Departure (CTD)">D</span>';

                    let cellOtaClass = "rate-cell-container p-0 border-r border-indigo-100 text-center relative ";
                    if (otaStop) cellOtaClass += "rate-cell-stopped ";
                    else if (otaOverride !== undefined) cellOtaClass += "rate-cell-pinned ";

                    const showTop = density === 'minmax' || density === 'full';
                    const showBottom = density === 'full';

                    trOta += `<td class="${cellOtaClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}', '${rate.ratePlanId}')">
                        ${showTop ? `
                        <!-- TOP: Two clearly separated columns for OTA Min & Max -->
                        <div class="grid grid-cols-2 px-0.5 leading-none h-[10px] pt-0.5 border-b border-indigo-100/60">
                            <input type="text" class="cell-min-input w-full bg-transparent border-none text-left p-0 text-[7px] text-indigo-700 outline-none font-bold" value="${otaMin || ''}" placeholder="-" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'min', this.value, '${rateSource}')" title="Min Stay">
                            <input type="text" class="cell-max-input w-full bg-transparent border-none text-right p-0 text-[7px] text-indigo-400 outline-none" value="${otaMax || ''}" placeholder="-" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'max', this.value, '${rateSource}')" title="Max Stay">
                        </div>` : ''}
                        <div class="${density === 'compact' ? 'h-[22px]' : 'h-[16px]'} flex items-center justify-center">
                            <input type="number" step="any" class="cell-price-text w-full text-center outline-none bg-transparent font-bold text-[10px] ${otaOverride !== undefined ? '!text-pink-600 font-black' : 'text-indigo-900'} px-0" value="${calculatedRate !== undefined ? window.formatDisplay(calculatedRate * mult) : ''}" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'rate', this.value, '${rateSource}')">
                        </div>
                        ${showBottom ? `
                        <div class="flex items-center justify-between px-0.5 text-[7px] leading-none h-[10px] pb-0.5">
                            <button onclick="window.handleCellCtaCtdCycle('${dateStr}', '${room}', '${rate.ratePlanId}')" class="cursor-pointer" title="Click to cycle Closed to Arrival (A), Departure (D), or Both (B)">
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
                <div class="grid grid-cols-2 px-0.5 py-1 gap-0.5">
                    <input type="text" class="w-full bg-slate-700 rounded text-center text-[8px] font-black text-white p-0 outline-none" value="${gData.min || ''}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'min', this.value)" title="Global Min Stay">
                    <input type="text" class="w-full bg-slate-700 rounded text-center text-[8px] font-black text-slate-400 p-0 outline-none" value="${gData.max || ''}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'max', this.value)" title="Global Max Stay">
                </div>
            </td>`;
        }
        globalTr += `</tr>`;
        allRowsHtml += globalTr;
    }

    body.innerHTML = allRowsHtml;
    if (window.lucide) window.lucide.createIcons();
};

window.handleAvailEdit = (dateStr, room, value) => {
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.dirtyFields = window.dirtyFields || {};
    window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};
    window.dirtyFields[dateStr][room] = window.dirtyFields[dateStr][room] || new Set();
    window.dirtyFields[dateStr][room].add('avail');

    if (window.channexRateMap) {
        let affectedRates = window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === room);
        affectedRates.forEach(rate => {
            window.dirtyFields[dateStr][rate.ratePlanId] = window.dirtyFields[dateStr][rate.ratePlanId] || new Set();
            window.dirtyFields[dateStr][rate.ratePlanId].add('avail');
        });
    }

    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};

    if (value === "") delete window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`];
    else window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`] = parseInt(value, 10);

    window.updateDOMCell(dateStr, room);
    window.markUnsavedChanges();
};

window.handleCellEdit = (dateStr, room, field, value) => {
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);

    window.dirtyFields = window.dirtyFields || {};
    window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};

    // Hybrid Min Stay vs Min on Arrival parser (e.g. '3a', '3>', '3▸' -> min_arr)
    if (field === 'min_hybrid') {
        const valStr = String(value || '').trim();
        const isArr = /[a>▸]/i.test(valStr);
        const cleanNum = valStr.replace(/[^0-9]/g, '');

        window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
        window.masterPricing.timeline[dateStr][room] = window.masterPricing.timeline[dateStr][room] || { isOverride: {} };
        const data = window.masterPricing.timeline[dateStr][room];

        if (cleanNum === "") {
            delete data.isOverride.min;
            delete data.isOverride.min_arr;
            data.min = "";
            data.min_arr = "";
        } else if (isArr) {
            data.min_arr = parseInt(cleanNum, 10);
            data.min = "";
            data.isOverride.min_arr = true;
            delete data.isOverride.min;
        } else {
            data.min = parseInt(cleanNum, 10);
            data.min_arr = "";
            data.isOverride.min = true;
            delete data.isOverride.min_arr;
        }

        window.updateDOMCell(dateStr, room);
        window.markUnsavedChanges();
        if (window.renderGrid) window.renderGrid();
        return;
    }

    if (window.channexRateMap) {
        let affectedRates = room === 'GLOBAL' ? window.channexRateMap : window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === room);
        affectedRates.forEach(rate => {
            window.dirtyFields[dateStr][rate.ratePlanId] = window.dirtyFields[dateStr][rate.ratePlanId] || new Set();
            let fieldMap = (field === 'std' || field === 'fmp') ? 'rate' : (field === 'min_arr' ? 'min' : field);
            window.dirtyFields[dateStr][rate.ratePlanId].add(fieldMap);
        });
    }

    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr][room] = window.masterPricing.timeline[dateStr][room] || { isOverride: {} };

    const data = window.masterPricing.timeline[dateStr][room];

    if (value === "") {
        delete data.isOverride[field];
        if (field === 'cta' || field === 'ctd' || field === 'stopSell') data[field] = false;
        else data[field] = "";
    } else {
        data.isOverride[field] = true;
        const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
        if (field === 'std' || field === 'fmp') data[field] = window.roundCurrency(parseFloat(value) / mult);
        else if (field === 'cta' || field === 'ctd' || field === 'stopSell') data[field] = value;
        else data[field] = parseInt(value, 10);
    }

    let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
    if (minDiff === 0 && (field === 'std' || field === 'fmp') && room !== 'GLOBAL' && (window.eventDates || []).length > 0) {
        if (value === "") {
            data.isOverride.std = false;
            data.isOverride.fmp = false;
            data.std = "";
            data.fmp = "";
        } else {
            data.std = data[field];
            data.fmp = data[field];
            data.isOverride.std = true;
            data.isOverride.fmp = true;
        }
    }

    window.updateDOMCell(dateStr, room);
    if ((field === 'std' || field === 'fmp') && room !== 'GLOBAL') {
        if (value === "") {
            if (window.healDay) window.healDay(dateStr);
        } else {
            if (window.rippleDay) window.rippleDay(dateStr, room);
        }
    }
    window.markUnsavedChanges();
};

window.handleOtaEdit = (dateStr, ratePlanId, parentRoom, ruleType, ruleVal, field, value, rateSource = 'std') => {
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);

    window.dirtyFields = window.dirtyFields || {};
    window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};
    window.dirtyFields[dateStr][ratePlanId] = window.dirtyFields[dateStr][ratePlanId] || new Set();
    let fieldMap = field === 'min_arr' ? 'min' : field;
    window.dirtyFields[dateStr][ratePlanId].add(fieldMap);

    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};

    let targetKey = field === 'rate' ? ratePlanId : `${ratePlanId}_${field}`;

    if (value === "") {
        delete window.masterPricing.timeline[dateStr].otaOverrides[targetKey];
    } else {
        if (field === 'rate') {
            const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
            const numVal = window.roundCurrency(parseFloat(value) / mult);

            const roomData = window.masterPricing.timeline[dateStr][parentRoom] || {};
            let activePrice = (rateSource === 'evt' && roomData.fmp && (window.eventDates || []).length > 0)
                ? roomData.fmp
                : roomData.std;
            let expectedMathVal = null;
            if (activePrice !== undefined && activePrice !== "") expectedMathVal = window.applyMath(activePrice, ruleType, ruleVal);

            if (expectedMathVal === numVal) {
                delete window.masterPricing.timeline[dateStr].otaOverrides[ratePlanId];
            } else {
                window.masterPricing.timeline[dateStr].otaOverrides[ratePlanId] = numVal;
            }
        } else {
            window.masterPricing.timeline[dateStr].otaOverrides[targetKey] = value;
        }
    }

    window.updateDOMCell(dateStr, parentRoom);
    window.markUnsavedChanges();
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
