// ==========================================================================
// CHANNEL MANAGER CHANNEX API & OTA MAPPING (cm-channex.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-channex.js
// ==========================================================================

window.getChannexBaseUrl = () => 'https://app.channex.io/api/v1';

window.fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            const statusEl = document.getElementById('sync-status');
            if (statusEl) statusEl.innerText = `RATE LIMIT HIT. RETRYING IN ${backoff / 1000}s...`;
            await new Promise(r => setTimeout(r, backoff));
            backoff *= 2;
            continue;
        }
        return res;
    }
    return await fetch(url, options);
};

window.fetchAllChannex = async (endpoint, apiKey, propId) => {
    let allItems = [];
    let page = 1;
    let totalPages = 1;
    const baseUrl = window.getChannexBaseUrl();

    while (page <= totalPages) {
        const res = await fetch(`${baseUrl}/${endpoint}?filter[property_id]=${propId}&pagination[page]=${page}&pagination[limit]=100`, {
            headers: { "user-api-key": apiKey }
        });
        if (!res.ok) throw new Error(`Channex API returned HTTP ${res.status} for ${endpoint}`);
        const data = await res.json();

        if (data && Array.isArray(data.data)) {
            allItems = allItems.concat(data.data);
        }
        if (data && data.meta && data.meta.pagination) {
            totalPages = data.meta.pagination.total_pages || 1;
        } else if (data && data.meta) {
            totalPages = data.meta.total_pages || 1;
        }
        page++;
    }
    return allItems;
};

window.saveCredentialsAndFetch = async () => {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();
    if (!apiKey || !propId) return window.customAlert("API Key and Property ID are required.");

    window.showLoader('FETCHING CHANNEX DATA...');
    window.channexConfig = { apiKey, propId, env: 'production' };

    try {
        localStorage.setItem(`cm_channex_${window.currentPropertyId}`, JSON.stringify(window.channexConfig));
        localStorage.setItem('cm_channex_last_used', JSON.stringify(window.channexConfig));
    } catch (e) {}

    try {
        // Re-read latest room inventory from Firestore in case rooms were renamed in settings.html
        if (window.loadPropertyConfig) {
            await window.loadPropertyConfig();
        }

        const roomData = await window.fetchAllChannex('room_types', apiKey, propId);
        const rateData = await window.fetchAllChannex('rate_plans', apiKey, propId);

        const roomNameMap = {};
        roomData.forEach(r => { roomNameMap[r.id] = r.attributes.title; });
        rateData.forEach(rate => {
            const parentRoomId = rate.relationships?.room_type?.data?.id;
            if (parentRoomId && roomNameMap[parentRoomId]) {
                rate.attributes.title = `${rate.attributes.title} [${roomNameMap[parentRoomId]}]`;
            }
        });

        window.renderChannexMappingUI(roomData, rateData);

        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const { doc, setDoc } = window.cmFs;
        await Promise.all([
            setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), { channex: window.channexConfig }, { merge: true }),
            setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'pricing', `master_${canonId}`), { channex: window.channexConfig }, { merge: true })
        ]);
    } catch (e) {
        console.error(e);
        window.customAlert("Failed to fetch Channex configuration.\n\n" + e.message);
    }
    window.hideLoader();
};

window.fetchChannexData = () => {
    window.saveCredentialsAndFetch();
};

window.renderChannexMappingUI = (channexRooms, channexRates) => {
    const mapContainer = document.getElementById('channex-mapping-container');
    if (!mapContainer) return;

    if (!channexRooms || channexRooms.length === 0) {
        mapContainer.innerHTML = "<div class='text-center py-6 text-red-500 font-bold text-xs'>No Room Types found in Channex for this Property.</div>";
        return;
    }
    if ((window.roomTypes || []).length === 0) {
        mapContainer.innerHTML = "<div class='text-center py-6 text-orange-500 font-bold text-xs'>No PMS Room Categories configured in settings.html.</div>";
        return;
    }

    const pmsOptions = `<option value="">-- DO NOT MAP --</option>` + (window.roomTypes || []).map(t => `<option value="${t}">${t}</option>`).join('');

    let html = '<div class="flex flex-col gap-1.5">';
    channexRooms.forEach(cr => {
        const existingMap = (window.channexMap || []).find(m => m.channexId === cr.id);
        let selectedVal = existingMap ? existingMap.pmsCategory : '';

        html += `
            <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200 shadow-sm chan-map-row" data-chan-id="${cr.id}">
                <div class="flex-1 font-bold text-slate-700 text-[11px] truncate pl-1" title="${cr.attributes.title}">${cr.attributes.title}</div>
                <i data-lucide="arrow-right" size="12" class="text-emerald-500 shrink-0"></i>
                <select class="input-base !py-0.5 !text-[10px] !w-48 cursor-pointer chan-pms-sel bg-slate-50 border-emerald-300 text-emerald-800 shadow-none">
                    ${pmsOptions.replace(`value="${selectedVal}"`, `value="${selectedVal}" selected`)}
                </select>
            </div>`;
    });
    html += '</div>';
    mapContainer.innerHTML = html;

    const rateCard = document.getElementById('channex-rate-mapping-card');
    const rateContainer = document.getElementById('channex-rate-mapping-container');

    if (channexRates && channexRates.length > 0 && rateContainer) {
        if (rateCard) {
            rateCard.classList.remove('hidden');
            rateCard.style.display = 'flex';
        }
        let rHtml = '<div class="flex flex-col gap-1.5">';
        channexRates.forEach(rate => {
            const existingMap = (window.channexRateMap || []).find(m => m.ratePlanId === rate.id);
            let selectedVal = existingMap ? existingMap.pmsCategory : '';
            let ruleType = existingMap ? (existingMap.ruleType || "=") : "=";
            let ruleVal = existingMap && existingMap.ruleVal !== undefined ? existingMap.ruleVal : "";
            let rateSource = existingMap ? (existingMap.rateSource || "std") : "std";

            rHtml += `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-amber-200 shadow-sm chan-rate-map-row" data-rate-id="${rate.id}" data-rate-title="${rate.attributes.title}">
                    <div class="flex-1 flex flex-col min-w-0 pl-1">
                        <span class="font-bold text-slate-800 text-[11px] truncate" title="${rate.attributes.title}">${rate.attributes.title}</span>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Channex Rate Plan</span>
                    </div>
                    <i data-lucide="arrow-right" size="12" class="text-amber-500 shrink-0"></i>
                    <select class="input-base !py-0.5 !text-[10px] !w-32 cursor-pointer chan-rate-pms-sel bg-slate-50 border-amber-300 text-amber-800 shadow-none">
                        ${pmsOptions.replace(`value="${selectedVal}"`, `value="${selectedVal}" selected`)}
                    </select>
                    <select class="input-base !py-0.5 !text-[10px] !w-20 cursor-pointer chan-rate-source bg-slate-50 border-amber-300 text-amber-900 shadow-none font-black text-center" title="Base rate source">
                        <option value="std" ${rateSource === 'evt' ? '' : 'selected'}>STD Rate</option>
                        <option value="evt" ${rateSource === 'evt' ? 'selected' : ''}>EVT Pkg</option>
                    </select>
                    <select class="input-base !py-0.5 !text-[10px] !w-16 cursor-pointer chan-rate-rule-type bg-slate-50 border-amber-300 text-amber-800 shadow-none font-black text-center">
                        <option value="=" ${ruleType === '=' ? 'selected' : ''}>=</option>
                        <option value="+" ${ruleType === '+' ? 'selected' : ''}>+$</option>
                        <option value="-" ${ruleType === '-' ? 'selected' : ''}>-$</option>
                        <option value="+%" ${ruleType === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${ruleType === '-%' ? 'selected' : ''}>-%</option>
                    </select>
                    <input type="number" class="input-base !py-0.5 !text-[10px] !w-16 text-center chan-rate-rule-val border-amber-300 bg-white" placeholder="0" value="${ruleVal}">
                </div>`;
        });
        rHtml += '</div>';
        rateContainer.innerHTML = rHtml;
    } else if (rateCard) {
        rateCard.classList.add('hidden');
        rateCard.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
};

window.renderChannexMapping = () => {
    const mapContainer = document.getElementById('channex-mapping-container');
    if (!mapContainer) return;
    const map = window.channexMap || [];

    const buildCategoryOptions = (currentCat) => {
        const resolved = window.categoryResolver ? window.categoryResolver(currentCat) : currentCat;
        let optionsHtml = `<option value="">-- DO NOT MAP / UNMAPPED --</option>`;
        (window.roomTypes || []).forEach(t => {
            const isSelected = (t === resolved) || (t === currentCat);
            optionsHtml += `<option value="${t}" ${isSelected ? 'selected' : ''}>${t}</option>`;
        });
        if (currentCat && !resolved && !(window.roomTypes || []).includes(currentCat)) {
            optionsHtml += `<option value="${currentCat}" selected class="text-rose-600 font-bold">⚠️ ${currentCat} (RENAMED / NOT IN SETTINGS)</option>`;
        }
        return optionsHtml;
    };

    if (map.length > 0) {
        let html = '<div class="flex flex-col gap-1.5">';
        map.forEach(m => {
            html += `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200 shadow-sm chan-map-row" data-chan-id="${m.channexId}">
                    <div class="flex-1 font-bold text-slate-700 text-[11px] truncate pl-1" title="${m.channexTitle || ''}">${m.channexTitle || 'Mapped Room'}</div>
                    <i data-lucide="arrow-right" size="12" class="text-emerald-500 shrink-0"></i>
                    <select onchange="window.markUnsavedChanges()" class="input-base !py-0.5 !text-[10px] !w-48 cursor-pointer chan-pms-sel bg-slate-50 border-emerald-300 text-emerald-800 shadow-none">
                        ${buildCategoryOptions(m.pmsCategory)}
                    </select>
                </div>`;
        });
        html += '</div>';
        mapContainer.innerHTML = html;
    } else {
        mapContainer.innerHTML = "<div class='text-center py-6 text-slate-400 font-bold text-xs italic'>Enter API key and click Save & Fetch to map rooms.</div>";
    }

    const rateContainer = document.getElementById('channex-rate-mapping-container');
    if (!rateContainer) return;
    const rateMap = window.channexRateMap || [];
    const rateCard = document.getElementById('channex-rate-mapping-card');

    if (rateMap.length > 0) {
        if (rateCard) { rateCard.classList.remove('hidden'); rateCard.style.display = 'flex'; }
        let rHtml = '<div class="flex flex-col gap-1.5">';
        rateMap.forEach(m => {
            let ruleType = m.ruleType || "=";
            let ruleVal = m.ruleVal !== undefined ? m.ruleVal : "";
            let rateSource = m.rateSource || "std";
            rHtml += `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-amber-200 shadow-sm chan-rate-map-row" data-rate-id="${m.ratePlanId}" data-rate-title="${m.ratePlanTitle}">
                    <div class="flex-1 flex flex-col min-w-0 pl-1">
                        <span class="font-bold text-slate-800 text-[11px] truncate" title="${m.ratePlanTitle || ''}">${window.formatRatePlanTitle(m.ratePlanTitle) || 'Mapped Rate'}</span>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Channex Rate Plan</span>
                    </div>
                    <i data-lucide="arrow-right" size="12" class="text-amber-500 shrink-0"></i>
                    <select onchange="window.markUnsavedChanges()" class="input-base !py-0.5 !text-[10px] !w-32 cursor-pointer chan-rate-pms-sel bg-slate-50 border-amber-300 text-amber-800 shadow-none">
                        ${buildCategoryOptions(m.pmsCategory)}
                    </select>
                    <select onchange="window.markUnsavedChanges()" class="input-base !py-0.5 !text-[10px] !w-20 cursor-pointer chan-rate-source bg-slate-50 border-amber-300 text-amber-900 shadow-none font-black text-center" title="Base rate source">
                        <option value="std" ${rateSource === 'evt' ? '' : 'selected'}>STD Rate</option>
                        <option value="evt" ${rateSource === 'evt' ? 'selected' : ''}>EVT Pkg</option>
                    </select>
                    <select onchange="window.markUnsavedChanges()" class="input-base !py-0.5 !text-[10px] !w-16 cursor-pointer chan-rate-rule-type bg-slate-50 border-amber-300 text-amber-800 shadow-none font-black text-center">
                        <option value="=" ${ruleType === '=' ? 'selected' : ''}>=</option>
                        <option value="+" ${ruleType === '+' ? 'selected' : ''}>+฿</option>
                        <option value="-" ${ruleType === '-' ? 'selected' : ''}>-฿</option>
                        <option value="+%" ${ruleType === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${ruleType === '-%' ? 'selected' : ''}>-%</option>
                    </select>
                    <input type="number" oninput="window.markUnsavedChanges()" class="input-base !py-0.5 !text-[10px] !w-16 text-center chan-rate-rule-val border-amber-300 bg-white font-bold" placeholder="0" value="${ruleVal}">
                </div>`;
        });
        rHtml += '</div>';
        rateContainer.innerHTML = rHtml;
    } else {
        rateContainer.innerHTML = "<div class='text-center py-6 text-slate-400 font-bold text-xs italic'>No Rate Plans mapped yet.</div>";
    }
    if (window.lucide) window.lucide.createIcons();
};

window.saveMappingToDB = async (notify = false) => {
    window.channexMap = [];
    document.querySelectorAll('.chan-map-row').forEach(row => {
        const cId = row.getAttribute('data-chan-id');
        const cTitle = row.querySelector('.font-bold')?.innerText || '';
        const pCat = row.querySelector('.chan-pms-sel')?.value || '';
        if (cId) window.channexMap.push({ channexId: cId, channexTitle: cTitle, pmsCategory: pCat || "" });
    });

    window.channexRateMap = [];
    document.querySelectorAll('.chan-rate-map-row').forEach(row => {
        const rId = row.getAttribute('data-rate-id');
        const rTitle = row.getAttribute('data-rate-title') || row.querySelector('.font-bold')?.innerText || '';
        const pCat = row.querySelector('.chan-rate-pms-sel')?.value || '';
        const ruleType = row.querySelector('.chan-rate-rule-type')?.value || '=';
        const ruleVal = parseFloat(row.querySelector('.chan-rate-rule-val')?.value) || 0;
        const rateSource = row.querySelector('.chan-rate-source')?.value || 'std';

        if (rId) window.channexRateMap.push({
            ratePlanId: rId,
            ratePlanTitle: rTitle,
            pmsCategory: pCat || "",
            ruleType: ruleType,
            ruleVal: ruleVal,
            rateSource: rateSource
        });
    });

    try {
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), {
            channexMap: window.channexMap,
            channexRateMap: window.channexRateMap
        }, { merge: true });

        if (notify) {
            window.customAlert("✅ Room and Rate Plan Mappings saved to database successfully!");
        }
        if (window.renderGrid) window.renderGrid();
    } catch (e) {
        console.error("Mapping Save Error:", e);
        if (notify) window.customAlert("Failed to save mappings: " + e.message);
    }
};

window.pushToChannexAPI = async (btn, mode = 'full') => {
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline" size="14"></i> SYNCING...';
        btn.disabled = true;
    }
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('active');
        loader.style.display = 'flex';
    }
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.innerText = 'COMPRESSING PAYLOAD...';

    try {
        if (!window.channexConfig || !window.channexConfig.apiKey || !window.channexConfig.propId) {
            throw new Error("Channex API Key or Property ID missing. Please check OTA Mapping Tab.");
        }

        const apiKey = window.channexConfig.apiKey;
        const propId = window.channexConfig.propId;
        const rMap = window.channexMap || [];
        const rateMap = window.channexRateMap || [];

        if (rMap.length === 0) throw new Error("No Room mappings found. Please map Room Types in the OTA Mapping tab.");

        let datesToProcess = [];
        if (mode === 'delta') {
            if (window.dirtyDates.size === 0) {
                if (loader) { loader.classList.remove('active'); loader.style.display = 'none'; }
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                if (window.lucide) window.lucide.createIcons();
                return window.customAlert("No changes to sync! Cells will turn orange when edited.");
            }
            datesToProcess = Array.from(window.dirtyDates).sort();
        } else {
            let dTemp = new Date();
            let currentDate = new Date(Date.UTC(dTemp.getFullYear(), dTemp.getMonth(), dTemp.getDate(), 12, 0, 0));
            for (let i = 0; i < 500; i++) {
                const d = new Date(currentDate.getTime() + (i * 86400000));
                datesToProcess.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
            }
        }

        const availMap = {};
        datesToProcess.forEach(dStr => {
            availMap[dStr] = {};
            (window.roomTypes || []).forEach(t => availMap[dStr][t] = window.totalRoomsByType[t] || 0);
        });

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

            const inMs = window.parseYMD(s.checkIn), outMs = window.parseYMD(s.checkOut);
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

            datesToProcess.forEach(dStr => {
                const dMs = window.parseYMD(dStr);
                if (dMs >= inMs && dMs < outMs) {
                    typesToDeduct.forEach(t => {
                        if (availMap[dStr][t] !== undefined && availMap[dStr][t] > 0) availMap[dStr][t]--;
                    });
                }
            });
        });

        const availPayload = [];
        const restPayload = [];

        rMap.forEach(roomRule => {
            const pmsCat = window.categoryResolver(roomRule.pmsCategory);
            const roomTypeId = roomRule.channexId;
            if (!pmsCat) return;

            let rangeStart = null;
            let currentAvail = null;

            for (let i = 0; i < datesToProcess.length; i++) {
                const dStr = datesToProcess[i];
                const dMs = window.parseYMD(dStr);
                const dayData = window.masterPricing.timeline[dStr] || {};

                if (mode === 'delta') {
                    const dFields = window.dirtyFields?.[dStr]?.[pmsCat];
                    if (!dFields || !dFields.has('avail')) {
                        if (rangeStart !== null && currentAvail !== null) {
                            availPayload.push({
                                property_id: propId, room_type_id: roomTypeId,
                                date_from: rangeStart, date_to: datesToProcess[i - 1],
                                availability: currentAvail
                            });
                        }
                        rangeStart = null;
                        currentAvail = null;
                        continue;
                    }
                }

                let availToday;
                const otaAvail = dayData.otaOverrides?.[`${pmsCat}_avail`];
                if (otaAvail !== undefined) {
                    availToday = parseInt(otaAvail);
                } else {
                    availToday = availMap[dStr][pmsCat] !== undefined ? availMap[dStr][pmsCat] : 0;
                }

                let isAdjacent = false;
                if (i > 0) {
                    const prevMs = window.parseYMD(datesToProcess[i - 1]);
                    if (dMs - prevMs === 86400000) isAdjacent = true;
                }

                if (availToday !== currentAvail || (i > 0 && !isAdjacent)) {
                    if (rangeStart !== null && currentAvail !== null) {
                        availPayload.push({
                            property_id: propId, room_type_id: roomTypeId,
                            date_from: rangeStart, date_to: datesToProcess[i - 1],
                            availability: currentAvail
                        });
                    }
                    rangeStart = dStr;
                    currentAvail = availToday;
                }

                if (i === datesToProcess.length - 1 && rangeStart !== null && currentAvail !== null) {
                    availPayload.push({
                        property_id: propId, room_type_id: roomTypeId,
                        date_from: rangeStart, date_to: dStr,
                        availability: currentAvail
                    });
                }
            }
        });

        rateMap.forEach(mapRule => {
            const ratePlanId = mapRule.ratePlanId;
            const pmsCat = window.categoryResolver(mapRule.pmsCategory);
            if (!pmsCat) return;

            const ruleType = mapRule.ruleType || "=";
            const ruleVal = mapRule.ruleVal !== undefined ? parseFloat(mapRule.ruleVal) : 0;

            let rangeStart = null;
            let currentObj = null;

            for (let i = 0; i < datesToProcess.length; i++) {
                const dStr = datesToProcess[i];
                const dMs = window.parseYMD(dStr);
                const dayData = window.masterPricing.timeline[dStr] || {};
                const rData = dayData[pmsCat] || {};
                const gData = dayData['GLOBAL'] || {};

                let dayPayload = {};

                // Standard and Non-Refundable rates derive from rData.std (which holds the standard pricing arc)
                // Only rate plans explicitly configured as EVT packages use rData.fmp
                let activePrice = (mapRule.rateSource === 'evt' && rData.fmp && rData.fmp !== "")
                    ? rData.fmp
                    : rData.std;

                let modifiedPrice = null;
                const otaOverride = dayData.otaOverrides?.[ratePlanId];

                if (otaOverride !== undefined) {
                    modifiedPrice = otaOverride;
                } else if (activePrice !== undefined && activePrice !== "") {
                    modifiedPrice = window.applyMath(activePrice, ruleType, ruleVal);

                    let promoMultiplier = 1.0;
                    (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
                        const isChannelMatch = pr.channel === 'ALL' || mapRule.ratePlanTitle.toLowerCase().includes(pr.channel.toLowerCase());
                        const isScopeMatch = pr.scope === 'ALL' || pr.scope === pmsCat;
                        const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dStr >= pr.startDate && dStr <= pr.endDate);

                        if (isChannelMatch && isScopeMatch && isDateMatch) {
                            const disc = pr.discountPct / 100;
                            if (disc > 0 && disc < 1) {
                                promoMultiplier *= (1 / (1 - disc));
                            }
                        }
                    });
                    modifiedPrice *= promoMultiplier;
                }

                const fullState = {};
                if (modifiedPrice !== null && modifiedPrice !== "" && !isNaN(Number(modifiedPrice))) {
                    fullState.rate = Math.round(Number(modifiedPrice) * 100);
                }

                const otaMin = dayData.otaOverrides?.[`${ratePlanId}_min`];
                const otaMinArr = dayData.otaOverrides?.[`${ratePlanId}_min_arr`];
                const otaMax = dayData.otaOverrides?.[`${ratePlanId}_max`];
                const otaCta = dayData.otaOverrides?.[`${ratePlanId}_cta`];
                const otaCtd = dayData.otaOverrides?.[`${ratePlanId}_ctd`];
                const otaStop = dayData.otaOverrides?.[`${ratePlanId}_stopSell`];

                const minStayThrough = otaMin !== undefined ? otaMin : (rData.min !== undefined && rData.min !== "" ? rData.min : (gData.min !== undefined && gData.min !== "" ? gData.min : 1));
                const minStayArrival = otaMinArr !== undefined ? otaMinArr : (rData.min_arr !== undefined && rData.min_arr !== "" ? rData.min_arr : (gData.min_arr !== undefined && gData.min_arr !== "" ? gData.min_arr : minStayThrough));

                fullState.min_stay_arrival = parseInt(minStayArrival) || 1;
                fullState.min_stay_through = parseInt(minStayThrough) || 1;

                const maxStay = otaMax !== undefined ? otaMax : (rData.max !== undefined && rData.max !== "" ? rData.max : (gData.max || 365));
                fullState.max_stay = parseInt(maxStay) || 365;

                fullState.closed_to_arrival = otaCta !== undefined ? otaCta : (rData.cta !== undefined ? rData.cta : (gData.cta === true));
                fullState.closed_to_departure = otaCtd !== undefined ? otaCtd : (rData.ctd !== undefined ? rData.ctd : (gData.ctd === true));
                fullState.stop_sell = otaStop !== undefined ? otaStop : (rData.stopSell !== undefined ? rData.stopSell : (gData.stopSell === true));

                if (mode === 'full' && (modifiedPrice === null || modifiedPrice === "")) {
                    let isDorm = pmsCat.toLowerCase().includes('dorm');
                    let fallbackBase = isDorm
                        ? (parseFloat(document.getElementById('w-d-base')?.value) || parseFloat(document.getElementById('w-d-base-single')?.value) || 199)
                        : (parseFloat(document.getElementById('w-p-base')?.value) || parseFloat(document.getElementById('w-p-base-single')?.value) || 899);
                    modifiedPrice = window.applyMath(fallbackBase, ruleType, ruleVal);

                    let promoMultiplier = 1.0;
                    (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
                        const isChannelMatch = pr.channel === 'ALL' || mapRule.ratePlanTitle.toLowerCase().includes(pr.channel.toLowerCase());
                        const isScopeMatch = pr.scope === 'ALL' || pr.scope === pmsCat;
                        const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dStr >= pr.startDate && dStr <= pr.endDate);

                        if (isChannelMatch && isScopeMatch && isDateMatch) {
                            const disc = pr.discountPct / 100;
                            if (disc > 0 && disc < 1) {
                                promoMultiplier *= (1 / (1 - disc));
                            }
                        }
                    });
                    modifiedPrice *= promoMultiplier;
                    fullState.rate = Math.round(modifiedPrice * 100);
                }

                if (mode === 'delta') {
                    const dFields = window.dirtyFields?.[dStr]?.[ratePlanId];
                    if (dFields) {
                        if (dFields.has('rate') && fullState.rate !== undefined) dayPayload.rate = fullState.rate;
                        if (dFields.has('min_stay_arrival') || dFields.has('min_stay_through') || dFields.has('min') || dFields.has('min_arr')) {
                            dayPayload.min_stay_arrival = fullState.min_stay_arrival;
                            dayPayload.min_stay_through = fullState.min_stay_through;
                        }
                        if (dFields.has('max') && fullState.max_stay !== undefined) dayPayload.max_stay = fullState.max_stay;
                        if (dFields.has('cta') && fullState.closed_to_arrival !== undefined) dayPayload.closed_to_arrival = fullState.closed_to_arrival;
                        if (dFields.has('ctd') && fullState.closed_to_departure !== undefined) dayPayload.closed_to_departure = fullState.closed_to_departure;
                        if (dFields.has('stopSell') && fullState.stop_sell !== undefined) dayPayload.stop_sell = fullState.stop_sell;
                    }
                } else {
                    dayPayload = fullState;
                }

                if (Object.keys(dayPayload).length === 0) {
                    if (rangeStart !== null) {
                        restPayload.push({
                            property_id: propId, rate_plan_id: ratePlanId,
                            date_from: rangeStart, date_to: datesToProcess[i - 1], ...currentObj
                        });
                        rangeStart = null; currentObj = null;
                    }
                    continue;
                }

                const isMatch = currentObj && JSON.stringify(currentObj) === JSON.stringify(dayPayload);

                let isAdjacent = false;
                if (i > 0) {
                    const prevMs = window.parseYMD(datesToProcess[i - 1]);
                    if (dMs - prevMs === 86400000) isAdjacent = true;
                }

                if (!isMatch || (i > 0 && !isAdjacent)) {
                    if (rangeStart !== null && Object.keys(currentObj || {}).length > 0) {
                        restPayload.push({
                            property_id: propId, rate_plan_id: ratePlanId,
                            date_from: rangeStart, date_to: datesToProcess[i - 1], ...currentObj
                        });
                    }
                    rangeStart = Object.keys(dayPayload).length > 0 ? dStr : null;
                    currentObj = Object.keys(dayPayload).length > 0 ? dayPayload : null;
                }

                if (i === datesToProcess.length - 1 && rangeStart !== null && Object.keys(currentObj || {}).length > 0) {
                    restPayload.push({
                        property_id: propId, rate_plan_id: ratePlanId,
                        date_from: rangeStart, date_to: dStr, ...currentObj
                    });
                }
            }
        });

        if (availPayload.length === 0 && restPayload.length === 0) {
            if (mode === 'delta') {
                window.dirtyDates.clear();
                window.dirtyFields = {};
                if (window.renderGrid) window.renderGrid();
                return window.customAlert("✅ All isolated changes have been successfully processed.\n\n(No new restricted payload data required pushing).");
            } else {
                throw new Error("Payload is empty. No specific changes were made.");
            }
        }

        const baseUrl = window.getChannexBaseUrl();

        if (availPayload.length > 0) {
            if (statusEl) statusEl.innerText = `PUSHING INVENTORY TO CHANNEX...`;
            const aRes = await window.fetchWithRetry(`${baseUrl}/availability`, {
                method: "POST",
                headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify({ values: availPayload })
            });
            const aData = await aRes.json();
            if (!aRes.ok && aRes.status !== 429) throw new Error("Availability Push Failed: " + JSON.stringify(aData));
        }

        if (restPayload.length > 0) {
            if (statusEl) statusEl.innerText = `PUSHING RATES TO CHANNEX...`;
            const rRes = await window.fetchWithRetry(`${baseUrl}/restrictions`, {
                method: "POST",
                headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify({ values: restPayload })
            });

            let responseData;
            try { responseData = await rRes.json(); } catch (e) { responseData = { error: "Unparseable response" }; }

            if (!rRes.ok && rRes.status !== 429) {
                let errMsg = "Unknown Error";
                if (responseData.errors && responseData.errors.length > 0) errMsg = responseData.errors[0].title || responseData.errors[0].detail || JSON.stringify(responseData.errors[0]);
                else if (responseData.error) errMsg = responseData.error;
                throw new Error(errMsg + "\n\nRaw Payload Response: " + JSON.stringify(responseData));
            }
        }

        const totalChanges = availPayload.length + restPayload.length;

        if (mode === 'delta') {
            window.syncedDates = new Set(window.dirtyDates);
            window.dirtyDates.clear();
            window.dirtyFields = {};
            if (window.renderGrid) window.renderGrid();
            window.customAlert(`✅ ${totalChanges} change${totalChanges === 1 ? '' : 's'} confirmed on Channex!`);
        } else {
            window.customAlert("✅ Full 500 day sync confirmed on Channex!");
        }

    } catch (err) {
        console.error("Channex Sync Error:", err);
        window.customAlert("❌ Sync Failed:\n\n" + err.message);
    } finally {
        window.hideLoader();
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
        if (window.lucide) window.lucide.createIcons();
    }
};
