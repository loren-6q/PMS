// ==========================================================================
// PMS BOOKING & RESERVATION LIFECYCLE CONTROLLER (pms-booking.js)
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
    const getPropId = () => (window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId) || 'swims_resort';
    const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));
    const parseYMD = str => window.parseYMD ? window.parseYMD(str) : Date.parse(str);
    const getLocalYMD = d => window.getLocalYMD ? window.getLocalYMD(d) : new Date(d).toISOString().split('T')[0];

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
        const sU = parseYMD(checkInStr), eU = parseYMD(checkOutStr);
        if (!sU || !eU) return occ;
        const curProp = getPropId();
        getStaff().forEach(s => {
            if (s.id === excludeBookingId || s.property !== curProp) return;
            if (['cancelled', 'noshow', 'unconfirmed', 'charged'].includes(s.status)) return;
            if (sU < parseYMD(s.checkOut) && parseYMD(s.checkIn) < eU) {
                getRooms(s).forEach(r => { if (r) occ.add(r); });
            }
        });
        return occ;
    };

    window.updateAvailableRooms = () => {
        const cI = $('check-in')?.value, cO = $('check-out')?.value, cId = $('guest-id')?.value;
        if (!cI || !cO) return;
        const occ = getOccupiedRooms(cI, cO, cId);
        $$('.assigned-room-select').forEach(sel => {
            const cur = sel.value;
            Array.from(sel.options).forEach(opt => {
                if (!opt.value) return;
                if (occ.has(opt.value)) {
                    opt.disabled = true;
                    opt.text = opt.text.replace(' (OCCUPIED)', '') + ' (OCCUPIED)';
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
        const assignedNow = Array.from($$('.assigned-room-select') || []).map(s => s.value).filter(Boolean);
        const assignedSet = new Set(assignedNow);
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

        let freeInType = hotelRooms.filter(r => r.type === targetType && !occ.has(r.id) && !assignedSet.has(r.id));
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

        if (val === undefined || val === null || (val === "" && c.children.length > 0)) {
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
        try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) {}
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
        const pCode = ((window.PROP_REVERSE_MAP && window.PROP_REVERSE_MAP[curProp]) || curProp.substring(0, 2)).toUpperCase();
        const directBookings = getStaff().filter(s => s.property === curProp && s.bookId && s.bookId.startsWith(pCode)).sort((a, b) => {
            const numA = parseInt(a.bookId.replace(pCode, '')) || 0;
            const numB = parseInt(b.bookId.replace(pCode, '')) || 0;
            return numB - numA;
        });
        let nextNum = 1;
        if (directBookings.length > 0) {
            nextNum = (parseInt(directBookings[0].bookId.replace(pCode, '')) || 0) + 1;
        }
        if ($('booking-id')) $('booking-id').value = `${pCode}${String(nextNum).padStart(5, '0')}`;
        if ($('booking-date')) $('booking-date').value = getLocalYMD(new Date());
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
            if (bId) {
                const dupe = getStaff().find(s => s.property === curProp && s.bookId === bId && s.id !== id && s.status !== 'cancelled' && s.status !== 'noshow');
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

            if (!['unconfirmed', 'cancelled', 'noshow', 'charged'].includes(stat)) {
                const occupiedNow = getOccupiedRooms(cI, cO, id);
                for (let r of rL) {
                    if (occupiedNow.has(r)) {
                        const conflictBooking = getStaff().find(s => s.id !== id && s.property === curProp && !['cancelled', 'noshow', 'unconfirmed', 'charged'].includes(s.status) && parseYMD(cI) < parseYMD(s.checkOut) && parseYMD(cI) < parseYMD(cO) && getRooms(s).includes(r));
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
        if (window.currentUserRole === 'staff') return;
        const cIn = $('check-in')?.value, cOut = $('check-out')?.value;
        const rL = Array.from($$('.assigned-room-select') || []).map(sel => sel.value).filter(Boolean);
        const hotelRooms = getHotelRooms();
        const delTypes = Array.from(new Set([
            ...rL.map(rId => {
                const hr = hotelRooms.find(hr => hr.id === rId);
                return hr ? hr.type : null;
            }).filter(Boolean),
            $('booked-type')?.value
        ])).filter(Boolean);

        window.showAlert(`Permanently delete this record?`, true, async () => {
            try {
                const db = getDb();
                const appId = getAppId();
                const { doc, deleteDoc } = getFs();
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', $('guest-id').value));
                if (window.triggerAutoSync) window.triggerAutoSync(cIn, cOut, delTypes);
                window.closeGuestModal();
            } catch (e) {
                window.showAlert("Delete blocked by Firebase Rules.");
            }
        });
    };

    window.requestDuplicate = async () => {
        if (window.currentUserRole === 'staff') return;
        try {
            const s = getStaff().find(x => x.id === $('guest-id')?.value);
            if (!s) return;
            const db = getDb();
            const appId = getAppId();
            const { doc, setDoc } = getFs();
            const lC = $('link-code')?.value.trim().toUpperCase() || s.linkedId || Math.random().toString(36).substr(2, 4).toUpperCase();

            if (!s.linkedId) {
                const dbR = (s.rooms || []).map(window.uiToDbRoom || (r => r));
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', s.id), { ...s, room: dbR[0] || "", rooms: dbR, linkedId: lC });
            }

            const nId = Math.random().toString(36).substr(2, 9);
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', nId), {
                ...s, id: nId, room: "", rooms: [""], linkedId: lC, payments: [], extraCharges: [], extended: false,
                createdAt: new Date().toISOString(), createdBy: window.currentUserEmail || 'admin',
                lastEditedAt: null, lastEditedBy: null, auditLog: []
            });

            if (window.triggerAutoSync) window.triggerAutoSync(s.checkIn, s.checkOut);
            window.closeGuestModal();
        } catch (e) {
            window.showAlert("Duplicate blocked by Firebase Rules.");
        }
    };

    window.requestSplit = () => {
        if (window.currentUserRole === 'staff') return;
        const s = getStaff().find(x => x.id === $('guest-id')?.value);
        if (!s) return;
        const sd = $('split-date');
        if (sd) { sd.value = ""; sd.min = s.checkIn; sd.max = s.checkOut; }
        const c = $('split-room-dropdown-container');
        if (!c) return;
        const sel = document.createElement('select');
        sel.id = 'split-room-select';
        sel.className = "input-base text-lg !p-2 cursor-pointer";
        sel.innerHTML = `<option value="">-- SELECT NEW ROOM --</option>`;

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
            opt.innerText = `${r.id} - ${r.type}`;
            og.appendChild(opt);
        });

        c.innerHTML = '';
        c.appendChild(sel);
        const m = $('split-modal');
        if (m) m.style.display = 'flex';
    };

    window.confirmSplit = async () => {
        const sD = $('split-date')?.value;
        const newRoom = $('split-room-select')?.value;
        const s = getStaff().find(x => x.id === $('guest-id')?.value);
        if (!sD || sD <= s.checkIn || sD >= s.checkOut) return window.showAlert("Invalid split date.");
        if (!newRoom) return window.showAlert("Please select a new room for the split.");

        const lC = s.linkedId || Math.random().toString(36).substr(2, 4).toUpperCase();
        const nId = Math.random().toString(36).substr(2, 9);
        const toDbRoom = window.uiToDbRoom || (r => r);
        const dbR = (s.rooms || []).map(toDbRoom);
        const nDbRoom = toDbRoom(newRoom);

        const db = getDb();
        const appId = getAppId();
        const { doc, setDoc } = getFs();

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', s.id), { ...s, room: dbR[0] || "", rooms: dbR, checkOut: sD, linkedId: lC });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', nId), {
            ...s, id: nId, checkIn: sD, room: nDbRoom, rooms: [nDbRoom], linkedId: lC, totalPrice: 0, netPrice: 0,
            payments: [], extraCharges: [], extended: false,
            notes: "Split segment for mid-stay room change. Master folio kept on original booking.\n" + (s.notes || ""),
            auditLog: []
        });

        const sm = $('split-modal');
        if (sm) sm.style.display = 'none';
        if (window.triggerAutoSync) window.triggerAutoSync(s.checkIn, s.checkOut);
        window.closeGuestModal();
    };

    window.requestMerge = () => {
        if (window.currentUserRole === 'staff') return;
        const cId = $('guest-id')?.value;
        if (!cId) return window.showAlert("Please save this booking first before merging.");
        const c = getStaff().find(x => x.id === cId);
        if (!c) return;

        const sel = $('merge-target');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- SELECT BOOKING --</option>';

        const curProp = getPropId();
        [...getStaff()].filter(s => s.property === curProp && s.id !== cId && s.status !== 'cancelled' && s.status !== 'noshow')
            .sort((a, b) => (a.lastName === c.lastName ? -1 : (b.lastName === c.lastName ? 1 : a.checkIn.localeCompare(b.checkIn))))
            .forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.innerText = `${s.lastName}, ${s.firstName} (${s.checkIn.substr(5)} to ${s.checkOut.substr(5)})`;
                if (s.lastName === c.lastName) opt.className = "text-indigo-600 font-black";
                sel.appendChild(opt);
            });

        const mm = $('merge-modal');
        if (mm) mm.style.display = 'flex';
    };

    window.confirmMerge = async () => {
        const tId = $('merge-target')?.value;
        if (!tId) return window.showAlert("Please select a booking to merge.");
        const t = getStaff().find(s => s.id === tId), c = getStaff().find(s => s.id === $('guest-id')?.value);
        if (!t || !c) return;

        const btn = $('merge-confirm-btn');
        if (btn) { btn.innerHTML = 'MERGING...'; btn.disabled = true; }

        try {
            let mNotes = ($('guest-notes')?.value || "") + `\n\n--- MERGED WITH BOOKING ${t.bookId || tId} ---\n` + (t.notes || "");
            [
                { id: 'first-name', tVal: t.firstName, lbl: 'First Name' }, { id: 'last-name', tVal: t.lastName, lbl: 'Last Name' },
                { id: 'phone', tVal: t.phone, lbl: 'Phone' }, { id: 'email', tVal: t.email, lbl: 'Email' },
                { id: 'guest-country', tVal: t.country, lbl: 'Country' }, { id: 'booked-type', tVal: t.bookedType, lbl: 'Booked Type' },
                { id: 'booking-source', tVal: t.source, lbl: 'Source' }, { id: 'booking-date', tVal: t.bookDate, lbl: 'Book Date' },
                { id: 'booking-id', tVal: t.bookId, lbl: 'Book ID' }
            ].forEach(f => {
                const el = $(f.id);
                if (!el) return;
                if (!el.value && f.tVal) el.value = f.tVal;
                else if (el.value && f.tVal && el.value.toString().trim().toLowerCase() !== f.tVal.toString().trim().toLowerCase()) mNotes += `\n[Merged ${f.lbl}]: ${f.tVal}`;
            });

            if ($('check-in')) $('check-in').value = c.checkIn < t.checkIn ? c.checkIn : t.checkIn;
            if ($('check-out')) $('check-out').value = c.checkOut > t.checkOut ? c.checkOut : t.checkOut;
            if ($('total-price')) $('total-price').value = (Number(c.totalPrice || 0) + Number(t.totalPrice || 0)).toFixed(2);
            if ($('net-price')) $('net-price').value = (Number(c.netPrice || 0) + Number(t.netPrice || 0)).toFixed(2);
            if ($('guest-notes')) $('guest-notes').value = mNotes.trim();
            if ($('pax-count')) $('pax-count').value = Math.max(c.pax || 1, t.pax || 1);

            (t.payments || []).forEach(p => window.addPaymentRow && window.addPaymentRow(p.date, Number(p.amt || 0).toFixed(2), p.method, true));

            window.activeExtraCharges = [...(c.extraCharges || []), ...(t.extraCharges || [])];
            if (window.renderExtraCharges) window.renderExtraCharges();

            const cR = Array.from(new Set([...Array.from($$('.assigned-room-select') || []).map(sel => sel.value).filter(Boolean), ...getRooms(t).filter(Boolean)]));
            if ($('assigned-rooms-container')) {
                $('assigned-rooms-container').innerHTML = '';
                if (cR.length > 0) cR.forEach(r => window.addRoomSelect(r));
                else window.addRoomSelect("");
            }

            setMulti('ext-btn', 1, ['NOT EXTENDED', 'EXTENDED'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);

            if (window.calcFinancials) window.calcFinancials();
            if (window.updateAvailableRooms) window.updateAvailableRooms();
            if (window.updateNightsDisplay) window.updateNightsDisplay();

            const db = getDb();
            const appId = getAppId();
            const { doc, deleteDoc } = getFs();

            window.staff = getStaff().filter(s => s.id !== t.id);
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', t.id));

            const mm = $('merge-modal');
            if (mm) mm.style.display = 'none';
            await window.saveBooking(true);

            const mergeTypes = [c.bookedType, t.bookedType].filter(Boolean);
            if (window.triggerAutoSync) window.triggerAutoSync(c.checkIn, c.checkOut, mergeTypes);
        } catch (err) {
            window.showAlert("Merge error, please check connection.");
        } finally {
            if (btn) { btn.innerHTML = 'Merge'; btn.disabled = false; }
        }
    };

    window.openEmailParserModal = () => {
        const ta = $('email-textarea');
        if (ta) ta.value = '';
        const em = $('email-modal');
        if (em) {
            em.style.display = 'flex';
            setTimeout(() => ta?.focus(), 50);
        }
    };

    window.parseEmail = () => {
        const raw = $('email-textarea')?.value.trim();
        if (!raw) return window.showAlert("Please paste booking text first.");

        if (typeof window.extractBookingData !== 'function') {
            return window.showAlert("Parser Library Not Loaded:\n\nCould not access window.extractBookingData. Ensure parser.js is reachable.");
        }

        try {
            const { s, summary } = window.extractBookingData(raw);
            const curProp = getPropId();

            if (s.bookId) {
                const dupe = getStaff().find(x => x.property === curProp && x.bookId === s.bookId && x.status !== 'cancelled' && x.status !== 'noshow');
                if (dupe) {
                    if (window.closeModal) window.closeModal('email-modal');
                    window.showAlert(`Duplicate Found:\nBooking ID ${s.bookId} already exists in the system!\n\nOpening original record now...`);
                    setTimeout(() => { if (window.closeAlert) window.closeAlert(); window.editStaff(dupe.id); }, 2500);
                    return;
                }
            } else if (s.firstName && s.lastName && s.checkIn) {
                const nameDupe = getStaff().find(x => x.property === curProp && x.firstName === s.firstName && x.lastName === s.lastName && x.checkIn === s.checkIn && x.status !== 'cancelled' && x.status !== 'noshow');
                if (nameDupe) {
                    if (window.closeModal) window.closeModal('email-modal');
                    window.showAlert(`Duplicate Found:\n${s.firstName} ${s.lastName} arriving on ${s.checkIn} already exists in the system!\n\nOpening original record now...`);
                    setTimeout(() => { if (window.closeAlert) window.closeAlert(); window.editStaff(nameDupe.id); }, 2500);
                    return;
                }
            }

            if (s.bookedType) {
                const resolved = window.resolvePmsRoomType(s.bookedType);
                if (resolved) s.bookedType = resolved;
            }

            if (s.bookedType && s.checkIn && s.checkOut && (!s.rooms || s.rooms.length === 0 || !s.rooms[0])) {
                const occ = getOccupiedRooms(s.checkIn, s.checkOut);
                let unitsNeeded = s.units || 1;
                s.autoRooms = [];
                const hotelRooms = getHotelRooms();
                const availableBeds = hotelRooms.filter(r => r.type === s.bookedType && !occ.has(r.id));
                for (let i = 0; i < Math.min(unitsNeeded, availableBeds.length); i++) {
                    s.autoRooms.push(availableBeds[i].id);
                    occ.add(availableBeds[i].id);
                }

                if (s.autoRooms.length > 0) {
                    s.room = s.autoRooms[0];
                    s.rooms = [...s.autoRooms];
                } else {
                    s.room = "";
                    s.rooms = [];
                }
            }

            s.notes = summary;
            window.populateStaffForm(s);
            if (window.closeModal) window.closeModal('email-modal');

            if (s.checkIn) {
                const d = new Date(s.checkIn + "T12:00:00Z");
                d.setDate(d.getDate() - 3);
                window.viewStart = d;
                if (window.render) window.render();
            }
        } catch (err) {
            console.error("Booking Import Exception:", err);
            window.showAlert("Failed to parse booking:\n\n" + (err.message || "Unknown format error"));
        }
    };

    window.parseBdcPublicRates = async () => {
        const txt = $('rates-textarea')?.value;
        if (!txt) return window.showAlert("Please paste BDC search results text into the box first.");
        const newRates = {};
        const mapping = {
            'Bed in 4-Bed Mixed Dormitory Room': ['Standard Quad Dorm'],
            'King Room with Balcony': ['Gardenview King Room'],
            'Twin Room with Balcony': ['Gardenview Twin Room'],
            'Deluxe Double Room with Side Sea View': ['Partial Oceanview King Room'],
            'Deluxe Double Room with Balcony and Sea View': ['Oceanview King Room'],
            'Deluxe Twin Room with Sea View': ['Oceanview Twin Room'],
            'Standard Triple Room': ['Partial Oceanview Triple (King+Twin)', 'Partial Oceanview Triple (Bunk+Twin)'],
            'Bungalow': ['BUNGALOWS']
        };

        for (let bdcName in mapping) {
            let idx = txt.indexOf(bdcName);
            if (idx > -1) {
                let chunk = txt.substring(idx, idx + 800);
                let prices = [];
                let reg = /(?:THB|฿)\s*([\d,.]+)/gi;
                let match;
                while ((match = reg.exec(chunk)) !== null) {
                    let pVal = parseFloat(match[1].replace(/,/g, ''));
                    if (pVal > 10 && pVal < 50000) prices.push(pVal);
                }
                if (prices.length > 0) {
                    let lowPrice = Math.min(...prices);
                    mapping[bdcName].forEach(targetName => { newRates[targetName] = lowPrice; });
                }
            }
        }

        if (Object.keys(newRates).length > 0) {
            window.dailyRates = newRates;
            try {
                const db = getDb();
                const appId = getAppId();
                const { doc, setDoc } = getFs();
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'daily_rates', 'current'), {
                    rates: newRates,
                    updated: new Date().toISOString()
                });
                if ($('rates-textarea')) $('rates-textarea').value = '';
                if ($('dashboard-view')?.style.display === 'flex' && window.renderDashboard) window.renderDashboard();
                window.showAlert(`Successfully extracted and saved lowest rates for ${Object.keys(newRates).length} room categories!`);
            } catch (e) {
                window.showAlert("Failed to save rates.");
            }
        } else {
            window.showAlert("No matching rates found in the text.");
        }
    };
})();
