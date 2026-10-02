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
            : `flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border text-center ${classes[state]}`;
    };

    window.setMulti = setMulti;

    window.cycleMulti = (el, labels, classes) => {
        if (!el) return;
        const curState = parseInt(el.dataset.state || 0);
        const nextState = (curState + 1) % labels.length;
        setMulti(el.id, nextState, labels, classes);
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
        const staffList = getStaff();
        const s = staffList.find(x => x.id === id);
        const name = s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'this booking';

        window.showAlert(`Permanently delete booking for ${name.toUpperCase()}?\n\nThis cannot be undone.`, true, async () => {
            const delBtn = $('delete-btn');
            if (delBtn) { delBtn.disabled = true; delBtn.innerHTML = '...'; }

            const db = getDb();
            const appId = getAppId();
            const { doc, deleteDoc } = getFs();

            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
                if (window.triggerAutoSync && s) {
                    window.triggerAutoSync(s.checkIn, s.checkOut);
                }
                window.closeGuestModal();
            } catch (e) {
                console.error("Delete Error", e);
                window.showAlert("Delete failed: " + e.message);
            } finally {
                if (delBtn) { delBtn.disabled = false; delBtn.innerHTML = '<i data-lucide="trash-2" size="14"></i>'; if (window.lucide) window.lucide.createIcons(); }
            }
        });
    };

    window.requestDuplicate = () => {
        const id = $('guest-id')?.value;
        if (!id) return;
        const staffList = getStaff();
        const s = staffList.find(x => x.id === id);
        if (!s) return;

        const clone = JSON.parse(JSON.stringify(s));
        delete clone.id;
        clone.bookId = "";
        clone.payments = [];
        clone.extraCharges = [];
        clone.status = "future";
        clone.notes = `[DUPLICATE of booking ${s.bookId || s.id}]\n${clone.notes || ''}`.trim();

        window.populateStaffForm(clone);
        const gId = $('guest-id');
        if (gId) gId.value = '';
        window.showAlert("Booking cloned as NEW record.\n\nAdjust dates/room as needed and click Save.");
    };

    window.requestSplit = () => {
        const currentId = $('guest-id')?.value;
        if (!currentId) return window.showAlert("Please save this booking first before splitting.");

        const s = getStaff().find(x => x.id === currentId);
        if (!s || !s.checkIn || !s.checkOut) return window.showAlert("Missing check-in or check-out dates.");

        const parseFn = window.parseYMD || (str => Date.parse(str));
        const diffDays = Math.round((parseFn(s.checkOut) - parseFn(s.checkIn)) / 86400000);
        if (diffDays <= 1) return window.showAlert("Cannot split a 1-night stay.");

        const splitInput = $('split-date');
        if (splitInput) {
            const d = new Date(s.checkIn + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() + 1);
            splitInput.value = d.toISOString().split('T')[0];
            splitInput.min = s.checkIn;
            splitInput.max = s.checkOut;
        }

        const container = $('split-room-dropdown-container');
        if (container) {
            let opts = '<option value="">-- KEEP CURRENT ROOM --</option>';
            getHotelRooms().forEach(r => {
                opts += `<option value="${r.id}">${r.id} (${r.type})</option>`;
            });
            container.innerHTML = `<label class="field-label mb-1 text-left">New Room for Split Segment</label><select id="split-new-room" class="input-base !text-sm cursor-pointer">${opts}</select>`;
        }

        const modal = $('split-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    };

    window.confirmSplit = async () => {
        const currentId = $('guest-id')?.value;
        const splitDate = $('split-date')?.value;
        if (!currentId || !splitDate) return;

        const staffList = getStaff();
        const orig = staffList.find(x => x.id === currentId);
        if (!orig) return;

        if (splitDate <= orig.checkIn || splitDate >= orig.checkOut) {
            return window.showAlert("Split date must be strictly between Check-in and Check-out.");
        }

        const newRoomVal = $('split-new-room')?.value;
        const assignedNewRooms = newRoomVal ? [newRoomVal] : (orig.rooms || [orig.room]);

        const splitConfirmBtn = document.querySelector('#split-modal button.bg-orange-600');
        if (splitConfirmBtn) { splitConfirmBtn.disabled = true; splitConfirmBtn.innerText = "Splitting..."; }

        const db = getDb();
        const appId = getAppId();
        const { collection, doc, updateDoc, setDoc } = getFs();

        try {
            const origRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', currentId);
            const linkCode = orig.linkedId || Math.random().toString(36).substr(2, 6).toUpperCase();

            // 1. Shorten original booking segment
            await updateDoc(origRef, {
                checkOut: splitDate,
                linkedId: linkCode,
                notes: (`[SPLIT SEGMENT 1] Linked: ${linkCode}\n` + (orig.notes || '')).trim()
            });

            // 2. Create second segment with $0 due (absorbed into parent)
            const newDocRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
            const newSegment = {
                ...orig,
                id: newDocRef.id,
                checkIn: splitDate,
                checkOut: orig.checkOut,
                room: assignedNewRooms[0] || "",
                rooms: assignedNewRooms,
                totalPrice: 0,
                netPrice: 0,
                payments: [],
                extraCharges: [],
                linkedId: linkCode,
                notes: (`[SPLIT SEGMENT 2] Moved from ${orig.checkIn}. Linked: ${linkCode}\n` + (orig.notes || '')).trim(),
                createdAt: new Date().toISOString(),
                auditLog: [{ ts: new Date().toISOString(), user: window.currentUserEmail || 'admin', msg: `Created split segment from ${currentId}` }]
            };

            await setDoc(newDocRef, newSegment);

            if (window.closeModal) window.closeModal('split-modal');
            window.closeGuestModal();
            window.showAlert(`Stay split successfully!\n\nSegment 1: ${orig.checkIn} → ${splitDate}\nSegment 2: ${splitDate} → ${orig.checkOut}\nLink Code: ${linkCode}`);
        } catch (e) {
            console.error("Split Error", e);
            window.showAlert("Split failed: " + e.message);
        } finally {
            if (splitConfirmBtn) { splitConfirmBtn.disabled = false; splitConfirmBtn.innerText = "Split"; }
        }
    };

    window.requestMerge = () => {
        const currentId = $('guest-id')?.value;
        if (!currentId) return window.showAlert("Please save this booking first before merging.");

        const targetSelect = $('merge-target');
        if (!targetSelect) return;

        const staffList = getStaff();
        const curBooking = staffList.find(x => x.id === currentId);
        if (!curBooking) return;

        const parseFn = window.parseYMD || (str => Date.parse(str));
        const cInMs = parseFn(curBooking.checkIn);
        const cOutMs = parseFn(curBooking.checkOut);
        const curProp = getPropId();

        const curFirst = (curBooking.firstName || '').trim().toUpperCase();
        const curLast = (curBooking.lastName || '').trim().toUpperCase();
        const curRooms = (curBooking.rooms || [curBooking.room]).filter(Boolean).map(r => r.toUpperCase());

        // 1. FILTER CANDIDATES: Only bookings immediately preceding, following, or overlapping
        const candidates = staffList.filter(s => {
            if (s.id === currentId || s.status === 'cancelled' || s.status === 'noshow') return false;
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            if (!s.checkIn || !s.checkOut) return false;

            const sInMs = parseFn(s.checkIn);
            const sOutMs = parseFn(s.checkOut);

            // Preceding: checkout within +/- 2 days of current check-in
            const isPreceding = Math.abs(sOutMs - cInMs) <= 86400000 * 2;
            // Following: checkin within +/- 2 days of current check-out
            const isFollowing = Math.abs(sInMs - cOutMs) <= 86400000 * 2;
            // Overlapping stay dates
            const isOverlapping = sInMs < cOutMs && cInMs < sOutMs;

            return isPreceding || isFollowing || isOverlapping;
        });

        if (candidates.length === 0) {
            targetSelect.innerHTML = '<option value="">-- NO ADJACENT BOOKINGS FOUND (PRECEDING/FOLLOWING) --</option>';
            const modal = $('merge-modal');
            if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
            return;
        }

        // 2. SCORE CANDIDATES FOR LOGICAL MATCHING
        const scoredCandidates = candidates.map(s => {
            let score = 0;
            const sFirst = (s.firstName || '').trim().toUpperCase();
            const sLast = (s.lastName || '').trim().toUpperCase();
            const sRooms = (s.rooms || [s.room]).filter(Boolean).map(r => r.toUpperCase());
            const sInMs = parseFn(s.checkIn);
            const sOutMs = parseFn(s.checkOut);

            let reasons = [];

            // Matching Name
            if (curLast && sLast && curLast === sLast) { score += 50; reasons.push("Same Last Name"); }
            if (curFirst && sFirst && (curFirst.includes(sFirst) || sFirst.includes(curFirst))) { score += 30; reasons.push("Same First Name"); }

            // Contiguous / Back-to-Back dates
            if (s.checkOut === curBooking.checkIn) { score += 45; reasons.push("Checked out on arrival date"); }
            else if (s.checkIn === curBooking.checkOut) { score += 45; reasons.push("Checks in on departure date"); }

            // Matching Room
            if (sRooms.some(r => curRooms.includes(r))) { score += 20; reasons.push("Same Room"); }

            // Shared Link Code
            if (s.linkedId && curBooking.linkedId && s.linkedId === curBooking.linkedId) { score += 60; reasons.push("Shared Link Code"); }

            return { s, score, reasonText: reasons.join(', ') };
        });

        scoredCandidates.sort((a, b) => b.score - a.score || a.s.checkIn.localeCompare(b.s.checkIn));

        // 3. POPULATE DROPDOWN WITH BADGES
        targetSelect.innerHTML = '<option value="">-- SELECT BOOKING TO ABSORB --</option>';
        scoredCandidates.forEach((item, idx) => {
            const { s, score, reasonText } = item;
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
            const roomStr = (s.rooms || [s.room]).filter(Boolean).join(',') || 'Unassigned';
            const isBest = idx === 0 && score > 0;
            const badge = isBest ? '⭐ [BEST MATCH]' : (score >= 40 ? '✓ [LOGICAL]' : '');
            const reasonTag = reasonText ? ` (${reasonText})` : '';

            targetSelect.innerHTML += `<option value="${s.id}" ${isBest ? 'selected' : ''}>${badge} [${roomStr}] ${name} (${s.checkIn} to ${s.checkOut}) - ฿${s.totalPrice || 0}${reasonTag}</option>`;
        });

        const modal = $('merge-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    };

    window.confirmMerge = async () => {
        const currentId = $('guest-id')?.value;
        const targetId = $('merge-target')?.value;
        if (!targetId || !currentId) return window.showAlert("Please select a booking to absorb.");

        const staffList = getStaff();
        const sourceDoc = staffList.find(s => s.id === currentId);
        const targetDoc = staffList.find(s => s.id === targetId);
        if (!sourceDoc || !targetDoc) return;

        const mergeBtn = $('merge-confirm-btn');
        if (mergeBtn) { mergeBtn.innerText = "Merging..."; mergeBtn.disabled = true; }

        const db = getDb();
        const appId = getAppId();
        const { doc, updateDoc, deleteDoc } = getFs();

        try {
            const curRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', currentId);
            const targetRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', targetId);

            // Consolidate financials and notes
            const combinedPayments = [...(sourceDoc.payments || []), ...(targetDoc.payments || [])];
            const combinedCharges = [...(sourceDoc.extraCharges || []), ...(targetDoc.extraCharges || [])];
            const newTotal = (Number(sourceDoc.totalPrice) || 0) + (Number(targetDoc.totalPrice) || 0);
            const newNet = (Number(sourceDoc.netPrice) || 0) + (Number(targetDoc.netPrice) || 0);

            const mergeNote = `\n[MERGED BOOKING ${targetDoc.bookId || targetId}] ${targetDoc.firstName || ''} ${targetDoc.lastName || ''} (${targetDoc.checkIn} to ${targetDoc.checkOut})\n` + (targetDoc.notes || '');

            await updateDoc(curRef, {
                totalPrice: newTotal,
                netPrice: newNet,
                payments: combinedPayments,
                extraCharges: combinedCharges,
                notes: ((sourceDoc.notes || '') + '\n' + mergeNote).trim()
            });

            await deleteDoc(targetRef);

            if (window.closeModal) window.closeModal('merge-modal');
            window.closeGuestModal();
            window.showAlert(`Booking merged successfully!\n\nAbsorbed ${targetDoc.firstName || ''} ${targetDoc.lastName || ''} into this booking.\nNew Total: ฿${newTotal}`);
        } catch (e) {
            console.error("Merge Error", e);
            window.showAlert("Merge failed: " + e.message);
        } finally {
            if (mergeBtn) { mergeBtn.innerText = "Merge"; mergeBtn.disabled = false; }
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
            const curLinked = $('link-code')?.value.trim().toUpperCase() || '';

            // Duplicate Verification: Permits contiguous split segments with non-overlapping dates or shared link codes
            if (bId) {
                const dupe = getStaff().find(s => {
                    const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                    const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                    if (sProp !== curProp || s.bookId !== bId || s.id === id || !isOcc) return false;

                    // Allow contiguous or linked split segments
                    if ((curLinked && s.linkedId && curLinked === s.linkedId) || (s.checkOut <= cI || s.checkIn >= cO)) {
                        return false;
                    }
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
                linkedId: curLinked,
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
