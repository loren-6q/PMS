// ==========================================================================
// channex.js - Official Certified Channex Integration & Transmission Engine
// Wild & Wandering Property Management System
// 
// COMPLETE UNABRIDGED IMPLEMENTATION:
// - Paced Outbox Rate Limiter (strictly <= 20 ARI calls/min)
// - Exponential backoff for 429 (Retry-After) and 5xx responses
// - Contiguous Date Range Compressor (merges identical consecutive dates)
// - Real-time PMS inventory deduction (calculates net physical availability)
// - Dynamic Rate & Stay Restrictions dispatcher (rates, min, max, CTA, CTD, stop)
// - Full Sync (Test 1): Exactly 2 API calls for 500 days (Avail + Restrictions)
// - Delta Sync (Test 13): Pushes only modified date ranges
// - Booking Revision Acknowledgement: POST /booking_revisions/{id}/ack
// ==========================================================================

const CHANNEX_STAGING_HOST = "staging.channex.io";
const CHANNEX_PRODUCTION_HOST = "app.channex.io";

// --- SECTION 1: RATE-LIMITED HTTP CLIENT WITH EXPONENTIAL BACKOFF ---

class ChannexRateLimiter {
    constructor(maxPerMinute = 18) {
        this.maxPerMinute = maxPerMinute;
        this.tokens = maxPerMinute;
        this.queue = [];
        this.lastRefill = Date.now();
        setInterval(() => this.refill(), 3000);
    }

    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const addTokens = (elapsed / 60000) * this.maxPerMinute;
        this.tokens = Math.min(this.maxPerMinute, this.tokens + addTokens);
        this.lastRefill = now;
        this.drain();
    }

    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.drain();
        });
    }

    async drain() {
        if (this.queue.length === 0 || this.tokens < 1) return;
        this.tokens -= 1;
        const { task, resolve, reject } = this.queue.shift();
        try {
            const res = await task();
            resolve(res);
        } catch (err) {
            reject(err);
        }
    }
}

const limiter = new ChannexRateLimiter(18);

export const ChannexClient = {
    getHost(isStaging = false) {
        return isStaging ? CHANNEX_STAGING_HOST : CHANNEX_PRODUCTION_HOST;
    },

    getBaseUrl(isStaging = false) {
        return `https://${this.getHost(isStaging)}/api/v1`;
    },

    async request(endpoint, options = {}, apiKey, isStaging = false, retries = 4, backoffMs = 1000) {
        if (!apiKey) throw new Error("Channex API key is required.");

        const url = `${this.getBaseUrl(isStaging)}${endpoint}`;
        const headers = {
            "user-api-key": apiKey,
            "Content-Type": "application/json",
            ...(options.headers || {})
        };

        const executeCall = async () => {
            try {
                const response = await fetch(url, { ...options, headers });
                
                // Rate limited (429) -> Honor Retry-After
                if (response.status === 429) {
                    const retryHeader = response.headers.get("Retry-After");
                    const wait = retryHeader ? parseInt(retryHeader, 10) * 1000 : backoffMs;
                    console.warn(`[Channex Rate Limit 429] Waiting ${wait}ms before retrying ${endpoint}...`);
                    await new Promise(r => setTimeout(r, wait));
                    return ChannexClient.request(endpoint, options, apiKey, isStaging, retries - 1, backoffMs * 2);
                }

                // 5xx Server Error -> Exponential backoff
                if (response.status >= 500 && retries > 0) {
                    console.warn(`[Channex Server Error ${response.status}] Retrying in ${backoffMs}ms...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                    return ChannexClient.request(endpoint, options, apiKey, isStaging, retries - 1, backoffMs * 2);
                }

                const json = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errMsg = json?.errors?.title || json?.message || response.statusText;
                    throw new Error(`Channex Error (${response.status}): ${errMsg}`);
                }
                return json;
            } catch (err) {
                if (retries > 0 && !err.message.includes("401") && !err.message.includes("403")) {
                    await new Promise(r => setTimeout(r, backoffMs));
                    return ChannexClient.request(endpoint, options, apiKey, isStaging, retries - 1, backoffMs * 2);
                }
                throw err;
            }
        };

        return limiter.enqueue(executeCall);
    },

    // --- REVISION ACKNOWLEDGEMENT (CERTIFICATION TEST 11) ---
    async acknowledgeRevision(revisionId, apiKey, isStaging = false) {
        if (!revisionId) throw new Error("Revision ID is required.");
        return this.request(`/booking_revisions/${revisionId}/ack`, {
            method: "POST",
            body: JSON.stringify({})
        }, apiKey, isStaging);
    },

    async fetchRevisionDetails(revisionId, apiKey, isStaging = false) {
        if (!revisionId) throw new Error("Revision ID is required.");
        return this.request(`/booking_revisions/${revisionId}`, {
            method: "GET"
        }, apiKey, isStaging);
    },

    // --- FULL DATA SYNC (CERTIFICATION TEST 1: EXACTLY 2 API CALLS FOR 500 DAYS) ---
    async executeFullSync(propId, apiKey, availValues, restrValues, isStaging = false) {
        let availabilityTaskId = null;
        let restrictionsTaskId = null;

        // Call 1 of 2: 500 days of Availability (All Rooms)
        if (availValues && availValues.length > 0) {
            const availRes = await this.request("/availability", {
                method: "POST",
                body: JSON.stringify({ values: availValues })
            }, apiKey, isStaging);
            availabilityTaskId = availRes.data?.[0]?.id || availRes.data?.id || null;
        }

        // Call 2 of 2: 500 days of Rates & Restrictions (All Rate Plans)
        if (restrValues && restrValues.length > 0) {
            const restrRes = await this.request("/restrictions", {
                method: "POST",
                body: JSON.stringify({ values: restrValues })
            }, apiKey, isStaging);
            restrictionsTaskId = restrRes.data?.[0]?.id || restrRes.data?.id || null;
        }

        return { availabilityTaskId, restrictionsTaskId };
    }
};

// --- SECTION 2: CONTIGUOUS RANGE COMPRESSION ---

export function compressDateEntries(entries) {
    if (!entries || entries.length === 0) return [];
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const compressed = [];

    let currentRange = null;

    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const { date, ...attributes } = item;
        const attrKey = JSON.stringify(attributes);

        if (!currentRange) {
            currentRange = {
                date_from: date,
                date_to: date,
                attributes,
                attrKey
            };
            continue;
        }

        const prevMs = Date.parse(currentRange.date_to);
        const curMs = Date.parse(date);
        const isContiguous = (curMs - prevMs) === 86400000;
        const isSameAttributes = currentRange.attrKey === attrKey;

        if (isContiguous && isSameAttributes) {
            currentRange.date_to = date;
        } else {
            compressed.push({
                date_from: currentRange.date_from,
                date_to: currentRange.date_to,
                ...currentRange.attributes
            });
            currentRange = {
                date_from: date,
                date_to: date,
                attributes,
                attrKey
            };
        }
    }

    if (currentRange) {
        compressed.push({
            date_from: currentRange.date_from,
            date_to: currentRange.date_to,
            ...currentRange.attributes
        });
    }

    return compressed;
}

// --- SECTION 3: PMS DATA AGGREGATION & INVENTORY DEDUCTION ---

function getPeakCategoryCapacity(pmsCat) {
    let maxSeen = 0;
    if (window.liveInventory) {
        Object.values(window.liveInventory).forEach(dayObj => {
            if (dayObj && typeof dayObj[pmsCat] === 'number' && dayObj[pmsCat] > maxSeen) {
                maxSeen = dayObj[pmsCat];
            }
        });
    }
    if (maxSeen > 0) return maxSeen;

    // Count physical rooms assigned to this category in hotelRooms
    const physicalCount = (window.hotelRooms || []).filter(r => (r.type === pmsCat || r.category === pmsCat)).length;
    if (physicalCount > 0) return physicalCount;

    return 1;
}

function getNetAvailabilityForDate(pmsCat, dStr, peakCap) {
    if (window.liveInventory && window.liveInventory[dStr] && typeof window.liveInventory[dStr][pmsCat] === 'number') {
        return window.liveInventory[dStr][pmsCat];
    }

    const staffList = (window.staff && window.staff.length > 0)
        ? window.staff
        : (window.bookings || []);

    let occupied = 0;
    const curProp = window.currentPropertyId;

    if (Array.isArray(staffList)) {
        for (let i = 0; i < staffList.length; i++) {
            const s = staffList[i];
            if (!s) continue;
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp && curProp && sProp !== curProp) continue;

            const status = (s.status || '').toLowerCase();
            // Core design rule: non-occupying bookings do not deduct availability
            if (['cancelled', 'noshow', 'unconfirmed', 'charged', 'vol'].includes(status)) continue;

            const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
            const isUnassigned = rList.length === 0 || rList[0] === "";
            if (status === 'special' && isUnassigned) continue;

            const catMatch = (s.bookedType && (s.bookedType === pmsCat || s.bookedType.includes(pmsCat) || pmsCat.includes(s.bookedType)))
                || (s.category === pmsCat || s.roomType === pmsCat);

            if (!catMatch && isUnassigned) continue;

            const cIn = s.checkIn || s.start;
            const cOut = s.checkOut || s.end;

            if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                if (pmsCat.toLowerCase().includes('dorm') || pmsCat.toLowerCase().includes('bed')) {
                    occupied += parseInt(s.pax || s.bedCount || 1, 10);
                } else {
                    occupied += Math.max(1, rList.length);
                }
            }
        }
    }
    return Math.max(0, peakCap - occupied);
}

// --- SECTION 4: UNIFIED TRANSMISSION ENGINE (DISPATCHES DELTAS & FULL SYNCS) ---

export async function pushToChannexAPI(btn, mode = 'delta') {
    const apiKey = window.channexConfig?.apiKey 
        || window.MASTER_CHANNEX_API_KEY 
        || localStorage.getItem('cm_master_channex_api_key');

    const propId = window.channexConfig?.propId;
    const isStaging = !!(window.channexConfig?.isStaging || window.channexConfig?.env === 'staging');

    if (!apiKey || !propId) {
        return window.customAlert("Missing Credentials", "Channex credentials not configured. Please set them up in the Setup Wizard.");
    }
    if (!window.channexMap || window.channexMap.length === 0) {
        return window.customAlert("Missing Mapping", "No room mappings found. Please map your room types in Step 3 of the Setup Wizard.");
    }

    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline" size="14"></i> SYNCING...';
        btn.disabled = true;
    }

    try {
        const todayYmd = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
        let datesToProcess = [];

        if (mode === 'delta') {
            // Test 13: Push only changed date ranges
            datesToProcess = Array.from(window.dirtyDates || []).filter(d => d >= todayYmd).sort();
            if (datesToProcess.length === 0) {
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                return window.customAlert("All Clear", "No pending changes to push to Channex.");
            }
        } else {
            // Test 1: Full Sync across 500 days
            const sU = window.parseYMD ? window.parseYMD(todayYmd) : Date.parse(todayYmd);
            for (let i = 0; i < 500; i++) {
                const curDate = new Date(sU + (i * 86400000));
                datesToProcess.push(window.getLocalYMD ? window.getLocalYMD(curDate) : curDate.toISOString().split('T')[0]);
            }
        }

        // 1. BUILD AVAILABILITY PAYLOAD WITH RANGE COMPRESSION (TESTS 1, 9, 10)
        const rawAvailEntries = [];
        window.channexMap.forEach(rule => {
            if (!rule.channexId || !rule.pmsCategory) return;
            const pmsCat = rule.pmsCategory;
            const roomTypeId = rule.channexId;
            const peakCap = getPeakCategoryCapacity(pmsCat);

            datesToProcess.forEach(dStr => {
                const otaAvail = window.masterPricing?.timeline?.[dStr]?.otaOverrides?.[`${pmsCat}_avail`];
                const live = getNetAvailabilityForDate(pmsCat, dStr, peakCap);
                const availToday = otaAvail !== undefined ? otaAvail : live;

                rawAvailEntries.push({
                    date: dStr,
                    property_id: propId,
                    room_type_id: roomTypeId,
                    availability: availToday
                });
            });
        });

        // Group by room_type_id and compress contiguous date ranges
        const availPayload = [];
        const availByRoom = {};
        rawAvailEntries.forEach(entry => {
            if (!availByRoom[entry.room_type_id]) availByRoom[entry.room_type_id] = [];
            availByRoom[entry.room_type_id].push(entry);
        });
        Object.values(availByRoom).forEach(roomEntries => {
            availPayload.push(...compressDateEntries(roomEntries));
        });

        // 2. BUILD RESTRICTIONS & RATES PAYLOAD WITH RANGE COMPRESSION (TESTS 1–8, 14)
        const rawRestrEntries = [];
        const rateMultiplier = Number(window.channexConfig?.rateMultiplier) || 100;
        const validRatePlans = (window.channexRateMap || []).filter(r => r.ratePlanId && r.pmsCategory);

        validRatePlans.forEach(plan => {
            const pmsCat = plan.pmsCategory;
            const ratePlanId = plan.ratePlanId;

            datesToProcess.forEach(dStr => {
                const dayObj = window.masterPricing?.timeline?.[dStr] || {};
                const roomObj = dayObj[pmsCat] || {};
                const globObj = dayObj['GLOBAL'] || {};

                // Rate computation
                let computedPrice = null;
                const otaPriceOverride = dayObj.otaOverrides?.[ratePlanId];

                if (otaPriceOverride !== undefined && otaPriceOverride !== "") {
                    computedPrice = Number(otaPriceOverride);
                } else if (typeof window.computeDynamicPlanRate === 'function') {
                    computedPrice = window.computeDynamicPlanRate(dStr, pmsCat, plan);
                } else {
                    computedPrice = roomObj.std || 100;
                }

                const item = {
                    date: dStr,
                    property_id: propId,
                    rate_plan_id: ratePlanId
                };

                if (computedPrice !== null && !isNaN(computedPrice) && computedPrice > 0) {
                    item.rate = Math.round(computedPrice * rateMultiplier);
                }

                // Restrictions extraction
                const getRestrVal = (field) => {
                    const otaVal = dayObj.otaOverrides?.[`${ratePlanId}_${field}`];
                    if (otaVal !== undefined && otaVal !== "") return otaVal;
                    if (roomObj[field] !== undefined && roomObj[field] !== "") return roomObj[field];
                    if (globObj[field] !== undefined && globObj[field] !== "") return globObj[field];
                    return null;
                };

                const minS = getRestrVal('min');
                const minArr = getRestrVal('min_arr');
                if (minArr !== null && minArr !== "") {
                    item.min_stay_arrival = parseInt(String(minArr), 10) || 1;
                } else if (minS !== null && minS !== "") {
                    item.min_stay_through = parseInt(String(minS), 10) || 1;
                }

                const maxS = getRestrVal('max');
                if (maxS !== null && maxS !== "") {
                    item.max_stay = parseInt(String(maxS), 10) || 0;
                }

                const cta = getRestrVal('cta');
                if (cta !== null) item.closed_to_arrival = !!cta;

                const ctd = getRestrVal('ctd');
                if (ctd !== null) item.closed_to_departure = !!ctd;

                const stop = getRestrVal('stop') || getRestrVal('stopSell');
                if (stop !== null) item.stop_sell = !!stop;

                rawRestrEntries.push(item);
            });
        });

        // Group by rate_plan_id and compress contiguous date ranges
        const restrPayload = [];
        const restrByPlan = {};
        rawRestrEntries.forEach(entry => {
            if (!restrByPlan[entry.rate_plan_id]) restrByPlan[entry.rate_plan_id] = [];
            restrByPlan[entry.rate_plan_id].push(entry);
        });
        Object.values(restrByPlan).forEach(planEntries => {
            restrPayload.push(...compressDateEntries(planEntries));
        });

        // 3. EXECUTE API CALLS WITH CHUNKING AND OUTBOX RATE LIMITING (TEST 12)
        const recordedTaskIds = [];

        // Full Sync: 2 API calls (Availability + Restrictions)
        if (mode === 'full') {
            const res = await ChannexClient.executeFullSync(propId, apiKey, availPayload, restrPayload, isStaging);
            if (res.availabilityTaskId) recordedTaskIds.push(res.availabilityTaskId);
            if (res.restrictionsTaskId) recordedTaskIds.push(res.restrictionsTaskId);
        } else {
            // Delta updates batched into chunks of 50
            const CHUNK_SIZE = 50;

            if (availPayload.length > 0) {
                for (let i = 0; i < availPayload.length; i += CHUNK_SIZE) {
                    const chunk = availPayload.slice(i, i + CHUNK_SIZE);
                    const res = await ChannexClient.request("/availability", {
                        method: "POST",
                        body: JSON.stringify({ values: chunk })
                    }, apiKey, isStaging);
                    if (res.data?.[0]?.id) recordedTaskIds.push(res.data[0].id);
                }
            }

            if (restrPayload.length > 0) {
                for (let i = 0; i < restrPayload.length; i += CHUNK_SIZE) {
                    const chunk = restrPayload.slice(i, i + CHUNK_SIZE);
                    const res = await ChannexClient.request("/restrictions", {
                        method: "POST",
                        body: JSON.stringify({ values: chunk })
                    }, apiKey, isStaging);
                    if (res.data?.[0]?.id) recordedTaskIds.push(res.data[0].id);
                }
            }
        }

        // Clean dirty states on success
        datesToProcess.forEach(d => {
            if (window.dirtyDates) window.dirtyDates.delete(d);
            if (window.syncedDates) window.syncedDates.add(d);
        });
        window.hasUnsavedChanges = false;
        if (typeof window.updateSaveIndicator === 'function') window.updateSaveIndicator();
        if (typeof window.renderGrid === 'function') window.renderGrid();

        const taskMsg = recordedTaskIds.length > 0 ? `\nTask IDs: ${recordedTaskIds.slice(0, 3).join(', ')}` : '';
        window.customAlert("Sync Successful", `Pushed ${availPayload.length} availability ranges and ${restrPayload.length} restriction ranges to Channex.${taskMsg}`);

    } catch (err) {
        console.error("[Channex Sync Failure]:", err);
        window.customAlert("Sync Failed", err.message);
    } finally {
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
        if (window.lucide) window.lucide.createIcons();
    }
}

export async function saveAndSync(btn, mode = 'delta') {
    if (btn) btn.disabled = true;
    try {
        if (typeof window.savePricingToCloud === 'function') {
            await window.savePricingToCloud(true);
        }
        await pushToChannexAPI(btn, mode);
    } catch (err) {
        console.error("[Save & Sync Failure]:", err);
        window.customAlert("Error", err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Mount to window for global access across all views
window.pushToChannexAPI = pushToChannexAPI;
window.saveAndSync = saveAndSync;
