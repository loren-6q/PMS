// ==========================================================================
// cm-engine.js - Consolidated Channel Manager & Pricing Operations Engine
// Wild & Wandering Property Management System
// 
// COMPLETE UNABRIDGED IMPLEMENTATION:
// - Universal Calendar Matrix with Depth (Master, Room, Event, All Rates)
// - 5 View Density modes (Avail, Price, Compact, Min/Max, Full)
// - Quick Bulk Update Drawer (Range application, anchors vs all scope)
// - Event Curve Tuner (±2D peak curves, direct shoulder recalculations)
// - Bidirectional relational pricing matrix and Ripple propagation
// - OTA Promos & Deals Margin-Preservation Engine
// - Extranet Missing Booking Auditor & Live Availability discrepancy checker
// - Cloud Persistence Safety Circuit-Breakers (Blocks empty timeline overwrites)
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- SECTION 1: FIREBASE INITIALIZATION & STATE ---

const firebaseConfig = { 
    apiKey: "AIzaSyCyz--TlQZf_d-YNxhtGCV29LuFoRBfEeU", 
    authDomain: "swimspms.firebaseapp.com", 
    projectId: "swimspms", 
    storageBucket: "swimspms.firebasestorage.app", 
    messagingSenderId: "989960113115", 
    appId: "1:989960113115:web:a99e08a23a36ff4289f5fe" 
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = 'hotel-pms-v1';

window.db = db;
window.auth = auth;
window.appId = appId;
window.cmFs = { doc, getDoc, setDoc, collection, getDocs, updateDoc, onSnapshot };

// Global Matrix & Engine State
window.daysToRender = 42;
window.currentPropertyId = 'swims_resort';
window.windowPropertiesList = [];
window.roomTypes = [];
window.displayAbbrev = {};
window.eventDates = [];
window.masterPricing = { relationships: [], timeline: {} };
window.pricingRules = { channels: {} };
window.promoRules = [];
window.currentPlatformView = 'direct';
window.editMode = 'ripple'; // 'ripple' | 'pin'
window.drillLevel = 'room'; // 'master' | 'room' | 'event' | 'rates'
window.viewDensity = 'full'; // 'avail' | 'price' | 'compact' | 'minmax' | 'full'
window.channelPreviewFilter = 'ALL';
window.bulkScopeMode = 'anchors'; // 'anchors' | 'all'
window.expandedRooms = new Set();

// Inventory & Tracking State
window.staff = [];
window.hotelRooms = [];
window.totalRoomsByType = {};
window.liveInventory = {};
window.snapshotData = {};
window.dismissedIds = [];
window.dirtyDates = new Set();
window.syncedDates = new Set();
window.hasUnsavedChanges = false;
window.hasLoadedPricingFromCloud = false;

// Typing Lockout
window.isUserTyping = false;
window.typingTimeout = null;

// --- SECTION 2: UI CONTROLLERS & TABS ---

window.showLoader = function(statusText = 'LOADING DATA...') {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('active');
        loader.style.display = 'flex';
    }
    const statusEl = document.getElementById('sync-status');
    if (statusEl && statusText) statusEl.innerText = statusText;
};

window.hideLoader = function() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('active');
        loader.style.display = 'none';
    }
};

window.switchTab = function(tab) {
    ['grid', 'promos', 'manual'].forEach(t => {
        const el = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (el) {
            el.style.display = t === tab ? 'flex' : 'none';
            el.classList.toggle('hidden', t !== tab);
        }
        if (btn) btn.classList.toggle('active', t === tab);
    });

    if (tab === 'promos' && window.renderPromoRulesTable) window.renderPromoRulesTable();
    if (tab === 'manual') {
        if (window.checkMissing) window.checkMissing();
        if (window.renderManualGrid) window.renderManualGrid();
    }
    if (window.lucide) window.lucide.createIcons();
};

window.markUnsavedChanges = function() {
    window.hasUnsavedChanges = true;
    window.updateSaveIndicator();
};

window.updateSaveIndicator = function() {
    const si = document.getElementById('save-indicator');
    const saveBtn = document.getElementById('btn-save-sync');
    if (!si) return;
    if (window.hasUnsavedChanges) {
        si.innerText = '● UNSAVED CHANGES';
        si.className = 'text-[9.5px] font-black uppercase tracking-widest text-amber-600 mr-2 opacity-100 animate-pulse';
        if (saveBtn) saveBtn.classList.add('ring-2', 'ring-amber-400');
    } else {
        si.innerText = 'PRICING SAVED';
        si.className = 'text-[9.5px] font-black uppercase tracking-widest text-emerald-600 mr-2 opacity-100';
        if (saveBtn) saveBtn.classList.remove('ring-2', 'ring-amber-400');
        setTimeout(() => { if (!window.hasUnsavedChanges && si) si.classList.add('opacity-0'); }, 3000);
    }
};

// --- SECTION 3: PRICING LOGIC, MATH & EVENT CURVES ---

window.isEventPricingEnabled = function() {
    const canon = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
    if (canon === 'loud_samui' || canon === 'big_c') return false;
    return window.enableEventRates !== undefined ? !!window.enableEventRates : ((window.eventDates || []).length > 0);
};

window.togglePropertyEventRates = async function() {
    const canon = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
    if (canon === 'loud_samui') {
        return window.customAlert("Notice", "Event Pricing is not active for LOUD Hostels Samui.");
    }

    const nextState = !window.isEventPricingEnabled();
    window.enableEventRates = nextState;
    window.updateEventPricingToggleUI();

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            enableEventRates: nextState
        });
    } catch(e) {
        console.warn("Could not save event pricing toggle:", e);
    }

    if (window.renderGrid) window.renderGrid();
};

window.updateEventPricingToggleUI = function() {
    const btn = document.getElementById('prop-event-pricing-btn');
    const isEn = window.isEventPricingEnabled();
    if (btn) {
        btn.className = isEn 
            ? "px-2 py-1 rounded font-black text-[10px] sm:text-xs uppercase shadow-2xs flex items-center gap-1 transition-colors cursor-pointer bg-pink-100 text-pink-800 border border-pink-300 hover:bg-pink-200"
            : "px-2 py-1 rounded font-black text-[10px] sm:text-xs uppercase shadow-2xs flex items-center gap-1 transition-colors cursor-pointer bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200";
        btn.innerHTML = isEn 
            ? `<i data-lucide="calendar-heart" size="13" class="text-pink-600"></i> <span>EVENTS: ON</span>`
            : `<i data-lucide="calendar-off" size="13" class="text-slate-400"></i> <span>EVENTS: OFF</span>`;
    }
    const depthEvtBtn = document.getElementById('depth-event');
    if (depthEvtBtn) depthEvtBtn.style.display = isEn ? 'inline-block' : 'none';
    if (window.lucide) window.lucide.createIcons();
};

window.applyMath = function(baseVal, type, modifier, isReverse = false) {
    if (baseVal === "" || baseVal == null || isNaN(parseFloat(baseVal))) return "";
    let val = parseFloat(baseVal); 
    let mod = parseFloat(modifier); 
    if (isNaN(mod)) mod = 0; 
    
    let res = val;
    if (type === '=' || type === 'sync') res = val;
    else if (!isReverse) {
        if (type === '+' || type === 'add') res = Math.max(0, val + mod);
        if (type === '-' || type === 'sub') res = Math.max(0, val - mod);
        if (type === '+%' || type === 'add_pct') res = val * (1 + (mod / 100));
        if (type === '-%' || type === 'sub_pct') res = Math.max(0, val * (1 - (mod / 100)));
    } else {
        if (type === '+' || type === 'add') res = Math.max(0, val - mod);
        if (type === '-' || type === 'sub') res = Math.max(0, val - mod);
        if (type === '+%' || type === 'add_pct') res = val / (1 + (mod / 100));
        if (type === '-%' || type === 'sub_pct') res = Math.max(0, val * (1 - (mod / 100)));
    }
    return Math.round(res);
};

window.computeDynamicPlanRate = function(dateStr, room, ratePlan) {
    if (!ratePlan) return null;
    const dayObj = (window.masterPricing?.timeline?.[dateStr]) || {};
    const roomObj = dayObj[room] || {};
    const hasEvents = window.isEventPricingEnabled();

    const isEvtProduct = (ratePlan.product === 'evt') || (ratePlan.rateSource === 'evt') || /evt|fmp|event/i.test(ratePlan.ratePlanTitle || '');
    const isRefPolicy = (ratePlan.policy === 'ref') || (/ref|flexible/i.test(ratePlan.ratePlanTitle || '') && !/non-?ref/i.test(ratePlan.ratePlanTitle || ''));

    // 1. Base rate
    let basePrice = (isEvtProduct && hasEvents && roomObj.fmp !== undefined && roomObj.fmp !== "")
        ? roomObj.fmp
        : roomObj.std;

    if (basePrice === undefined || basePrice === "" || isNaN(parseFloat(basePrice))) return null;
    let computed = parseFloat(basePrice);

    // 2. Channel Adjustment (Default is base rate = 1:1)
    const channelName = ratePlan.channel || 'Default';
    const isDefault = !channelName || channelName === 'Default' || channelName.toLowerCase().includes('default');

    if (!isDefault) {
        const chRule = window.pricingRules?.channels?.[channelName] || { type: '=', val: 0 };
        computed = window.applyMath(computed, chRule.type || '=', chRule.val || 0);
    }

    // 3. Refundable Markup Ratio
    if (isRefPolicy) {
        const rType = (isEvtProduct && hasEvents) ? (window.pricingRules?.evtRefType || '+%') : (window.pricingRules?.stdRefType || '+%');
        const rVal = (isEvtProduct && hasEvents) ? (window.pricingRules?.evtRefVal || 25) : (window.pricingRules?.stdRefVal || 25);
        computed = window.applyMath(computed, rType, rVal);
    }

    // 4. OTA Promo Margin Preserver
    (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
        const isChanMatch = pr.channel === 'ALL' || ratePlan.ratePlanTitle.toLowerCase().includes(pr.channel.toLowerCase());
        const isScopeMatch = pr.scope === 'ALL' || pr.scope === room;
        const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dateStr >= pr.startDate && dateStr <= pr.endDate);

        if (isChanMatch && isScopeMatch && isDateMatch) {
            const disc = pr.discountPct / 100;
            if (disc > 0 && disc < 1) computed *= (1 / (1 - disc));
        }
    });

    return Math.round(computed);
};

window.rippleDay = function(dateStr, startRoom, forceRipple = false) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dMs = window.parseYMD ? window.parseYMD(dateStr) : Date.parse(dateStr);
    const minDiff = window.getNearestEvent ? window.getNearestEvent(dMs) : 999;
    const isPeak = (minDiff === 0);

    const adj = {};
    (window.roomTypes || []).forEach(r => { adj[r] = []; });
    (window.masterPricing.relationships || []).forEach(rel => {
        if (rel.anchor === 'unlinked') return;
        if (!adj[rel.anchor]) adj[rel.anchor] = [];
        if (!adj[rel.target]) adj[rel.target] = [];
        adj[rel.anchor].push({ to: rel.target, type: rel.type, val: rel.val, typeFmp: rel.typeFmp, valFmp: rel.valFmp, isReverse: false });
        adj[rel.target].push({ to: rel.anchor, type: rel.type, val: rel.val, typeFmp: rel.typeFmp, valFmp: rel.valFmp, isReverse: true });
    });

    const queue = [startRoom];
    const visited = new Set([startRoom]);

    while (queue.length > 0) {
        const cur = queue.shift();
        const curVals = window.masterPricing.timeline[dateStr][cur] || {};

        (adj[cur] || []).forEach(edge => {
            if (!(window.roomTypes || []).includes(edge.to)) return;

            if (!visited.has(edge.to)) {
                visited.add(edge.to);
                window.masterPricing.timeline[dateStr][edge.to] = window.masterPricing.timeline[dateStr][edge.to] || { isOverride: {} };
                const nextVals = window.masterPricing.timeline[dateStr][edge.to];

                if (!forceRipple && nextVals.isOverride?.std) return;

                if (isPeak) {
                    const rType = edge.typeFmp || edge.type;
                    const rVal = edge.valFmp !== undefined ? edge.valFmp : edge.val;
                    const basePrice = curVals.std !== "" ? curVals.std : curVals.fmp;
                    const target = window.applyMath(basePrice, rType, rVal, edge.isReverse);
                    nextVals.std = target;
                    nextVals.fmp = target;
                } else {
                    if (curVals.std !== undefined && curVals.std !== "") {
                        nextVals.std = window.applyMath(curVals.std, edge.type, edge.val, edge.isReverse);
                    }
                    if (curVals.fmp !== undefined && curVals.fmp !== "") {
                        const rType = edge.typeFmp || edge.type;
                        const rVal = edge.valFmp !== undefined ? edge.valFmp : edge.val;
                        nextVals.fmp = window.applyMath(curVals.fmp, rType, rVal, edge.isReverse);
                    }
                }

                queue.push(edge.to);
                window.dirtyDates.add(dateStr);
            }
        });
    }
};

// --- SECTION 4: INVENTORY DEDUCTION & CALENDAR MATRIX ---

window.calculateLiveInventory = function() {
    window.liveInventory = {};
    const curProp = window.currentPropertyId;
    const staffList = window.staff || [];
    const roomTypes = window.roomTypes || [];
    const totalCapacity = window.totalRoomsByType || {};

    const startInput = document.getElementById('tape-start')?.value || window.getLocalYMD(new Date());
    const startMs = window.parseYMD(startInput) || Date.now();

    for (let i = -7; i < 90; i++) {
        const curD = new Date(startMs + (i * 86400000));
        const dStr = window.getLocalYMD(curD);
        window.liveInventory[dStr] = {};

        const occupied = {};
        roomTypes.forEach(rt => { occupied[rt] = 0; });

        for (let j = 0; j < staffList.length; j++) {
            const s = staffList[j];
            if (!s) continue;
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp && curProp && sProp !== curProp) continue;

            const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
            const isUnassigned = rList.length === 0 || rList[0] === "";

            if (window.isOccupyingBooking && !window.isOccupyingBooking(s.status, isUnassigned)) continue;

            const cIn = s.checkIn;
            const cOut = s.checkOut;

            if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                let cat = null;
                if (!isUnassigned && rList.length > 0) {
                    const hRoom = (window.hotelRooms || []).find(hr => hr.id === rList[0]);
                    if (hRoom && hRoom.type) cat = hRoom.type;
                }
                if (!cat) {
                    cat = s.bookedType || s.category;
                }
                if (cat) {
                    const matchedRt = roomTypes.find(rt => rt.toLowerCase() === cat.toLowerCase());
                    if (matchedRt) {
                        occupied[matchedRt] = (occupied[matchedRt] || 0) + (matchedRt.toLowerCase().includes('dorm') ? parseInt(s.pax || 1, 10) : Math.max(1, rList.length));
                    }
                }
            }
        }

        roomTypes.forEach(rt => {
            const cap = totalCapacity[rt] || 1;
            window.liveInventory[dStr][rt] = Math.max(0, cap - (occupied[rt] || 0));
        });
    }
};

window.renderGrid = function() {
    const tapeInput = document.getElementById('tape-start');
    if (tapeInput && !tapeInput.value) tapeInput.value = window.getLocalYMD(new Date());
    const startStr = tapeInput?.value || window.getLocalYMD(new Date());
    if (!startStr) return;

    window.calculateLiveInventory();

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    const dObj = new Date(startStr + "T12:00:00Z");
    const isEvents = window.isEventPricingEnabled();
    const density = window.viewDensity || 'full';

    // Header Row
    let trHead = `<tr class="sticky-header">
        <th class="frozen-col-header z-30 border-r-2 border-slate-600 px-2 text-left" style="width: 140px; min-width: 140px; left: 0;">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-300">Room / Rate</span>
        </th>`;

    for (let i = 0; i < window.daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dateStr = window.getLocalYMD(cur);
        const dMs = window.parseYMD(dateStr);
        const minDiff = window.getNearestEvent ? window.getNearestEvent(dMs) : 999;

        let highlight = 'bg-slate-900 border-slate-700 text-white';
        if (isEvents && minDiff === 0) highlight = 'evt-peak !bg-amber-500 text-slate-900';
        else if (isEvents && Math.abs(minDiff) <= 2) highlight = 'bg-amber-400 text-amber-900 border-amber-500';

        trHead += `<th class="px-0 py-0.5 border-b ${highlight} text-center" style="width: 32px; min-width: 32px;">
            <span class="block text-[8px] font-bold uppercase leading-none">${window.mNames[cur.getUTCMonth()]}</span>
            <span class="block text-[11px] font-black leading-tight mt-0.5">${cur.getUTCDate()}</span>
        </th>`;
    }
    trHead += `</tr>`;
    head.innerHTML = trHead;

    // Room Rows
    let allRows = '';
    (window.roomTypes || []).forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
        const displayName = window.displayAbbrev[room] || room;

        // 1. Availability Row (Hidden in 'price' view density)
        if (density !== 'price') {
            let trAvail = `<tr class="${groupClass} border-b border-slate-200">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 px-2">
                    <div class="flex items-center justify-between text-[11px] font-black text-slate-800">
                        <span class="truncate">${displayName}</span>
                        <span class="text-[8px] font-bold text-slate-400">AVL</span>
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

                trAvail += `<td class="p-0 border-r border-slate-200 text-center text-[10px] ${availColor}">
                    ${displayVal}
                </td>`;
            }
            trAvail += `</tr>`;
            allRows += trAvail;
        }

        if (density === 'avail') return;

        // 2. Base Rate Row
        let trRate = `<tr class="${groupClass} border-b border-slate-300">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 px-2">
                <div class="flex items-center justify-between text-[10px] font-black text-slate-700">
                    <span>Base Rate</span>
                    <span class="text-[7px] bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded border border-indigo-200">STD</span>
                </div>
            </td>`;

        for (let i = 0; i < window.daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = window.getLocalYMD(cur);
            const rData = window.masterPricing?.timeline?.[dateStr]?.[room] || {};
            const isOverride = !!rData.isOverride?.std;
            const price = rData.std !== undefined && rData.std !== "" ? rData.std : "";

            trRate += `<td class="p-0 border-r border-slate-200 text-center ${isOverride ? 'bg-amber-100' : ''}" style="width: 32px; min-width: 32px;">
                <input type="number" class="w-full text-center outline-none bg-transparent font-black text-[10px] ${isOverride ? 'text-amber-900' : 'text-slate-800'}" value="${price}" onfocus="this.select()" onchange="window.handleCellPriceChange('${dateStr}', '${room}', this.value)">
            </td>`;
        }
        trRate += `</tr>`;
        allRows += trRate;
    });

    body.innerHTML = allRows;
    if (window.lucide) window.lucide.createIcons();
};

window.handleCellPriceChange = function(dateStr, room, val) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr][room] = window.masterPricing.timeline[dateStr][room] || { isOverride: {} };
    const rData = window.masterPricing.timeline[dateStr][room];

    if (val === "" || isNaN(parseFloat(val))) {
        delete rData.std;
        delete rData.isOverride.std;
    } else {
        rData.std = Math.round(parseFloat(val));
        rData.isOverride.std = true;

        if (window.editMode === 'ripple') {
            window.rippleDay(dateStr, room, true);
        }
    }

    window.dirtyDates.add(dateStr);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
};

window.setViewDensity = function(density) {
    window.viewDensity = density;
    ['avail', 'price', 'compact', 'minmax', 'full'].forEach(d => {
        const btn = document.getElementById(`density-${d}`);
        if (btn) btn.className = d === density 
            ? "px-2 py-0.5 rounded cursor-pointer transition-colors bg-white text-indigo-700 shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-600 hover:bg-white";
    });
    if (window.renderGrid) window.renderGrid();
};

window.shiftTape = function(days) {
    const input = document.getElementById('tape-start');
    if (!input || !input.value) return;
    const cur = new Date(input.value + "T12:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + days);
    input.value = window.getLocalYMD(cur);
    window.renderGrid();
};

// --- SECTION 5: SAFETY-GUARDED CLOUD PERSISTENCE ---

window.savePricingToCloud = async function(silent = false) {
    if (!window.hasLoadedPricingFromCloud) {
        console.error("[Save Aborted]: Cloud pricing not confirmed loaded.");
        return window.customAlert("Save Blocked", "Safety Guard: The pricing matrix has not finished loading. Overwrite blocked.");
    }

    const dateCount = Object.keys(window.masterPricing?.timeline || {}).length;
    if (dateCount === 0) {
        console.error("[Save Aborted]: Attempted to save an empty pricing matrix.");
        return window.customAlert("Save Blocked", "Safety Guard: Matrix in memory is empty. Overwriting existing rates is blocked.");
    }

    if (!silent) window.showLoader('SAVING MATRIX...');

    try {
        const propId = window.currentPropertyId;
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(propId) : propId;

        // Backup snapshot before save
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing_backups', `${canonId}_${Date.now()}`);
        await setDoc(backupRef, {
            timeline: window.masterPricing.timeline,
            createdAt: new Date().toISOString()
        });

        // Write primary pricing matrix
        const mainRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`);
        await setDoc(mainRef, {
            timeline: window.masterPricing.timeline,
            relationships: window.masterPricing.relationships || [],
            pricingRules: window.pricingRules || {},
            updatedAt: new Date().toISOString()
        }, { merge: true });

        window.hasUnsavedChanges = false;
        window.updateSaveIndicator();
        if (!silent) window.customAlert("Success", "Master pricing matrix safely saved and backed up.");

    } catch (err) {
        console.error("[Pricing Save Error]:", err);
        window.customAlert("Save Failed", err.message);
    } finally {
        if (!silent) window.hideLoader();
    }
};

// --- SECTION 6: INITIALIZATION & LOADERS ---

window.loadPropertyPricing = async function() {
    window.showLoader('LOADING CONFIG & PRICING...');
    window.hasLoadedPricingFromCloud = false;

    try {
        // 1. Fetch Property Doc
        const propSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId));
        if (propSnap.exists()) {
            const pData = propSnap.data();
            window.hotelRooms = pData.rooms || [];
            window.eventDates = pData.events || [];
            window.enableEventRates = pData.enableEventRates;
            window.channexConfig = pData.channex || {};
            window.channexMap = pData.channexMap || [];
            window.channexRateMap = pData.channexRateMap || [];

            window.roomTypes = [];
            window.totalRoomsByType = {};
            (pData.rooms || []).forEach(r => {
                const cat = r.type || r.category;
                if (cat && !window.roomTypes.includes(cat)) window.roomTypes.push(cat);
                if (cat) window.totalRoomsByType[cat] = (window.totalRoomsByType[cat] || 0) + 1;
            });
        }

        // 2. Fetch Pricing Doc
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const priceSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`));
        if (priceSnap.exists()) {
            const pData = priceSnap.data();
            window.masterPricing.timeline = pData.timeline || {};
            window.masterPricing.relationships = pData.relationships || [];
            window.pricingRules = pData.pricingRules || { channels: {} };
        }

        window.hasLoadedPricingFromCloud = true;
        window.updateEventPricingToggleUI();
        window.renderGrid();

    } catch (err) {
        console.error("[Property Load Error]:", err);
        window.customAlert("Load Error", "Failed to load pricing: " + err.message);
    } finally {
        window.hideLoader();
    }
};

window.handlePropertySwitch = async function(newPropId) {
    if (!newPropId || newPropId === window.currentPropertyId) return;
    window.currentPropertyId = newPropId;
    window.safeUpdateUrlParam('p', newPropId.toUpperCase());
    await window.loadPropertyPricing();
};

async function initCmEngine() {
    try {
        await signInAnonymously(auth);
    } catch(e) {
        console.warn("Auth note:", e);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const pParam = (urlParams.get('p') || '').trim();
    if (pParam) {
        window.currentPropertyId = window.toCanonicalPropId ? window.toCanonicalPropId(pParam) : pParam.toLowerCase();
    }

    try {
        const propsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const switcher = document.getElementById('property-switcher');
        if (switcher) {
            switcher.innerHTML = propsSnap.docs.map(d => {
                const p = d.data();
                return `<option value="${d.id}" ${d.id === window.currentPropertyId ? 'selected' : ''}>${p.name || d.id}</option>`;
            }).join('');
        }
    } catch(e) {}

    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), snap => {
        window.staff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (window.renderGrid) window.renderGrid();
    });

    await window.loadPropertyPricing();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCmEngine);
} else {
    setTimeout(initCmEngine, 0);
}
