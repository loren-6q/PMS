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

    const M_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    // ----------------------------------------------------------------------
    // 1. UI & HEADER HELPERS
    // ----------------------------------------------------------------------
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

    // ----------------------------------------------------------------------
    // 2. ROOM OCCUPANCY & AUTO-ASSIGNMENT ENGINE
    // ----------------------------------------------------------------------
    const getOccupiedRooms = (checkInStr, checkOutStr, excludeBookingId = null) => {
        const occ = new Set();
        const parseYMD = window.parseYMD || (s => Date.parse(s));
        const sU = parseYMD(checkInStr), eU = parseYMD(checkOutStr);
        if (!sU || !eU) return occ;
        const curProp = getPropId();

        getStaff().forEach(s => {
            if (s.id === excludeBookingId) return;
            
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return;

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

        // Auto-assign open room if not explicitly assigned
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

    // ----------------------------------------------------------------------
    // 3. MULTI-STATE TOGGLES
    // ----------------------------------------------------------------------
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
        const curState = parseInt(el.dataset.state || 0);
        const nextState = (curState + 1) % labels.length;
        setMulti(el.id, nextState, labels, classes);
    };

    // ----------------------------------------------------------------------
    // 4. STAY ITINERARY STRIPE (COMPACT & CLEAN)
    // ----------------------------------------------------------------------
    const formatLegDates = (cI, cO) => {
        if (!cI || !cO) return '--';
        const pI = cI.split('-'), pO = cO.split('-');
        if (pI.length !== 3 || pO.length !== 3) return `${cI}→${cO}`;
        const dI = parseInt(pI[2]), mI = parseInt(pI[1]) - 1;
        const dO = parseInt(pO[2]), mO = parseInt(pO[1]) - 1;
        if (mI === mO) {
            return `${dI}-${dO}${M_NAMES[mI] || ''}`;
        }
        return `${dI}${M_NAMES[mI] || ''}-${dO}${M_NAMES[mO] || ''}`;
    };

    window.renderItineraryStripe = currentStaff => {
        const stripe = $('itinerary-stripe');
        if (!stripe) return;

        const code = currentStaff?.linkedId ? String(currentStaff.linkedId).trim().toUpperCase() : '';
        if (!code) {
            stripe.classList.add('hidden');
            stripe.innerHTML = '';
            return;
        }

        const curProp = getPropId();
        const legs = getStaff().filter(s => {
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            return sProp === curProp && s.linkedId && String(s.linkedId).trim().toUpperCase() === code && s.status !== 'cancelled';
        }).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

        if (legs.length <= 1) {
            stripe.classList.add('hidden');
            stripe.innerHTML = '';
            return;
        }

        stripe.classList.remove('hidden');

        let html = `<span class="text-slate-400 shrink-0 font-bold select-none mr-0.5">🔗</span>`;

        legs.forEach((leg, idx) => {
            const isActive = leg.id === currentStaff.id;
            const datesShort = formatLegDates(leg.checkIn, leg.checkOut);
            const rL = getRooms(leg).filter(Boolean);
            const roomDisplay = rL.length > 0 ? rL.join(',') : 'UNASG';

            const activeClass = isActive 
                ? 'bg-blue-600 text-white font-black border border-blue-400 shadow-sm cursor-default' 
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600 cursor-pointer';

            html += `
                <div class="px-1.5 py-0.5 rounded text-[10px] uppercase transition-colors shrink-0 flex items-center gap-1 ${activeClass}" 
                     ${isActive ? '' : `onclick="window.editStaff('${leg.id}')"`}
                     title="${leg.firstName || ''} ${leg.lastName || ''} (${leg.checkIn} to ${leg.checkOut})">
                    ${isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>' : ''}
                    <span>${datesShort} ${roomDisplay}</span>
                </div>
            `;

            if (idx < legs.length - 1) {
                html += `<span class="text-slate-500 font-bold mx-0.5 select-none">|</span>`;
            }
        });

        stripe.innerHTML = html;
    };

    // ----------------------------------------------------------------------
    // 5. GUEST FORM & MODAL CONTROLLER
    // ----------------------------------------------------------------------
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
        try { window.history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch (e) {}
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

    // ----------------------------------------------------------------------
    // 6. MODAL ACTIONS (DELETE, DUPLICATE, SPLIT, MERGE)
    // ----------------------------------------------------------------------
    window.requestDelete = () => {
        const id = $('guest-id')?.value;
        const name = `${$('first-name')?.value || ''} ${$('last-name')?.value || ''}`.trim() || 'this booking';
        if (!id) return;

        window.showAlert(`PERMANENTLY DELETE BOOKING?\n\nGuest: ${name}\n\nThis cannot be undone.`, true, async () => {
            const delBtn = $('delete-btn');
            const origHtml = delBtn ? delBtn.innerHTML : '';
            if (delBtn) { delBtn.disabled = true; delBtn.innerHTML = '...'; }

            try {
                const db = getDb();
                const appId = getAppId();
                const { doc, deleteDoc } = getFs();

                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));

                const cI = $('check-in')?.value;
                const cO = $('check-out')?.value;
                const rL = Array.from($$('.assigned-room-select') || []).map(sel => sel.value).filter(Boolean);
                const hotelRooms = getHotelRooms();
                const rTypes = Array.from(new Set(rL.map(rId => hotelRooms.find(hr => hr.id === rId)?.type).filter(Boolean)));
                if (window.triggerAutoSync) window.triggerAutoSync(cI, cO, rTypes);

                window.closeGuestModal();
                if (window.showAlert) window.showAlert("Booking successfully deleted.");
            } catch (err) {
                console.error("Delete Error:", err);
                window.showAlert("Delete Error: " + err.message);
            } finally {
                if (delBtn) { delBtn.disabled = false; delBtn.innerHTML = origHtml; }
                if (window.lucide) window.lucide.createIcons();
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
        delete clone.createdAt;
        delete clone.createdBy;
        delete clone.lastEditedAt;
        delete clone.lastEditedBy;
        delete clone.auditLog;
        clone.payments = [];
        clone.extraCharges = [];
        clone.totalPrice = 0;
        clone.netPrice = 0;
        clone.status = 'future';
        clone.bookId = '';
        clone.notes = `[DUPLICATED FROM PREVIOUS BOOKING]\n` + (clone.notes || '');

        window.populateStaffForm(clone);
        window.showAlert("Booking duplicated as new record!\n\nPlease adjust the dates, select rooms, and save.");
    };

    window.requestSplit = () => {
        const cI = $('check-in')?.value;
        const cO = $('check-out')?.value;
        if (!cI || !cO) return window.showAlert("Please select valid check-in and check-out dates first.");

        const parseFn = window.parseYMD || (s => Date.parse(s));
        const nights = Math.round((parseFn(cO) - parseFn(cI)) / 86400000);
        if (nights <= 1) return window.showAlert("A booking must be at least 2 nights to split.");

        const dSplit = new Date(cI + "T12:00:00Z");
        dSplit.setUTCDate(dSplit.getUTCDate() + Math.floor(nights / 2));
        const splitDateStr = dSplit.toISOString().split('T')[0];

        const dateInput = $('split-date');
        if (dateInput) {
            dateInput.value = splitDateStr;
            dateInput.min = cI;
            dateInput.max = cO;
        }

        const roomContainer = $('split-room-dropdown-container');
        if (roomContainer) {
            const occ = getOccupiedRooms(splitDateStr, cO, $('guest-id')?.value);
            const curProp = getPropId();
            let roomOpts = `<label class="field-label text-left mb-1">Destination Room for Leg 2</label><select id="split-target-room" class="input-base !text-xs !p-2 uppercase cursor-pointer"><option value="">-- AUTO-ASSIGN AVAILABLE BED --</option>`;
            
            getHotelRooms().forEach(hr => {
                const normR = window.normalizeRoomId ? window.normalizeRoomId(hr.id, curProp) : hr.id;
                const isOccupied = occ.has(hr.id) || occ.has(normR);
                roomOpts += `<option value="${hr.id}" ${isOccupied ? 'disabled' : ''}>${hr.id} (${hr.type}) ${isOccupied ? '❌ OCCUPIED' : '✔ FREE'}</option>`;
            });
            roomOpts += `</select>`;
            roomContainer.innerHTML = roomOpts;
        }

        const modal = $('split-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    };

    window.confirmSplit = async () => {
        const splitDate = $('split-date')?.value;
        const cI = $('check-in')?.value;
        const cO = $('check-out')?.value;
        const id = $('guest-id')?.value;
        const currentRec = getStaff().find(x => x.id === id);

        if (!splitDate || splitDate <= cI || splitDate >= cO) {
            return window.showAlert("Split date must be strictly between Check-In and Check-Out.");
        }

        const splitTargetRoom = $('split-target-room')?.value || '';
        const curProp = getPropId();
        const occ = getOccupiedRooms(splitDate, cO, id);
        const normTarget = window.normalizeRoomId ? window.normalizeRoomId(splitTargetRoom, curProp) : splitTargetRoom;

        if (splitTargetRoom && (occ.has(splitTargetRoom) || occ.has(normTarget))) {
            return window.showAlert(`Selected room ${splitTargetRoom} is occupied during the second leg (${splitDate} to ${cO}). Please pick an open room.`);
        }

        if (window.closeModal) window.closeModal('split-modal');
        const splitBtn = $('split-btn');
        const origHtml = splitBtn ? splitBtn.innerHTML : '';
        if (splitBtn) { splitBtn.disabled = true; splitBtn.innerHTML = '...'; }

        try {
            const db = getDb();
            const appId = getAppId();
            const { doc, updateDoc, setDoc } = getFs();

            // Unified link code across all split segments
            const sharedLinkId = currentRec?.linkedId || ('LK-' + Math.random().toString(36).substr(2, 6).toUpperCase());
            const newDocId = Math.random().toString(36).substr(2, 9);
            const now = new Date().toISOString();
            const userEmail = window.currentUserEmail || 'admin';

            // 1. Shorten current booking (Leg 1)
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
                checkOut: splitDate,
                linkedId: sharedLinkId,
                lastEditedAt: now,
                lastEditedBy: userEmail
            });

            // 2. Create second linked segment (Leg 2)
            const leg2Rooms = splitTargetRoom ? [splitTargetRoom] : (currentRec?.rooms || []);
            const newSegment = {
                ...JSON.parse(JSON.stringify(currentRec || {})),
                id: newDocId,
                checkIn: splitDate,
                checkOut: cO,
                room: leg2Rooms[0] || "",
                rooms: leg2Rooms,
                totalPrice: 0,
                netPrice: 0,
                payments: [],
                extraCharges: [],
                linkedId: sharedLinkId,
                notes: `[LINKED SPLIT SEGMENT 2]\nOriginal Stay: ${cI} to ${cO}\n` + (currentRec?.notes || ''),
                createdAt: now,
                createdBy: userEmail,
                lastEditedAt: now,
                lastEditedBy: userEmail,
                auditLog: [{ ts: now, user: userEmail, msg: `Created split segment from ${id} for ${splitDate} to ${cO}.` }]
            };

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newDocId), newSegment);

            // Update local memory so itinerary displays immediately
            if (currentRec) {
                currentRec.checkOut = splitDate;
                currentRec.linkedId = sharedLinkId;
            }
            getStaff().push(newSegment);

            // Load new segment into modal
            window.populateStaffForm(newSegment);
            window.showAlert(`Split stay created!\n\nLeg 1: ${cI} to ${splitDate}\nLeg 2: ${splitDate} to ${cO} (Room: ${leg2Rooms.join(',') || 'Unassigned'}).\n\nBoth are linked via code ${sharedLinkId}.`);
        } catch (err) {
            console.error("Split Error:", err);
            window.showAlert("Split Error: " + err.message);
        } finally {
            if (splitBtn) { splitBtn.disabled = false; splitBtn.innerHTML = origHtml; }
            if (window.lucide) window.lucide.createIcons();
        }
    };

    window.requestMerge = () => {
        const id = $('guest-id')?.value;
        const cur = getStaff().find(x => x.id === id);
        if (!cur) return;

        const curProp = getPropId();
        const parseFn = window.parseYMD || (s => Date.parse(s));
        const cInMs = parseFn(cur.checkIn);
        const cOutMs = parseFn(cur.checkOut);
        const DAY_MS = 86400000;

        // Filter candidates to adjacent dates (within 2 days of checkin/checkout)
        const candidates = getStaff().filter(s => {
            if (s.id === id || s.status === 'cancelled') return false;
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            const sInMs = parseFn(s.checkIn);
            const sOutMs = parseFn(s.checkOut);
            const isConsecutive = (Math.abs(sOutMs - cInMs) <= 2 * DAY_MS) || (Math.abs(cOutMs - sInMs) <= 2 * DAY_MS);
            return isConsecutive;
        });

        if (candidates.length === 0) {
            return window.showAlert("No adjacent bookings found within 2 days of this stay to merge with.");
        }

        // Score candidates for logical auto-selection
        const curLast = (cur.lastName || '').toUpperCase().trim();
        const curRooms = getRooms(cur);
        candidates.forEach(c => {
            let score = 0;
            const cLast = (c.lastName || '').toUpperCase().trim();
            if (curLast && cLast && (curLast.includes(cLast) || cLast.includes(curLast))) score += 50;
            if (cur.linkedId && c.linkedId && cur.linkedId === c.linkedId) score += 30;
            const cInAdjacent = (parseFn(c.checkOut) === cInMs) || (parseFn(c.checkIn) === cOutMs);
            if (cInAdjacent) score += 20;
            const cRooms = getRooms(c);
            if (curRooms.some(r => cRooms.includes(r))) score += 10;
            c._mergeScore = score;
        });
        candidates.sort((a, b) => b._mergeScore - a._mergeScore);

        const select = $('merge-target');
        if (select) {
            select.innerHTML = candidates.map((s, idx) => {
                const sName = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
                const sRoom = getRooms(s).join(',') || 'Unassigned';
                const isTopMatch = idx === 0 && s._mergeScore >= 20;
                const star = isTopMatch ? '⭐ ' : '';
                return `<option value="${s.id}" ${isTopMatch ? 'selected' : ''}>${star}${sName} | ${s.checkIn}→${s.checkOut} | ${sRoom}</option>`;
            }).join('');
        }

        const modal = $('merge-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    };

    window.confirmMerge = async () => {
        const id = $('guest-id')?.value;
        const targetId = $('merge-target')?.value;
        if (!id || !targetId || id === targetId) return window.showAlert("Please select a valid booking to absorb.");

        const primary = getStaff().find(x => x.id === id);
        const absorbed = getStaff().find(x => x.id === targetId);
        if (!primary || !absorbed) return window.showAlert("Could not load booking records for merge.");

        if (window.closeModal) window.closeModal('merge-modal');
        const mergeBtn = $('merge-btn');
        const origHtml = mergeBtn ? mergeBtn.innerHTML : '';
        if (mergeBtn) { mergeBtn.disabled = true; mergeBtn.innerHTML = '...'; }

        try {
            const db = getDb();
            const appId = getAppId();
            const { doc, updateDoc, deleteDoc } = getFs();

            // Calculate expanded stay span
            const combinedIn = (primary.checkIn < absorbed.checkIn) ? primary.checkIn : absorbed.checkIn;
            const combinedOut = (primary.checkOut > absorbed.checkOut) ? primary.checkOut : absorbed.checkOut;

            // Combine unique rooms
            const allRooms = Array.from(new Set([...getRooms(primary), ...getRooms(absorbed)])).filter(Boolean);

            // Combine finances
            const combinedTotal = Number(((Number(primary.totalPrice) || 0) + (Number(absorbed.totalPrice) || 0)).toFixed(2));
            const combinedNet = Number(((Number(primary.netPrice) || 0) + (Number(absorbed.netPrice) || 0)).toFixed(2));
            const combinedPayments = [...(primary.payments || []), ...(absorbed.payments || [])];
            const combinedCharges = [...(primary.extraCharges || []), ...(absorbed.extraCharges || [])];

            const now = new Date().toISOString();
            const userEmail = window.currentUserEmail || 'admin';
            const mergedNotes = `${primary.notes || ''}\n\n[MERGED WITH BOOKING ${absorbed.bookId || absorbed.id}]\n` +
                                `Absorbed Guest: ${absorbed.firstName || ''} ${absorbed.lastName || ''}\n` +
                                `Dates: ${absorbed.checkIn} to ${absorbed.checkOut} (฿${absorbed.totalPrice || 0})\n` +
                                `Notes: ${absorbed.notes || '--'}`;

            // 1. Update primary record
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
                checkIn: combinedIn,
                checkOut: combinedOut,
                rooms: allRooms,
                room: allRooms[0] || "",
                totalPrice: combinedTotal,
                netPrice: combinedNet,
                payments: combinedPayments,
                extraCharges: combinedCharges,
                notes: mergedNotes.trim(),
                lastEditedAt: now,
                lastEditedBy: userEmail
            });

            // 2. Delete absorbed record
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', targetId));

            // Update primary record in local memory and remove absorbed
            primary.checkIn = combinedIn;
            primary.checkOut = combinedOut;
            primary.rooms = allRooms;
            primary.room = allRooms[0] || "";
            primary.totalPrice = combinedTotal;
            primary.netPrice = combinedNet;
            primary.payments = combinedPayments;
            primary.extraCharges = combinedCharges;
            primary.notes = mergedNotes.trim();

            const idx = getStaff().findIndex(x => x.id === targetId);
            if (idx > -1) getStaff().splice(idx, 1);

            // Reload primary booking into modal
            window.populateStaffForm(primary);
            window.showAlert(`Merge complete!\n\nAbsorbed booking ${absorbed.bookId || absorbed.id} into this record.\nStay dates are now ${combinedIn} to ${combinedOut}.\nTotal: ฿${combinedTotal}.`);
        } catch (err) {
            console.error("Merge Error:", err);
            window.showAlert("Merge Error: " + err.message);
        } finally {
            if (mergeBtn) { mergeBtn.disabled = false; mergeBtn.innerHTML = origHtml; }
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // ----------------------------------------------------------------------
    // 7. SAVE BOOKING (WITH SPLIT-AWARE DUPLICATE DETECTION)
    // ----------------------------------------------------------------------
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
            const curLink = $('link-code')?.value.trim().toUpperCase() || '';

            // Split-aware duplicate check: allows multiple contiguous segments sharing a bookId or linkCode
            if (bId) {
                const parseYMD = window.parseYMD || (s => Date.parse(s));
                const dupe = getStaff().find(s => {
                    const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                    const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                    if (sProp !== curProp || s.bookId !== bId || s.id === id || !isOcc) return false;

                    // If linked via linkCode or contiguous stay (non-overlapping dates), permit it
                    const isLinked = curLink && s.linkedId && s.linkedId.toUpperCase() === curLink;
                    const isNonOverlapping = (parseYMD(cO) <= parseYMD(s.checkIn)) || (parseYMD(cI) >= parseYMD(s.checkOut));
                    if (isLinked || isNonOverlapping) return false;

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
                linkedId: curLink,
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
                $('booked-type')?.value
            ])).filter(Boolean);

            const earliestIn = ext?.checkIn && ext.checkIn < cI ? ext.checkIn : cI;
            const latestOut = ext?.checkOut && ext.checkOut > cO ? ext.checkOut : cO;

            if (window.triggerAutoSync) window.triggerAutoSync(earliestIn, latestOut, bookingRoomTypes);
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
