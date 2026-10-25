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
            const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff;
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

    const rateMultiplier = document.getElementById('chan-rate-multiplier') 
        ? parseFloat(document.getElementById('chan-rate-multiplier').value) 
        : (window.channexConfig?.rateMultiplier !== undefined ? window.channexConfig.rateMultiplier : 100);

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

        window.channexConfig = { apiKey, propId, rateMultiplier, env: 'production' };
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

        const rateData = rawRateData.filter(rate => rate && rate.attributes);

        const roomNameMap = {};
        roomData.forEach(r => {
            roomNameMap[r.id] = r.attributes.title;
        });

        rateData.forEach(rate => {
            const parentRoomId = rate.relationships?.room_type?.data?.id;
            if (parentRoomId && roomNameMap[parentRoomId]) {
                rate.roomTypeName = roomNameMap[parentRoomId];
                const currentTitle = rate.attributes.title || '';
                if (!currentTitle.includes(`[${roomNameMap[parentRoomId]}]`)) {
                    rate.attributes.title = `${currentTitle} [${roomNameMap[parentRoomId]}]`;
                }
            }
        });

        // AUTO-PAIR PMS CATEGORIES: Never leave freshly discovered plans unmapped
        const existingMap = window.channexRateMap || [];
        window.channexRateMap = rateData.map(rate => {
            const existing = existingMap.find(m => m.ratePlanId === rate.id);
            const parentRoomName = rate.roomTypeName || '';

            // Match Channex parent room title directly to a PMS category
            let assignedCategory = existing?.pmsCategory || '';
            if (!assignedCategory && parentRoomName) {
                assignedCategory = (window.roomTypes || []).find(rt => {
                    const cleanRt = rt.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const cleanCh = parentRoomName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return cleanRt === cleanCh || cleanCh.includes(cleanRt) || cleanRt.includes(cleanCh);
                }) || '';
            }

            const info = window.formatCleanRateTitle ? window.formatCleanRateTitle(rate.attributes?.title || '', assignedCategory || parentRoomName) : {};
            const classified = window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(rate.attributes?.title || '') : {};

            return {
                ratePlanId: rate.id,
                ratePlanTitle: rate.attributes?.title || '',
                channexRoomTitle: parentRoomName,
                pmsCategory: assignedCategory,
                channel: existing?.channel || info.channel || classified.channel || 'Default',
                product: existing?.product || (window.isEventPricingEnabled && !window.isEventPricingEnabled() ? 'std' : classified.product),
                policy: existing?.policy || info.policy || classified.policy,
                rateSource: (existing?.product || classified.product) === 'evt' ? 'evt' : 'std'
            };
        });

        window.renderChannexMapping(roomData);
        window.renderChannexRateMapping(rateData);
        if (window.renderDynamicOtaRules) window.renderDynamicOtaRules();
        window.hideLoader();
        window.customAlert(`Fetched ${roomData.length} Room Types and ${rateData.length} Rate Plans from Channex!\n\nAll rate plans have been paired to their rooms.`);
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

// PMS-Style Channel Badges
window.getChannelBadgeHtml = (channel) => {
    const ch = (channel || '').toLowerCase();
    if (ch.includes('booking') || ch.includes('bdc')) {
        return `<span class="bg-[#003580] text-white px-1.5 h-5 text-[10px] font-black flex items-center justify-center rounded shrink-0 shadow-xs" title="Booking.com">BDC</span>`;
    }
    if (ch.includes('hostelworld') || ch.includes('hw')) {
        return `<span class="bg-[#F15A24] text-white px-1.5 h-5 text-[10px] font-black flex items-center justify-center rounded shrink-0 shadow-xs" title="Hostelworld">HW</span>`;
    }
    if (ch.includes('agoda')) {
        return `<span class="bg-[#87B2D6] text-white px-1.5 h-5 text-[10px] font-black flex items-center justify-center rounded shrink-0 shadow-xs" title="Agoda">AG</span>`;
    }
    if (ch.includes('airbnb') || ch.includes('abnb')) {
        return `<span class="bg-[#FF5A5F] text-white px-1.5 h-5 text-[10px] font-black flex items-center justify-center rounded shrink-0 shadow-xs" title="Airbnb">ABnB</span>`;
    }
    if (ch.includes('expedia') || ch.includes('exp')) {
        return `<span class="bg-[#facc15] text-[#003580] px-1.5 h-5 text-[10px] font-black flex items-center justify-center rounded shrink-0 shadow-xs" title="Expedia">EXP</span>`;
    }
    return `<span class="bg-emerald-600 text-white px-1.5 h-5 text-[9px] font-black flex items-center justify-center rounded shrink-0 shadow-xs" title="Default Rate Plan">DEFAULT</span>`;
};

// Strips out property noise while preserving distinct room and rate plan names
window.formatCleanRateTitle = (rawTitle, parentRoomName = '') => {
    if (!rawTitle) return { planLabel: "Standard", roomTag: parentRoomName || "", fullDisplay: "Standard", channel: "Default", policy: "non-ref" };

    let clean = String(rawTitle).trim();

    // 1. Remove property names and repetitive extranet boilerplate
    const noisePatterns = [
        /-\s*BookingCom\s*BDC\s*-\s*LOUD!?\s*a\s*Boutique\s*Party\s*Hostel/gi,
        /-\s*BookingCom\s*BookingCom\s*-\s*LOUD!?\s*a\s*Boutique\s*Party\s*Hostel/gi,
        /-\s*BookingCom\s*Samui\s*Beach\s*Hostel\s*-\s*Legacy/gi,
        /-\s*LOUD!?\s*a\s*Boutique\s*Party\s*Hostel/gi,
        /-\s*Samui\s*Beach\s*Hostel\s*-\s*Legacy/gi,
        /-\s*Samui\s*Beach\s*Hostel/gi,
        /-\s*SWIMS\s*Beach\s*Resort/gi,
        /-\s*WET\s*Pool\s*Party\s*Hostel/gi,
        /\(Per Room.*?\)/gi,
        /\(.*?Persons.*?\)/gi
    ];
    noisePatterns.forEach(pattern => {
        clean = clean.replace(pattern, '');
    });
    clean = clean.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').replace(/\s+/g, ' ').trim();

    // 2. Identify Channel Specificity
    const isBdc = /bdc|booking/i.test(clean);
    const isHw = /hostelworld|hw\b/i.test(clean);
    const isExp = /expedia|exp\b/i.test(clean);
    const isAgo = /agoda/i.test(clean);

    let detectedChannel = 'Default';
    if (isBdc) detectedChannel = 'Booking.com';
    else if (isHw) detectedChannel = 'Hostelworld';
    else if (isExp) detectedChannel = 'Expedia';
    else if (isAgo) detectedChannel = 'Agoda';

    // 3. Identify Policy
    const isNonRef = /non-?ref/i.test(clean);
    const isRef = /ref|flexible|flex/i.test(clean) && !isNonRef;

    return {
        planLabel: clean || rawTitle,
        roomTag: parentRoomName || "",
        channel: detectedChannel,
        policy: isRef ? 'ref' : 'non-ref'
    };
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

// --- SMART CLASSIFIER FUZZY MATCHER & ALIAS RULES ---
window.mappingChannelFilter = 'ALL';

window.getClassifierAliases = () => {
    const defaultAliases = {
        channels: {
            'Booking.com': ['bdc', 'booking', 'booking.com', 'b.com', 'bcom'],
            'Default': ['default', 'base', 'rate', 'standard'],
            'Hostelworld': ['hw', 'hostelworld', 'hostel world'],
            'Agoda': ['agoda', 'ago', 'ycs'],
            'Expedia': ['expedia', 'exp', 'epc'],
            'Airbnb': ['airbnb', 'abnb']
        },
        products: {
            'evt': ['evt', 'event', 'fmp', 'full moon', 'party', 'pkg', 'package'],
            'std': ['std', 'standard', 'base']
        },
        policies: {
            'ref': ['ref', 'refundable', 'flex', 'flexible', 'std ref', 'standard refundable'],
            'non-ref': ['non-ref', 'non ref', 'nonref', 'nonrefundable', 'non-refundable', 'nr', 'nref']
        }
    };

    try {
        const stored = localStorage.getItem(`cm_classifier_aliases_${window.currentPropertyId}`);
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    return defaultAliases;
};

window.toggleClassifierHelpModal = () => {
    const modal = document.getElementById('classifier-help-modal');
    if (!modal) return;
    const aliases = window.getClassifierAliases();

    const setVal = (id, arr) => {
        const el = document.getElementById(id);
        if (el && arr) el.value = arr.join(', ');
    };

    setVal('alias-channel-bdc', aliases.channels['Booking.com']);
    setVal('alias-channel-hw', aliases.channels['Hostelworld']);
    setVal('alias-channel-agoda', aliases.channels['Agoda']);
    setVal('alias-channel-direct', aliases.channels['Default']);
    setVal('alias-product-evt', aliases.products['evt']);
    setVal('alias-policy-ref', aliases.policies['ref']);
    setVal('alias-policy-nonref', aliases.policies['non-ref']);

    modal.classList.add('active');
    modal.style.display = 'flex';
};

window.saveClassifierAliases = () => {
    const parseAliases = id => {
        const val = document.getElementById(id)?.value || '';
        return val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    };

    const updated = {
        channels: {
            'Booking.com': parseAliases('alias-channel-bdc'),
            'Hostelworld': parseAliases('alias-channel-hw'),
            'Agoda': parseAliases('alias-channel-agoda'),
            'Default': parseAliases('alias-channel-direct'),
            'Expedia': ['expedia', 'exp', 'epc'],
            'Airbnb': ['airbnb', 'abnb']
        },
        products: {
            'evt': parseAliases('alias-product-evt'),
            'std': ['std', 'standard', 'base']
        },
        policies: {
            'ref': parseAliases('alias-policy-ref'),
            'non-ref': parseAliases('alias-policy-nonref')
        }
    };

    localStorage.setItem(`cm_classifier_aliases_${window.currentPropertyId}`, JSON.stringify(updated));
    window.closeModal('classifier-help-modal');
    window.autoClassifyAllChannexRates();
    window.customAlert("Keyword rules saved! Auto-reclassifying rate plans...");
};

window.fuzzyClassifyTitle = (title) => {
    if (!title || typeof title !== 'string') {
        return { channel: 'Default', product: 'std', policy: 'non-ref' };
    }
    const aliases = window.getClassifierAliases();
    const clean = title.toLowerCase();

    // 1. Channel
    let detectedChannel = 'Default';
    for (const [ch, keywords] of Object.entries(aliases.channels)) {
        if (keywords.some(k => clean.includes(k) || new RegExp(`\\b${k}\\b`, 'i').test(clean))) {
            detectedChannel = ch;
            break;
        }
    }

    // 2. Product
    let detectedProduct = 'std';
    if (aliases.products.evt.some(k => clean.includes(k) || new RegExp(`\\b${k}\\b`, 'i').test(clean))) {
        detectedProduct = 'evt';
    }

    // 3. Policy
    let detectedPolicy = 'non-ref';
    if (aliases.policies['non-ref'].some(k => clean.includes(k) || new RegExp(`\\b${k}\\b`, 'i').test(clean))) {
        detectedPolicy = 'non-ref';
    } else if (aliases.policies['ref'].some(k => clean.includes(k) || new RegExp(`\\b${k}\\b`, 'i').test(clean))) {
        detectedPolicy = 'ref';
    }

    return { channel: detectedChannel, product: detectedProduct, policy: detectedPolicy };
};

window.setMappingChannelFilter = (channel) => {
    window.mappingChannelFilter = channel;
    const filterIds = ['ALL', 'Booking.com', 'Default', 'Hostelworld', 'Agoda', 'OTHER'];
    filterIds.forEach(f => {
        const btn = document.getElementById(`map-flt-${f}`);
        if (btn) {
            if (f === channel) {
                btn.className = "px-2 py-0.5 rounded text-[9px] font-black uppercase transition-colors bg-amber-600 text-white shadow-xs";
            } else {
                btn.className = "px-2 py-0.5 rounded text-[9px] font-black uppercase transition-colors bg-white text-slate-700 border border-slate-300 hover:bg-amber-50";
            }
        }
    });
    if (window.renderChannexRateMapping) window.renderChannexRateMapping();
};

window.autoClassifyAllChannexRates = () => {
    if (!window.channexRateMap || window.channexRateMap.length === 0) return;

    const isEvents = window.isEventPricingEnabled ? window.isEventPricingEnabled() : false;

    window.channexRateMap.forEach(map => {
        const classified = window.fuzzyClassifyTitle(map.ratePlanTitle);
        const info = window.formatCleanRateTitle ? window.formatCleanRateTitle(map.ratePlanTitle, map.pmsCategory) : {};
        map.channel = map.channel || info.channel || classified.channel || 'Default';
        map.product = isEvents ? (map.product || classified.product) : 'std';
        map.policy = map.policy || info.policy || classified.policy;
        map.rateSource = map.product === 'evt' ? 'evt' : 'std';
    });

    window.renderChannexRateMapping();
    window.markUnsavedChanges();
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

        if (rateCard) {
            rateCard.style.display = 'flex';
            rateCard.classList.remove('hidden');
        }

        const activeFilter = window.mappingChannelFilter || 'ALL';
        const cleanRateMap = window.channexRateMap.filter(rate => {
            const title = rate.ratePlanTitle || '';

            if (activeFilter !== 'ALL') {
                const rChan = rate.channel || (window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(title).channel : 'Default');
                if (activeFilter === 'OTHER') {
                    return !['Booking.com', 'Default', 'Hostelworld', 'Agoda'].includes(rChan);
                }
                return rChan === activeFilter;
            }
            return true;
        });

        const pmsOptions = window.getPmsCategoryOptionsHtml();
        let rHtml = '<div class="flex flex-col gap-1.5">';

        if (cleanRateMap.length === 0) {
            rHtml += `<div class="p-6 text-center text-xs font-bold text-slate-400">No rate plans match the "${activeFilter}" filter.</div>`;
        }

        cleanRateMap.forEach(map => {
            let catOptions = pmsOptions;
            let warningTag = '';

            if (map.pmsCategory && !(window.roomTypes || []).includes(map.pmsCategory)) {
                catOptions = `<option value="${map.pmsCategory}" selected class="text-red-600 font-black">⚠️ ${map.pmsCategory} (NOT IN SETTINGS)</option>` + pmsOptions;
                warningTag = ` <span class="text-red-500 font-black text-[9px]">(RENAMED)</span>`;
            } else if (map.pmsCategory) {
                catOptions = catOptions.replace(`value="${map.pmsCategory}"`, `value="${map.pmsCategory}" selected`);
            }

            const info = window.formatCleanRateTitle ? window.formatCleanRateTitle(map.ratePlanTitle, map.channexRoomTitle || map.pmsCategory) : {};
            const classified = window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(map.ratePlanTitle) : {};
            
            const currentChannel = map.channel || info.channel || classified.channel || 'Default';
            const currentProduct = map.product || (map.rateSource === 'evt' ? 'evt' : classified.product);
            const currentPolicy = map.policy || info.policy || classified.policy;

            const roomBadge = map.channexRoomTitle || info.roomTag || map.pmsCategory || 'Unassigned Room';
            const channelBadge = window.getChannelBadgeHtml ? window.getChannelBadgeHtml(currentChannel) : '';

            rHtml += `
                <div class="flex items-center gap-2 bg-white p-2 rounded-lg border border-amber-200 shadow-sm chan-rate-map-row hover:border-amber-400 transition-colors" data-rate-id="${map.ratePlanId}" data-rate-title="${map.ratePlanTitle}">
                    <!-- Channel Badge Icon -->
                    <div class="shrink-0 flex items-center justify-center">
                        ${channelBadge}
                    </div>

                    <!-- Room Category Tag & Clear Plan Title -->
                    <div class="flex-1 flex flex-col min-w-0 pl-1">
                        <div class="flex items-center gap-1.5 truncate flex-wrap">
                            <span class="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded shadow-2xs truncate max-w-[240px]" title="${roomBadge}">
                                ${roomBadge}
                            </span>
                            <span class="font-black text-slate-800 text-[11px] truncate" title="${map.ratePlanTitle}">
                                ${info.planLabel || map.ratePlanTitle}${warningTag}
                            </span>
                        </div>
                        <span class="text-[7.5px] font-mono text-slate-400 uppercase tracking-tight truncate mt-0.5">Raw: ${map.ratePlanTitle} • ID: ...${map.ratePlanId.slice(-8)}</span>
                    </div>

                    <i data-lucide="arrow-right" size="12" class="text-amber-500 shrink-0"></i>

                    <!-- Category Selector -->
                    <select class="input-base !py-1 !text-xs !w-48 cursor-pointer chan-rate-pms-sel bg-slate-50 border-amber-300 text-amber-900 font-bold" onchange="window.updateRateMapEntry('${map.ratePlanId}', 'pmsCategory', this.value)">
                        ${catOptions}
                    </select>

                    <!-- Channel Classification Pill -->
                    <select class="input-base !py-1 !text-[10px] !w-32 cursor-pointer chan-rate-channel bg-indigo-50 border-indigo-200 text-indigo-800 font-black" onchange="window.updateRateMapEntry('${map.ratePlanId}', 'channel', this.value)" title="Assigned Channel">
                        <option value="Default" ${currentChannel === 'Default' ? 'selected' : ''}>Default</option>
                        <option value="Booking.com" ${currentChannel === 'Booking.com' ? 'selected' : ''}>Booking.com</option>
                        <option value="Hostelworld" ${currentChannel === 'Hostelworld' ? 'selected' : ''}>Hostelworld</option>
                        <option value="Agoda" ${currentChannel === 'Agoda' ? 'selected' : ''}>Agoda</option>
                        <option value="Expedia" ${currentChannel === 'Expedia' ? 'selected' : ''}>Expedia</option>
                        <option value="Airbnb" ${currentChannel === 'Airbnb' ? 'selected' : ''}>Airbnb</option>
                    </select>

                    <!-- Product Type Pill (STD vs EVT) -->
                    <select class="input-base !py-1 !text-[10px] !w-24 cursor-pointer chan-rate-product font-black text-center ${currentProduct === 'evt' ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-slate-100 text-slate-700 border-slate-300'}" onchange="window.updateRateMapEntry('${map.ratePlanId}', 'product', this.value)" title="Product Type">
                        <option value="std" ${currentProduct === 'std' ? 'selected' : ''}>STD</option>
                        <option value="evt" ${currentProduct === 'evt' ? 'selected' : ''}>EVT PKG</option>
                    </select>

                    <!-- Policy Ratio Pill (Non-Ref vs Ref) -->
                    <select class="input-base !py-1 !text-[10px] !w-28 cursor-pointer chan-rate-policy font-black text-center ${currentPolicy === 'ref' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}" onchange="window.updateRateMapEntry('${map.ratePlanId}', 'policy', this.value)" title="Policy">
                        <option value="non-ref" ${currentPolicy === 'non-ref' ? 'selected' : ''}>Non-Ref</option>
                        <option value="ref" ${currentPolicy === 'ref' ? 'selected' : ''}>Ref (+%)</option>
                    </select>
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

        window.channexRateMap = channexRates.map(rate => {
            const existing = (window.channexRateMap || []).find(m => m.ratePlanId === rate.id);
            const info = window.formatCleanRateTitle ? window.formatCleanRateTitle(rate.attributes?.title || '') : {};
            const classified = window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(rate.attributes?.title || '') : {};
            return {
                ratePlanId: rate.id,
                ratePlanTitle: rate.attributes?.title || '',
                pmsCategory: existing ? existing.pmsCategory : '',
                channel: existing?.channel || info.channel || classified.channel || 'Default',
                product: existing?.product || (window.isEventPricingEnabled && !window.isEventPricingEnabled() ? 'std' : classified.product),
                policy: existing?.policy || info.policy || classified.policy,
                rateSource: (existing?.product || classified.product) === 'evt' ? 'evt' : 'std'
            };
        });

        window.renderChannexRateMapping();
    }
};

window.updateRateMapEntry = (ratePlanId, field, value) => {
    window.channexRateMap = window.channexRateMap || [];
    const entry = window.channexRateMap.find(m => m.ratePlanId === ratePlanId);
    if (entry) {
        entry[field] = value;
        if (field === 'product') {
            entry.rateSource = value === 'evt' ? 'evt' : 'std';
        }
        window.markUnsavedChanges();
    }
};

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
    rateRows.forEach(r => {
        const rId = r.dataset.rateId;
        const pmsCat = r.querySelector('.chan-rate-pms-sel')?.value || '';
        const channel = r.querySelector('.chan-rate-channel')?.value || 'Default';
        const product = r.querySelector('.chan-rate-product')?.value || 'std';
        const policy = r.querySelector('.chan-rate-policy')?.value || 'non-ref';

        const existing = (window.channexRateMap || []).find(m => m.ratePlanId === rId);
        if (existing) {
            existing.pmsCategory = pmsCat;
            existing.channel = channel;
            existing.product = product;
            existing.policy = policy;
            existing.rateSource = product === 'evt' ? 'evt' : 'std';
        }
    });

    const activeRateMap = (window.channexRateMap || []).filter(m => m.ratePlanId && m.pmsCategory);

    try {
        const { doc, updateDoc } = window.cmFs;
        await updateDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), {
            channexMap: newMap,
            channexRateMap: activeRateMap
        });
        window.channexMap = newMap;
        window.channexRateMap = activeRateMap;

        if (notify) window.customAlert(`Classifications & room mappings successfully saved!\n\n${activeRateMap.length} rate plans mapped across all channels.`);
        if (window.renderGrid) window.renderGrid();
        if (window.renderDynamicOtaRules) window.renderDynamicOtaRules();
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
        return window.customAlert("Channex credentials not set up. Please map Channex in Tab 6 first.");
    }
    if (!window.channexMap || window.channexMap.length === 0) {
        return window.customAlert("No room mappings found. Please map your room types in Tab 6 first.");
    }

    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline" size="14"></i> SYNCING...';
        btn.disabled = true;
    }

    try {
        const todayYmd = window.getLocalYMD(new Date());
        let datesToProcess = [];

        if (mode === 'delta') {
            datesToProcess = Array.from(window.dirtyDates).filter(d => d >= todayYmd).sort();
            if (datesToProcess.length === 0) {
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                return window.customAlert("All clear! No pending changes to push.");
            }
        } else {
            const sU = window.parseYMD(todayYmd);
            for (let i = 0; i < 365; i++) {
                datesToProcess.push(window.getLocalYMD(new Date(sU + (i * 86400000))));
            }
        }

        const availPayload = [];
        const restrPayload = [];
        const syncAuditList = [];

        const getPeakCategoryCapacity = (pmsCat) => {
            let maxSeen = 0;
            if (window.liveInventory) {
                Object.values(window.liveInventory).forEach(dayObj => {
                    if (dayObj && typeof dayObj[pmsCat] === 'number' && dayObj[pmsCat] > maxSeen) {
                        maxSeen = dayObj[pmsCat];
                    }
                });
            }
            if (maxSeen > 0) return maxSeen;
            const match = pmsCat.match(/(\d+)\s*(-|\s*)(bed|bunk|dorm)/i);
            if (match && match[1]) return parseInt(match[1], 10);
            return 1;
        };

        const getNetAvailabilityForDate = (pmsCat, dStr, peakCap) => {
            if (window.liveInventory && window.liveInventory[dStr] && typeof window.liveInventory[dStr][pmsCat] === 'number') {
                return window.liveInventory[dStr][pmsCat];
            }
            const staffList = (window.staff && window.staff.length > 0)
                ? window.staff
                : (window.bookings || window.reservations || window.masterPricing?.bookings || []);

            let occupied = 0;
            const curProp = window.currentPropertyId;

            if (Array.isArray(staffList)) {
                for (let i = 0; i < staffList.length; i++) {
                    const s = staffList[i];
                    if (!s) continue;
                    const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                    if (sProp && curProp && sProp !== curProp) continue;

                    const status = (s.status || '').toLowerCase();
                    if (['cancelled', 'noshow', 'unconfirmed', 'charged'].includes(status)) continue;

                    const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
                    const isUnassigned = rList.length === 0 || rList[0] === "";
                    if (status === 'special' && isUnassigned) continue;

                    const catMatch = (s.bookedType && (s.bookedType === pmsCat || s.bookedType.includes(pmsCat) || pmsCat.includes(s.bookedType)))
                        || (s.category === pmsCat || s.roomType === pmsCat);

                    if (!catMatch && isUnassigned) continue;

                    const cIn = s.checkIn || s.start || s.startDate;
                    const cOut = s.checkOut || s.end || s.endDate;

                    if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                        if (pmsCat.toLowerCase().includes('dorm')) {
                            occupied += parseInt(s.pax || s.bedCount || 1, 10);
                        } else {
                            occupied += Math.max(1, rList.length);
                        }
                    }
                }
            }
            return Math.max(0, peakCap - occupied);
        };

        // 1. AVAILABILITY PAYLOAD
        window.channexMap.forEach(rule => {
            if (!rule.channexId || !rule.pmsCategory) return;
            const pmsCat = rule.pmsCategory;
            const roomTypeId = rule.channexId;
            const peakCapacity = getPeakCategoryCapacity(pmsCat);

            let rangeStart = null;
            let currentAvail = null;

            for (let i = 0; i < datesToProcess.length; i++) {
                const dStr = datesToProcess[i];
                let otaAvail = window.masterPricing?.timeline?.[dStr]?.otaOverrides?.[`${pmsCat}_avail`];
                let live = getNetAvailabilityForDate(pmsCat, dStr, peakCapacity);
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

        // 2. RATES & RESTRICTIONS PAYLOAD
        const rateMultiplier = (window.channexConfig?.rateMultiplier !== undefined && window.channexConfig?.rateMultiplier !== null)
            ? Number(window.channexConfig.rateMultiplier)
            : 100;

        const isEventsActive = window.isEventPricingEnabled ? window.isEventPricingEnabled() : false;

        (window.channexRateMap || []).forEach(rule => {
            if (!rule.ratePlanId || !rule.pmsCategory) return;
            const pmsCat = rule.pmsCategory;
            const ratePlanId = rule.ratePlanId;
            const rateSource = rule.rateSource || "std";
            const isEvtRate = isEventsActive && ((rateSource === 'evt') || /evt|fmp|event|pkg/i.test(rule.ratePlanTitle || ''));

            const classified = window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(rule.ratePlanTitle) : {};
            const effectiveRule = {
                ...rule,
                channel: rule.channel || classified.channel || 'Default',
                product: rule.product || (isEvtRate ? 'evt' : 'std'),
                policy: rule.policy || classified.policy || 'non-ref',
                rateSource: isEvtRate ? 'evt' : 'std'
            };

            let rangeStart = null;
            let currentItem = null;

            for (let i = 0; i < datesToProcess.length; i++) {
                const dStr = datesToProcess[i];
                const dayObj = window.masterPricing?.timeline?.[dStr] || {};
                const roomObj = dayObj[pmsCat] || {};
                const globObj = dayObj['GLOBAL'] || {};

                const dirtySet = (mode === 'delta' && window.dirtyFields?.[dStr]?.[ratePlanId])
                    ? window.dirtyFields[dStr][ratePlanId]
                    : null;

                const sendRate = mode === 'full' || !dirtySet || dirtySet.has('rate');
                const sendMin = mode === 'full' || (dirtySet && (dirtySet.has('min') || dirtySet.has('min_arr')));
                const sendMax = mode === 'full' || (dirtySet && dirtySet.has('max'));
                const sendCta = mode === 'full' || (dirtySet && dirtySet.has('cta'));
                const sendCtd = mode === 'full' || (dirtySet && dirtySet.has('ctd'));
                const sendStop = mode === 'full' || (dirtySet && dirtySet.has('stop'));

                const changeItem = {};

                // Rate Calculation
                if (sendRate) {
                    let calculatedPrice = null;
                    const otaPriceOverride = dayObj.otaOverrides?.[ratePlanId];

                    if (otaPriceOverride !== undefined && otaPriceOverride !== "") {
                        calculatedPrice = window.roundCurrency(otaPriceOverride);
                    } else if (typeof window.computeDynamicPlanRate === 'function') {
                        calculatedPrice = window.computeDynamicPlanRate(dStr, pmsCat, effectiveRule);
                    }

                    if (calculatedPrice === null || isNaN(calculatedPrice)) {
                        let activeBasePrice = isEvtRate && isEventsActive && roomObj.fmp
                            ? roomObj.fmp
                            : roomObj.std;

                        if (!activeBasePrice) {
                            const isDorm = pmsCat.toLowerCase().includes('dorm');
                            activeBasePrice = isDorm 
                                ? (window.savedAutofillBaselines?.d_base || 200)
                                : (window.savedAutofillBaselines?.p_base || 1000);
                        }

                        if (activeBasePrice) {
                            const channelName = effectiveRule.channel || 'Default';
                            const chRule = window.pricingRules?.channels?.[channelName] || { type: '=', val: 0 };
                            let p = window.applyMath(parseFloat(activeBasePrice), chRule.type || '=', chRule.val || 0);

                            if (effectiveRule.policy === 'ref') {
                                const pType = isEvtRate ? (window.pricingRules?.evtRefType || '+%') : (window.pricingRules?.stdRefType || '+%');
                                const pVal = isEvtRate ? (window.pricingRules?.evtRefVal || 25) : (window.pricingRules?.stdRefVal || 25);
                                p = window.applyMath(p, pType, pVal);
                            }
                            calculatedPrice = window.roundCurrency(p);
                        }
                    }

                    if (calculatedPrice !== null && !isNaN(calculatedPrice) && calculatedPrice > 0) {
                        changeItem.rate = Math.round(calculatedPrice * rateMultiplier);
                    }

                    if (dStr.endsWith('12-31') || i === 0) {
                        syncAuditList.push({
                            date: dStr,
                            room: pmsCat,
                            plan: rule.ratePlanTitle,
                            channel: effectiveRule.channel,
                            price: calculatedPrice
                        });
                    }
                }

                // Restrictions
                const getRestr = (f) => {
                    const otaVal = dayObj.otaOverrides?.[`${ratePlanId}_${f}`];
                    if (otaVal !== undefined && otaVal !== "") return otaVal;

                    if (isEvtRate && isEventsActive) {
                        if (roomObj[`evt_${f}`] !== undefined && roomObj[`evt_${f}`] !== "") return roomObj[`evt_${f}`];
                        if (dayObj.evtRestrictions && dayObj.evtRestrictions[f] !== undefined && dayObj.evtRestrictions[f] !== "") {
                            return dayObj.evtRestrictions[f];
                        }
                    }

                    if (roomObj[f] !== undefined && roomObj[f] !== "") return roomObj[f];
                    if (globObj[f] !== undefined && globObj[f] !== "") return globObj[f];
                    return null;
                };

                if (sendMin) {
                    const minS = getRestr('min');
                    const minArr = getRestr('min_arr');

                    if (minArr !== null && minArr !== "") {
                        const parsed = parseInt(String(minArr).replace(/[^\d]/g, ''), 10);
                        changeItem.min_stay_arrival = (!isNaN(parsed) && parsed >= 1) ? parsed : 1;
                    } else if (minS !== null && minS !== "") {
                        const parsed = parseInt(String(minS).replace(/[^\d]/g, ''), 10);
                        changeItem.min_stay_through = (!isNaN(parsed) && parsed >= 1) ? parsed : 1;
                    } else if (mode === 'delta') {
                        changeItem.min_stay_through = 1;
                    }
                }

                if (sendMax) {
                    const maxS = getRestr('max');
                    if (maxS !== null && maxS !== "") {
                        const parsed = parseInt(String(maxS).replace(/[^\d]/g, ''), 10);
                        changeItem.max_stay = !isNaN(parsed) ? Math.max(0, parsed) : 0;
                    } else if (mode === 'delta') {
                        changeItem.max_stay = 0;
                    }
                }

                if (sendCta) {
                    const cta = getRestr('cta');
                    if (cta === true) changeItem.closed_to_arrival = true;
                    else if (cta === false && (mode === 'delta' || dayObj[pmsCat]?.isOverride?.cta)) {
                        changeItem.closed_to_arrival = false;
                    }
                }

                if (sendCtd) {
                    const ctd = getRestr('ctd');
                    if (ctd === true) changeItem.closed_to_departure = true;
                    else if (ctd === false && (mode === 'delta' || dayObj[pmsCat]?.isOverride?.ctd)) {
                        changeItem.closed_to_departure = false;
                    }
                }

                if (sendStop) {
                    let stop = getRestr('stop');
                    if (stop === null || stop === "") stop = getRestr('stopSell');
                    if (stop === true) changeItem.stop_sell = true;
                    else if (stop === false && (mode === 'delta' || dayObj[pmsCat]?.isOverride?.stop || dayObj[pmsCat]?.isOverride?.stopSell)) {
                        changeItem.stop_sell = false;
                    }
                }

                const itemJson = JSON.stringify(changeItem);
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
                    currentItem = changeItem;
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

        if (syncAuditList.length > 0 && console.table) {
            console.log("📊 [CHANNEX SYNC AUDIT] Active price transmissions:");
            console.table(syncAuditList);
        }

        // 3. DISPATCH IN BATCHES OF 50
        let availSuccess = true;
        let restrSuccess = true;
        let allWarnings = [];

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

                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    console.error(`❌ Channex ${endpoint} HTTP failure on batch ${i}:`, json);
                    allOk = false;
                } else if (json.meta?.warnings?.length > 0) {
                    console.warn(`⚠️ Channex ${endpoint} warnings on batch ${i}:`, json.meta.warnings);
                    allWarnings = allWarnings.concat(json.meta.warnings);
                }
            }
            return allOk;
        };

        if (availPayload.length > 0) {
            availSuccess = await sendBatches('availability', availPayload);
        }

        if (restrPayload.length > 0) {
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

            let warningMsg = '';
            if (allWarnings.length > 0) {
                const formattedWarnings = allWarnings.slice(0, 10).map(w => {
                    const plan = (window.channexRateMap || []).find(r => r.ratePlanId === w.rate_plan_id);
                    const planTitle = plan ? (plan.ratePlanTitle || w.rate_plan_id) : (w.rate_plan_id || 'Unknown');
                    let detailStr = '';
                    if (w.warning) {
                        detailStr = Object.entries(w.warning).map(([f, msgs]) => `${f}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`).join('; ');
                    } else {
                        detailStr = JSON.stringify(w);
                    }
                    return `• [${planTitle}] ${w.date_from || w.date || ''}: ${detailStr}`;
                }).join('\n');

                warningMsg = `\n\n⚠️ Channex Warnings (${allWarnings.length}):\n${formattedWarnings}`;
            }

            window.customAlert(`Sync Successful!\n\nPushed ${availPayload.length} availability ranges and ${restrPayload.length} rate/restriction ranges to Channex across ${(window.channexRateMap || []).length} rate plans.${warningMsg}`);
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
