// ==========================================================================
// CHANNEL MANAGER PRICING & PROMOTIONS ENGINE (cm-pricing.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-pricing.js
// ==========================================================================

// --- 1. CORE PRICING MATH & EVENT PROXIMITY ---
window.applyMath = (baseVal, type, modifier, isReverse = false) => {
    if (baseVal === "" || baseVal == null || isNaN(parseFloat(baseVal))) return "";
    let val = parseFloat(baseVal); 
    let mod = parseFloat(modifier); 
    if (isNaN(mod)) mod = 0; 
    
    let res = val;
    if (type === '=') res = val;
    else if (!isReverse) {
        if (type === '+') res = Math.max(0, val + mod);
        if (type === '-') res = Math.max(0, val - mod);
        if (type === '+%') res = val * (1 + (mod / 100));
        if (type === '-%') res = Math.max(0, val * (1 - (mod / 100)));
    } else {
        if (type === '+') res = Math.max(0, val - mod);
        if (type === '-') res = Math.max(0, val + mod);
        if (type === '+%') res = val / (1 + (mod / 100));
        if (type === '-%') res = Math.max(0, val * (1 - (mod / 100)));
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
                
                if (isPeak) {
                    let ruleType = edge.typeFmp || edge.type;
                    let ruleVal = edge.valFmp !== undefined && edge.valFmp !== "" ? edge.valFmp : edge.val;
                    let basePrice = curVals.std !== "" ? curVals.std : curVals.fmp; 
                    let targetPrice = window.applyMath(basePrice, ruleType, ruleVal, edge.isReverse);
                    
                    nextVals.std = targetPrice;
                    nextVals.fmp = targetPrice;
                    nextVals.isOverride.std = false;
                    nextVals.isOverride.fmp = false;
                } else {
                    if (curVals.std !== "") {
                        nextVals.std = window.applyMath(curVals.std, edge.type, edge.val, edge.isReverse);
                        nextVals.isOverride.std = false;
                    }
                    if (curVals.fmp !== "") {
                        let ruleType = edge.typeFmp || edge.type;
                        let ruleVal = edge.valFmp !== undefined && edge.valFmp !== "" ? edge.valFmp : edge.val;
                        nextVals.fmp = window.applyMath(curVals.fmp, ruleType, ruleVal, edge.isReverse);
                        nextVals.isOverride.fmp = false;
                    }
                }
                
                queue.push(edge.to);

                // Register rippled rate plans as dirty for seamless delta sync
                window.dirtyDates.add(dateStr);
                window.syncedDates.delete(dateStr);
                window.dirtyFields = window.dirtyFields || {};
                window.dirtyFields[dateStr] = window.dirtyFields[dateStr] || {};
                if (window.channexRateMap) {
                    const affectedRates = window.channexRateMap.filter(m => window.categoryResolver(m.pmsCategory) === edge.to);
                    affectedRates.forEach(rate => {
                        window.dirtyFields[dateStr][rate.ratePlanId] = window.dirtyFields[dateStr][rate.ratePlanId] || new Set();
                        window.dirtyFields[dateStr][rate.ratePlanId].add('rate');
                    });
                }

                if (window.updateDOMCell) window.updateDOMCell(dateStr, edge.to);
            }
        });
    }
};

window.healDay = (dateStr) => {
    const anchorP = document.getElementById('w-anchor-private')?.value;
    const anchorD = document.getElementById('w-anchor-dorm')?.value;
    const hasEvents = (window.eventDates || []).length > 0;

    const p_base = parseFloat(document.getElementById('w-p-base')?.value) || 0;
    const p_pkg = parseFloat(document.getElementById('w-p-pkg')?.value) || 0;
    const p_m2 = parseFloat(document.getElementById('w-p-m2')?.value) || p_base;
    const p_m1 = parseFloat(document.getElementById('w-p-m1')?.value) || p_base;
    const p_0 = parseFloat(document.getElementById('w-p-0')?.value) || p_base;
    const p_p1 = parseFloat(document.getElementById('w-p-p1')?.value) || p_base;
    const p_p2 = parseFloat(document.getElementById('w-p-p2')?.value) || p_base;

    const d_base = parseFloat(document.getElementById('w-d-base')?.value) || 0;
    const d_pkg = parseFloat(document.getElementById('w-d-pkg')?.value) || 0;
    const d_m2 = parseFloat(document.getElementById('w-d-m2')?.value) || d_base;
    const d_m1 = parseFloat(document.getElementById('w-d-m1')?.value) || d_base;
    const d_0 = parseFloat(document.getElementById('w-d-0')?.value) || d_base;
    const d_p1 = parseFloat(document.getElementById('w-d-p1')?.value) || d_base;
    const d_p2 = parseFloat(document.getElementById('w-d-p2')?.value) || d_base;

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
        if (!window.masterPricing.timeline[dateStr][anchorP].isOverride.std) window.masterPricing.timeline[dateStr][anchorP].std = stdP;
        if (!window.masterPricing.timeline[dateStr][anchorP].isOverride.fmp) window.masterPricing.timeline[dateStr][anchorP].fmp = fmpP;
    }
    if (anchorD) {
        window.masterPricing.timeline[dateStr][anchorD] = window.masterPricing.timeline[dateStr][anchorD] || { isOverride: {} };
        if (!window.masterPricing.timeline[dateStr][anchorD].isOverride.std) window.masterPricing.timeline[dateStr][anchorD].std = stdD;
        if (!window.masterPricing.timeline[dateStr][anchorD].isOverride.fmp) window.masterPricing.timeline[dateStr][anchorD].fmp = fmpD;
    }
    
    const anchors = new Set((window.masterPricing.relationships || []).map(r => r.anchor));
    anchors.forEach(a => { if (a !== 'unlinked') window.rippleDay(dateStr, a); });
    
    (window.roomTypes || []).forEach(r => { if (window.updateDOMCell) window.updateDOMCell(dateStr, r); });
    if (window.updateDOMCell) window.updateDOMCell(dateStr, 'GLOBAL');
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
    const curP = selP?.value || window.savedAutofillBaselines?.anchor_p || '';
    const curD = selD?.value || window.savedAutofillBaselines?.anchor_d || '';

    if (selP) {
        const privates = (window.roomTypes || []).filter(t => !t.toLowerCase().includes('dorm'));
        const list = privates.length ? privates : (window.roomTypes || []);
        selP.innerHTML = list.map(t => `<option value="${t}" ${t === curP ? 'selected' : ''}>${t}</option>`).join('');
        if (curP && list.includes(curP)) selP.value = curP;
    }
    if (selD) {
        const dorms = (window.roomTypes || []).filter(t => t.toLowerCase().includes('dorm'));
        const list = dorms.length ? dorms : (window.roomTypes || []);
        selD.innerHTML = list.map(t => `<option value="${t}" ${t === curD ? 'selected' : ''}>${t}</option>`).join('');
        if (curD && list.includes(curD)) selD.value = curD;
    }
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

window.populateAutofillBaselines = (b) => {
    if (!b) return;
    window.savedAutofillBaselines = b;
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
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
    const baselines = {
        anchor_p: document.getElementById('w-anchor-private')?.value || '',
        anchor_d: document.getElementById('w-anchor-dorm')?.value || '',
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
        d_p2: getVal('w-d-p2')
    };
    window.savedAutofillBaselines = baselines;

    try {
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            autofillBaselines: baselines,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        if (notify) window.customAlert("Autofiller baseline prices and anchors saved to database!");
    } catch (e) {
        console.error("Failed to save baselines:", e);
        if (notify) window.customAlert("Could not save baselines: " + e.message);
    }
};

// --- 5. TIMELINE AUTOMATOR & OVERRIDE CLEARERS ---
window.setAutofillPreset = (days) => {
    const startInp = document.getElementById('w-start-date');
    const endInp = document.getElementById('w-end-date');
    if (!startInp) return;
    const startVal = startInp.value || new Date().toISOString().split('T')[0];
    startInp.value = startVal;
    const sD = new Date(startVal + "T12:00:00Z");
    sD.setUTCDate(sD.getUTCDate() + (days - 1));
    if (endInp) endInp.value = sD.toISOString().split('T')[0];
};

window.clearOverrides = () => {
    const sDate = document.getElementById('w-start-date')?.value; 
    const eDate = document.getElementById('w-end-date')?.value;
    if (!sDate || !eDate) return window.customAlert("Please select both a Start Date and an End Date.");
    if (sDate > eDate) return window.customAlert("End Date must be on or after Start Date.");
    const startUnix = window.parseYMD(sDate), endUnix = window.parseYMD(eDate); 
    
    for (let d = startUnix; d <= endUnix; d += 86400000) {
        let dateStr = window.getLocalYMD(new Date(d));
        if (window.masterPricing.timeline[dateStr]) {
            (window.roomTypes || []).forEach(r => { 
                if (window.masterPricing.timeline[dateStr][r]) window.masterPricing.timeline[dateStr][r].isOverride = {}; 
            });
            if (window.masterPricing.timeline[dateStr]['GLOBAL']) window.masterPricing.timeline[dateStr]['GLOBAL'].isOverride = {};
            window.masterPricing.timeline[dateStr].otaOverrides = {};
        }
    }
    window.runAutomator(); 
};

window.runAutomator = () => {
    const anchorP = document.getElementById('w-anchor-private')?.value;
    const anchorD = document.getElementById('w-anchor-dorm')?.value;
    const sDate = document.getElementById('w-start-date')?.value;
    const eDate = document.getElementById('w-end-date')?.value;
    const hasEvents = (window.eventDates || []).length > 0;
    
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
    
    if (!sDate || !eDate) return window.customAlert("Please select both a Start Date and an End Date.");
    if (sDate > eDate) return window.customAlert("End Date must be on or after Start Date.");
    const startUnix = window.parseYMD(sDate), endUnix = window.parseYMD(eDate);
    
    for (let d = startUnix; d <= endUnix; d += 86400000) {
        let dateStr = window.getLocalYMD(new Date(d));
        let minDiff = window.getNearestEvent(window.parseYMD(dateStr));
        
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);

        let stdP = p_base, fmpP = ""; 
        let stdD = d_base, fmpD = "";
        let min = "", min_arr = "", cta = false;
        
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
            
            if (minDiff < 0 && minDiff >= -6) {
                min = Math.abs(minDiff) + 1;
            } else if (minDiff === 0) {
                min = 1;
            } else if (minDiff > 0 && minDiff <= 6) {
                min = ""; 
                min_arr = 5; 
                cta = true; 
            } else {
                min = ""; min_arr = ""; cta = false;
            }
        }

        window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
        window.masterPricing.timeline[dateStr]['GLOBAL'] = window.masterPricing.timeline[dateStr]['GLOBAL'] || { isOverride: {} };
        const curG = window.masterPricing.timeline[dateStr]['GLOBAL'];
        if (!curG.isOverride.min && min !== "") curG.min = min; else if (!curG.isOverride.min && min === "") curG.min = "";
        if (!curG.isOverride.min_arr && min_arr !== "") curG.min_arr = min_arr; else if (!curG.isOverride.min_arr && min_arr === "") curG.min_arr = "";
        if (!curG.isOverride.cta) curG.cta = cta;
        
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
    document.getElementById('promo-rule-id').value = '';
    document.getElementById('promo-name').value = '';
    document.getElementById('promo-discount-pct').value = '15';
    document.getElementById('promo-always-active').checked = false;
    window.togglePromoDateInputs(false);

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('promo-start-date').value = today;
    document.getElementById('promo-end-date').value = today;

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
        
        if (isAlways) {
            Object.keys(window.masterPricing.timeline || {}).forEach(d => window.dirtyDates.add(d));
        } else if (startDate && endDate) {
            let c = new Date(startDate + "T12:00:00Z");
            const eD = new Date(endDate + "T12:00:00Z");
            while (c <= eD) {
                window.dirtyDates.add(c.toISOString().split('T')[0]);
                c.setUTCDate(c.getUTCDate() + 1);
            }
        }

        if (window.renderGrid) window.renderGrid();
        window.customAlert(`Promo rule "${name}" saved! Affected dates marked dirty for sync.`);
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
