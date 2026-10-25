// ==========================================================================
// CHANNEL MANAGER PRICING & PROMOTIONS ENGINE (cm-pricing.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-pricing.js
// ==========================================================================

// Safe fallbacks to prevent module loading race conditions
window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
window.masterPricing.timeline = window.masterPricing.timeline || {};
window.pricingRules = window.pricingRules || {};
window.dirtyDates = window.dirtyDates || new Set();
window.syncedDates = window.syncedDates || new Set();
window.dirtyFields = window.dirtyFields || {};
window.eventDates = window.eventDates || [];
window.roomTypes = window.roomTypes || [];

// --- 1. CORE PRICING MATH & EVENT PROXIMITY ---
window.editMode = window.editMode || 'ripple'; // 'ripple' | 'pin'

// DYNAMIC RATE COMPUTATION (Master Driver -> Product STD/EVT -> Channel Multiplier -> Policy Ratio -> Promo)
window.computeDynamicPlanRate = (dateStr, room, ratePlan) => {
    if (!ratePlan) return null;
    const dayObj = (window.masterPricing && window.masterPricing.timeline) ? (window.masterPricing.timeline[dateStr] || {}) : {};
    const roomObj = dayObj[room] || {};
    const isEvents = window.isEventPricingEnabled ? window.isEventPricingEnabled() : ((window.eventDates || []).length > 0);
    const hasEvents = isEvents && (window.eventDates || []).length > 0;

    const isEvtProduct = (ratePlan.product === 'evt') || (ratePlan.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(ratePlan.ratePlanTitle || '');
    const isRefPolicy = (ratePlan.policy === 'ref') || (/ref|refundable/i.test(ratePlan.ratePlanTitle || '') && !/non-?ref/i.test(ratePlan.ratePlanTitle || ''));

    // 1. Base Product Rate (Standard vs Event)
    let basePrice = (isEvtProduct && hasEvents && roomObj.fmp !== undefined && roomObj.fmp !== "")
        ? roomObj.fmp
        : roomObj.std;

    if (basePrice === undefined || basePrice === "") {
        basePrice = window.masterPricing?.baseRates?.[room] || window.categoryBaseRates?.[room];
    }
    if (basePrice === undefined || basePrice === "" || isNaN(parseFloat(basePrice))) return null;

    let computed = parseFloat(basePrice);

    // 2. Channel Multiplier (from Tab 2 Pricing Rules)
    const channelName = ratePlan.channel || (window.fuzzyClassifyTitle ? window.fuzzyClassifyTitle(ratePlan.ratePlanTitle).channel : 'Direct Website');
    const channelRule = window.pricingRules?.channels?.[channelName] || { type: '=', val: 0 };
    computed = window.applyMath(computed, channelRule.type || '=', channelRule.val || 0);

    // 3. Policy Ratio (Refundable vs Non-Ref)
    if (isRefPolicy) {
        if (isEvtProduct && hasEvents) {
            const eType = window.pricingRules?.evtRefType || '+%';
            const eVal = window.pricingRules?.evtRefVal !== undefined ? window.pricingRules.evtRefVal : 25;
            computed = window.applyMath(computed, eType, eVal);
        } else {
            const sType = window.pricingRules?.stdRefType || '+%';
            const sVal = window.pricingRules?.stdRefVal !== undefined ? window.pricingRules.stdRefVal : 25;
            computed = window.applyMath(computed, sType, sVal);
        }
    }

    // 4. Promo Offsets (from Tab 3 Deals & Promos)
    let promoMultiplier = 1.0;
    (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
        const isChannelMatch = window.isRatePlanMatchingChannel 
            ? window.isRatePlanMatchingChannel(ratePlan.ratePlanTitle, pr.channel)
            : (pr.channel === 'ALL' || ratePlan.ratePlanTitle.toLowerCase().includes(pr.channel.toLowerCase()));
        const isScopeMatch = pr.scope === 'ALL' || pr.scope === room;
        const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dateStr >= pr.startDate && dateStr <= pr.endDate);

        if (isChannelMatch && isScopeMatch && isDateMatch) {
            const disc = pr.discountPct / 100;
            if (disc > 0 && disc < 1) promoMultiplier *= (1 / (1 - disc));
        }
    });

    computed *= promoMultiplier;
    return window.roundCurrency(computed);
};

window.applyMath = (baseVal, type, modifier, isReverse = false) => {
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
        if (type === '-' || type === 'sub') res = Math.max(0, val + mod);
        if (type === '+%' || type === 'add_pct') res = val / (1 + (mod / 100));
        if (type === '-%' || type === 'sub_pct') res = Math.max(0, val * (1 - (mod / 100)));
    }
    return window.roundCurrency(res);
};

window.getNearestEvent = (unixMs) => {
    if (!window.eventDates || window.eventDates.length === 0) return 999;
    let minDiff = Infinity;
    window.eventDates.forEach(evt => {
        const evtUnix = window.parseYMD(evt);
        const diff = Math.round((unixMs - evtUnix) / 86400000);
        if (Math.abs(diff) < Math.abs(minDiff)) minDiff = diff;
    });
    return minDiff; 
};

window.toggleEditMode = () => {
    window.editMode = window.editMode === 'ripple' ? 'pin' : 'ripple';
    const btn = document.getElementById('mode-toggle-btn');
    const label = document.getElementById('mode-label');
    const icon = document.getElementById('mode-icon');
    if (!btn || !label) return;

    if (window.editMode === 'ripple') {
        btn.className = "px-2.5 py-1.5 rounded font-black text-xs uppercase shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200";
        label.innerText = "RIPPLE MODE";
        icon.innerHTML = '<i data-lucide="zap" size="14" class="text-amber-600"></i>';
    } else {
        btn.className = "px-2.5 py-1.5 rounded font-black text-xs uppercase shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer bg-indigo-100 text-indigo-800 border border-indigo-300 hover:bg-indigo-200";
        label.innerText = "OVERRIDE MODE";
        icon.innerHTML = '<i data-lucide="edit-3" size="14" class="text-indigo-600"></i>';
    }
    if (window.lucide) window.lucide.createIcons();
};

window.showCmTooltip = (e, text) => {
    const tt = document.getElementById('cm-tooltip');
    if (!tt || !text) return;
    tt.innerText = text;
    tt.classList.remove('hidden');

    const pad = 12;
    let left = e.clientX + pad;
    let top = e.clientY + pad;

    if (left + 220 > window.innerWidth) left = e.clientX - 230;
    if (top + 60 > window.innerHeight) top = e.clientY - 70;

    tt.style.left = `${Math.max(10, left)}px`;
    tt.style.top = `${Math.max(10, top)}px`;
};

window.hideCmTooltip = () => {
    const tt = document.getElementById('cm-tooltip');
    if (tt) tt.classList.add('hidden');
};

// --- 2. RELATIONAL LINKING & RIPPLE ENGINE ---
window.rippleDay = (dateStr, startRoom) => {
    if (!window.isRippleEnabled) return;
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
    let isPeak = (minDiff === 0);

    const adj = {}; 
    (window.roomTypes || []).forEach(r => { adj[r] = []; });
    (window.masterPricing.relationships || []).forEach(rel => {
        if (rel.anchor === 'unlinked') return; 
        let aRoom = rel.anchor;
        let tRoom = rel.target;
        
        if (!adj[aRoom]) adj[aRoom] = [];
        if (!adj[tRoom]) adj[tRoom] = [];
        
        adj[aRoom].push({ to: tRoom, type: rel.type, val: rel.val, typeFmp: rel.typeFmp, valFmp: rel.valFmp, isReverse: false });
        adj[tRoom].push({ to: aRoom, type: rel.type, val: rel.val, typeFmp: rel.typeFmp, valFmp: rel.valFmp, isReverse: true });
    });

    let queue = [startRoom]; 
    let visited = new Set([startRoom]);
    while (queue.length > 0) {
        let cur = queue.shift();
        let curVals = window.masterPricing.timeline[dateStr][cur] || { std: "", fmp: "", isOverride: {} };

        (adj[cur] || []).forEach(edge => {
            if (!(window.roomTypes || []).includes(edge.to)) return;

            if (!visited.has(edge.to)) {
                visited.add(edge.to);
                window.masterPricing.timeline[dateStr][edge.to] = window.masterPricing.timeline[dateStr][edge.to] || { isOverride: {} };
                let nextVals = window.masterPricing.timeline[dateStr][edge.to];
                
                if (nextVals.isOverride?.std) return;

                if (isPeak) {
                    let ruleType = edge.typeFmp || edge.type;
                    let ruleVal = edge.valFmp !== undefined && edge.valFmp !== "" ? edge.valFmp : edge.val;
                    let basePrice = curVals.std !== "" ? curVals.std : curVals.fmp; 
                    let targetPrice = window.applyMath(basePrice, ruleType, ruleVal, edge.isReverse);
                    nextVals.std = targetPrice;
                    nextVals.fmp = targetPrice;
                } else {
                    if (curVals.std !== "") {
                        nextVals.std = window.applyMath(curVals.std, edge.type, edge.val, edge.isReverse);
                    }
                    if (curVals.fmp !== "") {
                        let ruleType = edge.typeFmp || edge.type;
                        let ruleVal = edge.valFmp !== undefined && edge.valFmp !== "" ? edge.valFmp : edge.val;
                        nextVals.fmp = window.applyMath(curVals.fmp, ruleType, ruleVal, edge.isReverse);
                    }
                }
                
                queue.push(edge.to);
                window.dirtyDates.add(dateStr);
            }
        });
    }
};

window.healDay = (dateStr) => {
    const anchorP = document.getElementById('w-anchor-private')?.value || window.pricingRules?.anchorPrivate || window.savedAutofillBaselines?.anchor_p;
    const anchorD = document.getElementById('w-anchor-dorm')?.value || window.pricingRules?.anchorDorm || window.savedAutofillBaselines?.anchor_d;
    const isEvents = window.isEventPricingEnabled ? window.isEventPricingEnabled() : ((window.eventDates || []).length > 0);
    const hasEvents = isEvents && (window.eventDates || []).length > 0;

    const b = window.savedAutofillBaselines || {};
    const p_base = parseFloat(document.getElementById('w-p-base')?.value) || parseFloat(document.getElementById('w-p-base-single')?.value) || b.p_base || 0;
    const p_pkg = parseFloat(document.getElementById('w-p-pkg')?.value) || b.p_pkg || 0;
    const p_m2 = parseFloat(document.getElementById('w-p-m2')?.value) || b.p_m2 || p_base;
    const p_m1 = parseFloat(document.getElementById('w-p-m1')?.value) || b.p_m1 || p_base;
    const p_0 = parseFloat(document.getElementById('w-p-0')?.value) || b.p_0 || p_base;
    const p_p1 = parseFloat(document.getElementById('w-p-p1')?.value) || b.p_p1 || p_base;
    const p_p2 = parseFloat(document.getElementById('w-p-p2')?.value) || b.p_p2 || p_base;

    const d_base = parseFloat(document.getElementById('w-d-base')?.value) || parseFloat(document.getElementById('w-d-base-single')?.value) || b.d_base || 0;
    const d_pkg = parseFloat(document.getElementById('w-d-pkg')?.value) || b.d_pkg || 0;
    const d_m2 = parseFloat(document.getElementById('w-d-m2')?.value) || b.d_m2 || d_base;
    const d_m1 = parseFloat(document.getElementById('w-d-m1')?.value) || b.d_m1 || d_base;
    const d_0 = parseFloat(document.getElementById('w-d-0')?.value) || b.d_0 || d_base;
    const d_p1 = parseFloat(document.getElementById('w-d-p1')?.value) || b.d_p1 || d_base;
    const d_p2 = parseFloat(document.getElementById('w-d-p2')?.value) || b.d_p2 || d_base;

    let stdP = p_base, fmpP = ""; 
    let stdD = d_base, fmpD = "";
    
    if (hasEvents) {
        let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
        if (Math.abs(minDiff) <= 6 && minDiff !== 0) { fmpP = p_pkg; fmpD = d_pkg; } 
        else if (Math.abs(minDiff) > 6) { fmpP = ""; fmpD = ""; }
        
        if (minDiff === -2) { stdP = p_m2; stdD = d_m2; }
        else if (minDiff === -1) { stdP = p_m1; stdD = d_m1; }
        else if (minDiff === 1) { stdP = p_p1; stdD = d_p1; }
        else if (minDiff === 2) { stdP = p_p2; stdD = d_p2; }
        else if (minDiff === 0) { stdP = p_0; fmpP = p_0; stdD = d_0; fmpD = d_0; }
    }

    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    
    if (anchorP) {
        window.masterPricing.timeline[dateStr][anchorP] = window.masterPricing.timeline[dateStr][anchorP] || { isOverride: {} };
        const curStd = window.masterPricing.timeline[dateStr][anchorP].std;
        if (!window.masterPricing.timeline[dateStr][anchorP].isOverride.std && (curStd === "" || curStd === undefined)) {
            window.masterPricing.timeline[dateStr][anchorP].std = stdP;
        }
        if (!window.masterPricing.timeline[dateStr][anchorP].isOverride.fmp && (window.masterPricing.timeline[dateStr][anchorP].fmp === "" || window.masterPricing.timeline[dateStr][anchorP].fmp === undefined)) {
            window.masterPricing.timeline[dateStr][anchorP].fmp = fmpP;
        }
    }
    if (anchorD) {
        window.masterPricing.timeline[dateStr][anchorD] = window.masterPricing.timeline[dateStr][anchorD] || { isOverride: {} };
        const curStdD = window.masterPricing.timeline[dateStr][anchorD].std;
        if (!window.masterPricing.timeline[dateStr][anchorD].isOverride.std && (curStdD === "" || curStdD === undefined)) {
            window.masterPricing.timeline[dateStr][anchorD].std = stdD;
        }
        if (!window.masterPricing.timeline[dateStr][anchorD].isOverride.fmp && (window.masterPricing.timeline[dateStr][anchorD].fmp === "" || window.masterPricing.timeline[dateStr][anchorD].fmp === undefined)) {
            window.masterPricing.timeline[dateStr][anchorD].fmp = fmpD;
        }
    }
    
    const anchors = new Set((window.masterPricing.relationships || []).map(r => r.anchor));
    anchors.forEach(a => { if (a !== 'unlinked') window.rippleDay(dateStr, a); });
};

// --- 3. RELATIONAL LINKING UI & PERSISTENCE ---
window.renderRelationships = () => {
    const body = document.getElementById('relationships-body'); 
    if (!body) return;
    body.innerHTML = '';
    const hasEvents = (window.eventDates || []).length > 0;
    
    const getAnchorOptionsHtml = (selectedAnchor) => {
        let html = `<option value="unlinked" ${selectedAnchor === 'unlinked' ? 'selected' : ''} class="font-black text-amber-600">-- UNLINKED --</option>`;
        const allOptions = [...(window.roomTypes || [])];
        const cleanSel = (selectedAnchor || '').toUpperCase().trim();
        if (selectedAnchor && selectedAnchor !== 'unlinked' && !allOptions.some(t => t.toUpperCase().trim() === cleanSel)) {
            allOptions.unshift(selectedAnchor);
        }
        allOptions.forEach(t => {
            const isSel = (t === selectedAnchor) || (t.toUpperCase().trim() === cleanSel);
            html += `<option value="${t}" ${isSel ? 'selected' : ''}>${window.displayAbbrev[t] || t}</option>`;
        });
        return html;
    };

    const getTargetOptionsHtml = (selectedTarget) => {
        let html = '';
        const allOptions = [...(window.roomTypes || [])];
        const cleanSel = (selectedTarget || '').toUpperCase().trim();
        if (selectedTarget && !allOptions.some(t => t.toUpperCase().trim() === cleanSel)) {
            allOptions.unshift(selectedTarget);
        }
        allOptions.forEach(t => {
            const isSel = (t === selectedTarget) || (t.toUpperCase().trim() === cleanSel);
            html += `<option value="${t}" ${isSel ? 'selected' : ''}>${window.displayAbbrev[t] || t}</option>`;
        });
        return html;
    };

    (window.masterPricing.relationships || []).forEach((rel) => {
        const tr = document.createElement('tr'); 
        tr.className = "border-b border-slate-200 rel-row bg-white hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="p-0 text-center"><button onclick="this.closest('tr').remove(); window.saveRelationships()" class="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"><i data-lucide="trash-2" size="16"></i></button></td>
            <td class="p-0 border-r border-slate-200 w-1/4"><select class="rel-anchor input-base !text-xs !py-1 cursor-pointer w-full" onchange="window.saveRelationships()">${getAnchorOptionsHtml(rel.anchor)}</select></td>
            <td class="p-0 border-r border-slate-200 w-1/4"><select class="rel-target input-base !text-xs !py-1 cursor-pointer w-full" onchange="window.saveRelationships()">${getTargetOptionsHtml(rel.target)}</select></td>
            <td class="p-0 border-r border-slate-200 bg-slate-50">
                <div class="flex items-center justify-center">
                    <select class="rel-type input-base !text-xs !py-1 w-auto min-w-[80px] text-center cursor-pointer font-black text-indigo-700" onchange="window.saveRelationships()">
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" class="rel-val input-base !text-sm !py-1 w-20 text-center font-black" placeholder="Val" value="${rel.val === 0 ? '' : rel.val}" oninput="window.saveRelationships()" onchange="window.saveRelationships()">
                </div>
            </td>
            <td class="p-0 bg-pink-50/50 evt-column" style="${hasEvents ? '' : 'display:none;'}">
                <div class="flex items-center justify-center">
                    <select class="rel-fmp-type input-base !text-xs !py-1 w-auto min-w-[80px] text-center cursor-pointer font-black text-pink-700" onchange="window.saveRelationships()">
                        <option value="=" ${rel.typeFmp === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" class="rel-fmp-val input-base !text-sm !py-1 w-20 text-center font-black" placeholder="Val" value="${rel.valFmp === 0 || rel.valFmp === undefined ? '' : rel.valFmp}" oninput="window.saveRelationships()" onchange="window.saveRelationships()">
                </div>
            </td>
        `; 
        body.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.readRelationshipsFromDOM = () => {
    const rows = document.querySelectorAll('.rel-row');
    if (rows.length === 0) return;
    const updated = [];
    rows.forEach(tr => {
        const aEl = tr.querySelector('.rel-anchor');
        const tEl = tr.querySelector('.rel-target');
        const typeEl = tr.querySelector('.rel-type');
        const valEl = tr.querySelector('.rel-val');
        const fmpTypeEl = tr.querySelector('.rel-fmp-type');
        const fmpValEl = tr.querySelector('.rel-fmp-val');
        if (aEl && tEl) {
            updated.push({
                anchor: aEl.value,
                target: tEl.value,
                type: typeEl ? typeEl.value : "=",
                val: valEl ? (parseFloat(valEl.value) || 0) : 0,
                typeFmp: fmpTypeEl ? fmpTypeEl.value : "=",
                valFmp: fmpValEl ? (parseFloat(fmpValEl.value) || 0) : 0
            });
        }
    });
    if (updated.length > 0) {
        window.masterPricing.relationships = updated;
    }
};

window.saveRelationshipsToCloud = async (notify = false) => {
    window.readRelationshipsFromDOM();
    const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
    try {
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            relationships: window.masterPricing.relationships,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        if (notify) {
            window.customAlert("Rule links saved to database!");
        }
    } catch (e) {
        console.error("Failed to save relationships to database:", e);
        if (notify) window.customAlert("Could not save links: " + e.message);
    }
};

window.saveRelationships = () => {
    window.readRelationshipsFromDOM();
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid();
    clearTimeout(window._relSaveTimer);
    window._relSaveTimer = setTimeout(() => {
        window.saveRelationshipsToCloud(false);
    }, 800);
};

window.addRelationshipRow = () => {
    window.readRelationshipsFromDOM();
    window.masterPricing.relationships = window.masterPricing.relationships || [];
    const defaultAnchor = (window.roomTypes && window.roomTypes[0]) ? window.roomTypes[0] : 'unlinked';
    const defaultTarget = (window.roomTypes && window.roomTypes.length > 1) ? window.roomTypes[1] : (defaultAnchor || '');
    window.masterPricing.relationships.push({
        anchor: defaultAnchor,
        target: defaultTarget,
        type: '=',
        val: 0,
        typeFmp: '=',
        valFmp: 0
    });
    window.renderRelationships();
    window.markUnsavedChanges();
    clearTimeout(window._relSaveTimer);
    window._relSaveTimer = setTimeout(() => {
        window.saveRelationshipsToCloud(false);
    }, 800);
};

// --- 4. AUTOFILLER BASELINES & EVENT VISIBILITY ---
window.updateAnchorDropdowns = () => {
    const selP = document.getElementById('w-anchor-private'); 
    const selD = document.getElementById('w-anchor-dorm');
    const dispP = document.getElementById('display-anchor-private');
    const dispD = document.getElementById('display-anchor-dorm');

    const curP = selP?.value || window.pricingRules?.anchorPrivate || window.savedAutofillBaselines?.anchor_p || '';
    const curD = selD?.value || window.pricingRules?.anchorDorm || window.savedAutofillBaselines?.anchor_d || '';

    const privates = (window.roomTypes || []).filter(t => !t.toLowerCase().includes('dorm'));
    const pList = privates.length ? privates : (window.roomTypes || []);
    const dorms = (window.roomTypes || []).filter(t => t.toLowerCase().includes('dorm'));
    const dList = dorms.length ? dorms : (window.roomTypes || []);

    if (selP) {
        selP.innerHTML = pList.map(t => `<option value="${t}" ${t === curP ? 'selected' : ''}>${t}</option>`).join('');
        if (curP && pList.includes(curP)) selP.value = curP;
    }
    if (selD) {
        selD.innerHTML = dList.map(t => `<option value="${t}" ${t === curD ? 'selected' : ''}>${t}</option>`).join('');
        if (curD && dList.includes(curD)) selD.value = curD;
    }

    if (dispP) dispP.innerText = selP?.value || curP || (pList[0] || '--');
    if (dispD) dispD.innerText = selD?.value || curD || (dList[0] || '--');
};

window.setAutofillPreset = (days) => {
    const sEl = document.getElementById('w-start-date');
    const eEl = document.getElementById('w-end-date');
    if (!sEl || !eEl) return;
    const start = sEl.value ? new Date(sEl.value + 'T12:00:00Z') : new Date();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + (days - 1));
    eEl.value = window.getLocalYMD ? window.getLocalYMD(end) : end.toISOString().split('T')[0];
};

window.clearOverrides = () => {
    const s = document.getElementById('w-start-date')?.value;
    const e = document.getElementById('w-end-date')?.value;
    if (!s || !e) {
        if (window.customAlert) window.customAlert("Please select Start Date and End Date to clear overrides.");
        return;
    }
    const execute = () => {
        const sU = window.parseYMD ? window.parseYMD(s) : new Date(s).getTime();
        const eU = window.parseYMD ? window.parseYMD(e) : new Date(e).getTime();
        for (let d = sU; d <= eU; d += 86400000) {
            const dStr = window.getLocalYMD ? window.getLocalYMD(new Date(d)) : new Date(d).toISOString().split('T')[0];
            if (window.masterPricing?.timeline?.[dStr]) {
                (window.roomTypes || []).forEach(r => {
                    if (window.unlockCellOverride) window.unlockCellOverride(dStr, r);
                });
            }
        }
        if (window.renderGrid) window.renderGrid();
        window.markUnsavedChanges();
        window.customAlert("Overrides cleared across selected range!");
    };
    window.customAlert(`Clear all pricing overrides between ${s} and ${e}?`, true, execute);
};

window.toggleAutofillEventMode = (enabled) => {
    const panel = document.getElementById('autofill-events-panel');
    const stdPanel = document.getElementById('autofill-standard-panel');
    if (panel) panel.style.display = enabled ? 'block' : 'none';
    if (stdPanel) stdPanel.style.display = enabled ? 'none' : 'block';
    
    document.querySelectorAll('.evt-column').forEach(el => {
        if (el.tagName === 'TR' || el.tagName === 'TD' || el.tagName === 'TH' || el.tagName === 'OPTION') {
            el.style.display = enabled ? 'table-cell' : 'none';
            if (el.tagName === 'OPTION') el.style.display = enabled ? 'block' : 'none';
        } else {
            el.style.display = enabled ? 'block' : 'none';
        }
    });
    document.querySelectorAll('.no-evt-column').forEach(el => el.style.display = enabled ? 'none' : 'block');
};

window.toggleEvtRestrInputs = (enabled) => {
    const wrap = document.getElementById('evt-restr-table-wrap');
    if (!wrap) return;
    if (enabled) {
        wrap.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        wrap.classList.add('opacity-50', 'pointer-events-none');
    }
};

window.populateAutofillBaselines = (b) => {
    if (!b) return;
    window.savedAutofillBaselines = b;
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };
    const setCheck = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.checked = !!val;
    };

    setVal('w-p-base', b.p_base);
    setVal('w-p-base-single', b.p_base);
    setVal('w-p-pkg', b.p_pkg);
    setVal('w-p-m2', b.p_m2);
    setVal('w-p-m1', b.p_m1);
    setVal('w-p-0', b.p_0);
    setVal('w-p-p1', b.p_p1);
    setVal('w-p-p2', b.p_p2);

    setVal('w-d-base', b.d_base);
    setVal('w-d-base-single', b.d_base);
    setVal('w-d-pkg', b.d_pkg);
    setVal('w-d-m2', b.d_m2);
    setVal('w-d-m1', b.d_m1);
    setVal('w-d-0', b.d_0);
    setVal('w-d-p1', b.d_p1);
    setVal('w-d-p2', b.d_p2);

    setCheck('w-enable-evt-restr', b.enable_evt_restr);
    window.toggleEvtRestrInputs(!!b.enable_evt_restr);

    // Populate all offsets from -7 to +7 independently
    for (let off = -7; off <= 7; off++) {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        if (b[`r_min_${tag}`] !== undefined) setVal(`w-r-min-${tag}`, b[`r_min_${tag}`]);
        if (b[`r_minarr_${tag}`] !== undefined) setVal(`w-r-minarr-${tag}`, b[`r_minarr_${tag}`]);
        if (b[`r_cta_${tag}`] !== undefined) setCheck(`w-r-cta-${tag}`, b[`r_cta_${tag}`]);
        if (b[`r_ctd_${tag}`] !== undefined) setCheck(`w-r-ctd-${tag}`, b[`r_ctd_${tag}`]);
    }

    if (b.anchor_p) {
        const pEl = document.getElementById('w-anchor-private');
        if (pEl) pEl.value = b.anchor_p;
    }
    if (b.anchor_d) {
        const dEl = document.getElementById('w-anchor-dorm');
        if (dEl) dEl.value = b.anchor_d;
    }
};

window.debounceSaveBaselines = () => {
    clearTimeout(window._baselineSaveTimer);
    window._baselineSaveTimer = setTimeout(() => {
        window.saveAutofillBaselines(false);
    }, 600);
};

window.saveAutofillBaselines = async (notify = false) => {
    const getVal = id => {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || 0) : 0;
    };
    const getRaw = id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
    };
    const getBool = id => {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    };

    const baselines = {
        anchor_p: document.getElementById('w-anchor-private')?.value || window.pricingRules?.anchorPrivate || '',
        anchor_d: document.getElementById('w-anchor-dorm')?.value || window.pricingRules?.anchorDorm || '',
        p_base: getVal('w-p-base') || getVal('w-p-base-single'),
        p_pkg: getVal('w-p-pkg'),
        p_m2: getVal('w-p-m2'),
        p_m1: getVal('w-p-m1'),
        p_0: getVal('w-p-0'),
        p_p1: getVal('w-p-p1'),
        p_p2: getVal('w-p-p2'),
        d_base: getVal('w-d-base') || getVal('w-d-base-single'),
        d_pkg: getVal('w-d-pkg'),
        d_m2: getVal('w-d-m2'),
        d_m1: getVal('w-d-m1'),
        d_0: getVal('w-d-0'),
        d_p1: getVal('w-d-p1'),
        d_p2: getVal('w-d-p2'),
        enable_evt_restr: getBool('w-enable-evt-restr')
    };

    for (let off = -7; off <= 7; off++) {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        baselines[`r_min_${tag}`] = getRaw(`w-r-min-${tag}`);
        baselines[`r_minarr_${tag}`] = getRaw(`w-r-minarr-${tag}`);
        baselines[`r_cta_${tag}`] = getBool(`w-r-cta-${tag}`);
        baselines[`r_ctd_${tag}`] = getBool(`w-r-ctd-${tag}`);
    }
    window.savedAutofillBaselines = baselines;

    try {
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            autofillBaselines: baselines,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        if (notify) window.customAlert("Autofiller baseline prices and restrictions saved to database!");
    } catch (e) {
        console.error("Failed to save baselines:", e);
        if (notify) window.customAlert("Could not save baselines: " + e.message);
    }
};

// --- 5. DYNAMIC ACTIVE OTA CHANNEL PIPELINE ---
window.resetChannelsToParity = () => {
    window.pricingRules = window.pricingRules || {};
    window.pricingRules.channels = {};
    (window.channexRateMap || []).forEach(m => {
        if (m.channel && m.channel !== 'ALL' && !m.channel.toLowerCase().includes('default')) {
            window.pricingRules.channels[m.channel] = { type: '=', val: 0 };
        }
    });
    window.pricingRules.channels['Booking.com'] = { type: '=', val: 0 };

    window.markUnsavedChanges();
    window.savePricingRulesToCloud(false);
    if (window.renderDynamicOtaRules) window.renderDynamicOtaRules();
    if (window.renderGrid) window.renderGrid();
    if (window.customAlert) window.customAlert("All channels reset to SYNC (= 0) for 100% WYSIWYG parity!");
};

window.renderDynamicOtaRules = () => {
    const container = document.getElementById('dynamic-ota-rules-container');
    if (!container) return;

    // Detect unique channels actually mapped in Channex (excluding Default plans which are already the base rate)
    const activeChannels = new Set();
    (window.channexRateMap || []).forEach(r => {
        const ch = r.channel || '';
        if (ch && ch !== 'ALL' && !ch.toLowerCase().includes('default')) {
            activeChannels.add(ch);
        } else if (/bdc|booking/i.test(r.ratePlanTitle || '')) {
            activeChannels.add('Booking.com');
        }
    });

    if (activeChannels.size === 0) {
        activeChannels.add('Booking.com');
    }

    window.pricingRules = window.pricingRules || {};
    window.pricingRules.channels = window.pricingRules.channels || {};

    let html = '';
    activeChannels.forEach(ch => {
        const conf = window.pricingRules.channels[ch] || { type: '=', val: 0 };
        const isBdc = ch === 'Booking.com';
        const badgeColor = isBdc ? 'bg-[#003580] text-white' : 'bg-purple-600 text-white';

        html += `
        <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
            <div class="flex items-center gap-2 min-w-0">
                <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${badgeColor} shrink-0">${ch}</span>
                <span class="text-xs font-bold text-slate-700 truncate">${ch} Channel Multiplier</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <select class="input-base !w-24 !py-1 font-black text-center" onchange="window.updateChannelRule('${ch}', 'type', this.value)">
                    <option value="=" ${conf.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                    <option value="+%" ${conf.type === '+%' ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${conf.type === '-%' ? 'selected' : ''}>- %</option>
                    <option value="+" ${conf.type === '+' ? 'selected' : ''}>+ ฿</option>
                    <option value="-" ${conf.type === '-' ? 'selected' : ''}>- ฿</option>
                </select>
                <input type="number" step="any" value="${conf.val || 0}" class="input-base !w-20 !py-1 font-black text-center" oninput="window.updateChannelRule('${ch}', 'val', this.value)">
            </div>
        </div>`;
    });

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.updateChannelRule = (channel, field, val) => {
    window.pricingRules = window.pricingRules || {};
    window.pricingRules.channels = window.pricingRules.channels || {};
    window.pricingRules.channels[channel] = window.pricingRules.channels[channel] || { type: '=', val: 0 };
    window.pricingRules.channels[channel][field] = field === 'val' ? parseFloat(val) || 0 : val;
    window.markRulesUnsaved();
};

window.markRulesUnsaved = () => {
    window.markUnsavedChanges();
};

window.savePricingRulesToCloud = async (notify = false) => {
    const stdInput = document.getElementById('rule-std-ref-val');
    const evtInput = document.getElementById('rule-evt-ref-val');
    const stdTypeEl = document.getElementById('rule-std-ref-type');
    const evtTypeEl = document.getElementById('rule-evt-ref-type');
    const masterDriverEl = document.getElementById('rule-master-driver');
    const anchorPEl = document.getElementById('rule-anchor-private') || document.getElementById('w-anchor-private');
    const anchorDEl = document.getElementById('rule-anchor-dorm') || document.getElementById('w-anchor-dorm');

    const rules = {
        masterDriver: masterDriverEl?.value || window.pricingRules?.masterDriver || 'bdc_non_ref',
        anchorPrivate: anchorPEl?.value || window.pricingRules?.anchorPrivate || window.savedAutofillBaselines?.anchor_p || '',
        anchorDorm: anchorDEl?.value || window.pricingRules?.anchorDorm || window.savedAutofillBaselines?.anchor_d || '',
        stdRefType: stdTypeEl?.value || window.pricingRules?.stdRefType || '+%',
        stdRefVal: (stdInput && stdInput.value !== "") ? (parseFloat(stdInput.value) || 0) : (window.pricingRules?.stdRefVal !== undefined ? window.pricingRules.stdRefVal : 25),
        evtRefType: evtTypeEl?.value || window.pricingRules?.evtRefType || '+%',
        evtRefVal: (evtInput && evtInput.value !== "") ? (parseFloat(evtInput.value) || 0) : (window.pricingRules?.evtRefVal !== undefined ? window.pricingRules.evtRefVal : 25),
        channels: window.pricingRules?.channels || {}
    };

    window.pricingRules = rules;

    try {
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            pricingRules: rules,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        if (notify) window.customAlert("Pricing Rules & Channel Multipliers saved to database!");
    } catch(e) {
        console.error("Rules Save Error:", e);
        if (notify) window.customAlert("Failed to save rules: " + e.message);
    }
};

// --- DYNAMIC EVENT RESTRICTION SPAN & TABLE RENDERER (±2D, ±4D, ±7D) ---
window.evtRestrWindow = window.evtRestrWindow || 7; // Default to ±7D (15 Days)

window.setEvtRestrWindow = (days) => {
    window.evtRestrWindow = days;
    [2, 4, 7].forEach(d => {
        const btn = document.getElementById(`restr-span-${d}`);
        if (btn) {
            if (d === days) btn.className = "px-2 py-0.5 rounded bg-white text-indigo-700 shadow-xs font-black cursor-pointer";
            else btn.className = "px-2 py-0.5 rounded text-slate-600 hover:bg-white cursor-pointer";
        }
    });
    window.renderEvtRestrTable();
};

window.renderEvtRestrTable = () => {
    const theadRow = document.getElementById('evt-restr-thead-row');
    const tbody = document.getElementById('evt-restr-tbody');
    if (!theadRow || !tbody) return;

    const span = window.evtRestrWindow || 7;
    const offsets = [];
    for (let i = -span; i <= span; i++) offsets.push(i);

    let thHtml = `<th class="text-[9px] font-black uppercase text-slate-400 text-left pl-2 w-28">Rule Type</th>`;
    offsets.forEach(off => {
        if (off === 0) thHtml += `<th class="text-[10px] font-black uppercase text-amber-600">Peak (0)</th>`;
        else thHtml += `<th class="text-[9px] font-black uppercase text-slate-400">EVT ${off > 0 ? '+' + off : off}</th>`;
    });
    theadRow.innerHTML = thHtml;

    const b = window.savedAutofillBaselines || {};

    const getVal = (prefix, off, def = "") => {
        const key = `${prefix}_${off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off)}`;
        return b[key] !== undefined ? b[key] : def;
    };

    const getBool = (prefix, off) => {
        const key = `${prefix}_${off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off)}`;
        return !!b[key];
    };

    let tbHtml = '';

    // Row 1: Min Stay (Nts)
    tbHtml += `<tr class="bg-pink-50/40">
        <td class="text-xs font-bold text-pink-900 text-left pl-2 rounded-l-lg border border-pink-100 border-r-0 py-1">Min Stay (Nts)</td>`;
    offsets.forEach(off => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const val = getVal('r_min', off, "");
        tbHtml += `<td class="border-y border-pink-100">
            <input type="number" min="1" id="w-r-min-${tag}" class="input-base text-center !py-1 !px-0.5 text-pink-800 font-black w-12" value="${val}" placeholder="--" onfocus="this.select()" oninput="window.debounceSaveBaselines();">
        </td>`;
    });
    tbHtml += `</tr>`;

    // Row 2: Min on Arrival (min_arr)
    tbHtml += `<tr class="bg-slate-50">
        <td class="text-xs font-bold text-slate-700 text-left pl-2 rounded-l-lg border border-slate-200 border-r-0 py-1">Min on Arrival</td>`;
    offsets.forEach(off => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const val = getVal('r_minarr', off, "");
        tbHtml += `<td class="border-y border-slate-200">
            <input type="number" min="1" id="w-r-minarr-${tag}" class="input-base text-center !py-1 !px-0.5 text-amber-700 font-bold w-12" value="${val}" placeholder="--" onfocus="this.select()" oninput="window.debounceSaveBaselines();">
        </td>`;
    });
    tbHtml += `</tr>`;

    // Row 3: Close to Arrival (CTA)
    tbHtml += `<tr class="bg-slate-50">
        <td class="text-xs font-bold text-slate-700 text-left pl-2 rounded-l-lg border border-slate-200 border-r-0 py-1">Close to Arrival (CTA)</td>`;
    offsets.forEach(off => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const chk = getBool('r_cta', off);
        tbHtml += `<td class="border-y border-slate-200 py-1">
            <input type="checkbox" id="w-r-cta-${tag}" class="row-checkbox" ${chk ? 'checked' : ''} onchange="window.debounceSaveBaselines();">
        </td>`;
    });
    tbHtml += `</tr>`;

    // Row 4: Close to Departure (CTD)
    tbHtml += `<tr class="bg-slate-50">
        <td class="text-xs font-bold text-slate-700 text-left pl-2 rounded-l-lg border border-slate-200 border-r-0 py-1">Close to Departure (CTD)</td>`;
    offsets.forEach(off => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const chk = getBool('r_ctd', off);
        tbHtml += `<td class="border-y border-slate-200 py-1">
            <input type="checkbox" id="w-r-ctd-${tag}" class="row-checkbox" ${chk ? 'checked' : ''} onchange="window.debounceSaveBaselines();">
        </td>`;
    });
    tbHtml += `</tr>`;

    tbody.innerHTML = tbHtml;
};

window.runAutomator = () => {
    const anchorP = document.getElementById('w-anchor-private')?.value || window.pricingRules?.anchorPrivate;
    const anchorD = document.getElementById('w-anchor-dorm')?.value || window.pricingRules?.anchorDorm;
    const sDate = document.getElementById('w-start-date')?.value;
    const eDate = document.getElementById('w-end-date')?.value;
    const isEvents = window.isEventPricingEnabled ? window.isEventPricingEnabled() : ((window.eventDates || []).length > 0);
    const hasEvents = isEvents && (window.eventDates || []).length > 0;
    
    const p_base = parseFloat(document.getElementById('w-p-base')?.value) || parseFloat(document.getElementById('w-p-base-single')?.value) || 0;
    const p_pkg = parseFloat(document.getElementById('w-p-pkg')?.value) || 0;
    const p_m2 = parseFloat(document.getElementById('w-p-m2')?.value) || p_base;
    const p_m1 = parseFloat(document.getElementById('w-p-m1')?.value) || p_base;
    const p_0 = parseFloat(document.getElementById('w-p-0')?.value) || p_base;
    const p_p1 = parseFloat(document.getElementById('w-p-p1')?.value) || p_base;
    const p_p2 = parseFloat(document.getElementById('w-p-p2')?.value) || p_base;

    const d_base = parseFloat(document.getElementById('w-d-base')?.value) || parseFloat(document.getElementById('w-d-base-single')?.value) || 0;
    const d_pkg = parseFloat(document.getElementById('w-d-pkg')?.value) || 0;
    const d_m2 = parseFloat(document.getElementById('w-d-m2')?.value) || d_base;
    const d_m1 = parseFloat(document.getElementById('w-d-m1')?.value) || d_base;
    const d_0 = parseFloat(document.getElementById('w-d-0')?.value) || d_base;
    const d_p1 = parseFloat(document.getElementById('w-d-p1')?.value) || d_base;
    const d_p2 = parseFloat(document.getElementById('w-d-p2')?.value) || d_base;

    const restrCheckEl = document.getElementById('w-enable-evt-restr');
    const enableRestr = restrCheckEl ? restrCheckEl.checked : true;

    const getRestr = (off) => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const minEl = document.getElementById(`w-r-min-${tag}`);
        const minArrEl = document.getElementById(`w-r-minarr-${tag}`);
        const ctaEl = document.getElementById(`w-r-cta-${tag}`);
        const ctdEl = document.getElementById(`w-r-ctd-${tag}`);

        const min = minEl && minEl.value !== "" ? parseInt(minEl.value, 10) : "";
        const min_arr = minArrEl && minArrEl.value !== "" ? parseInt(minArrEl.value, 10) : "";
        const cta = ctaEl ? ctaEl.checked : false;
        const ctd = ctdEl ? ctdEl.checked : false;

        return { min, min_arr, cta, ctd };
    };

    const restrMap = {};
    for (let off = -7; off <= 7; off++) {
        restrMap[String(off)] = getRestr(off);
    }
    
    if (!sDate || !eDate) return window.customAlert("Please select both a Start Date and an End Date.");
    if (sDate > eDate) return window.customAlert("End Date must be on or after Start Date.");
    const startUnix = window.parseYMD(sDate), endUnix = window.parseYMD(eDate);

    let eventDatesUpdated = 0;
    
    for (let d = startUnix; d <= endUnix; d += 86400000) {
        let dateStr = window.getLocalYMD(new Date(d));
        let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
        
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);

        let stdP = p_base, fmpP = ""; 
        let stdD = d_base, fmpD = "";
        
        if (hasEvents) {
            if (Math.abs(minDiff) <= 6 && minDiff !== 0) { 
                fmpP = p_pkg; fmpD = d_pkg; 
            } else if (Math.abs(minDiff) > 6) { 
                fmpP = ""; fmpD = ""; 
            }
            
            if (minDiff === -2) { stdP = p_m2; stdD = d_m2; }
            else if (minDiff === -1) { stdP = p_m1; stdD = d_m1; }
            else if (minDiff === 1) { stdP = p_p1; stdD = d_p1; }
            else if (minDiff === 2) { stdP = p_p2; stdD = d_p2; }
            else if (minDiff === 0) { 
                stdP = p_0; fmpP = p_0; 
                stdD = d_0; fmpD = d_0; 
            }
        }

        window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
        
        // Strict EVT restriction enforcement across up to ±7 days
        if (hasEvents && enableRestr) {
            const restrConfig = restrMap[String(minDiff)];
            if (restrConfig && (restrConfig.min !== "" || restrConfig.min_arr !== "" || restrConfig.cta || restrConfig.ctd)) {
                eventDatesUpdated++;
                window.masterPricing.timeline[dateStr].evtRestrictions = {
                    min: restrConfig.min,
                    min_arr: restrConfig.min_arr,
                    cta: restrConfig.cta,
                    ctd: restrConfig.ctd
                };

                (window.channexRateMap || []).forEach(rate => {
                    const isEvtRate = (rate.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(rate.ratePlanTitle || '');
                    if (isEvtRate) {
                        window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
                        const otaO = window.masterPricing.timeline[dateStr].otaOverrides;
                        if (restrConfig.min !== "") otaO[`${rate.ratePlanId}_min`] = restrConfig.min;
                        if (restrConfig.min_arr !== "") otaO[`${rate.ratePlanId}_min_arr`] = restrConfig.min_arr;
                        otaO[`${rate.ratePlanId}_cta`] = !!restrConfig.cta;
                        otaO[`${rate.ratePlanId}_ctd`] = !!restrConfig.ctd;
                    }
                });
            } else {
                delete window.masterPricing.timeline[dateStr].evtRestrictions;
            }
        } else {
            delete window.masterPricing.timeline[dateStr].evtRestrictions;
        }
        
        if (anchorP) {
            window.masterPricing.timeline[dateStr][anchorP] = window.masterPricing.timeline[dateStr][anchorP] || { isOverride: {} };
            const curP = window.masterPricing.timeline[dateStr][anchorP];
            if (!curP.isOverride.std) curP.std = window.roundCurrency(stdP);
            if (!curP.isOverride.fmp) curP.fmp = fmpP !== "" ? window.roundCurrency(fmpP) : "";
            window.rippleDay(dateStr, anchorP);
        }
        
        if (anchorD) {
            window.masterPricing.timeline[dateStr][anchorD] = window.masterPricing.timeline[dateStr][anchorD] || { isOverride: {} };
            const curD = window.masterPricing.timeline[dateStr][anchorD];
            if (!curD.isOverride.std) curD.std = window.roundCurrency(stdD);
            if (!curD.isOverride.fmp) curD.fmp = fmpD !== "" ? window.roundCurrency(fmpD) : "";
            window.rippleDay(dateStr, anchorD);
        }
    }

    window.saveAutofillBaselines(false);
    window.markUnsavedChanges();
    if (window.renderGrid) window.renderGrid(); 
    if (window.switchTab) window.switchTab('grid');

    window.customAlert(`Timeline Painted Successfully!\n\n` +
        `• Period: ${sDate} → ${eDate}\n` +
        `• EVT Rate Plans: Event minimum stays, CTA, and CTD applied exclusively to EVT plans (${eventDatesUpdated} event dates affected).\n` +
        `• Standard Rate Plans: Kept on standard open stays (no event restrictions).\n` +
        `• Click "SAVE & SYNC" to push these values to Channex.`);
};

window.nukeDatabase = () => {
    window.customAlert("WIPE ALL PRICING DATA?\n\nThis will completely clear your entire pricing matrix from the database, resetting everything to blank.", true, () => {
        window.masterPricing.timeline = {};
        window.savePricingToCloud();
        if (window.renderGrid) window.renderGrid();
    });
};

// --- 6. PROMOTIONS & DEALS ENGINE ---
window.populatePromoScopeDropdown = () => {
    const scopeEl = document.getElementById('promo-room-scope');
    if (scopeEl) {
        scopeEl.innerHTML = `<option value="ALL">All Categories</option>` +
            (window.roomTypes || []).map(t => `<option value="${t}">${t}</option>`).join('');
    }
};

window.openAddPromoModal = () => {
    const idEl = document.getElementById('promo-rule-id');
    const nameEl = document.getElementById('promo-name');
    const discEl = document.getElementById('promo-discount-pct');
    const alwEl = document.getElementById('promo-always-active');
    if (idEl) idEl.value = '';
    if (nameEl) nameEl.value = '';
    if (discEl) discEl.value = '15';
    if (alwEl) alwEl.checked = false;
    window.togglePromoDateInputs(false);

    const today = new Date().toISOString().split('T')[0];
    const sEl = document.getElementById('promo-start-date');
    const eEl = document.getElementById('promo-end-date');
    if (sEl) sEl.value = today;
    if (eEl) eEl.value = today;

    const modal = document.getElementById('promo-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
    window.updatePromoModalMath();
};

window.togglePromoDateInputs = (isAlways) => {
    const wrap = document.getElementById('promo-date-wrap');
    if (wrap) {
        if (isAlways) wrap.classList.add('opacity-40', 'pointer-events-none');
        else wrap.classList.remove('opacity-40', 'pointer-events-none');
    }
};

window.updatePromoModalMath = () => {
    const disc = parseFloat(document.getElementById('promo-discount-pct')?.value) || 0;
    const calcEl = document.getElementById('promo-calculated-markup');
    if (!calcEl) return;
    if (disc <= 0 || disc >= 100) {
        calcEl.value = "+0%";
    } else {
        const markup = ((1 / (1 - (disc / 100))) - 1) * 100;
        calcEl.value = `+${markup.toFixed(1)}%`;
    }
};

window.savePromoRule = async () => {
    const name = document.getElementById('promo-name')?.value.trim();
    const discountPct = parseFloat(document.getElementById('promo-discount-pct')?.value) || 0;
    const channel = document.getElementById('promo-channel')?.value;
    const isAlways = document.getElementById('promo-always-active')?.checked;
    const startDate = document.getElementById('promo-start-date')?.value;
    const endDate = document.getElementById('promo-end-date')?.value;
    const scope = document.getElementById('promo-room-scope')?.value;
    const active = document.getElementById('promo-active-toggle')?.checked;

    if (!name) return window.customAlert("Please enter a Promo Name.");
    if (discountPct <= 0 || discountPct >= 100) return window.customAlert("Please enter a valid Discount % (1-99).");

    const ruleId = document.getElementById('promo-rule-id')?.value || 'rule_' + Math.random().toString(36).substr(2, 9);
    const promoRules = window.promoRules || [];

    const existingIdx = promoRules.findIndex(r => r.id === ruleId);
    const newRule = {
        id: ruleId,
        name: name.toUpperCase(),
        channel,
        discountPct,
        isAlways,
        startDate: isAlways ? null : startDate,
        endDate: isAlways ? null : endDate,
        scope,
        active,
        createdAt: new Date().toISOString()
    };

    if (existingIdx > -1) promoRules[existingIdx] = newRule;
    else promoRules.push(newRule);

    try {
        const { doc, updateDoc } = window.cmFs;
        await updateDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), { promoRules });
        window.promoRules = promoRules;
        window.closeModal('promo-modal');
        window.renderPromoRulesTable();
        
        window.markUnsavedChanges();
        if (window.renderGrid) window.renderGrid();
        window.customAlert(`Promo rule "${name}" saved!`);
    } catch (err) {
        window.customAlert("Save Error: " + err.message);
    }
};

window.togglePromoRuleActive = async (ruleId, isActive) => {
    const promoRules = window.promoRules || [];
    const target = promoRules.find(r => r.id === ruleId);
    if (target) {
        target.active = isActive;
        const { doc, updateDoc } = window.cmFs;
        await updateDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), { promoRules });
        window.renderPromoRulesTable();
        window.markUnsavedChanges();
        if (window.renderGrid) window.renderGrid();
    }
};

window.deletePromoRule = async (ruleId) => {
    window.customAlert("Delete this promotional rule?", true, async () => {
        const promoRules = (window.promoRules || []).filter(r => r.id !== ruleId);
        const { doc, updateDoc } = window.cmFs;
        await updateDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'properties', window.currentPropertyId), { promoRules });
        window.promoRules = promoRules;
        window.renderPromoRulesTable();
        window.markUnsavedChanges();
        if (window.renderGrid) window.renderGrid();
    });
};

window.renderPromoRulesTable = () => {
    const tbody = document.getElementById('promo-table-body');
    if (!tbody) return;

    const rules = window.promoRules || [];
    const today = new Date().toISOString().split('T')[0];

    if (rules.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-400 font-bold uppercase tracking-widest">
                    No active OTA promo rules configured. Click "+ Add Promo Rule" above.
                </td>
            </tr>`;
        return;
    }

    let html = '';
    rules.forEach(r => {
        const isExpired = !r.isAlways && r.endDate && r.endDate < today;
        const isCurrentlyActive = r.active && !isExpired;

        const markupPct = ((1 / (1 - (r.discountPct / 100))) - 1) * 100;
        const dateDisplay = r.isAlways ? '<span class="text-blue-600">ALWAYS ACTIVE</span>' : `${r.startDate || '--'} → ${r.endDate || '--'}`;

        html += `
        <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors ${isExpired ? 'opacity-50 grayscale' : ''}">
            <td class="py-2 px-3 border-r border-slate-200 font-black text-blue-700">${r.channel}</td>
            <td class="py-2 px-3 border-r border-slate-200">${r.name}</td>
            <td class="py-2 px-3 border-r border-slate-200 font-mono text-xs">${dateDisplay}</td>
            <td class="py-2 px-3 border-r border-slate-200 text-center text-pink-600 font-black">${r.discountPct}%</td>
            <td class="py-2 px-3 border-r border-slate-200 text-center text-emerald-600 font-black">+${markupPct.toFixed(1)}%</td>
            <td class="py-2 px-3 border-r border-slate-200 font-bold text-slate-600">${r.scope}</td>
            <td class="py-2 px-3 border-r border-slate-200 text-center">
                <span class="px-2 py-0.5 text-[9px] rounded font-black uppercase ${isCurrentlyActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'}">
                    ${isExpired ? 'EXPIRED' : (r.active ? 'ACTIVE' : 'OFF')}
                </span>
            </td>
            <td class="py-2 px-3 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="window.togglePromoRuleActive('${r.id}', ${!r.active})" class="p-1 text-slate-400 hover:text-blue-600 cursor-pointer" title="Toggle Active">
                        <i data-lucide="${r.active ? 'power' : 'power-off'}" size="14"></i>
                    </button>
                    <button onclick="window.deletePromoRule('${r.id}')" class="p-1 text-slate-400 hover:text-red-600 cursor-pointer" title="Delete">
                        <i data-lucide="trash-2" size="14"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};
