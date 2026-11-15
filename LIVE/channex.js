// ==========================================================================
// channex.js - Certified Official Channex Transmission & Outbox Engine
// Wild & Wandering Property Management System
// 
// ARCHITECTURE CONTRACT & CHANNEX CERTIFICATION COMPLIANCE:
// - Paced Outbox Rate Limiter (strictly <= 18 ARI calls/min)
// - Exponential backoff for 429 (Retry-After) and 5xx responses
// - Contiguous Date Range Compressor (single 'date' vs 'date_from'/'date_to')
// - Real-time PMS inventory deduction (calculates net physical availability)
// - Discrete Dispatchers: isolated Rate, Restriction, or Availability updates
// - Test 1: Full Sync (Exactly 2 API calls for 500 days)
// - Tests 2-8: Isolated price, min stay, stop sell, and CTA/CTD updates
// - Tests 9-10: Real-time PMS booking inventory sync (triggerAutoSync)
// - Test 11: Booking Revision Acknowledgement (POST /booking_revisions/{id}/ack)
// ==========================================================================

import { isOccupyingBooking } from './core/occupancy.js';
import { parseYMD, getLocalYMD } from './core/dates.js';
import { toCanonicalPropId } from './core/properties.js';
import { customAlert } from './core/ui-dialogs.js';

const CHANNEX_STAGING_HOST = "staging.channex.io";
const CHANNEX_PRODUCTION_HOST = "app.channex.io";

// --------------------------------------------------------------------------
// 1. RATE-LIMITED HTTP CLIENT WITH EXPONENTIAL BACKOFF (TEST 12)
// --------------------------------------------------------------------------

export class ChannexRateLimiter {
    constructor(maxPerMinute = 18) {
        this.maxPerMinute = maxPerMinute;
        this.tokens = maxPerMinute;
        this.queue = [];
        this.lastRefill = Date.now();
        this.isDraining = false;
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
        if (this.isDraining) return;
        this.isDraining = true;

        while (this.queue.length > 0 && this.tokens >= 1) {
            this.tokens -= 1;
            const { task, resolve, reject } = this.queue.shift();
            task().then(resolve).catch(reject);
        }

        this.isDraining = false;
    }
}

export const limiter = new ChannexRateLimiter(18);

export const ChannexClient = {
    getHost(isStaging = false) {
        return isStaging ? CHANNEX_STAGING_HOST : CHANNEX_PRODUCTION_HOST;
    },

    getBaseUrl(isStaging = false) {
        return `https://${this.getHost(isStaging)}/api/v1`;
    },

    async request(endpoint, options = {}, apiKey, isStaging = false, retries = 4, backoffMs = 1000) {
        const key = apiKey || window.channexConfig?.apiKey || localStorage.getItem('cm_master_channex_api_key');
        if (!key) throw new Error("Channex API key is required.");

        const staging = isStaging !== undefined ? isStaging : !!(window.channexConfig?.isStaging || window.channexConfig?.env === 'staging');
        const url = `${this.getBaseUrl(staging)}${endpoint}`;
        const headers = {
            "user-api-key": key,
            "Content-Type": "application/json",
            ...(options.headers || {})
        };

        const executeCall = async () => {
            try {
                const response = await fetch(url, { ...options, headers });

                // Rate limited (429) -> Honor Retry-After header
                if (response.status === 429) {
                    const retryHeader = response.headers.get("Retry-After");
                    const wait = retryHeader ? parseInt(retryHeader, 10) * 1000 : backoffMs;
                    console.warn(`[Channex Rate Limit 429] Waiting ${wait}ms before retrying ${endpoint}...`);
                    await new Promise(r => setTimeout(r, wait));
                    return ChannexClient.request(endpoint, options, key, staging, retries - 1, backoffMs * 2);
                }

                // 5xx Server Error -> Exponential backoff
                if (response.status >= 500 && retries > 0) {
                    console.warn(`[Channex Server Error ${response.status}] Retrying in ${backoffMs}ms...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                    return ChannexClient.request(endpoint, options, key, staging, retries - 1, backoffMs * 2);
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
                    return ChannexClient.request(endpoint, options, key, staging, retries - 1, backoffMs * 2);
                }
                throw err;
            }
        };

        return limiter.enqueue(executeCall);
    },

    // --- REVISION ACKNOWLEDGEMENT (TEST 11) ---
    async acknowledgeRevision(revisionId, apiKey, isStaging = false) {
        if (!revisionId) throw new Error("Revision ID is required.");
        return this.request(`/booking_revisions/${revisionId}/ack`, {
            method: "POST",
            body: JSON.stringify({})
        }, apiKey, isStaging);
    },

    // --- FULL DATA SYNC (TEST 1: EXACTLY 2 API CALLS FOR 500 DAYS) ---
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

// --------------------------------------------------------------------------
// 2. CONTIGUOUS RANGE COMPRESSION (CHANNEX BEST PRACTICES)
// --------------------------------------------------------------------------

// Merges contiguous dates with identical attributes.
// Normalizes 1-day entries to 'date' and multi-day spans to 'date_from'/'date_to'.
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
            // Commit previous range
            if (currentRange.date_from === currentRange.date_to) {
                compressed.push({
                    date: currentRange.date_from,
                    ...currentRange.attributes
                });
            } else {
                compressed.push({
                    date_from: currentRange.date_from,
                    date_to: currentRange.date_to,
                    ...currentRange.attributes
                });
            }
            currentRange = {
                date_from: date,
                date_to: date,
                attributes,
                attrKey
            };
        }
    }

    if (currentRange) {
        if (currentRange.date_from === currentRange.date_to) {
            compressed.push({
                date: currentRange.date_from,
                ...currentRange.attributes
            });
        } else {
            compressed.push({
                date_from: currentRange.date_from,
                date_to: currentRange.date_to,
                ...currentRange.attributes
            });
        }
    }

    return compressed;
}

// --------------------------------------------------------------------------
// 3. PMS INVENTORY DEDUCTION (THE STRICT OCCUPANCY LAW)
// --------------------------------------------------------------------------

export function getPeakCategoryCapacity(pmsCat) {
    let maxSeen = 0;
    if (window.liveInventory) {
        Object.values(window.liveInventory).forEach(dayObj => {
            if (dayObj && typeof dayObj[pmsCat] === 'number' && dayObj[pmsCat] > maxSeen) {
                maxSeen = dayObj[pmsCat];
            }
        });
    }
    if (maxSeen > 0) return maxSeen;

    const physicalCount = (window.hotelRooms || []).filter(r => (r.type === pmsCat || r.category === pmsCat)).length;
    if (physicalCount > 0) return physicalCount;

    return 1;
}

export function getNetAvailabilityForDate(pmsCat, dStr, peakCap) {
    if (window.liveInventory && window.liveInventory[dStr] && typeof window.liveInventory[dStr][pmsCat] === 'number') {
        return window.liveInventory[dStr][pmsCat];
    }

    const staffList = window.staff || window.bookings || [];
    let occupied = 0;
    const curProp = window.currentPropertyId;

    if (Array.isArray(staffList)) {
        for (let i = 0; i < staffList.length; i++) {
            const s = staffList[i];
            if (!s) continue;
            const sProp = toCanonicalPropId(s.property);
            if (sProp && curProp && sProp !== curProp) continue;

            const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
            const hasAssignedRoom = rList.length > 0 && rList[0] !== "";

            // The Strict Occupancy Law
            if (!isOccupyingBooking(s.status, hasAssignedRoom)) continue;

            const catMatch = (s.bookedType && (s.bookedType === pmsCat || s.bookedType.includes(pmsCat) || pmsCat.includes(s.bookedType)))
                || (s.category === pmsCat || s.roomType === pmsCat);

            if (!catMatch && !hasAssignedRoom) continue;

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

// --------------------------------------------------------------------------
// 4. GRANULAR DISPATCHERS: ISOLATED RATES, RESTRICTIONS & AVAILABILITY
// --------------------------------------------------------------------------

// Format rates per Channex API spec: decimal string or integer cents
function formatChannexRate(amount) {
    if (amount === null || amount === undefined || isNaN(amount) || amount <= 0) return null;
    const mult = Number(window.channexConfig?.rateMultiplier) || 1;
    if (mult === 100) {
        return Math.round(Number(amount) * 100);
    }
    return Number(amount).toFixed(2);
}

// --- Direct Restrictions Dispatcher (Tests 2, 3, 4, 5, 6, 7, 8) ---
export async function sendRestrictionsUpdate(valuesList, apiKey, isStaging) {
    if (!valuesList || valuesList.length === 0) return null;
    const propId = window.channexConfig?.propId;
    if (!propId) throw new Error("Property ID not configured in Channex settings.");

    // Group by rate_plan_id, compress contiguous dates, and prepare values payload
    const byPlan = {};
    valuesList.forEach(v => {
        const pid = v.rate_plan_id;
        if (!byPlan[pid]) byPlan[pid] = [];
        byPlan[pid].push({ property_id: propId, ...v });
    });

    const payloadValues = [];
    Object.values(byPlan).forEach(planItems => {
        payloadValues.push(...compressDateEntries(planItems));
    });

    const res = await ChannexClient.request("/restrictions", {
        method: "POST",
        body: JSON.stringify({ values: payloadValues })
    }, apiKey, isStaging);

    const taskId = res.data?.[0]?.id || res.data?.id || null;
    console.log(`[Channex Restrictions Dispatched]: Task ID: ${taskId}`, payloadValues);
    return taskId;
}

// --- Direct Availability Dispatcher (Tests 9, 10) ---
export async function sendAvailabilityUpdate(valuesList, apiKey, isStaging) {
    if (!valuesList || valuesList.length === 0) return null;
    const propId = window.channexConfig?.propId;
    if (!propId) throw new Error("Property ID not configured in Channex settings.");

    const byRoom = {};
    valuesList.forEach(v => {
        const rid = v.room_type_id;
        if (!byRoom[rid]) byRoom[rid] = [];
        byRoom[rid].push({ property_id: propId, ...v });
    });

    const payloadValues = [];
    Object.values(byRoom).forEach(roomItems => {
        payloadValues.push(...compressDateEntries(roomItems));
    });

    const res = await ChannexClient.request("/availability", {
        method: "POST",
        body: JSON.stringify({ values: payloadValues })
    }, apiKey, isStaging);

    const taskId = res.data?.[0]?.id || res.data?.id || null;
    console.log(`[Channex Availability Dispatched]: Task ID: ${taskId}`, payloadValues);
    return taskId;
}

// --------------------------------------------------------------------------
// 5. PMS REAL-TIME RESERVATION SYNC (TEST 9 & 10 HOOK)
// --------------------------------------------------------------------------

// Invoked automatically when bookings are created, split, shortened (early checkout), or cancelled
export async function triggerAutoSync(checkIn, checkOut, affectedCategories = []) {
    const propId = window.channexConfig?.propId;
    if (!propId || !window.channexMap || window.channexMap.length === 0) {
        console.warn("[AutoSync Skipped]: No Channex property or mapping loaded.");
        return null;
    }

    const sU = parseYMD(checkIn);
    const eU = parseYMD(checkOut);
    const nts = Math.max(1, Math.round((eU - sU) / 86400000));
    const dates = [];
    for (let i = 0; i < nts; i++) {
        dates.push(getLocalYMD(new Date(sU + (i * 86400000))));
    }

    // Resolve room type IDs
    const targets = window.channexMap.filter(m => {
        if (!m.channexId || !m.pmsCategory) return false;
        if (affectedCategories.length === 0) return true;
        return affectedCategories.includes(m.pmsCategory);
    });

    const rawAvail = [];
    targets.forEach(rule => {
        const peakCap = getPeakCategoryCapacity(rule.pmsCategory);
        dates.forEach(dStr => {
            rawAvail.push({
                room_type_id: rule.channexId,
                date: dStr,
                availability: getNetAvailabilityForDate(rule.pmsCategory, dStr, peakCap)
            });
        });
    });

    try {
        const taskId = await sendAvailabilityUpdate(rawAvail);
        if (window.showToast) {
            window.showToast("Channex Inventory Updated", `Pushed live availability for ${dates[0]} → ${dates[dates.length - 1]}.`);
        }
        return taskId;
    } catch (err) {
        console.error("[AutoSync Failed]:", err);
        return null;
    }
}

// --------------------------------------------------------------------------
// 6. MASTER BULK & FULL SYNC DISPATCHER (TEST 1 & CM DRAWER)
// --------------------------------------------------------------------------

export async function pushToChannexAPI(btn, mode = 'delta') {
    const apiKey = window.channexConfig?.apiKey || localStorage.getItem('cm_master_channex_api_key');
    const propId = window.channexConfig?.propId;
    const isStaging = !!(window.channexConfig?.isStaging || window.channexConfig?.env === 'staging');

    if (!apiKey || !propId) {
        return customAlert("Credentials Error", "Channex credentials not configured. Please enter them in Setup Wizard.");
    }
    if (!window.channexMap || window.channexMap.length === 0) {
        return customAlert("Mapping Error", "No room mappings found. Please map your room types in Step 3 of Setup Wizard.");
    }

    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = 'SYNCING...';
        btn.disabled = true;
    }

    try {
        const todayYmd = getLocalYMD(new Date());
        let datesToProcess = [];

        if (mode === 'delta') {
            datesToProcess = Array.from(window.dirtyDates || []).filter(d => d >= todayYmd).sort();
            if (datesToProcess.length === 0) {
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                return customAlert("All Clear", "No pending changes to push to Channex.");
            }
        } else {
            // Full Sync (Test 1: Exactly 500 days horizon)
            const sU = parseYMD(todayYmd);
            for (let i = 0; i < 500; i++) {
                datesToProcess.push(getLocalYMD(new Date(sU + (i * 86400000))));
            }
        }

        // Granular Delta Filters (so rate edits never push availability, and single-plan edits only push that plan)
        const hasGranularAvail = window.dirtyAvailKeys instanceof Set && window.dirtyAvailKeys.size > 0;
        const hasGranularPlans = window.dirtyPlanKeys instanceof Set && window.dirtyPlanKeys.size > 0;
        const useGranular = (mode === 'delta') && (hasGranularAvail || hasGranularPlans);

        const shouldPushAvail = (dStr, pmsCat) => {
            if (mode === 'full' || !useGranular) return true;
            if (!hasGranularAvail) return false;
            return window.dirtyAvailKeys.has(`${dStr}|*`) || window.dirtyAvailKeys.has(`${dStr}|ROOM:${pmsCat}`);
        };

        const shouldPushPlan = (dStr, pmsCat, ratePlanId) => {
            if (mode === 'full' || !useGranular) return true;
            if (!hasGranularPlans) return false;
            return window.dirtyPlanKeys.has(`${dStr}|*`)
                || window.dirtyPlanKeys.has(`${dStr}|ROOM:${pmsCat}`)
                || window.dirtyPlanKeys.has(`${dStr}|PLAN:${ratePlanId}`);
        };

        // 1. Availability Payload
        const rawAvailEntries = [];
        window.channexMap.forEach(rule => {
            if (!rule.channexId || !rule.pmsCategory) return;
            const pmsCat = rule.pmsCategory;
            const roomTypeId = rule.channexId;
            const peakCap = getPeakCategoryCapacity(pmsCat);

            datesToProcess.forEach(dStr => {
                if (!shouldPushAvail(dStr, pmsCat)) return;
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

        const availPayload = [];
        const availByRoom = {};
        rawAvailEntries.forEach(entry => {
            if (!availByRoom[entry.room_type_id]) availByRoom[entry.room_type_id] = [];
            availByRoom[entry.room_type_id].push(entry);
        });
        Object.values(availByRoom).forEach(roomEntries => {
            availPayload.push(...compressDateEntries(roomEntries));
        });

        // 2. Restrictions & Rates Payload
        const rawRestrEntries = [];
        const validRatePlans = (window.channexRateMap || []).filter(r => r.ratePlanId && r.pmsCategory);
        const isEventsActive = typeof window.isEventPricingEnabled === 'function' ? window.isEventPricingEnabled() : false;

        validRatePlans.forEach(plan => {
            const pmsCat = plan.pmsCategory;
            const ratePlanId = plan.ratePlanId;
            const isEvtRate = isEventsActive && ((plan.product === 'evt') || (plan.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(plan.ratePlanTitle || ''));

            datesToProcess.forEach(dStr => {
                if (!shouldPushPlan(dStr, pmsCat, ratePlanId)) return;
                const dayObj = window.masterPricing?.timeline?.[dStr] || {};
                const roomObj = dayObj[pmsCat] || {};
                const globObj = dayObj['GLOBAL'] || {};

                let computedPrice = null;
                const otaPriceOverride = dayObj.otaOverrides?.[ratePlanId];
                const isBlankEvtWindow = isEvtRate
                    && (roomObj.fmp === undefined || roomObj.fmp === "")
                    && (otaPriceOverride === undefined || otaPriceOverride === "");

                if (!isBlankEvtWindow) {
                    if (otaPriceOverride !== undefined && otaPriceOverride !== "") {
                        computedPrice = Number(otaPriceOverride);
                    } else if (typeof window.computeDynamicPlanRate === 'function') {
                        computedPrice = window.computeDynamicPlanRate(dStr, pmsCat, plan);
                    } else {
                        computedPrice = roomObj.std || 100;
                    }
                }

                const item = {
                    date: dStr,
                    property_id: propId,
                    rate_plan_id: ratePlanId
                };

                const fRate = formatChannexRate(computedPrice);
                if (fRate !== null) {
                    item.rate = fRate;
                }

                const getRestrVal = (field) => {
                    const otaVal = dayObj.otaOverrides?.[`${ratePlanId}_${field}`];
                    if (otaVal !== undefined && otaVal !== "") return otaVal;
                    if (isEvtRate) {
                        if (roomObj[`evt_${field}`] !== undefined && roomObj[`evt_${field}`] !== "") return roomObj[`evt_${field}`];
                        if (dayObj.evtRestrictions?.[field] !== undefined && dayObj.evtRestrictions[field] !== "") return dayObj.evtRestrictions[field];
                    }
                    if (roomObj[field] !== undefined && roomObj[field] !== "") return roomObj[field];
                    if (globObj[field] !== undefined && globObj[field] !== "") return globObj[field];
                    return null;
                };

                const minS = getRestrVal('min');
                const minArr = getRestrVal('min_arr');
                if (minArr !== null && minArr !== "") {
                    item.min_stay_arrival = parseInt(String(minArr), 10) || 1;
                }
                if (minS !== null && minS !== "") {
                    item.min_stay_through = parseInt(String(minS), 10) || 1;
                }

                const maxS = getRestrVal('max');
                if (maxS !== null && maxS !== "") item.max_stay = parseInt(String(maxS), 10) || 0;

                const cta = getRestrVal('cta');
                if (cta !== null) item.closed_to_arrival = !!cta;

                const ctd = getRestrVal('ctd');
                if (ctd !== null) item.closed_to_departure = !!ctd;

                const stop = getRestrVal('stop') || getRestrVal('stopSell');
                if (isBlankEvtWindow) {
                    item.stop_sell = true;
                } else if (stop !== null) {
                    item.stop_sell = !!stop;
                }

                rawRestrEntries.push(item);
            });
        });

        const restrPayload = [];
        const restrByPlan = {};
        rawRestrEntries.forEach(entry => {
            if (!restrByPlan[entry.rate_plan_id]) restrByPlan[entry.rate_plan_id] = [];
            restrByPlan[entry.rate_plan_id].push(entry);
        });
        Object.values(restrByPlan).forEach(planEntries => {
            restrPayload.push(...compressDateEntries(planEntries));
        });

        // 3. Execute Calls (Test 1: Exactly 2 calls; Tests 2-10: Single batched API call per endpoint)
        const recordedTaskIds = [];

        if (mode === 'full') {
            const res = await ChannexClient.executeFullSync(propId, apiKey, availPayload, restrPayload, isStaging);
            if (res.availabilityTaskId) recordedTaskIds.push(res.availabilityTaskId);
            if (res.restrictionsTaskId) recordedTaskIds.push(res.restrictionsTaskId);
        } else {
            const CHUNK_SIZE = 2500;
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

        datesToProcess.forEach(d => {
            if (window.dirtyDates) window.dirtyDates.delete(d);
            if (window.syncedDates) window.syncedDates.add(d);
        });
        if (window.dirtyAvailKeys instanceof Set) window.dirtyAvailKeys.clear();
        if (window.dirtyPlanKeys instanceof Set) window.dirtyPlanKeys.clear();
        window.hasUnsavedChanges = false;
        if (typeof window.updateSaveIndicator === 'function') window.updateSaveIndicator();
        if (typeof window.renderGrid === 'function') window.renderGrid();

        const taskMsg = recordedTaskIds.length > 0 ? `\nTask IDs: ${recordedTaskIds.slice(0, 3).join(', ')}` : '';
        customAlert("Sync Successful", `Pushed ${availPayload.length} availability ranges and ${restrPayload.length} restriction ranges to Channex.${taskMsg}`);

    } catch (err) {
        console.error("[Channex Sync Failure]:", err);
        customAlert("Sync Failed", err.message);
    } finally {
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
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
        customAlert("Error", err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// --------------------------------------------------------------------------
// 7. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

if (typeof window !== 'undefined') {
    window.ChannexClient = ChannexClient;
    window.sendRestrictionsUpdate = sendRestrictionsUpdate;
    window.sendAvailabilityUpdate = sendAvailabilityUpdate;
    window.triggerAutoSync = triggerAutoSync;
    window.compressDateEntries = compressDateEntries;
    window.pushToChannexAPI = pushToChannexAPI;
    window.saveAndSync = saveAndSync;
}
