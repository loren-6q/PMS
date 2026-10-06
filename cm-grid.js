// ==========================================================================
// CHANNEL MANAGER CALENDAR GRID & INVENTORY (cm-grid.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-grid.js
// ==========================================================================

// --- 1. DATA ACCESSORS & CELL STATE RETRIEVAL ---
window.getCellData = (dateStr, room) => {
    const data = (window.masterPricing.timeline[dateStr] || {})[room] || {};
    if (room === 'GLOBAL') {
        return {
            min: data.min !== undefined ? data.min : "",
            max: data.max !== undefined ? data.max : "",
            min_arr: data.min_arr !== undefined ? data.min_arr : "",
            cta: data.cta || false,
            ctd: data.ctd || false,
            stopSell: data.stopSell || false,
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
        stopSell: data.stopSell || false,
        isOverride: data.isOverride || {}
    };
};

window.updateDOMCell = (dateStr, room) => {
    const bId = `inp_${dateStr}_${room.replace(/\s+/g, '')}`;
    const data = window.getCellData(dateStr, room);
    const mult = window.getViewMultiplier ? window.getViewMultiplier() : 1.0;
    const hasEvents = (window.eventDates || []).length > 0;
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
        if (window.activeMetrics.has('rates')) {
            const elStd = document.getElementById(`${bId}_std`);
            if (elStd) {
                elStd.value = data.std !== "" && !isNaN(data.std) ? window.formatDisplay(data.std * mult) : "";
                if (data.isOverride.std) elStd.classList.add('is-override');
                else elStd.classList.remove('is-override');
                applyState(elStd, false, room, 'rate');
            }
            const elFmp = document.getElementById(`${bId}_fmp`);
            if (elFmp && hasEvents) {
                elFmp.value = data.fmp !== "" && !isNaN(data.fmp) ? window.formatDisplay(data.fmp * mult) : "";
                if (data.isOverride.fmp) elFmp.classList.add('is-override');
                else elFmp.classList.remove('is-override');
                applyState(elFmp, false, room, 'rate');
            }
        }

        ['min', 'max', 'min_arr', 'cta', 'ctd', 'stopSell'].forEach(fKey => {
            let mapKey = fKey === 'stopSell' ? 'stop' : (fKey === 'min_arr' ? 'min' : fKey);
            if (window.activeMetrics.has(mapKey)) {
                const el = document.getElementById(`${bId}_${fKey}`);
                if (el) {
                    let fCheck = fKey === 'min_arr' ? 'min' : fKey;
                    if (fKey === 'cta' || fKey === 'ctd' || fKey === 'stopSell') {
                        el.checked = data[fKey] === true;
                        const td = el.closest('td');
                        if (td) applyState(el, true, room, fCheck);
                        if (data.isOverride[fKey]) td.classList.add('!border', '!border-orange-500');
                        else td.classList.remove('!border', '!border-orange-500');
                    } else {
                        el.value = data[fKey] !== undefined ? data[fKey] : "";
                        if (data.isOverride[fKey]) el.classList.add('is-override');
                        else el.classList.remove('is-override');
                        applyState(el, false, room, fCheck);
                    }
                }
            }
        });

        if (window.channexRateMap) {
            const mappedRates = window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === room);
            mappedRates.forEach(rate => {
                const otaId = `inp_${dateStr}_${rate.ratePlanId}`;

                if (window.activeMetrics.has('rates')) {
                    const otaInput = document.getElementById(`${otaId}_ota`);
                    if (otaInput) {
                        const otaOverride = window.masterPricing.timeline[dateStr]?.otaOverrides?.[rate.ratePlanId];
                        if (otaOverride !== undefined) {
                            otaInput.value = window.formatDisplay(otaOverride);
                            otaInput.classList.add('!text-pink-600', 'font-black');
                            otaInput.classList.remove('!bg-pink-100', '!text-pink-700');
                        } else {
                            let activePrice = (rate.rateSource === 'evt' && data.fmp !== undefined && data.fmp !== "" && hasEvents)
                                ? data.fmp
                                : data.std;

                            let promoMultiplier = 1.0;
                            (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
                                const isChannelMatch = window.isRatePlanMatchingChannel 
                                    ? window.isRatePlanMatchingChannel(rate.ratePlanTitle, pr.channel)
                                    : (pr.channel === 'ALL' || rate.ratePlanTitle.toLowerCase().includes(pr.channel.toLowerCase()));
                                const isScopeMatch = pr.scope === 'ALL' || pr.scope === room;
                                const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dateStr >= pr.startDate && dateStr <= pr.endDate);

                                if (isChannelMatch && isScopeMatch && isDateMatch) {
                                    const disc = pr.discountPct / 100;
                                    if (disc > 0 && disc < 1) {
                                        promoMultiplier *= (1 / (1 - disc));
                                    }
                                }
                            });

                            if (activePrice !== "" && activePrice !== undefined) {
                                let modified = window.applyMath(activePrice, rate.ruleType || "=", rate.ruleVal || 0);
                                modified *= promoMultiplier;
                                otaInput.value = window.formatDisplay(modified * mult);
                                otaInput.classList.remove('!text-pink-600', 'font-black', '!bg-pink-100', '!text-pink-700');
                            } else {
                                otaInput.value = "";
                                otaInput.classList.remove('!text-pink-600', 'font-black', '!bg-pink-100', '!text-pink-700');
                            }
                        }
                        applyState(otaInput, false, rate.ratePlanId, 'rate');
                    }
                }

                ['min', 'max', 'min_arr', 'cta', 'ctd', 'stopSell'].forEach(fKey => {
                    let mapKey = fKey === 'stopSell' ? 'stop' : (fKey === 'min_arr' ? 'min' : fKey);
                    if (window.activeMetrics.has(mapKey)) {
                        const rEl = document.getElementById(`${otaId}_${fKey}`);
                        if (rEl) {
                            let fCheck = fKey === 'min_arr' ? 'min' : fKey;
                            const val = window.masterPricing.timeline[dateStr]?.otaOverrides?.[`${rate.ratePlanId}_${fKey}`];
                            if (fKey === 'cta' || fKey === 'ctd' || fKey === 'stopSell') {
                                rEl.checked = val === true;
                                const td = rEl.closest('td');
                                if (td) applyState(rEl, true, rate.ratePlanId, fCheck);
                                if (val !== undefined) td.classList.add('!border', '!border-orange-500');
                                else td.classList.remove('!border', '!border-orange-500');
                            } else {
                                rEl.value = val !== undefined ? val : "";
                                if (val !== undefined) rEl.classList.add('!text-pink-600', 'font-black');
                                else rEl.classList.remove('!text-pink-600', 'font-black');
                                applyState(rEl, false, rate.ratePlanId, fCheck);
                            }
                        }
                    }
                });
            });
        }
    } else {
        ['min', 'max', 'min_arr'].forEach(k => {
            let mapKey = k === 'min_arr' ? 'min' : k;
            if (window.activeMetrics.has(mapKey)) {
                const el = document.getElementById(`${bId}_${k}`);
                if (el) {
                    let displayVal = (data[k] !== undefined && data[k] !== "") ? data[k] : "";
                    if (k === 'min' && window.currentPlatformView === 'hw' && displayVal === "") {
                        let msDiff = window.getNearestEvent(window.parseYMD(dateStr));
                        if (msDiff > 0 && msDiff <= 6) displayVal = msDiff + 1;
                    }
                    el.value = displayVal;
                    if (data.isOverride[k]) el.classList.add('is-override');
                    else el.classList.remove('is-override');
                    applyState(el, false, 'GLOBAL', k);
                }
            }
        });

        ['cta', 'ctd', 'stopSell'].forEach(k => {
            let mapKey = k === 'stopSell' ? 'stop' : k;
            if (window.activeMetrics.has(mapKey)) {
                const elBool = document.getElementById(`${bId}_${k}`);
                if (elBool) {
                    elBool.checked = data[k] === true;
                    const td = elBool.closest('td');
                    if (td) applyState(elBool, true, 'GLOBAL', k);
                    if (data.isOverride[k]) td.classList.add('!border', '!border-orange-500');
                    else td.classList.remove('!border', '!border-orange-500');
                }
            }
        });
    }
};

window.calculateLiveInventory = () => {
    const oldInventoryStr = JSON.stringify(window.liveInventory || {});
    window.liveInventory = {};
    window.viewDates = [];

    const container = document.getElementById('grid-container');
    const availableWidth = container ? container.clientWidth - 185 : (window.innerWidth - 185);
    window.daysToRender = Math.max(30, Math.floor(availableWidth / 35));

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
                // AUTOMATED BACKGROUND SYNC: Trigger immediate update to Channex and Firestore without user interaction
                if (window.pushToChannexAPI) {
                    console.log("⚡ Auto-detected inventory change! Dispatching live sync to Channex & Firestore...");
                    window.pushToChannexAPI(null, 'delta').catch(err => {
                        console.error("⚠️ Background Channex sync error:", err);
                    });
                }
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
    const hasEvents = (window.eventDates || []).length > 0 && window.activeMetrics.has('evt');

    let trHead = `<tr class="sticky-header"><th class="frozen-col-header z-30 border-r border-slate-600" style="width: 140px; min-width: 140px; left: 0;"></th><th class="frozen-col-header z-30 border-r-2 border-slate-500" style="width: 44px; min-width: 44px; left: 140px;"></th>`;
    for (let i = 0; i < window.daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dMs = window.parseYMD(window.getLocalYMD(cur));
        let minDiff = window.getNearestEvent(dMs);

        let highlight = 'bg-slate-900 border-slate-700 text-white';
        if (hasEvents) {
            if (minDiff === 0) highlight = 'evt-peak !bg-amber-500';
            else if (Math.abs(minDiff) <= 2) highlight = 'bg-amber-400 text-amber-900 border-amber-500';
        }

        trHead += `<th class="px-0 py-0.5 min-w-[35px] w-[35px] border-b ${highlight}">
            <span class="block text-[8px] font-bold uppercase leading-none">${window.mNames[cur.getUTCMonth()]}</span>
            <span class="block text-[12px] font-black leading-tight mt-0.5">${cur.getUTCDate()}</span>
        </th>`;
    }
    trHead += `</tr>`;
    head.innerHTML = trHead;

    let allRowsHtml = '';

    (window.roomTypes || []).forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'room-group-even' : 'room-group-odd';
        let displayName = window.displayAbbrev[room] || room;

        let roomRows = [];
        if (window.activeMetrics.has('avail')) roomRows.push({ id: 'avail', label: 'AVAIL', isBool: false, isAvail: true });
        if (window.activeMetrics.has('rates')) {
            roomRows.push({ id: 'std', label: 'STD', isBool: false });
            if (hasEvents) roomRows.push({ id: 'fmp', label: 'EVT', isBool: false, isEvt: true });
        }
        if (window.activeMetrics.has('min')) {
            roomRows.push({ id: 'min', label: 'MIN NTS', isBool: false });
            roomRows.push({ id: 'min_arr', label: 'MIN ARR', isBool: false });
        }
        if (window.activeMetrics.has('max')) roomRows.push({ id: 'max', label: 'MAX NTS', isBool: false });
        if (window.activeMetrics.has('cta')) roomRows.push({ id: 'cta', label: 'CTA', isBool: true });
        if (window.activeMetrics.has('ctd')) roomRows.push({ id: 'ctd', label: 'CTD', isBool: true });
        if (window.activeMetrics.has('stop')) roomRows.push({ id: 'stopSell', label: 'STOP', isBool: true });

        if (roomRows.length === 0) return;

        const mappedRates = window.channexRateMap ? window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === room) : [];
        const hasMappedRates = mappedRates.length > 0;
        let totalRoomSpan = roomRows.length;

        roomRows.forEach((rDef, rIdx) => {
            let isLastInRoom = rIdx === totalRoomSpan - 1;
            let isAbsoluteBoundary = isLastInRoom && !hasMappedRates;

            let trClass = `${groupClass} ${rDef.isEvt ? 'evt-text' : ''}`;
            if (isAbsoluteBoundary) trClass += ' room-boundary-bottom';

            let cellBottomStyle = isAbsoluteBoundary
                ? 'style="border-bottom: 4px solid #0f172a !important;"'
                : (isLastInRoom ? 'style="border-bottom: 2px solid #a5b4fc !important;"' : 'style="border-bottom: 1px solid #e2e8f0;"');

            let tr = `<tr class="${trClass}">`;

            if (rIdx === 0) {
                let mainRoomBorder = (!hasMappedRates)
                    ? 'style="border-bottom: 4px solid #0f172a !important;"'
                    : 'style="border-bottom: 1px solid #cbd5e1;"';

                tr += `<td rowspan="${totalRoomSpan}" ${mainRoomBorder} class="frozen-col !p-0 z-20 align-middle border-r border-slate-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                    <div class="w-[140px] flex items-center px-1.5 h-full font-bold text-slate-700 text-left text-[10px] leading-tight whitespace-normal break-words">
                        ${displayName}
                    </div>
                </td>`;
            }

            let labelColor = rDef.isEvt ? 'text-pink-600' : (rDef.isAvail ? 'text-slate-500 font-bold' : 'text-slate-500');
            let labelHtml = rDef.label.replace(' ', '<br>');

            tr += `<td ${cellBottomStyle} class="frozen-col-2 !p-0 z-20 align-middle ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                <span class="text-[8px] font-bold tracking-tighter leading-none block ${labelColor}">${labelHtml}</span>
            </td>`;

            for (let i = 0; i < window.daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = window.getLocalYMD(cur);
                const bId = `inp_${dateStr}_${room.replace(/\s+/g, '')}`;
                let isDirty = window.dirtyDates.has(dateStr);
                let isSynced = window.syncedDates.has(dateStr);
                let stateClass = isDirty ? (rDef.isBool ? 'override-cell-highlight' : 'is-dirty') : (isSynced ? 'is-synced' : '');

                let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
                let evtColor = '';
                if (hasEvents) {
                    if (minDiff === 0) evtColor = 'bg-amber-300';
                    else if (Math.abs(minDiff) <= 2) evtColor = 'bg-yellow-100';
                }

                if (rDef.isAvail) {
                    let live = window.liveInventory[dateStr] && window.liveInventory[dateStr][room] !== undefined ? window.liveInventory[dateStr][room] : 0;
                    let otaAvail = window.masterPricing.timeline[dateStr]?.otaOverrides?.[`${room}_avail`];
                    let displayVal = otaAvail !== undefined ? otaAvail : live;
                    let availColor = displayVal == 0 ? 'text-rose-600 font-bold' : (displayVal <= 2 ? 'text-amber-600 font-bold' : 'text-emerald-700 font-bold');
                    let overrideClass = otaAvail !== undefined ? '!bg-amber-100' : 'bg-slate-50/80';
                    tr += `<td ${cellBottomStyle} class="${evtColor} ${overrideClass} p-0 min-w-[35px] w-[35px]">
                        <input type="number" step="any" class="w-full h-full text-center outline-none focus:bg-white text-[10px] ${availColor} ${stateClass} font-semibold bg-transparent tracking-tighter px-0" value="${displayVal}" onfocus="this.select()" onchange="window.handleAvailEdit('${dateStr}', '${room}', this.value)">
                    </td>`;
                } else if (rDef.isBool) {
                    tr += `<td ${cellBottomStyle} class="${evtColor} ${stateClass} min-w-[35px] w-[35px]"><div class="flex justify-center h-full items-center"><input type="checkbox" id="${bId}_${rDef.id}" class="grid-toggle scale-75" onchange="window.handleCellEdit('${dateStr}', '${room}', '${rDef.id}', this.checked)"></div></td>`;
                } else {
                    tr += `<td ${cellBottomStyle} class="${evtColor} min-w-[35px] w-[35px]"><input type="number" step="any" id="${bId}_${rDef.id}" class="w-full text-center outline-none focus:bg-indigo-50 font-medium ${rDef.isEvt ? '!text-pink-600' : '!text-slate-800'} bg-transparent ${stateClass} text-[10px] tracking-tighter px-0" onfocus="this.select()" onchange="window.handleCellEdit('${dateStr}', '${room}', '${rDef.id}', this.value)"></td>`;
                }
            }
            tr += `</tr>`;
            allRowsHtml += tr;
        });

        if (hasMappedRates) {
            mappedRates.forEach((rate, rateIdx) => {
                let otaRows = [];
                if (window.activeMetrics.has('rates')) otaRows.push({ id: 'ota', label: 'RATE', isBool: false, isRate: true });
                if (window.activeMetrics.has('min')) {
                    otaRows.push({ id: 'min', label: 'MIN NTS', isBool: false });
                    otaRows.push({ id: 'min_arr', label: 'MIN ARR', isBool: false });
                }
                if (window.activeMetrics.has('max')) otaRows.push({ id: 'max', label: 'MAX NTS', isBool: false });
                if (window.activeMetrics.has('cta')) otaRows.push({ id: 'cta', label: 'CTA', isBool: true });
                if (window.activeMetrics.has('ctd')) otaRows.push({ id: 'ctd', label: 'CTD', isBool: true });
                if (window.activeMetrics.has('stop')) otaRows.push({ id: 'stopSell', label: 'STOP', isBool: true });

                if (otaRows.length === 0) return;

                let rType = rate.ruleType || "=";
                let rVal = rate.ruleVal !== undefined ? rate.ruleVal : 0;
                let ruleText = rType === "=" ? "BASE" : `${rType}${rVal}`;
                let rateRowspan = otaRows.length;
                let isLastRateOfRoom = (rateIdx === mappedRates.length - 1);
                const rateSource = rate.rateSource || 'std';

                otaRows.forEach((oDef, oIdx) => {
                    let isLastOtaRowOfRate = (oIdx === rateRowspan - 1);
                    let isAbsoluteLastRowOfRoom = isLastRateOfRoom && isLastOtaRowOfRate;

                    let trOtaClass = `${groupClass} bg-indigo-50/50`;
                    if (isAbsoluteLastRowOfRoom) trOtaClass += ' room-boundary-bottom';

                    let otaCellBottomStyle = isAbsoluteLastRowOfRoom
                        ? 'style="border-bottom: 4px solid #0f172a !important;"'
                        : (isLastOtaRowOfRate ? 'style="border-bottom: 2px solid #94a3b8 !important;"' : 'style="border-bottom: 1px solid #c7d2fe;"');

                    let trOta = `<tr class="${trOtaClass}">`;

                    if (oIdx === 0) {
                        let otaMainBorder = isLastRateOfRoom
                            ? 'style="border-bottom: 4px solid #0f172a !important;"'
                            : 'style="border-bottom: 1px solid #cbd5e1;"';

                        const badgeColor = rateSource === 'evt' ? 'text-pink-600 font-black' : 'text-indigo-500 font-black';
                        const badgeText = rateSource === 'evt' ? 'EVT PKG' : 'RATE PLAN';

                        trOta += `<td rowspan="${rateRowspan}" ${otaMainBorder} class="frozen-col !p-0 z-20 border-r border-slate-300 bg-indigo-50/50">
                            <div class="w-[140px] flex flex-col justify-center px-1.5 h-full text-left" title="${rate.ratePlanTitle}">
                                <span class="text-[9px] font-bold text-indigo-900 leading-tight whitespace-normal break-words">${window.formatRatePlanTitle(rate.ratePlanTitle)}</span>
                                <span class="text-[7px] uppercase tracking-widest mt-0.5 ${badgeColor}">${badgeText}</span>
                            </div>
                        </td>`;
                    }

                    let labelHtml = oDef.label.replace(' ', '<br>');

                    trOta += `<td ${otaCellBottomStyle} class="frozen-col-2 !p-0 z-20 align-middle border-r-2 border-slate-400 bg-indigo-50/50">
                        <span class="text-[7px] font-bold tracking-tighter text-indigo-800 block w-full text-center leading-tight">${labelHtml}</span>
                        ${oDef.isRate ? `<span class="text-[7px] font-bold text-slate-500 tracking-tighter block w-full text-center">${ruleText === 'BASE' ? 'BASE' : (ruleText)}</span>` : ''}
                    </td>`;

                    for (let i = 0; i < window.daysToRender; i++) {
                        const cur = new Date(dObj);
                        cur.setUTCDate(cur.getUTCDate() + i);
                        const dateStr = window.getLocalYMD(cur);
                        const bId = `inp_${dateStr}_${rate.ratePlanId}`;
                        let isDirty = window.dirtyDates.has(dateStr);
                        let isSynced = window.syncedDates.has(dateStr);
                        let stateClass = isDirty ? (oDef.isBool ? 'override-cell-highlight' : 'is-dirty') : (isSynced ? 'is-synced' : '');
                        let evtColor = '';
                        if (hasEvents) {
                            let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
                            if (minDiff === 0) evtColor = 'bg-amber-100/50';
                            else if (Math.abs(minDiff) <= 2) evtColor = 'bg-yellow-50/50';
                        }

                        if (oDef.isBool) {
                            trOta += `<td ${otaCellBottomStyle} class="${evtColor} ${stateClass} min-w-[35px] w-[35px]"><div class="flex justify-center h-full items-center"><input type="checkbox" id="${bId}_${oDef.id}" class="grid-toggle scale-75" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, '${oDef.id}', this.checked, '${rateSource}')"></div></td>`;
                        } else if (oDef.isRate) {
                            trOta += `<td ${otaCellBottomStyle} class="${evtColor} min-w-[35px] w-[35px]"><input type="number" step="any" id="${bId}_ota" class="w-full text-center outline-none focus:bg-pink-50 font-medium !text-indigo-800 bg-transparent text-[10px] tracking-tighter px-0 ${stateClass}" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, 'rate', this.value, '${rateSource}')"></td>`;
                        } else {
                            trOta += `<td ${otaCellBottomStyle} class="${evtColor} min-w-[35px] w-[35px]"><input type="number" step="any" id="${bId}_${oDef.id}" class="w-full text-center outline-none focus:bg-pink-50 font-medium !text-indigo-600 bg-transparent ${stateClass} text-[10px] tracking-tighter px-0" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '${rate.ruleType || "="}', ${rate.ruleVal || 0}, '${oDef.id}', this.value, '${rateSource}')"></td>`;
                        }
                    }
                    trOta += `</tr>`;
                    allRowsHtml += trOta;
                });
            });
        }
    });

    let globalRows = [];
    if (window.activeMetrics.has('min')) {
        globalRows.push({ id: 'min', lbl: 'MIN NTS', isBool: false });
        if (window.currentPlatformView !== 'hw') globalRows.push({ id: 'min_arr', lbl: 'MIN ARR', isBool: false });
    }
    if (window.activeMetrics.has('max') && window.currentPlatformView !== 'hw') globalRows.push({ id: 'max', lbl: 'MAX NTS', isBool: false });
    if (window.activeMetrics.has('cta') && window.currentPlatformView !== 'hw') globalRows.push({ id: 'cta', lbl: 'CTA', isBool: true });
    if (window.activeMetrics.has('ctd') && window.currentPlatformView !== 'hw') globalRows.push({ id: 'ctd', lbl: 'CTD', isBool: true });
    if (window.activeMetrics.has('stop') && window.currentPlatformView !== 'hw') globalRows.push({ id: 'stopSell', lbl: 'STOP SELL', isBool: true });

    if (globalRows.length > 0) {
        globalRows.forEach((rc, rIndex) => {
            let tr = `<tr class="bg-white border-b border-slate-200 text-slate-700">`;

            if (rIndex === 0) {
                tr += `<td rowspan="${globalRows.length}" class="frozen-col z-20 bg-slate-800 border-r border-slate-900 border-t-4 border-slate-900 align-middle text-center p-2 min-h-[30px]">
                    <span class="text-[11px] font-black tracking-widest text-white uppercase break-words whitespace-normal leading-tight block w-full text-center">GLOBAL (ALL)</span>
                </td>`;
            }

            let labelHtml = rc.lbl.replace(' ', '<br>');
            tr += `<td class="frozen-col-2 !p-0 z-20 bg-slate-800 border-r-2 border-slate-900 ${rIndex === 0 ? 'border-t-4 border-slate-900' : ''} align-middle border-b border-slate-700">
                <div class="text-[9px] font-black !text-slate-300 uppercase tracking-tighter text-center leading-none">${labelHtml}</div>
            </td>`;

            for (let i = 0; i < window.daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = window.getLocalYMD(cur);
                const bId = `inp_${dateStr}_GLOBAL_${rc.id}`;
                let isDirty = window.dirtyDates.has(dateStr);
                let isSynced = window.syncedDates.has(dateStr);
                let stateClass = isDirty ? (rc.isBool ? 'override-cell-highlight' : 'is-dirty') : (isSynced ? 'is-synced' : '');

                let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
                let evtColor = 'bg-white';
                if (hasEvents) evtColor = minDiff === 0 ? 'bg-amber-50' : (Math.abs(minDiff) <= 2 ? 'bg-amber-50/50' : 'bg-white');
                let bTClass = rIndex === 0 ? 'border-t-4 border-slate-900' : '';

                if (rc.isBool) {
                    tr += `<td class="${evtColor} ${bTClass} border-b border-slate-300 ${stateClass} min-w-[35px] w-[35px]"><div class="flex justify-center h-full items-center"><input type="checkbox" id="${bId}" class="grid-toggle scale-75" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', '${rc.id}', this.checked)"></div></td>`;
                } else {
                    tr += `<td class="${evtColor} ${bTClass} border-b border-slate-300 min-w-[35px] w-[35px]"><input type="number" step="any" id="${bId}" class="w-full text-center outline-none focus:bg-indigo-50 font-black !text-slate-700 bg-transparent text-[11px] tracking-tighter px-0 ${stateClass}" onfocus="this.select()" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', '${rc.id}', this.value)"></td>`;
                }
            }
            tr += `</tr>`;
            allRowsHtml += tr;
        });
    }

    body.innerHTML = allRowsHtml;

    for (let i = 0; i < window.daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dateStr = window.getLocalYMD(cur);
        (window.roomTypes || []).forEach(room => window.updateDOMCell(dateStr, room));
        window.updateDOMCell(dateStr, 'GLOBAL');
    }
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
    else window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`] = parseInt(value);

    window.updateDOMCell(dateStr, room);
    window.markUnsavedChanges();

    if (window.pushToChannexAPI) {
        window.pushToChannexAPI(null, 'delta').catch(err => console.error("⚠️ Background sync error:", err));
    }
};

window.handleCellEdit = (dateStr, room, field, value) => {
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);

    window.dirtyFields = window.dirtyFields || {};
    window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};

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
        else data[field] = parseInt(value);
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

    if (window.pushToChannexAPI) {
        window.pushToChannexAPI(null, 'delta').catch(err => console.error("⚠️ Background sync error:", err));
    }
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

    if (window.pushToChannexAPI) {
        window.pushToChannexAPI(null, 'delta').catch(err => console.error("⚠️ Background sync error:", err));
    }
};

window.shiftTape = (days) => {
    const current = new Date(document.getElementById('tape-start').value + "T12:00:00Z");
    current.setUTCDate(current.getUTCDate() + days);
    document.getElementById('tape-start').value = current.toISOString().split('T')[0];
    window.renderGrid();
};

window.toggleRipple = () => {
    window.isRippleEnabled = !window.isRippleEnabled;
    const btn = document.getElementById('ripple-toggle');
    if (window.isRippleEnabled) {
        btn.innerHTML = '<i data-lucide="link" size="12"></i> LINKS: ON';
        btn.classList.replace('!bg-slate-100', '!bg-indigo-100');
        btn.classList.replace('!text-slate-500', '!text-indigo-700');
    } else {
        btn.innerHTML = '<i data-lucide="link-2-off" size="12"></i> LINKS: OFF';
        btn.classList.replace('!bg-indigo-100', '!bg-slate-100');
        btn.classList.replace('!text-indigo-700', '!text-slate-500');
    }
    if (window.lucide) window.lucide.createIcons();
};

window.toggleQuickBulk = (forceClose = false) => {
    const panel = document.getElementById('quick-bulk-panel');
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

    document.getElementById('qb-grid-body').innerHTML = html;
};

window.applyBulkGrid = (isClear = false) => {
    const s = document.getElementById('qb-start').value;
    const e = document.getElementById('qb-end').value;
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

    if (window.pushToChannexAPI) {
        window.pushToChannexAPI(null, 'delta').catch(err => console.error("⚠️ Background sync error:", err));
    }

    if (!isClear) {
        document.querySelectorAll('#qb-grid-body input:not([type="date"]):not([disabled])').forEach(i => i.value = "");
    }
};

let _resizeDebounce = null;
window.addEventListener('resize', () => {
    clearTimeout(_resizeDebounce);
    _resizeDebounce = setTimeout(() => {
        if (window.renderGrid) window.renderGrid();
    }, 200);
});
