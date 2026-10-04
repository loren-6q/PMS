// ==========================================================================
// PMS BOOKING & RESERVATION FUNCTIONS (pms-booking.js)
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    const $ = id => document.getElementById(id);
    const $$ = s => document.querySelectorAll(s);

    const getDb = () => window.db;
    const getAppId = () => window.appId || 'hotel-pms-v1';
    const getFs = () => window.fs || {};
    const getStaff = () => window.staff || [];
    const getHotelRooms = () => window.hotelRooms || [];
    
    // Core property ID accessor utilizing pms-core.js
    const getPropId = () => {
        const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
        return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
    };
    
    const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

    // ----------------------------------------------------------------------
    // Native Booking Utilities: Room Mapping, Diffing & Sync Trigger
    // ----------------------------------------------------------------------
    window.uiToDbRoom = window.uiToDbRoom || (rid => {
        if (!rid) return "";
        const curProp = getPropId();
        return window.normalizeRoomId ? window.normalizeRoomId(rid, curProp) : rid;
    });

    window.generateAuditDiff = window.generateAuditDiff || ((prev, next) => {
        if (!prev) return "Booking created.";
        const changes = [];
        if (prev.checkIn !== next.checkIn || prev.checkOut !== next.checkOut) {
            changes.push(`Dates: ${prev.checkIn || '?'}..${prev.checkOut || '?'} → ${next.checkIn || '?'}..${next.checkOut || '?'}`);
        }
        const prevRooms = (prev.rooms || [prev.room]).filter(Boolean).join(',');
        const nextRooms = (next.rooms || [next.room]).filter(Boolean).join(',');
        if (prevRooms !== nextRooms) {
            changes.push(`Rooms: [${prevRooms || 'None'}] → [${nextRooms || 'None'}]`);
        }
        if (Number(prev.totalPrice || 0) !== Number(next.totalPrice || 0)) {
            changes.push(`Total: ฿${Number(prev.totalPrice || 0).toFixed(2)} → ฿${Number(next.totalPrice || 0).toFixed(2)}`);
        }
        if (prev.status !== next.status) {
            changes.push(`Status: ${prev.status || '?'} → ${next.status || '?'}`);
        }
        if ((prev.notes || '') !== (next.notes || '')) {
            changes.push("Notes updated");
        }
        const prevPay = (prev.payments || []).reduce((sum, p) => sum + Number(p.amt || 0), 0);
        const nextPay = (next.payments || []).reduce((sum, p) => sum + Number(p.amt || 0), 0);
        if (prevPay !== nextPay) {
            changes.push(`Paid: ฿${prevPay.toFixed(2)} → ฿${nextPay.toFixed(2)}`);
        }
        return changes.length > 0 ? changes.join(' | ') : "Booking details re-saved.";
    });

    const getPropertyChannexInfo = async (canonPropId) => {
        if (window.pmsPropertyChannexCache && window.pmsPropertyChannexCache[canonPropId]) {
            return window.pmsPropertyChannexCache[canonPropId];
        }
        if (window.channexConfig && window.channexConfig.apiKey && window.channexConfig.propId) {
            return {
                channex: window.channexConfig,
                channexMap: window.channexMap || []
            };
        }
        try {
            const db = getDb();
            const appId = getAppId();
            const { doc, getDoc } = getFs();
            if (db && getDoc) {
                const propSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', canonPropId));
                if (propSnap.exists()) {
                    const data = propSnap.data();
                    const config = {
                        channex: data.channex || null,
                        channexMap: Array.isArray(data.channexMap) ? data.channexMap : []
                    };
                    window.pmsPropertyChannexCache = window.pmsPropertyChannexCache || {};
                    window.pmsPropertyChannexCache[canonPropId] = config;
                    return config;
                }
            }
        } catch (e) {
            console.warn("Could not load Channex config for property:", e);
        }

        try {
            const localCreds = JSON.parse(localStorage.getItem(`cm_channex_${canonPropId}`) || '{}');
            if (localCreds.apiKey && localCreds.propId) {
                return { channex: localCreds, channexMap: [] };
            }
        } catch (e) {}

        return null;
    };

    window.autoSyncChannexAvailability = async (start, end, roomTypes = [], overrideBooking = null, deletedId = null) => {
        if (!start || !end) return;

        try {
            const curProp = getPropId();
            const canonProp = window.toCanonicalPropId ? window.toCanonicalPropId(curProp) : curProp;
            const info = await getPropertyChannexInfo(canonProp);
            if (!info || !info.channex || !info.channex.apiKey || !info.channex.propId) {
                return; // Property not mapped to Channex
            }

            const { apiKey, propId } = info.channex;
            const channexMap = info.channexMap || [];
            if (channexMap.length === 0) return;

            const parseFn = window.parseYMD || (str => Date.parse(str));
            const getYmdFn = window.getLocalYMD || (d => new Date(d).toISOString().split('T')[0]);

            const sU = parseFn(start);
            const eU = parseFn(end);
            if (!sU || !eU) return;

            const datesToProcess = [];
            for (let d = sU; d <= eU; d += 86400000) {
                datesToProcess.push(getYmdFn(new Date(d)));
            }
            if (datesToProcess.length === 0) return;

            // In-memory staff list with real-time override/delete compensation
            let staffList = (getStaff() || []).filter(b => b.id !== deletedId);
            if (overrideBooking) {
                const exIdx = staffList.findIndex(b => b.id === overrideBooking.id);
                if (exIdx > -1) staffList[exIdx] = overrideBooking;
                else staffList.push(overrideBooking);
            }

            const activeStaff = staffList.filter(s => {
                const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                const rList = getRooms(s);
                const isUnassigned = rList.length === 0 || rList[0] === "";
                return sProp === canonProp && (window.isOccupyingBooking ? window.isOccupyingBooking(s.status, isUnassigned) : (s.status !== 'cancelled' && s.status !== 'noshow'));
            });

            const hotelRooms = getHotelRooms();
            const totalCapacityByType = {};
            hotelRooms.forEach(hr => {
                if (hr && hr.type) {
                    totalCapacityByType[hr.type] = (totalCapacityByType[hr.type] || 0) + 1;
                }
            });

            // Pre-calculate live availability per date per PMS category
            const availMap = {};
            datesToProcess.forEach(dStr => {
                availMap[dStr] = {};
                Object.keys(totalCapacityByType).forEach(t => {
                    availMap[dStr][t] = totalCapacityByType[t] || 0;
                });
            });

            activeStaff.forEach(s => {
                if (!s.checkIn || !s.checkOut) return;
                const inMs = parseFn(s.checkIn);
                const outMs = parseFn(s.checkOut);
                const rList = getRooms(s);
                const isUnassigned = rList.length === 0 || rList[0] === "";
                if (s.status === 'special' && isUnassigned) return;

                const typesToDeduct = [];
                if (!isUnassigned) {
                    rList.forEach(rid => {
                        const normR = window.normalizeRoomId ? window.normalizeRoomId(rid, canonProp) : rid;
                        const hrDef = hotelRooms.find(hr => hr.id === rid || hr.id === normR);
                        if (hrDef && hrDef.type) typesToDeduct.push(hrDef.type);
                    });
                } else if (s.bookedType) {
                    const inferred = window.resolvePmsRoomType ? window.resolvePmsRoomType(s.bookedType) : s.bookedType;
                    if (inferred) {
                        const dedCount = inferred.toLowerCase().includes('dorm') ? (s.pax || 1) : Math.max(1, rList.length);
                        for (let k = 0; k < dedCount; k++) typesToDeduct.push(inferred);
                    }
                }

                datesToProcess.forEach(dStr => {
                    const dMs = parseFn(dStr);
                    if (dMs >= inMs && dMs < outMs) {
                        typesToDeduct.forEach(t => {
                            if (availMap[dStr] && availMap[dStr][t] !== undefined && availMap[dStr][t] > 0) {
                                availMap[dStr][t]--;
                            }
                        });
                    }
                });
            });

            const availPayload = [];
            channexMap.forEach(rule => {
                if (!rule.channexId || !rule.pmsCategory) return;
                const pmsCat = rule.pmsCategory;
                const roomTypeId = rule.channexId;

                let rangeStart = null;
                let currentAvail = null;

                for (let i = 0; i < datesToProcess.length; i++) {
                    const dStr = datesToProcess[i];
                    const availToday = availMap[dStr]?.[pmsCat] !== undefined ? availMap[dStr][pmsCat] : 0;

                    let isAdjacent = false;
                    if (i > 0) {
                        const prevMs = parseFn(datesToProcess[i - 1]);
                        const dMs = parseFn(dStr);
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

            if (availPayload.length > 0) {
                const res = await fetch(`https://app.channex.io/api/v1/availability`, {
                    method: "POST",
                    headers: {
                        "user-api-key": apiKey,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ values: availPayload })
                });

                if (res.ok) {
                    console.log(`📡 [Channex Auto-Push] Successfully updated ${availPayload.length} availability ranges for ${canonProp}`);
                } else {
                    const errData = await res.json().catch(() => ({}));
                    console.warn("⚠️ [Channex Auto-Push] Response status:", res.status, errData);
                }
            }
        } catch (err) {
            console.warn("Channex Auto-Sync dispatch notice:", err);
        }
    };

    window.triggerAutoSync = window.triggerAutoSync || ((start, end, roomTypes = [], overrideBooking = null, deletedId = null) => {
        try {
            if (window.dirtyDates && start && end) {
                const sU = window.parseYMD ? window.parseYMD(start) : Date.parse(start);
                const eU = window.parseYMD ? window.parseYMD(end) : Date.parse(end);
                for (let d = sU; d <= eU; d += 86400000) {
                    const dStr = window.getLocalYMD ? window.getLocalYMD(new Date(d)) : new Date(d).toISOString().split('T')[0];
                    window.dirtyDates.add(dStr);
                }
            }
            if (typeof window.renderGrid === 'function') window.renderGrid();
        } catch (e) {
            console.warn("Auto-sync notice:", e);
        }

        // Auto-push live inventory to Channex in background
        if (window.autoSyncChannexAvailability && start && end) {
            window.autoSyncChannexAvailability(start, end, roomTypes, overrideBooking, deletedId).catch(err => {
                console.warn("[Channex Sync] Auto-push notice:", err);
            });
        }
    });

    window.updateHeaderName = () => {
        const fn = $('first-name')?.value.trim().toUpperCase() || '';
        const ln = $('last-name')?.value.trim().toUpperCase() || '';
        const disp = $('modal-guest-name-display');
        if (disp) disp.innerText = `${fn} ${ln}`.trim() || "NEW BOOKING";
    };

    window.checkEmailProxy = val => {
        const el = $('email');
        if (!el) return;
        const v = val.toLowerCase();
        const isOTA = v.includes('booking.com') || v.includes('agoda');
        el.classList.remove('text-red-600', 'text-green-600', 'font-black');
        if (isOTA) el.classList.add('text-red-600', 'font-black');
        else if (v.includes('@')) el.classList.add('text-green-600', 'font-black');
    };

    window.cycleStatus = () => {
        const sBtn = $('status-cycle-btn');
        if (!sBtn) return;
        const cV = sBtn.dataset.value || 'future';
        const cycle = window.STATUS_CYCLE || [];
        let idx = cycle.findIndex(x => x.val === cV);
        idx = (idx + 1) % cycle.length;
        const nO = cycle[idx];
        sBtn.dataset.value = nO.val;
        sBtn.innerText = nO.val.toUpperCase();
        sBtn.style.background = nO.bg;
        sBtn.style.color = nO.txt;
        const hiddenInput = $('guest-status-hidden');
        if (hiddenInput) hiddenInput.value = nO.val;
    };

    const getOccupiedRooms = (checkInStr, checkOutStr, excludeBookingId = null) => {
        const occ = new Set();
        const parseYMD = window.parseYMD || (s => Date.parse(s));
        const sU = parseYMD(checkInStr), eU = parseYMD(checkOutStr);
        if (!sU || !eU) return occ;
        const curProp = getPropId();

        getStaff().forEach(s => {
            if (s.id === excludeBookingId) return;
            
            // Standardize Property Comparison via pms-core
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return;

            // Universal Status Occupancy Evaluator via pms-core
            const rList = getRooms(s);
            const isUnassigned = rList.length === 0 || rList[0] === "";
            const isOccupying = window.isOccupyingBooking 
                ? window.isOccupyingBooking(s.status, isUnassigned)
                : (s.status !== 'cancelled' && s.status !== 'noshow');

            if (!isOccupying) return;

            if (sU < parseYMD(s.checkOut) && parseYMD(s.checkIn) < eU) {
                rList.forEach(r => {
                    if (r) {
                        const normR = window.normalizeRoomId ? window.normalizeRoomId(r, curProp) : r;
                        occ.add(normR);
                        occ.add(r);
                    }
                });
            }
        });
        return occ;
    };

    window.updateAvailableRooms = () => {
        const cI = $('check-in')?.value, cO = $('check-out')?.value, cId = $('guest-id')?.value;
        if (!cI || !cO) return;
        const occ = getOccupiedRooms(cI, cO, cId);
        const curProp = getPropId();

        $$('.assigned-room-select').forEach(sel => {
            const cur = sel.value;
            Array.from(sel.options).forEach(opt => {
                if (!opt.value) return;
                const normOpt = window.normalizeRoomId ? window.normalizeRoomId(opt.value, curProp) : opt.value;
                
                if (occ.has(opt.value) || occ.has(normOpt)) {
                    opt.disabled = true;
                    if (!opt.text.includes('(OCCUPIED)')) {
                        opt.text = opt.text + ' (OCCUPIED)';
                    }
                } else {
                    opt.disabled = false;
                    opt.text = opt.text.replace(' (OCCUPIED)', '');
                }
            });
            sel.value = cur;
        });
    };

    window.resolvePmsRoomType = (rawType = '') => {
        if (!rawType) return '';
        const rawLower = rawType.toLowerCase().trim();
        const propOtaMap = window.propertyOtaMap || [];
        const hotelRooms = getHotelRooms();
        const roomTypes = [...new Set(hotelRooms.filter(r => r.type).map(r => r.type))];

        if (propOtaMap.length > 0) {
            const sortedMap = [...propOtaMap].sort((a, b) => (b.otaName || '').length - (a.otaName || '').length);
            const otaMatch = sortedMap.find(m => {
                const kw = (m.otaName || '').toLowerCase().split(/\s+/).filter(Boolean);
                return kw.length > 0 && kw.every(k => rawLower.includes(k));
            });
            if (otaMatch && otaMatch.pmsCategory) return otaMatch.pmsCategory;
        }

        const direct = roomTypes.find(t => t.toLowerCase() === rawLower);
        if (direct) return direct;

        const sub = roomTypes.find(t => rawLower.includes(t.toLowerCase()) || t.toLowerCase().includes(rawLower));
        if (sub) return sub;

        let bestType = null;
        let highestScore = 0;

        roomTypes.forEach(pmsType => {
            const pmsLower = pmsType.toLowerCase();
            let score = 0;
            if (rawLower.includes('female') && pmsLower.includes('female')) score += 20;
            if (rawLower.includes('male') && !rawLower.includes('female') && pmsLower.includes('male') && !pmsLower.includes('female')) score += 20;
            if (rawLower.includes('mixed') && pmsLower.includes('mixed')) score += 15;

            ['4', '6', '8', '10', '12', 'quad', 'triple', 'twin', 'double', 'single', 'king'].forEach(kw => {
                if (rawLower.includes(kw) && pmsLower.includes(kw)) score += 5;
            });

            ['dorm', 'ensuite', 'balcony', 'bungalow', 'oceanview', 'gardenview', 'deluxe', 'standard'].forEach(kw => {
                if (rawLower.includes(kw) && pmsLower.includes(kw)) score += 3;
            });

            if (score > highestScore) {
                highestScore = score;
                bestType = pmsType;
            }
        });

        return highestScore >= 5 ? bestType : rawType;
    };

    window.getRoomDistance = (anchorId, candidateId) => {
        if (!anchorId || !candidateId || anchorId === candidateId) return 0;
        const hotelRooms = getHotelRooms();
        const anchorIdx = hotelRooms.findIndex(r => r.id === anchorId);
        const candIdx = hotelRooms.findIndex(r => r.id === candidateId);
        if (anchorIdx === -1 || candIdx === -1) return 999;

        const anchorBase = anchorId.replace(/\d+$/, '').replace(/-.*$/, '').toUpperCase();
        const candBase = candidateId.replace(/\d+$/, '').replace(/-.*$/, '').toUpperCase();

        if (anchorBase && anchorBase === candBase) {
            const anchorNum = parseInt(anchorId.match(/\d+$/)?.[0] || '0');
            const candNum = parseInt(candidateId.match(/\d+$/)?.[0] || '0');
            return Math.abs(anchorNum - candNum);
        }
        return 100 + Math.abs(anchorIdx - candIdx);
    };

    window.suggestAvailableRoom = (preferredType = null) => {
        const cI = $('check-in')?.value, cO = $('check-out')?.value, cId = $('guest-id')?.value;
        if (!cI || !cO) return "";
        const occ = getOccupiedRooms(cI, cO, cId);
        const curProp = getPropId();

        const assignedNow = Array.from($$('.assigned-room-select') || []).map(s => s.value).filter(Boolean);
        const assignedSet = new Set(assignedNow.map(r => window.normalizeRoomId ? window.normalizeRoomId(r, curProp) : r));
        const hotelRooms = getHotelRooms();

        let targetType = null;
        let anchorRoom = null;

        if (assignedNow.length > 0) {
            anchorRoom = assignedNow[assignedNow.length - 1];
            const refObj = hotelRooms.find(r => r.id === anchorRoom);
            if (refObj && refObj.type) targetType = refObj.type;
        }

        if (!targetType && preferredType) {
            targetType = window.resolvePmsRoomType ? window.resolvePmsRoomType(preferredType) : preferredType;
        }

        if (!targetType) return "";

        let freeInType = hotelRooms.filter(r => {
            if (r.type !== targetType) return false;
            const normR = window.normalizeRoomId ? window.normalizeRoomId(r.id, curProp) : r.id;
            return !occ.has(r.id) && !occ.has(normR) && !assignedSet.has(normR);
        });

        if (freeInType.length === 0) return "";

        if (anchorRoom) {
            freeInType.sort((a, b) => window.getRoomDistance(anchorRoom, a.id) - window.getRoomDistance(anchorRoom, b.id));
        }

        return freeInType[0].id;
    };

    window.addRoomSelect = (val = "") => {
        const c = $('assigned-rooms-container');
        if (!c) return;
        const w = document.createElement('div');
        const sel = document.createElement('select');
        w.className = "flex items-stretch gap-1 w-full";
        sel.className = "assigned-room-select flex-1 min-w-0 bg-white border border-blue-300 text-xs font-bold uppercase text-blue-800 rounded px-1 py-1 outline-none shadow-sm cursor-pointer focus:ring-2 focus:ring-blue-500 text-ellipsis";
        sel.innerHTML = `<option value="">-- UNASSIGNED --</option>`;
        sel.onchange = window.updateAvailableRooms;

        let cg = '', og = null;
        getHotelRooms().forEach(r => {
            if (r.type !== cg) {
                og = document.createElement('optgroup');
                og.label = `--- ${r.type.toUpperCase()} ---`;
                sel.appendChild(og);
                cg = r.type;
            }
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.innerText = `${r.id} (${r.bed || '?'})`;
            og.appendChild(opt);
        });

        // Auto-suggest available room if empty
        if (!val) {
            const suggested = window.suggestAvailableRoom($('booked-type')?.value);
            if (suggested) val = suggested;
        }

        sel.value = val || "";
        const del = document.createElement('button');
        del.type = "button";
        del.className = "w-6 flex justify-center items-center text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 flex-shrink-0 shadow-sm transition-colors cursor-pointer";
        del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>`;
        del.onclick = () => {
            w.remove();
            if (c.children.length === 0) window.addRoomSelect("");
            window.updateAvailableRooms();
        };

        w.appendChild(sel);
        w.appendChild(del);
        c.appendChild(w);
        window.updateAvailableRooms();
    };

    const setMulti = (id, state, labels, classes) => {
        const el = $(id);
        if (!el) return;
        el.dataset.state = state;
        el.innerText = labels[state];
        el.className = id.includes('email')
            ? `flex-1 min-w-[80px] unselectable multi-state-btn px-0.5 py-1 rounded text-[9px] font-black uppercase border text-center whitespace-nowrap ${classes[state]}`
            : `flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border ${classes[state]}`;
    };

    window.cycleMulti = (el, labels, classes) => {
        if (!el) return;
        let cur = parseInt(el.dataset.state || 0);
        cur = (cur + 1) % labels.length;
        setMulti(el.id, cur, labels, classes);
    };

    window.renderItineraryStripe = s => {
        const stripe = $('itinerary-stripe');
        if (!stripe) return;
        if (!s || !s.linkedId) {
            stripe.classList.add('hidden');
            stripe.innerHTML = '';
            return;
        }

        const curProp = getPropId();
        const legs = getStaff().filter(x => {
            const xProp = window.toCanonicalPropId ? window.toCanonicalPropId(x.property) : x.property;
            return xProp === curProp && x.linkedId === s.linkedId && x.status !== 'cancelled' && x.status !== 'noshow';
        }).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

        if (legs.length <= 1) {
            stripe.classList.add('hidden');
            stripe.innerHTML = '';
            return;
        }

        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const formatCompactDate = (dIn, dOut) => {
            if (!dIn || !dOut) return '--';
            const iD = new Date(dIn + "T12:00:00Z"), oD = new Date(dOut + "T12:00:00Z");
            const iM = months[iD.getUTCMonth()], oM = months[oD.getUTCMonth()];
            const iDay = String(iD.getUTCDate()).padStart(2, '0');
            const oDay = String(oD.getUTCDate()).padStart(2, '0');
            return iM === oM ? `${iDay}-${oDay}${iM}` : `${iDay}${iM}-${oDay}${oM}`;
        };

        let html = `<div class="flex items-center gap-1.5 flex-wrap">`;
        html += `<i data-lucide="link" class="!w-3.5 !h-3.5 text-slate-400 shrink-0 mr-0.5"></i>`;

        legs.forEach((leg, idx) => {
            const isCurrent = leg.id === s.id;
            const rList = getRooms(leg).filter(Boolean);
            const rStr = rList.join(',') || 'Unassigned';
            const dateStr = formatCompactDate(leg.checkIn, leg.checkOut);

            if (idx > 0) {
                html += `<span class="text-slate-600 font-black text-xs select-none">|</span>`;
            }

            html += `
                <button type="button" onclick="window.editStaff('${leg.id}')" class="px-2 py-0.5 rounded text-xs font-black uppercase transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${isCurrent ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'}" title="Switch to Leg ${idx + 1}">
                    ${isCurrent ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>' : ''}
                    <span>${dateStr} ${rStr}</span>
                </button>
            `;
        });

        html += `</div>`;
        stripe.innerHTML = html;
        stripe.classList.remove('hidden');
        stripe.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    };

    window.populateStaffForm = (s = {}) => {
        const isN = !s.id;
        const f = $('guest-form');
        if (f) f.reset();
        const mC = $('guest-modal-content');
        if (mC) {
            mC.style.position = 'relative';
            mC.style.left = 'auto';
            mC.style.top = 'auto';
            mC.style.margin = '0';
        }

        const bcc = $('bad-cc-box');
        if (bcc) {
            bcc.dataset.bad = s.badCC ? 'true' : 'false';
            bcc.innerHTML = s.badCC ? '<span class="text-white text-[10px] font-black">X</span>' : '';
            bcc.className = `w-3.5 h-3.5 border-2 border-slate-300 rounded mt-0.5 flex items-center justify-center ${s.badCC ? 'bg-red-500 border-red-600' : ''}`;
        }

        [
            ['guest-id', s.id], ['first-name', s.firstName], ['last-name', s.lastName], ['phone', s.phone],
            ['email', s.email], ['booked-type', s.bookedType], ['check-in', s.checkIn], ['check-out', s.checkOut],
            ['booking-date', s.bookDate], ['booking-id', s.bookId], ['link-code', s.linkedId], ['guest-country', s.country],
            ['pax-count', s.pax || 1], ['booking-source', s.source || 'direct'], ['guest-notes', s.notes],
            ['total-price', Number(s.totalPrice || 0).toFixed(2)], ['net-price', Number(s.netPrice || 0).toFixed(2)]
        ].forEach(([id, val]) => {
            const el = $(id);
            if (el) el.value = val || "";
        });

        let pSt = s.status || "future";
        if ($('guest-status-hidden')) $('guest-status-hidden').value = pSt;
        const cycle = window.STATUS_CYCLE || [];
        const sObj = cycle.find(x => x.val === pSt) || cycle[1] || { val: 'future', bg: '#7fc6f5', txt: '#1e293b' };
        const sBtn = $('status-cycle-btn');
        if (sBtn) {
            sBtn.dataset.value = sObj.val;
            sBtn.innerText = sObj.val.toUpperCase();
            sBtn.style.background = sObj.bg;
            sBtn.style.color = sObj.txt;
        }

        if ($('net-price')) $('net-price').dataset.override = s.netOverride ? 'true' : 'false';
        if ($('assigned-rooms-container')) $('assigned-rooms-container').innerHTML = '';
        const rL = getRooms(s).length ? getRooms(s) : (isN ? [] : [""]);
        if (rL.length > 0) { rL.forEach(r => window.addRoomSelect(r)); } else { window.addRoomSelect(""); }

        if ($('payments-list')) $('payments-list').innerHTML = '';
        if (s.payments && window.addPaymentRow) s.payments.forEach(p => window.addPaymentRow(p.date, Number(p.amt || 0).toFixed(2), p.method, true));

        window.activeExtraCharges = Array.isArray(s.extraCharges) ? [...s.extraCharges] : [];
        if (window.renderExtraCharges) window.renderExtraCharges();

        setMulti('email-confirm-btn', s.emailConfirm ? 1 : 0, ['CONFIRM: --', 'CONFIRM: SENT'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);
        setMulti('email-prepost-btn', !s.emailPrePost ? 0 : (s.emailPrePost === 'sent' ? 1 : 2), ['PRE/POST: --', 'PRE/POST: SENT', 'PRE/POST: CONF'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
        setMulti('email-special-btn', s.emailSpecial ? 1 : 0, ['SPECIAL: --', 'SPECIAL: SENT'], ['text-slate-400', 'bg-yellow-100 text-yellow-700 border-yellow-400']);
        setMulti('refund-btn', s.refundability === 'non-ref' ? 1 : (s.refundability === 'ref' ? 2 : 0), ['REFUNDABILITY: ?', 'NON-REFUNDABLE', 'REFUNDABLE'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
        setMulti('upgrade-btn', !s.upgrade || s.upgrade === 'none' ? 0 : (s.upgrade === 'free' ? 1 : 2), ['NO UPGRADE', 'FREE UPGRADE', 'PAID UPGRADE'], ['text-slate-400', 'bg-yellow-100 text-yellow-700 border-yellow-400', 'bg-green-100 text-green-700 border-green-400']);
        setMulti('rating-btn', !s.rating || s.rating === 'none' ? 0 : (s.rating === 'good' ? 1 : 2), ['FEEDBACK: --', 'FEEDBACK: ✔ GOOD', 'FEEDBACK: ❌ BAD'], ['text-slate-400', 'bg-green-100 text-green-700 border-green-400', 'bg-red-100 text-red-700 border-red-400']);
        setMulti('ext-btn', s.extended ? 1 : 0, ['NOT EXTENDED', 'EXTENDED'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);

        if ($('ext-days')) $('ext-days').value = 1;
        if ($('ext-avg-rate')) { $('ext-avg-rate').value = ''; $('ext-avg-rate').classList.remove('text-pink-600', 'bg-pink-100'); }
        if ($('ext-price')) $('ext-price').value = '';
        if ($('btn-check-bdc')) { $('btn-check-bdc').classList.replace('bg-pink-500', 'bg-slate-200'); $('btn-check-bdc').classList.replace('text-white', 'text-slate-700'); $('btn-check-bdc').classList.remove('animate-pulse'); }

        if (window.updateHeaderName) window.updateHeaderName();
        if (window.checkEmailProxy) window.checkEmailProxy(s.email || "");
        if (window.calcFinancials) window.calcFinancials();
        if (window.updateAvailableRooms) window.updateAvailableRooms();
        if (window.updateNightsDisplay) window.updateNightsDisplay();
        if (window.calcExtension) window.calcExtension();

        if (window.toggleSection) {
            window.toggleSection('guest-profile-section', 'profile-chevron', true);
            window.toggleSection('ext-section', 'ext-chevron', false);
            window.toggleSection('fin-section', 'fin-chevron', true);
            window.toggleSection('meta-section', 'meta-chevron', true);
        }

        // Render dynamic Stay Itinerary Stripe
        window.renderItineraryStripe(s);

        ['delete-btn', 'split-btn', 'merge-btn', 'dup-btn', 'hist-btn'].forEach(id => {
            const el = $(id);
            if (el) el.style.visibility = isN ? 'hidden' : 'visible';
        });

        const userEmail = (window.currentUserEmail || 'admin').toUpperCase();
        if ($('audit-log')) {
            $('audit-log').innerText = isN ? `NEW RECORD | CREATING AS ${userEmail}` : `CREATED BY ${s.createdBy || 'UNKNOWN'} ON ${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB').slice(0, 5) : '--'}` + (s.lastEditedBy ? ` | LAST EDIT: ${s.lastEditedBy} ON ${new Date(s.lastEditedAt).toLocaleDateString('en-GB').slice(0, 5)}` : '');
        }

        if (window.currentUserRole === 'staff') {
            ['delete-btn', 'split-btn', 'merge-btn'].forEach(id => { if ($(id)) $(id).style.visibility = 'hidden'; });
            if ($('save-btn')) $('save-btn').style.display = 'none';
        }

        const modal = $('guest-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        if (window.lucide) window.lucide.createIcons();
    };

    window.requestDelete = () => {
        const id = $('guest-id')?.value;
        if (!id) return;
        const curProp = getPropId();
        const s = getStaff().find(x => x.id === id);
        const name = s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'Guest';

        window.showAlert(`Permanently delete booking for ${name} (${s?.bookId || id})?`, true, async () => {
            const db = getDb();
            const appId = getAppId();
            const { doc, deleteDoc } = getFs();
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
                if (window.triggerAutoSync && s) {
                    const hotelRooms = getHotelRooms();
                    const types = (s.rooms || []).map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
                    window.triggerAutoSync(s.checkIn, s.checkOut, types, null, id);
                }
                window.closeGuestModal();
            } catch (err) {
                console.error("Delete Error:", err);
                window.showAlert("Delete Error: " + err.message);
            }
        });
    };

    window.requestDuplicate = () => {
        const id = $('guest-id')?.value;
        if (!id) return;
        const s = getStaff().find(x => x.id === id);
        if (!s) return;

        const clone = JSON.parse(JSON.stringify(s));
        delete clone.id;
        delete clone.bookId;
        clone.status = 'future';
        clone.payments = [];
        clone.extraCharges = [];
        clone.notes = (clone.notes ? clone.notes + '\n' : '') + `[DUPLICATED FROM PREVIOUS BOOKING ${s.bookId || s.id}]`;

        window.populateStaffForm(clone);
        window.showAlert("Booking details duplicated as a new reservation.\nPlease assign dates, room, and save.");
    };

    window.requestSplit = () => {
        const id = $('guest-id')?.value;
        const cI = $('check-in')?.value;
        const cO = $('check-out')?.value;
        if (!id || !cI || !cO) return;

        const s = getStaff().find(x => x.id === id);
        const parseFn = window.parseYMD || (str => Date.parse(str));
        const ms = parseFn(cO) - parseFn(cI);
        const nights = Math.round(ms / 86400000);
        if (nights <= 1) return window.showAlert("Cannot split a 1-night stay.");

        const dIn = new Date(cI + "T12:00:00Z");
        dIn.setUTCDate(dIn.getUTCDate() + Math.floor(nights / 2));
        const midYMD = dIn.toISOString().split('T')[0];

        const dateInp = $('split-date');
        if (dateInp) {
            dateInp.value = midYMD;
            dateInp.min = cI;
            dateInp.max = cO;
            dateInp.onchange = () => populateSplitRoomDropdown(dateInp.value, cO);
        }

        const populateSplitRoomDropdown = (splitStart, splitEnd) => {
            const container = $('split-room-dropdown-container');
            if (!container) return;
            const occ = getOccupiedRooms(splitStart, splitEnd, id);
            const hotelRooms = getHotelRooms();
            const curProp = getPropId();

            let optHtml = `<label class="field-label text-left mb-1">Destination Room for Leg 2</label>
                <select id="split-room-target" class="input-base !text-xs !p-2 uppercase cursor-pointer">
                <option value="">-- AUTO SUGGEST / SAME TYPE --</option>`;

            let cg = '';
            hotelRooms.forEach(r => {
                if (r.type !== cg) {
                    if (cg !== '') optHtml += `</optgroup>`;
                    optHtml += `<optgroup label="--- ${r.type.toUpperCase()} ---">`;
                    cg = r.type;
                }
                const normR = window.normalizeRoomId ? window.normalizeRoomId(r.id, curProp) : r.id;
                const isOccupied = occ.has(r.id) || occ.has(normR);
                optHtml += `<option value="${r.id}" ${isOccupied ? 'disabled class="text-slate-400"' : 'class="font-bold"'}>${r.id} (${r.bed || '?'})${isOccupied ? ' (OCCUPIED)' : ''}</option>`;
            });
            if (cg !== '') optHtml += `</optgroup>`;
            optHtml += `</select>`;
            container.innerHTML = optHtml;
        };

        populateSplitRoomDropdown(midYMD, cO);

        const m = $('split-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
    };

    window.confirmSplit = async () => {
        const id = $('guest-id')?.value;
        const splitDate = $('split-date')?.value;
        const chosenRoom = $('split-room-target')?.value;
        if (!id || !splitDate) return;

        const s = getStaff().find(x => x.id === id);
        if (!s) return;
        if (splitDate <= s.checkIn || splitDate >= s.checkOut) {
            return window.showAlert("Split date must be between Check-in and Check-out.");
        }

        const parseFn = window.parseYMD || (str => Date.parse(str));
        const totalNights = Math.max(1, Math.round((parseFn(s.checkOut) - parseFn(s.checkIn)) / 86400000));
        const leg1Nights = Math.max(1, Math.round((parseFn(splitDate) - parseFn(s.checkIn)) / 86400000));
        const leg2Nights = Math.max(1, totalNights - leg1Nights);

        const leg1Price = Number(((s.totalPrice / totalNights) * leg1Nights).toFixed(2));
        const leg2Price = Number((s.totalPrice - leg1Price).toFixed(2));

        const linkCode = s.linkedId || `LK-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const db = getDb();
        const appId = getAppId();
        const { doc, setDoc, updateDoc } = getFs();
        const newLegId = Math.random().toString(36).substr(2, 9);
        const curProp = getPropId();

        let leg2Room = chosenRoom;
        if (!leg2Room) {
            const occ = getOccupiedRooms(splitDate, s.checkOut, id);
            const hotelRooms = getHotelRooms();
            const freeRoom = hotelRooms.find(r => r.type === (s.bookedType || '') && !occ.has(r.id));
            leg2Room = freeRoom ? freeRoom.id : (s.rooms?.[0] || "");
        }

        const leg2Booking = {
            ...JSON.parse(JSON.stringify(s)),
            id: newLegId,
            property: curProp,
            checkIn: splitDate,
            checkOut: s.checkOut,
            rooms: leg2Room ? [leg2Room] : [],
            room: leg2Room || "",
            totalPrice: leg2Price,
            netPrice: Number((leg2Price * 0.82).toFixed(2)),
            payments: [],
            extraCharges: [],
            linkedId: linkCode,
            notes: (s.notes ? s.notes + '\n' : '') + `[SPLIT SEGMENT - LEG 2 FROM ${s.checkIn} STAY]`,
            createdAt: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
                checkOut: splitDate,
                totalPrice: leg1Price,
                netPrice: Number((leg1Price * 0.82).toFixed(2)),
                linkedId: linkCode,
                lastEditedAt: new Date().toISOString(),
                notes: (s.notes ? s.notes + '\n' : '') + `[SPLIT SEGMENT - LEG 1 ENDS ${splitDate}]`
            });

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newLegId), leg2Booking);

            if (window.triggerAutoSync) {
                const hotelRooms = getHotelRooms();
                const types = [...(s.rooms || []), leg2Room].map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
                window.triggerAutoSync(s.checkIn, s.checkOut, types);
            }

            window.closeModal('split-modal');
            window.closeGuestModal();
            window.showAlert(`Booking split successfully!\n\nLeg 1: ${s.checkIn} → ${splitDate}\nLeg 2: ${splitDate} → ${s.checkOut} (Room: ${leg2Room || 'Same'})\n\nLinked with code: ${linkCode}`);
        } catch (err) {
            console.error("Split Error:", err);
            window.showAlert("Error splitting booking: " + err.message);
        }
    };

    window.requestMerge = () => {
        const id = $('guest-id')?.value;
        if (!id) return;
        const cur = getStaff().find(x => x.id === id);
        if (!cur) return;

        const curProp = getPropId();
        const parseFn = window.parseYMD || (str => Date.parse(str));
        const curIn = parseFn(cur.checkIn);
        const curOut = parseFn(cur.checkOut);

        const candidates = getStaff().filter(s => {
            if (s.id === id) return false;
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            if (s.status === 'cancelled' || s.status === 'noshow') return false;

            const sIn = parseFn(s.checkIn);
            const sOut = parseFn(s.checkOut);
            const isAdjacentBefore = Math.abs(sOut - curIn) <= (2 * 86400000);
            const isAdjacentAfter = Math.abs(sIn - curOut) <= (2 * 86400000);
            const sharesLink = cur.linkedId && s.linkedId && cur.linkedId === s.linkedId;
            const sharesName = cur.lastName && s.lastName && cur.lastName.toUpperCase() === s.lastName.toUpperCase();

            return isAdjacentBefore || isAdjacentAfter || sharesLink || sharesName;
        });

        if (candidates.length === 0) {
            return window.showAlert("No adjacent or matching bookings found nearby to merge with.");
        }

        candidates.sort((a, b) => {
            let scoreA = 0, scoreB = 0;
            if (a.linkedId && a.linkedId === cur.linkedId) scoreA += 50;
            if (b.linkedId && b.linkedId === cur.linkedId) scoreB += 50;
            if (a.lastName && a.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreA += 30;
            if (b.lastName && b.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreB += 30;
            if (parseFn(a.checkOut) === curIn || parseFn(a.checkIn) === curOut) scoreA += 40;
            if (parseFn(b.checkOut) === curIn || parseFn(b.checkIn) === curOut) scoreB += 40;
            return scoreB - scoreA;
        });

        const targetSelect = $('merge-target');
        if (targetSelect) {
            targetSelect.innerHTML = candidates.map((c, idx) => {
                const isBest = idx === 0;
                const rStr = (c.rooms || []).join(',') || c.room || 'No Room';
                return `<option value="${c.id}">${isBest ? '⭐ ' : ''}${c.lastName || 'Guest'}, ${c.firstName || ''} (${c.checkIn} to ${c.checkOut}) [${rStr}]</option>`;
            }).join('');
        }

        const m = $('merge-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
    };

    window.confirmMerge = async () => {
        const id = $('guest-id')?.value;
        const targetId = $('merge-target')?.value;
        if (!id || !targetId) return;

        const primary = getStaff().find(x => x.id === id);
        const absorbed = getStaff().find(x => x.id === targetId);
        if (!primary || !absorbed) return;

        const combinedPayments = [...(primary.payments || []), ...(absorbed.payments || [])];
        const combinedCharges = [...(primary.extraCharges || []), ...(absorbed.extraCharges || [])];
        const combinedTotal = Number(((primary.totalPrice || 0) + (absorbed.totalPrice || 0)).toFixed(2));
        const combinedNet = Number(((primary.netPrice || 0) + (absorbed.netPrice || 0)).toFixed(2));

        const earliestIn = primary.checkIn < absorbed.checkIn ? primary.checkIn : absorbed.checkIn;
        const latestOut = primary.checkOut > absorbed.checkOut ? primary.checkOut : absorbed.checkOut;

        const mergeNote = `\n\n[MERGED WITH BOOKING ${absorbed.bookId || absorbed.id} on ${new Date().toLocaleDateString('en-GB')}]\n` +
                          `• Absorbed Dates: ${absorbed.checkIn} to ${absorbed.checkOut}\n` +
                          `• Absorbed Room: ${(absorbed.rooms || []).join(',') || absorbed.room}\n` +
                          `• Absorbed Total: ฿${absorbed.totalPrice || 0}\n` +
                          (absorbed.notes ? `• Absorbed Notes: ${absorbed.notes}` : '');

        const db = getDb();
        const appId = getAppId();
        const { doc, updateDoc, deleteDoc } = getFs();

        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
                checkIn: earliestIn,
                checkOut: latestOut,
                totalPrice: combinedTotal,
                netPrice: combinedNet,
                payments: combinedPayments,
                extraCharges: combinedCharges,
                extended: true,
                notes: ((primary.notes || '') + mergeNote).trim(),
                lastEditedAt: new Date().toISOString()
            });

            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', targetId));

            if (window.triggerAutoSync) {
                const hotelRooms = getHotelRooms();
                const types = [...(primary.rooms || []), ...(absorbed.rooms || [])].map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
                window.triggerAutoSync(earliestIn, latestOut, types);
            }

            window.closeModal('merge-modal');
            window.closeGuestModal();
            window.showAlert(`Bookings successfully merged into ${primary.bookId || id}!\n\nNew Stay: ${earliestIn} to ${latestOut}\nTotal: ฿${combinedTotal}`);
        } catch (err) {
            console.error("Merge Error:", err);
            window.showAlert("Error merging bookings: " + err.message);
        }
    };

    window.editStaff = id => {
        const s = getStaff().find(x => x.id === id);
        if (s) window.populateStaffForm(s);
    };

    window.closeGuestModal = () => {
        const m = $('guest-modal');
        if (m) {
            m.classList.remove('active');
            m.style.display = 'none';
        }
    };

    window.quickAdd = (r, d) => {
        window.populateStaffForm({});
        if ($('check-in')) $('check-in').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const o = new Date(d);
        o.setDate(d.getDate() + 1);
        if ($('check-out')) $('check-out').value = `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`;
        if (window.updateNightsDisplay) window.updateNightsDisplay();
        if ($('assigned-rooms-container')) $('assigned-rooms-container').innerHTML = '';
        window.addRoomSelect(r);

        const curProp = getPropId();
        const pCode = window.toDisplayPropKey ? window.toDisplayPropKey(curProp) : 'SWIMS';
        const directBookings = getStaff().filter(s => {
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            return sProp === curProp && s.bookId && s.bookId.startsWith(pCode);
        }).sort((a, b) => {
            const numA = parseInt(a.bookId.replace(pCode, '')) || 0;
            const numB = parseInt(b.bookId.replace(pCode, '')) || 0;
            return numB - numA;
        });
        let nextNum = 1;
        if (directBookings.length > 0) {
            nextNum = (parseInt(directBookings[0].bookId.replace(pCode, '')) || 0) + 1;
        }
        if ($('booking-id')) $('booking-id').value = `${pCode}${String(nextNum).padStart(5, '0')}`;
        if ($('booking-date')) $('booking-date').value = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
        window.updateAvailableRooms();
        if (window.calcExtension) window.calcExtension();
    };

    window.saveBooking = async (keepOpen = false) => {
        if (window.currentUserRole === 'staff') return;
        const sB = $('save-btn');
        if (sB?.disabled) return;
        if (sB) { sB.disabled = true; sB.innerHTML = 'SAVING...'; }

        try {
            const cI = $('check-in')?.value, cO = $('check-out')?.value;
            if (cI >= cO) {
                if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="save" size="14" class="shrink-0"></i> Save'; }
                if (window.lucide) window.lucide.createIcons();
                return window.showAlert("INVALID DATES:\nDeparture must be after arrival.");
            }

            const idI = $('guest-id');
            const id = idI?.value || Math.random().toString(36).substr(2, 9);
            if (idI) idI.value = id;

            const bId = $('booking-id')?.value.trim() || '';
            const curProp = getPropId();
            const linkCodeVal = $('link-code')?.value.trim().toUpperCase() || '';

            if (bId) {
                const dupe = getStaff().find(s => {
                    const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                    const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                    if (sProp !== curProp || s.bookId !== bId || s.id === id || !isOcc) return false;
                    
                    // Allow valid contiguous split legs sharing a link code or having non-overlapping dates
                    const parseFn = window.parseYMD || (str => Date.parse(str));
                    const isLinked = linkCodeVal && s.linkedId && linkCodeVal === s.linkedId;
                    const isContiguousOrSplit = parseFn(cI) >= parseFn(s.checkOut) || parseFn(cO) <= parseFn(s.checkIn);
                    if (isLinked || isContiguousOrSplit) return false;

                    return true;
                });
                if (dupe) {
                    if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="save" size="14" class="shrink-0"></i> Save'; }
                    if (window.lucide) window.lucide.createIcons();
                    if (window.closeModal) window.closeModal('email-modal');
                    window.showAlert(`Duplicate Blocked:\nBooking ID ${bId} already exists in the system!\n\nOpening original record now...`);
                    setTimeout(() => { if (window.closeAlert) window.closeAlert(); window.editStaff(dupe.id); }, 2500);
                    return;
                }
            }

            const rL = Array.from($$('.assigned-room-select') || []).map(sel => sel.value).filter(Boolean);
            const dbRL = rL.map(window.uiToDbRoom || (r => r));
            const stat = $('guest-status-hidden')?.value || 'future';

            const isOccStatus = window.isOccupyingBooking ? window.isOccupyingBooking(stat) : (stat !== 'cancelled');

            if (isOccStatus) {
                const occupiedNow = getOccupiedRooms(cI, cO, id);
                const parseYMD = window.parseYMD || (s => Date.parse(s));
                for (let r of rL) {
                    const normR = window.normalizeRoomId ? window.normalizeRoomId(r, curProp) : r;
                    if (occupiedNow.has(r) || occupiedNow.has(normR)) {
                        const conflictBooking = getStaff().find(s => {
                            if (s.id === id) return false;
                            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                            if (sProp !== curProp) return false;
                            const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                            if (!isOcc) return false;
                            if (parseYMD(cI) >= parseYMD(s.checkOut) || parseYMD(cO) <= parseYMD(s.checkIn)) return false;
                            return getRooms(s).map(rm => window.normalizeRoomId ? window.normalizeRoomId(rm, curProp) : rm).includes(normR);
                        });
                        if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="save" size="14" class="shrink-0"></i> Save'; }
                        if (window.lucide) window.lucide.createIcons();
                        return window.showAlert(`ROOM OVERLAP ERROR:\n\nRoom ${r} is already assigned to ${conflictBooking?.firstName || ''} ${conflictBooking?.lastName || 'another guest'} during these dates.`);
                    }
                }
            }

            const ext = getStaff().find(s => s.id === id);
            const now = new Date().toISOString();
            const userEmail = window.currentUserEmail || 'admin';

            const ent = {
                id,
                property: curProp,
                firstName: $('first-name')?.value.trim().toUpperCase() || '',
                lastName: $('last-name')?.value.trim().toUpperCase() || '',
                status: stat,
                bookedType: $('booked-type')?.value || '',
                room: dbRL[0] || "",
                rooms: dbRL,
                checkIn: cI,
                checkOut: cO,
                pax: parseInt($('pax-count')?.value) || 1,
                country: $('guest-country')?.value || '',
                phone: $('phone')?.value || '',
                email: $('email')?.value || '',
                source: $('booking-source')?.value || 'direct',
                bookDate: $('booking-date')?.value || '',
                bookId: $('booking-id')?.value || '',
                linkedId: linkCodeVal,
                totalPrice: Number($('total-price')?.value) || 0,
                netPrice: Number($('net-price')?.value) || 0,
                netOverride: $('net-price')?.dataset.override === 'true',
                badCC: $('bad-cc-box')?.dataset.bad === 'true',
                payments: Array.from($$('.payment-row') || []).map(r => ({
                    date: r.querySelector('.pay-date')?.value || '',
                    amt: Number(r.querySelector('.pay-amt')?.value) || 0,
                    method: r.querySelector('.pay-method')?.value || 'cash'
                })),
                extraCharges: window.activeExtraCharges || [],
                emailConfirm: parseInt($('email-confirm-btn')?.dataset?.state || 0) === 1,
                emailPrePost: parseInt($('email-prepost-btn')?.dataset?.state || 0) > 0 ? (parseInt($('email-prepost-btn')?.dataset?.state) === 1 ? 'sent' : 'confirmed') : false,
                emailSpecial: parseInt($('email-special-btn')?.dataset?.state || 0) === 1,
                refundability: parseInt($('refund-btn')?.dataset?.state || 0) === 1 ? 'non-ref' : (parseInt($('refund-btn')?.dataset?.state || 0) === 2 ? 'ref' : 'unknown'),
                upgrade: parseInt($('upgrade-btn')?.dataset?.state || 0) > 0 ? (parseInt($('upgrade-btn')?.dataset?.state) === 1 ? 'free' : 'paid') : 'none',
                rating: parseInt($('rating-btn')?.dataset?.state || 0) > 0 ? (parseInt($('rating-btn')?.dataset?.state) === 1 ? 'good' : 'bad') : 'none',
                extended: parseInt($('ext-btn')?.dataset?.state || 0) === 1,
                notes: $('guest-notes')?.value || '',
                createdAt: ext?.createdAt || now,
                createdBy: ext?.createdBy || userEmail,
                lastEditedAt: now,
                lastEditedBy: userEmail,
                auditLog: Array.isArray(ext?.auditLog) ? ext.auditLog : []
            };

            const diff = window.generateAuditDiff ? window.generateAuditDiff(ext, ent) : "Saved.";
            ent.auditLog.push({ ts: now, user: userEmail, msg: diff });

            const db = getDb();
            const appId = getAppId();
            const { doc, setDoc } = getFs();

            const savePromise = setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), ent);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 15000));
            await Promise.race([savePromise, timeoutPromise]);

            const hotelRooms = getHotelRooms();
            const bookingRoomTypes = Array.from(new Set([
                ...rL.map(rId => {
                    const hr = hotelRooms.find(hr => hr.id === rId);
                    return hr ? hr.type : null;
                }).filter(Boolean),
                $('booked-type')?.value,
                ext?.bookedType
            ])).filter(Boolean);

            const earliestIn = ext?.checkIn && ext.checkIn < cI ? ext.checkIn : cI;
            const latestOut = ext?.checkOut && ext.checkOut > cO ? ext.checkOut : cO;

            if (window.triggerAutoSync) window.triggerAutoSync(earliestIn, latestOut, bookingRoomTypes, ent);
            if (!keepOpen) window.closeGuestModal();
        } catch (err) {
            console.error("Save Error:", err);
            window.showAlert("Save process timed out or encountered an error. Please verify your connection.\n\nError: " + err.message);
        } finally {
            if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="save" size="14" class="shrink-0"></i> Save'; }
            if (window.lucide) window.lucide.createIcons();
        }
    };
})();
