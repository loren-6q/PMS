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
        const cur = parseInt(el.dataset.state || 0);
        const next = (cur + 1) % labels.length;
        setMulti(el.id, next, labels, classes);
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

        // Render Dynamic Stay Itinerary Stripe
        if (window.renderItineraryStripe) window.renderItineraryStripe(s);

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

    window.renderItineraryStripe = s => {
        const stripe = $('itinerary-stripe');
        if (!stripe) return;

        const curProp = getPropId();
        const staff = getStaff();
        const linkCode = (s.linkedId || $('link-code')?.value || '').trim().toUpperCase();

        let linkedGroup = [];
        if (linkCode) {
            linkedGroup = staff.filter(b => {
                const bProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
                if (bProp !== curProp || b.status === 'cancelled') return false;
                const bLink = (b.linkedId || '').trim().toUpperCase();
                return bLink === linkCode || b.id === linkCode || (s.id && bLink === s.id);
            });
        }

        if (linkedGroup.length <= 1 && s.id) {
            const byId = staff.filter(b => {
                const bProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
                if (bProp !== curProp || b.status === 'cancelled') return false;
                return (b.linkedId || '').trim().toUpperCase() === s.id;
            });
            if (byId.length > 0) linkedGroup = [s, ...byId];
        }

        // Sort chronologically by check-in date
        linkedGroup.sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

        if (linkedGroup.length <= 1) {
            stripe.classList.add('hidden');
            stripe.innerHTML = '';
            return;
        }

        stripe.classList.remove('hidden');

        let html = `
            <div class="flex items-center gap-1 shrink-0 pr-2 border-r border-slate-700">
                <span class="text-amber-400 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    STAY ITINERARY:
                </span>
            </div>
            <div class="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar py-0.5">
        `;

        linkedGroup.forEach((leg, idx) => {
            const isCurrent = leg.id === s.id;
            const rList = getRooms(leg).filter(Boolean);
            const roomName = rList.length > 0 ? rList.join(',') : (leg.room || 'UNASSIGNED');
            const dIn = leg.checkIn ? leg.checkIn.substr(5) : '??';
            const dOut = leg.checkOut ? leg.checkOut.substr(5) : '??';

            const pillClass = isCurrent
                ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-1 ring-white/50 cursor-default'
                : 'bg-slate-700/80 hover:bg-slate-600 text-slate-300 border-slate-600 cursor-pointer';

            html += `
                <button type="button" onclick="${isCurrent ? '' : `window.editStaff('${leg.id}')`}" class="px-2 py-0.5 rounded border text-[10px] font-black flex items-center gap-1 transition-all whitespace-nowrap shrink-0 ${pillClass}" title="${leg.checkIn} to ${leg.checkOut} (${roomName})">
                    ${isCurrent ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>' : ''}
                    <span>Leg ${idx + 1}: ${roomName}</span>
                    <span class="opacity-70 text-[9px] font-mono">(${dIn}→${dOut})</span>
                </button>
            `;

            if (idx < linkedGroup.length - 1) {
                html += `<span class="text-slate-500 font-bold px-0.5">➔</span>`;
            }
        });

        html += `
            </div>
            <div class="flex items-center gap-1 shrink-0 pl-1 border-l border-slate-700">
                <button type="button" onclick="window.requestSplit()" class="px-1.5 py-0.5 rounded bg-orange-600/80 hover:bg-orange-500 text-white font-black text-[9px] uppercase tracking-wide cursor-pointer transition-colors shadow-sm" title="Split current stay into a new room leg">
                    + Split Room
                </button>
            </div>
        `;

        stripe.innerHTML = html;
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
            const currentLink = $('link-code')?.value.trim().toUpperCase() || '';

            if (bId) {
                const parseYMD = window.parseYMD || (s => Date.parse(s));
                const dupe = getStaff().find(s => {
                    const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                    const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                    if (sProp !== curProp || s.bookId !== bId || s.id === id || !isOcc) return false;

                    // Allow contiguous or shared linked legs
                    const isLinkedLeg = (currentLink && s.linkedId && s.linkedId === currentLink) || (s.linkedId === id) || (currentLink === s.id);
                    const isNonOverlapping = (parseYMD(cI) >= parseYMD(s.checkOut) || parseYMD(cO) <= parseYMD(s.checkIn));
                    if (isLinkedLeg || isNonOverlapping) return false;

                    return true;
                });

                if (dupe) {
                    if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="save" size="14" class="shrink-0"></i> Save'; }
                    if (window.lucide) window.lucide.createIcons();
                    return window.showAlert(`Duplicate Blocked:\nBooking ID ${bId} already overlaps with an active booking in the system!`);
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
                linkedId: $('link-code')?.value.trim().toUpperCase() || '',
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

    window.requestDelete = () => {
        const id = $('guest-id')?.value;
        if (!id) return;

        window.showAlert("PERMANENTLY DELETE THIS BOOKING?\n\nThis will remove the guest record from your calendar and database.", true, async () => {
            const btn = $('delete-btn');
            const origHtml = btn ? btn.innerHTML : '';
            if (btn) btn.innerHTML = '...';

            try {
                const db = getDb();
                const appId = getAppId();
                const { doc, deleteDoc } = getFs();

                const staff = getStaff();
                const target = staff.find(s => s.id === id);

                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));

                if (target && window.triggerAutoSync) {
                    const rL = getRooms(target);
                    const hotelRooms = getHotelRooms();
                    const rTypes = Array.from(new Set([
                        ...rL.map(rId => hotelRooms.find(hr => hr.id === rId)?.type).filter(Boolean),
                        target.bookedType
                    ])).filter(Boolean);
                    window.triggerAutoSync(target.checkIn, target.checkOut, rTypes);
                }

                window.closeGuestModal();
                if (window.showAlert) window.showAlert("Booking deleted successfully.");
            } catch (err) {
                console.error("Delete Error:", err);
                window.showAlert("Delete failed: " + err.message);
            } finally {
                if (btn) btn.innerHTML = origHtml;
                if (window.lucide) window.lucide.createIcons();
            }
        });
    };

    window.requestDuplicate = () => {
        const id = $('guest-id')?.value;
        if (!id) return;

        const staff = getStaff();
        const orig = staff.find(s => s.id === id);
        if (!orig) return;

        const copy = JSON.parse(JSON.stringify(orig));
        delete copy.id;
        copy.status = 'new';
        copy.payments = [];
        copy.extraCharges = [];
        copy.notes = `[DUPLICATE OF ${orig.id} - ${orig.bookId || 'DIRECT'}]\n` + (orig.notes || '');

        window.populateStaffForm(copy);
        $('guest-id').value = '';

        if (window.showAlert) {
            window.showAlert("Booking duplicated as NEW!\n\nReview the room and dates, then click Save.");
        }
    };

    window.requestSplit = () => {
        const id = $('guest-id')?.value;
        if (!id) return window.showAlert("Please save this booking first before splitting.");

        const staff = getStaff();
        const orig = staff.find(s => s.id === id);
        if (!orig || !orig.checkIn || !orig.checkOut) return;

        const parseYMD = window.parseYMD || (s => Date.parse(s));
        const sU = parseYMD(orig.checkIn), eU = parseYMD(orig.checkOut);
        const midMs = sU + Math.round((eU - sU) / 2);
        const getYmd = window.getLocalYMD || (d => new Date(d).toISOString().split('T')[0]);
        const defaultSplitDate = getYmd(new Date(midMs));

        const dateInput = $('split-date');
        if (dateInput) {
            dateInput.min = orig.checkIn;
            dateInput.max = orig.checkOut;
            dateInput.value = defaultSplitDate;
            dateInput.onchange = () => window.updateSplitRoomDropdown(orig);
        }

        window.updateSplitRoomDropdown(orig);

        const modal = $('split-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        if (window.lucide) window.lucide.createIcons();
    };

    window.updateSplitRoomDropdown = orig => {
        const splitDate = $('split-date')?.value || orig.checkIn;
        const curProp = getPropId();
        const hotelRooms = getHotelRooms();
        const occupied = getOccupiedRooms(splitDate, orig.checkOut, orig.id);

        const container = $('split-room-dropdown-container');
        if (!container) return;

        const sel = document.createElement('select');
        sel.id = 'split-next-room';
        sel.className = 'input-base !text-sm !p-2 cursor-pointer font-bold uppercase';

        let html = '<option value="">-- AUTO-ASSIGN / SAME ROOM TYPE --</option>';
        hotelRooms.forEach(r => {
            const normR = window.normalizeRoomId ? window.normalizeRoomId(r.id, curProp) : r.id;
            const isOcc = occupied.has(r.id) || occupied.has(normR);
            html += `<option value="${r.id}" ${isOcc ? 'disabled class="text-slate-400"' : 'class="font-black text-slate-800"'}>ROOM ${r.id} (${r.type || '?'}) ${isOcc ? '[OCCUPIED]' : '[AVAILABLE]'}</option>`;
        });
        sel.innerHTML = html;

        container.innerHTML = '';
        container.appendChild(sel);
    };

    window.confirmSplit = async () => {
        const id = $('guest-id')?.value;
        const splitDate = $('split-date')?.value;
        const nextRoom = $('split-next-room')?.value || "";

        if (!id || !splitDate) return window.showAlert("Please select a split date.");

        const staff = getStaff();
        const orig = staff.find(s => s.id === id);
        if (!orig) return;

        if (splitDate <= orig.checkIn || splitDate >= orig.checkOut) {
            return window.showAlert("INVALID SPLIT DATE:\nSplit date must be strictly between Arrival and Departure.");
        }

        const commonLink = orig.linkedId || ('LK' + Math.random().toString(36).substr(2, 5).toUpperCase());
        const origOut = orig.checkOut;
        const dbNextRoom = nextRoom ? (window.uiToDbRoom ? window.uiToDbRoom(nextRoom) : nextRoom) : "";

        const newId = Math.random().toString(36).substr(2, 9);
        const curProp = getPropId();
        const userEmail = window.currentUserEmail || 'admin';
        const now = new Date().toISOString();

        const splitSegment = {
            id: newId,
            property: curProp,
            firstName: orig.firstName || '',
            lastName: orig.lastName || '',
            status: orig.status || 'future',
            bookedType: orig.bookedType || '',
            room: dbNextRoom,
            rooms: dbNextRoom ? [dbNextRoom] : [],
            checkIn: splitDate,
            checkOut: origOut,
            pax: orig.pax || 1,
            country: orig.country || '',
            phone: orig.phone || '',
            email: orig.email || '',
            source: orig.source || 'direct',
            bookDate: orig.bookDate || '',
            bookId: orig.bookId || '',
            linkedId: commonLink,
            totalPrice: 0,
            netPrice: 0,
            netOverride: false,
            badCC: false,
            payments: [],
            extraCharges: [],
            emailConfirm: false,
            emailPrePost: false,
            emailSpecial: false,
            refundability: orig.refundability || 'unknown',
            upgrade: 'none',
            rating: 'none',
            extended: false,
            notes: `[SPLIT STAY LEG 2 - FROM ${orig.id}]\nMove to room ${nextRoom || 'unassigned'} on ${splitDate}.\n` + (orig.notes || ''),
            createdAt: now,
            createdBy: userEmail,
            lastEditedAt: now,
            lastEditedBy: userEmail,
            auditLog: [{ ts: now, user: userEmail, msg: `Created as Split Leg 2 from booking ${orig.id}` }]
        };

        try {
            const db = getDb();
            const appId = getAppId();
            const { doc, setDoc } = getFs();

            // 1. Shorten leg 1 and tag with commonLink
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
                checkOut: splitDate,
                linkedId: commonLink,
                lastEditedAt: now,
                lastEditedBy: userEmail
            }, { merge: true });

            // 2. Save leg 2
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newId), splitSegment);

            if (window.closeModal) window.closeModal('split-modal');

            // 3. Immediately switch modal to leg 2 to review the move
            window.editStaff(newId);

            if (window.showAlert) {
                window.showAlert(`Stay split into linked legs!\n\nLeg 1: ${orig.checkIn} → ${splitDate}\nLeg 2: ${splitDate} → ${origOut} (Room: ${nextRoom || 'Unassigned'})\nLink Code: ${commonLink}`);
            }
        } catch (err) {
            console.error("Split Error:", err);
            window.showAlert("Split failed: " + err.message);
        }
    };

    window.requestMerge = () => {
        const id = $('guest-id')?.value;
        if (!id) return window.showAlert("Please save this booking first before merging.");

        const staff = getStaff();
        const current = staff.find(s => s.id === id);
        if (!current) return;

        const curProp = getPropId();
        const parseYMD = window.parseYMD || (s => Date.parse(s));
        const cIn = parseYMD(current.checkIn);
        const cOut = parseYMD(current.checkOut);
        const twoDaysMs = 2 * 86400000;

        const candidates = staff.filter(s => {
            if (s.id === id || s.status === 'cancelled' || s.status === 'noshow') return false;
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;

            const sIn = parseYMD(s.checkIn);
            const sOut = parseYMD(s.checkOut);

            const isAdjacentPreceding = Math.abs(cIn - sOut) <= twoDaysMs;
            const isAdjacentFollowing = Math.abs(cOut - sIn) <= twoDaysMs;
            const isOverlap = (cIn < sOut && sIn < cOut);

            return isAdjacentPreceding || isAdjacentFollowing || isOverlap;
        });

        const targetSelect = $('merge-target');
        if (!targetSelect) return;

        if (candidates.length === 0) {
            targetSelect.innerHTML = '<option value="">-- NO ADJACENT BOOKINGS FOUND (±2 DAYS) --</option>';
        } else {
            const scoredCandidates = candidates.map(c => {
                let score = 0;
                const cLast = (current.lastName || '').toUpperCase();
                const tLast = (c.lastName || '').toUpperCase();
                if (cLast && tLast && (cLast === tLast || cLast.includes(tLast) || tLast.includes(cLast))) score += 40;

                const cFirst = (current.firstName || '').toUpperCase();
                const tFirst = (c.firstName || '').toUpperCase();
                if (cFirst && tFirst && (cFirst === tFirst || cFirst.includes(tFirst) || tFirst.includes(cFirst))) score += 20;

                const sIn = parseYMD(c.checkIn);
                const sOut = parseYMD(c.checkOut);
                if (sOut === cIn || sIn === cOut) score += 30;

                const cRooms = getRooms(current);
                const tRooms = getRooms(c);
                if (cRooms.some(r => tRooms.includes(r))) score += 15;

                if (current.linkedId && c.linkedId && current.linkedId === c.linkedId) score += 50;

                return { c, score };
            });

            scoredCandidates.sort((a, b) => b.score - a.score);

            let html = '<option value="">-- SELECT BOOKING TO ABSORB --</option>';
            scoredCandidates.forEach((item, index) => {
                const s = item.c;
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
                const dates = `${s.checkIn?.substr(5) || '??'} → ${s.checkOut?.substr(5) || '??'}`;
                const rNames = getRooms(s).filter(Boolean).join(',') || s.room || 'No Room';
                const starBadge = (index === 0 && item.score >= 40) ? '⭐ ' : '';
                html += `<option value="${s.id}" ${index === 0 && item.score >= 40 ? 'selected' : ''}>${starBadge}${name} (${dates} | ${rNames}) [${s.status.toUpperCase()}]</option>`;
            });
            targetSelect.innerHTML = html;
        }

        const modal = $('merge-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        if (window.lucide) window.lucide.createIcons();
    };

    window.confirmMerge = async () => {
        const currentId = $('guest-id')?.value;
        const targetId = $('merge-target')?.value;
        if (!currentId || !targetId) return window.showAlert("Please select a booking to merge.");

        const staff = getStaff();
        const currentDoc = staff.find(s => s.id === currentId);
        const targetDoc = staff.find(s => s.id === targetId);

        if (!currentDoc || !targetDoc) return window.showAlert("Booking record not found.");

        const btn = $('merge-confirm-btn');
        if (btn) btn.innerText = "Merging...";

        try {
            const db = getDb();
            const appId = getAppId();
            const { doc, setDoc, deleteDoc } = getFs();

            // Combined Payments and Charges
            const combinedPayments = [...(currentDoc.payments || []), ...(targetDoc.payments || [])];
            const combinedCharges = [...(currentDoc.extraCharges || []), ...(targetDoc.extraCharges || [])];

            const newTotal = Number(((Number(currentDoc.totalPrice) || 0) + (Number(targetDoc.totalPrice) || 0)).toFixed(2));
            const newNet = Number(((Number(currentDoc.netPrice) || 0) + (Number(targetDoc.netPrice) || 0)).toFixed(2));

            // Expanded Date Boundaries
            const newIn = currentDoc.checkIn < targetDoc.checkIn ? currentDoc.checkIn : targetDoc.checkIn;
            const newOut = currentDoc.checkOut > targetDoc.checkOut ? currentDoc.checkOut : targetDoc.checkOut;

            // Combined Rooms
            const combinedRooms = Array.from(new Set([...getRooms(currentDoc), ...getRooms(targetDoc)].filter(Boolean)));

            const todayStr = new Date().toLocaleDateString('en-GB');
            const mergeNote = `\n\n[MERGED ON ${todayStr} - ABSORBED ID: ${targetDoc.id} (${targetDoc.bookId || 'DIRECT'})]\nDates: ${targetDoc.checkIn} to ${targetDoc.checkOut} | Rooms: ${getRooms(targetDoc).join(',') || 'None'}\n` + (targetDoc.notes || '');

            const updatedNotes = ((currentDoc.notes || '') + mergeNote).trim();

            const userEmail = window.currentUserEmail || 'admin';
            const now = new Date().toISOString();

            const updatedCurrent = {
                ...currentDoc,
                checkIn: newIn,
                checkOut: newOut,
                rooms: combinedRooms,
                room: combinedRooms[0] || "",
                totalPrice: newTotal,
                netPrice: newNet,
                payments: combinedPayments,
                extraCharges: combinedCharges,
                notes: updatedNotes,
                lastEditedAt: now,
                lastEditedBy: userEmail
            };

            // 1. Update Current Document in Firestore
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', currentId), updatedCurrent, { merge: true });

            // 2. Delete Absorbed Document
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', targetId));

            if (window.closeModal) window.closeModal('merge-modal');

            // 3. Refresh Form with merged data
            window.populateStaffForm(updatedCurrent);

            if (window.showAlert) {
                window.showAlert(`Bookings Merged Successfully!\n\nAbsorbed ${targetDoc.firstName} ${targetDoc.lastName}.\nStay dates: ${newIn} → ${newOut}\nTotal: ฿${newTotal}`);
            }
        } catch (err) {
            console.error("Merge Error:", err);
            window.showAlert("Merge failed: " + err.message);
        } finally {
            if (btn) btn.innerText = "Merge";
            if (window.lucide) window.lucide.createIcons();
        }
    };

    window.resetGuestForm = () => {
        const gForm = $('guest-form');
        if (gForm) gForm.reset();
        const gId = $('guest-id');
        if (gId) gId.value = '';
    };

    window.closeModal = id => {
        const m = $(id);
        if (m) {
            m.classList.remove('active');
            m.style.display = 'none';
        }
    };
})();
