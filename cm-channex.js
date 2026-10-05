// ==========================================================================
// CHANNEL MANAGER CHANNEX API & OTA MAPPING (cm-channex.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-channex.js
// ==========================================================================

// --- 1. CHANNEX REST API CLIENT WITH EXPONENTIAL BACKOFF RETRY ---
window.fetchWithRetry = async (url, options = {}, retries = 4, backoff = 1000) => {
    try {
        const res = await fetch(url, options);
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
            console.warn(`⏳ Channex Rate limit (429). Retrying in ${waitTime}ms...`);
            await new Promise(r => setTimeout(r, waitTime));
            return window.fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        return res;
    } catch (err) {
        if (retries > 0) {
            console.warn(`⚠️ Network fetch error. Retrying in ${backoff}ms...`, err);
            await new Promise(r => setTimeout(r, backoff));
            return window.fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
};

window.fetchAllChannex = async (endpoint, apiKey, propId) => {
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `https://app.channex.io/api/v1/${endpoint}?filter[property_id]=${propId}&pagination[page]=${page}&pagination[limit]=100`;
        const res = await window.fetchWithRetry(url, {
            headers: {
                "user-api-key": apiKey,
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.errors?.title || `Channex API error: ${res.statusText}`);
        }

        const json = await res.json();
        const data = json.data || [];
        allData = allData.concat(data);

        if (json.meta && json.meta.total !== undefined) {
            hasMore = allData.length < json.meta.total;
        } else {
            hasMore = data.length >= 100;
        }
        page++;
    }
    return allData;
};

// --- 2. CREDENTIALS & INITIAL DISCOVERY ---
window.saveCredentialsAndFetch = async () => {
    const apiKey = document.getElementById('chan-api-key')?.value.trim() 
        || window.channexConfig?.apiKey 
        || window.MASTER_CHANNEX_API_KEY 
        || localStorage.getItem('cm_master_channex_api_key') 
        || "";

    const propId = document.getElementById('chan-prop-id')?.value.trim() 
        || window.channexConfig?.propId 
        || "";

    if (!apiKey || !propId) {
        return window.customAlert("Please provide both your Channex API Key and Property ID.");
    }

    localStorage.setItem('cm_master_channex_api_key', apiKey);
    window.MASTER_CHANNEX_API_KEY = apiKey;

    window.showLoader('VALIDATING & CONNECTING...');

    try {
        const testRes = await fetch(`https://app.channex.io/api/v1/properties/${propId}`, {
            headers: {
                "user-api-key": apiKey,
                "Content-Type": "application/json"
            }
        });

        if (!testRes.ok) {
            const err = await testRes.json().catch(() => ({}));
            throw new Error(err?.errors?.title || "Invalid API Key or Property ID.");
        }

        const propJson = await testRes.json();
        const propTitle = propJson.data?.attributes?.title || 'Unknown Property';

        window.channexConfig = { apiKey, propId, env: 'production' };
        localStorage.setItem(`cm_channex_${window.currentPropertyId}`, JSON.stringify(window.channexConfig));

        const { doc, updateDoc } = window.cmFs;
        await updateDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), {
            channex: window.channexConfig
        });

        window.customAlert(`Success!\n\nConnected to Channex: "${propTitle}". Fetching room inventory and rate plans...`);
        await window.fetchChannexData();

    } catch (err) {
        console.error("Credentials error:", err);
        window.hideLoader();
        window.customAlert("Connection Failed:\n\n" + err.message);
    }
};

window.fetchChannexData = async () => {
    const apiKey = window.channexConfig?.apiKey 
        || document.getElementById('chan-api-key')?.value.trim() 
        || window.MASTER_CHANNEX_API_KEY 
        || localStorage.getItem('cm_master_channex_api_key');

    const propId = window.channexConfig?.propId || document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return window.customAlert("Channex credentials missing. Enter API key and Property ID first.");
    }

    window.showLoader('FETCHING CHANNEX INVENTORY...');

    try {
        const roomData = await window.fetchAllChannex('room_types', apiKey, propId);
        const rawRateData = await window.fetchAllChannex('rate_plans', apiKey, propId);

        const rateData = rawRateData.filter(rate => {
            if (rate.attributes?.parent_rate_plan_id) return false;
            if (rate.relationships?.parent_rate_plan?.data?.id) return false;
            const title = rate.attributes?.title || '';
            if (/ - (BookingCom|Hostelworld|Agoda|Expedia|Airbnb|Hotelbeds|Ctrip|TripCom)\b/i.test(title)) return false;
            return true;
        });

        const roomNameMap = {};
        roomData.forEach(r => {
            roomNameMap[r.id] = r.attributes.title;
        });

        rateData.forEach(rate => {
            const parentRoomId = rate.relationships?.room_type?.data?.id;
            if (parentRoomId && roomNameMap[parentRoomId]) {
                rate.attributes.title = `${rate.attributes.title} [${roomNameMap[parentRoomId]}]`;
            }
        });

        window.renderChannexMapping(roomData);
        window.renderChannexRateMapping(rateData);
        window.hideLoader();
        window.customAlert(`Fetched ${roomData.length} Room Types and ${rateData.length} Master Rate Plans from Channex!`);
    } catch (err) {
        console.error("Fetch Channex Data error:", err);
        window.hideLoader();
        window.customAlert("Fetch Error:\n\n" + err.message);
    }
};

// --- 3. MAPPING UI RENDERERS ---
window.getPmsCategoryOptionsHtml = () => {
    let opts = '<option value="">-- UNMAPPED / IGNORED --</option>';
    (window.roomTypes || []).forEach(rt => {
        opts += `<option value="${rt}">${rt}</option>`;
    });
    return opts;
};

window.renderChannexMapping = (channexRooms = null) => {
    const container = document.getElementById('channex-mapping-container');
    if (!container) return;

    if (!channexRooms) {
        if (!window.channexMap || window.channexMap.length === 0) {
            container.innerHTML = `<div class="text-center py-6 text-slate-400 font-bold text-xs italic">No room mappings configured yet. Click Save & Fetch above.</div>`;
            return;
        }

        const pmsOptions = window.getPmsCategoryOptionsHtml();
        let html = '<div class="flex flex-col gap-1.5">';
        window.channexMap.forEach(map => {
            let catOptions = pmsOptions;
            let warningTag = '';

            if (map.pmsCategory && !(window.roomTypes || []).includes(map.pmsCategory)) {
                catOptions = `<option value="${map.pmsCategory}" selected class="text-red-600 font-black">⚠️ ${map.pmsCategory} (RENAMED / NOT IN SETTINGS)</option>` + pmsOptions;
                warningTag = ` <span class="text-red-500 font-black text-[9px]">(RENAMED IN SETTINGS)</span>`;
            } else {
                catOptions = catOptions.replace(`value="${map.pmsCategory}"`, `value="${map.pmsCategory}" selected`);
            }

            html += `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200 shadow-sm chan-map-row" data-channex-id="${map.channexId}" data-channex-title="${map.channexTitle}">
                    <div class="flex-1 flex flex-col min-w-0 pl-1">
                        <span class="font-bold text-slate-800 text-[11px] truncate" title="${map.channexTitle}">${map.channexTitle}${warningTag}</span>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Channex ID: ${map.channexId}</span>
                    </div>
                    <i data-lucide="arrow-right" size="14" class="text-slate-400 shrink-0"></i>
                    <select class="input-base !py-1 !text-xs !w-44 cursor-pointer chan-pms-sel bg-slate-50 border-slate-300 text-slate-700 font-bold">
                        ${catOptions}
                    </select>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
        if (window.renderChannexRateMapping) window.renderChannexRateMapping();
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const pmsOptions = window.getPmsCategoryOptionsHtml();
    let html = '<div class="flex flex-col gap-1.5">';
    channexRooms.forEach(room => {
        const existingMap = (window.channexMap || []).find(m => m.channexId === room.id);
        let selectedVal = existingMap ? existingMap.pmsCategory : '';
        let catOptions = pmsOptions;
        let warningTag = '';

        if (selectedVal && !(window.roomTypes || []).includes(selectedVal)) {
            catOptions = `<option value="${selectedVal}" selected class="text-red-600 font-black">⚠️ ${selectedVal} (RENAMED / NOT IN SETTINGS)</option>` + pmsOptions;
            warningTag = ` <span class="text-red-500 font-black text-[9px]">(RENAMED IN SETTINGS)</span>`;
        } else {
            catOptions = catOptions.replace(`value="${selectedVal}"`, `value="${selectedVal}" selected`);
        }

        html += `
            <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200 shadow-sm chan-map-row" data-channex-id="${room.id}" data-channex-title="${room.attributes.title}">
                <div class="flex-1 flex flex-col min-w-0 pl-1">
                    <span class="font-bold text-slate-800 text-[11px] truncate" title="${room.attributes.title}">${room.attributes.title}${warningTag}</span>
                    <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Channex ID: ${room.id}</span>
                </div>
                <i data-lucide="arrow-right" size="14" class="text-slate-400 shrink-0"></i>
                <select class="input-base !py-1 !text-xs !w-44 cursor-pointer chan-pms-sel bg-slate-50 border-slate-300 text-slate-700 font-bold">
                    ${catOptions}
                </select>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.renderChannexRateMapping = (channexRates = null) => {
    const rateContainer = document.getElementById('channex-rate-mapping-container');
    const rateCard = document.getElementById('channex-rate-mapping-card');
    if (!rateContainer) return;

    if (!channexRates) {
        if (!window.channexRateMap || window.channexRateMap.length === 0) {
            if (rateCard) rateCard.style.display = 'none';
            return;
        }

        const cleanRateMap = window.channexRateMap.filter(rate => {
            const title = rate.ratePlanTitle || '';
            if (/ - (BookingCom|Hostelworld|Agoda|Expedia|Airbnb|Hotelbeds|Ctrip|TripCom)\b/i.test(title)) return false;
            return true;
        });

        if (rateCard) {
            rateCard.style.display = 'flex';
            rateCard.classList.remove('hidden');
        }

        const pmsOptions = window.getPmsCategoryOptionsHtml();
        let rHtml = '<div class="flex flex-col gap-1.5">';
        cleanRateMap.forEach(map => {
            let catOptions = pmsOptions;
            let warningTag = '';

            if (map.pmsCategory && !(window.roomTypes || []).includes(map.pmsCategory)) {
                catOptions = `<option value="${map.pmsCategory}" selected class="text-red-600 font-black">⚠️ ${map.pmsCategory} (RENAMED / NOT IN SETTINGS)</option>` + pmsOptions;
                warningTag = ` <span class="text-red-500 font-black text-[9px]">(RENAMED IN SETTINGS)</span>`;
            } else {
                catOptions = catOptions.replace(`value="${map.pmsCategory}"`, `value="${map.pmsCategory}" selected`);
            }

            const ruleType = map.ruleType || "=";
            const ruleVal = map.ruleVal !== undefined ? map.ruleVal : "";
            const rateSource = map.rateSource || "std";
            const displayTitle = window.formatRatePlanTitle ? window.formatRatePlanTitle(map.ratePlanTitle, true) : map.ratePlanTitle;

            rHtml += `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-amber-200 shadow-sm chan-rate-map-row" data-rate-id="${map.ratePlanId}" data-rate-title="${map.ratePlanTitle}">
                    <div class="flex-1 flex flex-col min-w-0 pl-1">
                        <span class="font-bold text-slate-800 text-[11px] truncate" title="${map.ratePlanTitle}">${displayTitle}${warningTag}</span>
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Channex Rate Plan</span>
                    </div>
                    <i data-lucide="arrow-right" size="12" class="text-amber-500 shrink-0"></i>
                    <select class="input-base !py-0.5 !text-[10px] !w-32 cursor-pointer chan-rate-pms-sel bg-slate-50 border-amber-300 text-amber-800 shadow-none font-bold">
                        ${catOptions}
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
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    if (channexRates && channexRates.length > 0) {
        if (rateCard) {
            rateCard.style.display = 'flex';
            rateCard.classList.remove('hidden');
        }

        const cleanRates = channexRates.filter(rate => {
            if (rate.attributes?.parent_rate_plan_id) return false;
            if (rate.relationships?.parent_rate_plan?.data?.id) return false;
            const title = rate.attributes?.title || '';
            if (/ - (BookingCom|Hostelworld|Agoda|Expedia|Airbnb|Hotelbeds|Ctrip|TripCom)\b/i.test(title)) return false;
            return true;
        });

        const pmsOptions = window.getPmsCategoryOptionsHtml();

        let rHtml = '<div class="flex flex-col gap-1.5">';
        cleanRates.forEach(rate => {
            const existingMap = (window.channexRateMap || []).find(m => m.ratePlanId === rate.id);
            let selectedVal = existingMap ? existingMap.pmsCategory : '';
            let ruleType = existingMap ? (existingMap.ruleType || "=") : "=";
            let ruleVal = existingMap && existingMap.ruleVal !== undefined ? existingMap.ruleVal : "";
            let rateSource = existingMap ? (existingMap.rateSource || "std") : "std";

            const displayTitle = window.formatRatePlanTitle ? window.formatRatePlanTitle(rate.attributes.title, true) : rate.attributes.title;

            rHtml += `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded border border-amber-200 shadow-sm chan-rate-map-row" data-rate-id="${rate.id}" data-rate-title="${rate.attributes.title}">
                    <div class="flex-1 flex flex-col min-w-0 pl-1">
                        <span class="font-bold text-slate-800 text-[11px] truncate" title="${rate.attributes.title}">${displayTitle}</span>
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
        rateCard.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
};

// --- 4. PERSIST MAPPINGS TO CLOUD ---
window.saveMappingToDB = async (notify = false) => {
    const rows = document.querySelectorAll('.chan-map-row');
    const newMap = [];
    rows.forEach(r => {
        const cId = r.dataset.channexId;
        const cTitle = r.dataset.channexTitle;
        const sel = r.querySelector('.chan-pms-sel');
        const pmsCat = sel ? sel.value : '';
        if (cId && pmsCat) {
            newMap.push({ channexId: cId, channexTitle: cTitle, pmsCategory: pmsCat });
        }
    });

    const rateRows = document.querySelectorAll('.chan-rate-map-row');
    const newRateMap = [];
    rateRows.forEach(r => {
        const rId = r.dataset.rateId;
        const rTitle = r.dataset.rateTitle;
        const sel = r.querySelector('.chan-rate-pms-sel');
        const pmsCat = sel ? sel.value : '';
        const srcSel = r.querySelector('.chan-rate-source');
        const rateSource = srcSel ? srcSel.value : 'std';
        const typeSel = r.querySelector('.chan-rate-rule-type');
        const ruleType = typeSel ? typeSel.value : '=';
        const valInp = r.querySelector('.chan-rate-rule-val');
        const ruleVal = valInp && valInp.value !== '' ? parseFloat(valInp.value) : 0;

        if (rId && pmsCat) {
            newRateMap.push({ ratePlanId: rId, ratePlanTitle: rTitle, pmsCategory: pmsCat, rateSource, ruleType, ruleVal });
        }
    });

    try {
        const { doc, updateDoc } = window.cmFs;
        await updateDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), {
            channexMap: newMap,
            channexRateMap: newRateMap
        });
        window.channexMap = newMap;
        window.channexRateMap = newRateMap;

        if (notify) window.customAlert("Mappings successfully saved to database!");
        if (window.renderGrid) window.renderGrid();
    } catch (err) {
        console.error("Save mapping error:", err);
        if (notify) window.customAlert("Save Error:\n\n" + err.message);
    }
};

// --- 5. COMPRESS CONTIGUOUS RANGES & DISPATCH TO CHANNEX ---
window.pushToChannexAPI = async (btn, mode = 'delta') => {
    const apiKey = window.channexConfig?.apiKey 
        || window.MASTER_CHANNEX_API_KEY 
        || localStorage.getItem('cm_master_channex_api_key');

    const propId = window.channexConfig?.propId;

    if (!apiKey || !propId) {
        return window.customAlert("Channex credentials not set up. Please map Channex in Tab 5 first.");
    }
    if (!window.channexMap || window.channexMap.length === 0) {
        return window.customAlert("No room mappings found. Please map your room types in Tab 5 first.");
    }

    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline" size="14"></i> SYNCING...';
        btn.disabled = true;
    }

    try {
        let datesToProcess = [];
        if (mode === 'delta') {
            datesToProcess = Array.from(window.dirtyDates).sort();
            if (datesToProcess.length === 0) {
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                return window.customAlert("All clear! No unsynced changes to push.");
            }
        } else {
            const startStr = document.getElementById('tape-start')?.value || window.getLocalYMD(new Date());
            const sU = window.parseYMD(startStr);
            for (let i = 0; i < 500; i++) {
                datesToProcess.push(window.getLocalYMD(new Date(sU + (i * 86400000))));
            }
        }

        const availPayload = [];
        const restrPayload = [];

        // 1. Availability: Group by Channex Room Type
        window.channexMap.forEach(rule => {
            if (!rule.channexId || !rule.pmsCategory) return;
            const pmsCat = rule.pmsCategory;
            const roomTypeId = rule.channexId;

            let rangeStart = null;
            let currentAvail = null;

            for (let i = 0; i < datesToProcess.length; i++) {
                const dStr = datesToProcess[i];

                let otaAvail = window.masterPricing.timeline[dStr]?.otaOverrides?.[`${pmsCat}_avail`];
                let live = (window.liveInventory[dStr] && window.liveInventory[dStr][pmsCat] !== undefined)
                    ? window.liveInventory[dStr][pmsCat]
                    : 0;
                let availToday = otaAvail !== undefined ? otaAvail : live;

                let isAdjacent = false;
                if (i > 0) {
                    const prevMs = window.parseYMD(datesToProcess[i - 1]);
                    const dMs = window.parseYMD(dStr);
                    if (dMs - prevMs === 86400000) isAdjacent = true;
                }

                if (availToday !== currentAvail || (i > 0 && !isAdjacent)) {
                    if (rangeStart !== null && currentAvail !== null) {
                        availPayload.push({
                            property_id: propId,
                            room_type_id: roomTypeId,
                            date_from: rangeStart,
                            date_to: datesToProcess[i - 1],
                            availability: currentAvail
                        });
                    }
                    rangeStart = dStr;
                    currentAvail = availToday;
                }

                if (i === datesToProcess.length - 1 && rangeStart !== null && currentAvail !== null) {
                    availPayload.push({
                        property_id: propId,
                        room_type_id: roomTypeId,
                        date_from: rangeStart,
                        date_to: dStr,
                        availability: currentAvail
                    });
                }
            }
        });

        // 2. Rates & Restrictions: Clean objects containing ONLY non-null active fields
        (window.channexRateMap || []).forEach(rule => {
            if (!rule.ratePlanId || !rule.pmsCategory) return;
            const pmsCat = rule.pmsCategory;
            const ratePlanId = rule.ratePlanId;
            const rType = rule.ruleType || "=";
            const rVal = rule.ruleVal !== undefined ? rule.ruleVal : 0;
            const rateSource = rule.rateSource || "std";

            let rangeStart = null;
            let currentItem = null;

            for (let i = 0; i < datesToProcess.length; i++) {
                const dStr = datesToProcess[i];
                const dayObj = window.masterPricing.timeline[dStr] || {};
                const roomObj = dayObj[pmsCat] || {};
                const globObj = dayObj['GLOBAL'] || {};

                const dirtyFieldsSet = window.dirtyFields?.[dStr]?.[ratePlanId];

                // In delta mode, skip dates that have no modified fields
                if (mode === 'delta') {
                    if (!dirtyFieldsSet || dirtyFieldsSet.size === 0) {
                        if (rangeStart !== null && currentItem !== null && Object.keys(currentItem).length > 0) {
                            restrPayload.push({
                                property_id: propId,
                                rate_plan_id: ratePlanId,
                                date_from: rangeStart,
                                date_to: datesToProcess[i - 1],
                                ...currentItem
                            });
                            rangeStart = null;
                            currentItem = null;
                        }
                        continue;
                    }
                }

                // Calculate Live Price
                let calculatedPrice = null;
                const otaPriceOverride = dayObj.otaOverrides?.[ratePlanId];

                if (otaPriceOverride !== undefined && otaPriceOverride !== "") {
                    calculatedPrice = window.roundCurrency(otaPriceOverride);
                } else {
                    let activeBasePrice = (rateSource === 'evt' && (window.eventDates || []).length > 0 && roomObj.fmp !== undefined && roomObj.fmp !== "")
                        ? roomObj.fmp
                        : roomObj.std;

                    let promoMultiplier = 1.0;
                    (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
                        const isChannelMatch = window.isRatePlanMatchingChannel 
                            ? window.isRatePlanMatchingChannel(rule.ratePlanTitle, pr.channel)
                            : (pr.channel === 'ALL' || rule.ratePlanTitle.toLowerCase().includes(pr.channel.toLowerCase()));
                        const isScopeMatch = pr.scope === 'ALL' || pr.scope === pmsCat;
                        const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dStr >= pr.startDate && dStr <= pr.endDate);

                        if (isChannelMatch && isScopeMatch && isDateMatch) {
                            const disc = pr.discountPct / 100;
                            if (disc > 0 && disc < 1) {
                                promoMultiplier *= (1 / (1 - disc));
                            }
                        }
                    });

                    if (activeBasePrice !== undefined && activeBasePrice !== "") {
                        let modPrice = window.applyMath(activeBasePrice, rType, rVal);
                        modPrice *= promoMultiplier;
                        calculatedPrice = window.roundCurrency(modPrice);
                    }
                }

                const getRestr = (f) => {
                    const otaVal = dayObj.otaOverrides?.[`${ratePlanId}_${f}`];
                    if (otaVal !== undefined && otaVal !== "") return otaVal;
                    if (roomObj[f] !== undefined && roomObj[f] !== "") return roomObj[f];
                    if (globObj[f] !== undefined && globObj[f] !== "") return globObj[f];
                    return null;
                };

                // Build restriction object WITHOUT explicit null properties
                const todayRestrictions = {};
                if (calculatedPrice !== null && !isNaN(calculatedPrice) && calculatedPrice > 0) {
                    todayRestrictions.rate = Math.round(calculatedPrice * 100);
                }

                const minS = getRestr('min');
                if (minS !== null && minS !== "") todayRestrictions.min_stay_arrival = parseInt(minS);

                const minArr = getRestr('min_arr');
                if (minArr !== null && minArr !== "") todayRestrictions.min_stay_through = parseInt(minArr);

                const maxS = getRestr('max');
                if (maxS !== null && maxS !== "") todayRestrictions.max_stay = parseInt(maxS);

                const cta = getRestr('cta');
                if (cta !== null && cta !== "") todayRestrictions.closed_to_arrival = !!cta;

                const ctd = getRestr('ctd');
                if (ctd !== null && ctd !== "") todayRestrictions.closed_to_departure = !!ctd;

                const stop = getRestr('stopSell');
                if (stop !== null && stop !== "") todayRestrictions.stop_sell = !!stop;

                const itemJson = JSON.stringify(todayRestrictions);

                let isAdjacent = false;
                if (i > 0) {
                    const prevMs = window.parseYMD(datesToProcess[i - 1]);
                    const dMs = window.parseYMD(dStr);
                    if (dMs - prevMs === 86400000) isAdjacent = true;
                }

                if (JSON.stringify(currentItem) !== itemJson || (i > 0 && !isAdjacent)) {
                    if (rangeStart !== null && currentItem !== null && Object.keys(currentItem).length > 0) {
                        restrPayload.push({
                            property_id: propId,
                            rate_plan_id: ratePlanId,
                            date_from: rangeStart,
                            date_to: datesToProcess[i - 1],
                            ...currentItem
                        });
                    }
                    rangeStart = dStr;
                    currentItem = todayRestrictions;
                }

                if (i === datesToProcess.length - 1 && rangeStart !== null && currentItem !== null && Object.keys(currentItem).length > 0) {
                    restrPayload.push({
                        property_id: propId,
                        rate_plan_id: ratePlanId,
                        date_from: rangeStart,
                        date_to: dStr,
                        ...currentItem
                    });
                }
            }
        });

        // 3. Dispatch Payloads in 50-Item Chunks
        let availSuccess = true;
        let restrSuccess = true;

        const sendBatches = async (endpoint, payload) => {
            const chunkSize = 50;
            let allOk = true;
            for (let i = 0; i < payload.length; i += chunkSize) {
                const chunk = payload.slice(i, i + chunkSize);
                const res = await window.fetchWithRetry(`https://app.channex.io/api/v1/${endpoint}`, {
                    method: "POST",
                    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                    body: JSON.stringify({ values: chunk })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    console.error(`❌ Channex ${endpoint} sync failure on batch ${i}:`, err);
                    allOk = false;
                }
            }
            return allOk;
        };

        if (availPayload.length > 0) {
            console.log("Pushing Availability Ranges to Channex (Chunked):", availPayload);
            availSuccess = await sendBatches('availability', availPayload);
        }

        if (restrPayload.length > 0) {
            console.log("Pushing Restrictions to Channex (Chunked):", restrPayload);
            restrSuccess = await sendBatches('restrictions', restrPayload);
        }

        if (availSuccess && restrSuccess) {
            datesToProcess.forEach(d => {
                window.syncedDates.add(d);
                window.dirtyDates.delete(d);
            });
            window.dirtyFields = {};
            window.hasUnsavedChanges = false;
            window.updateSaveIndicator();
            if (window.renderGrid) window.renderGrid();

            window.customAlert(`Sync Successful!\n\nPushed ${availPayload.length} availability ranges and ${restrPayload.length} rate/restriction ranges to Channex.`);
        } else {
            throw new Error("One or more Channex endpoints rejected the payload. Check DevTools console for details.");
        }

    } catch (err) {
        console.error("Sync to Channex error:", err);
        window.customAlert("Sync Failed:\n\n" + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
        if (window.lucide) window.lucide.createIcons();
    }
};
