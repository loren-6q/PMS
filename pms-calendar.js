// ==========================================================================
// pms-calendar.js - PMS Calendar Timeline & Grid Engine
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    const $ = id => document.getElementById(id);
    const $$ = s => document.querySelectorAll(s);

    const mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    window.SVGS = window.SVGS || {
        upFree: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M12 2L4 12h5v10h6V12h5z" fill="#facc15" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        upPaid: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M12 2L4 12h5v10h6V12h5z" fill="#4ade80" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        ext: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M4 12h12v-5l8 8-8 8v-5H4z" fill="#3b82f6" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        link: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        mailConf: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#fff" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        mailNotFmp: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#334155" stroke-width="2"/></svg>`,
        mailPre: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#f87171" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        mailPreConf: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#4ade80" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        mailSpec: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#facc15" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        fbGood: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M3 12l5 5L21 4" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12l5 5L21 4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`,
        fbBad: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`
    };

    window.STATUS_CYCLE = window.STATUS_CYCLE || [
        { val: 'new', bg: '#ec4899', txt: '#fff' },
        { val: 'future', bg: '#7fc6f5', txt: '#1e293b' },
        { val: 'here', bg: '#dcfce7', txt: '#14532d' },
        { val: 'left', bg: '#aba39d', txt: '#1e293b' },
        { val: 'cancelled', bg: '#e5e7eb', txt: '#1e293b' },
        { val: 'noshow', bg: '#e5e7eb', txt: '#1e293b' },
        { val: 'special', bg: '#fef08a', txt: '#1e293b' },
        { val: 'blocked', bg: '#475569', txt: '#fff' },
        { val: 'charged', bg: '#0f172a', txt: '#fbbf24' },
        { val: 'vol', bg: '#fbcfe8', txt: '#831843' },
        { val: 'unconfirmed', bg: '#f3e8ff', txt: '#581c87' }
    ];

    window.masterState = 0;

    const getStaff = () => window.staff || (window.getStaff ? window.getStaff() : []);
    const getHotelRooms = () => window.hotelRooms || (window.getHotelRooms ? window.getHotelRooms() : []);
    const getPropId = () => {
        const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
        return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
    };
    const getFmpDates = () => window.fmpDates || [];
    const getSearchTerm = () => (window.getSearchTerm ? window.getSearchTerm() : window.searchTerm) || "";
    const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

    // Zero-drift UTC-noon parser
    window.parseYMD = str => {
        if (!str) return 0;
        const clean = String(str).split('T')[0].trim();
        const parts = clean.split('-').map(Number);
        if (parts.length < 3 || isNaN(parts[0])) return 0;
        return Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    };

    window.getLocalYMD = d => {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };

    const getDayIndex = str => {
        const t = window.parseYMD(str);
        if (!t) return -1;
        const vS = window.viewStart || new Date();
        const vSTime = Date.UTC(vS.getFullYear(), vS.getMonth(), vS.getDate(), 12, 0, 0);
        return Math.round((t - vSTime) / 86400000);
    };

    window.prevPeriod = () => {
        if (!window.viewStart) window.viewStart = new Date();
        window.viewStart.setDate(window.viewStart.getDate() - 7);
        window.render();
    };

    window.nextPeriod = () => {
        if (!window.viewStart) window.viewStart = new Date();
        window.viewStart.setDate(window.viewStart.getDate() + 7);
        window.render();
    };

    window.goToday = () => {
        const d = new Date();
        d.setDate(d.getDate() - 3);
        d.setHours(12, 0, 0, 0);
        window.viewStart = d;
        window.render();
    };

    window.jumpToMonth = val => {
        if (val) {
            const [y, m] = val.split('-');
            window.viewStart = new Date(y, m - 1, 1, 12, 0, 0);
            window.render();
        }
    };

    window.toggleZoom = () => {
        window.isZoomWide = !window.isZoomWide;
        const c = $('calendar-view');
        if (c) {
            if (window.isZoomWide) c.classList.add('zoom-wide-mode');
            else c.classList.remove('zoom-wide-mode');
        }
    };

    window.handleSearch = v => {
        window.searchTerm = v.trim().toUpperCase();
        window.searchMatchIndex = 0;
        const jb = $('search-jump-btn'), mc = $('match-counter');
        const stList = getStaff();
        const term = window.searchTerm;
        const curProp = getPropId();

        const dbNameInput = $('db-filter-name');
        if (dbNameInput && dbNameInput.value !== v) dbNameInput.value = v;

        const m = stList.filter(s => {
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            return ((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(term) || (s.bookId || '').toUpperCase().includes(term);
        });
        if (term && m.length > 0) {
            jb?.classList.replace('hidden', 'flex');
            if (mc) mc.innerText = `Match ${window.searchMatchIndex + 1} of ${m.length}`;
        } else {
            jb?.classList.replace('flex', 'hidden');
        }
        if ($('calendar-view')?.style.display !== 'none') window.render();
        if ($('database-view')?.style.display !== 'none' && window.renderDatabase) window.renderDatabase();
    };

    window.clearSearch = () => {
        const input = $('guest-search');
        if (input) input.value = "";
        const dbNameInput = $('db-filter-name');
        if (dbNameInput) dbNameInput.value = "";
        window.handleSearch("");
    };

    window.toggleSearchMode = () => {
        const c = $('search-container');
        if (!c) return;
        if (c.classList.contains('hidden')) {
            c.classList.replace('hidden', 'flex');
            setTimeout(() => $('guest-search')?.focus(), 50);
        } else {
            c.classList.replace('flex', 'hidden');
        }
    };

    window.clearSearchAndClose = () => {
        window.clearSearch();
        if (window.innerWidth < 640) $('search-container')?.classList.replace('flex', 'hidden');
    };

    window.jumpToSearchMatch = () => {
        const stList = getStaff();
        const term = window.searchTerm;
        const curProp = getPropId();
        const m = stList.filter(s => {
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            return ((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(term) || (s.bookId || '').toUpperCase().includes(term);
        }).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

        if (m.length > 0) {
            const idx = (window.searchMatchIndex || 0) % m.length;
            const targetBooking = m[idx];
            if (targetBooking.checkIn) {
                const parts = targetBooking.checkIn.split('-');
                const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
                d.setDate(d.getDate() - 3);
                window.viewStart = d;
            }
            window.searchMatchIndex = idx + 1;
            const mc = $('match-counter');
            if (mc) mc.innerText = `Match ${idx + 1} of ${m.length}`;
            window.render();
        }
    };

    window.toggleAllGroups = () => {
        window.masterState = ((window.masterState || 0) + 1) % 4;
        const g = new Set();
        $$('.group-header').forEach(el => { if (el.dataset.group) g.add(el.dataset.group); });
        g.forEach(grp => window.toggleGroup(grp, window.masterState));
    };

    window.toggleGroup = (grp, stateIdx = -1) => {
        const h = $(`icon-${grp}`);
        const rws = $$(`.group-${grp}`);
        const sL = $(`state-${grp}`);
        const aR = $$(`.avail-row-${grp}`);
        if (!h) return;
        let cS = stateIdx;
        if (cS === -1) {
            if (grp === 'unassigned-unconfirmed') {
                cS = h.style.transform.includes('180deg') ? 0 : 3;
            } else {
                const txt = sL ? sL.innerText : 'ALL';
                cS = txt === 'ALL' ? 1 : (txt === 'OCC' ? 2 : (txt === 'EMP' ? 3 : 0));
            }
        }
        const vM = {
            0: { lbl: 'ALL', showOcc: true, showEmp: true, showAvail: false, rot: '0deg' },
            1: { lbl: 'OCC', showOcc: true, showEmp: false, showAvail: false, rot: '-90deg' },
            2: { lbl: 'EMP', showOcc: false, showEmp: true, showAvail: false, rot: '90deg' },
            3: { lbl: 'HID', showOcc: false, showEmp: false, showAvail: true, rot: '180deg' }
        };
        const s = vM[cS];
        if (sL) sL.innerText = s.lbl;
        h.style.transform = `rotate(${s.rot})`;
        if (aR) aR.forEach(r => { r.style.display = s.showAvail ? 'grid' : 'none'; });
        rws.forEach(r => {
            if (grp === 'unassigned-unconfirmed' || r.classList.contains('sub-header-row')) {
                r.style.display = (cS === 3) ? 'none' : 'grid';
                return;
            }
            const isE = r.querySelectorAll('.staff-bar').length === 0;
            r.style.display = (isE ? s.showEmp : s.showOcc) ? 'grid' : 'none';
        });
    };

    const getFloorIcon = f => {
        if (!f) return '';
        const fStr = String(f).toLowerCase().trim();
        if (fStr === '1' || fStr === 'down' || fStr === 'downstairs' || fStr === 'floor-down') {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Downstairs"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
        }
        if (fStr === '2' || fStr === 'up' || fStr === 'upstairs' || fStr === 'floor-up') {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Upstairs"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
        }
        return '';
    };

    const getBunkIcon = b => {
        if (!b) return '';
        const bStr = String(b).toLowerCase().trim();
        if (bStr === 'bottom' || bStr === 'bot' || bStr.includes('btm') || bStr.includes('bottom')) {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Bottom Bunk"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
        }
        if (bStr === 'top' || bStr.includes('top')) {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Top Bunk"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
        }
        return '';
    };

    const formatBedDisplayLabel = (rId) => {
        if (!rId) return '';
        const m = String(rId).match(/№\s*(\d+)/i);
        if (m) return `№ ${m[1]}`;
        const m2 = String(rId).match(/[A-Za-z0-9]+[_\-\s]+(\d+)$/);
        if (m2) return `№ ${m2[1].padStart(2, '0')}`;
        const m3 = String(rId).match(/^([A-Za-z]+)(\d+)$/);
        if (m3) return `№ ${m3[2].padStart(2, '0')}`;
        return rId;
    };

    const classifyRoomForCalendar = r => {
        const cat = (r.category || r.type || '').toLowerCase();
        const bunk = (r.bunk || r.bed || '').toLowerCase();
        const isPrivate = bunk.includes('private') || cat.includes('private') || r.rule === 'private' || r.isDorm === false;
        const isDorm = !isPrivate;

        let baseRoom = '';
        if (isDorm) {
            if (r.parentRoom) baseRoom = r.parentRoom;
            else if (r.id.includes('№')) baseRoom = r.id.split('№')[0].trim();
            else if (r.id.includes('-')) baseRoom = r.id.split('-')[0].trim();
            else baseRoom = r.id.replace(/\d+$/, '').trim();
        }
        return { isDorm, baseRoom };
    };

    const matchesRoom = (bookingRoom, catalogRoomId) => {
        if (!bookingRoom || !catalogRoomId) return false;
        if (bookingRoom === catalogRoomId) return true;
        const bClean = String(bookingRoom).replace(/[№#\-_:\s]/g, '').toUpperCase();
        const cClean = String(catalogRoomId).replace(/[№#\-_:\s]/g, '').toUpperCase();
        return bClean === cClean;
    };

    window.render = () => {
        if (!window.viewStart) {
            window.viewStart = new Date();
            window.viewStart.setDate(window.viewStart.getDate() - 3);
            window.viewStart.setHours(12, 0, 0, 0);
        }

        const vS = window.viewStart;
        const w = window.innerWidth;
        const dShow = w >= 1150 ? 35 : w >= 950 ? 28 : w >= 650 ? 21 : 14;
        document.documentElement.style.setProperty('--days', dShow);

        const mOpts = (() => {
            let h = '<option value="">ALL DATES</option>';
            const d = new Date(vS.getFullYear(), vS.getMonth() - 2, 1);
            for (let i = 0; i < 36; i++) {
                h += `<option value="${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}">${mNames[d.getMonth()]} ${d.getFullYear()}</option>`;
                d.setMonth(d.getMonth() + 1);
            }
            return h;
        })();

        const jm = $('jump-month-select');
        if (jm) {
            if (jm.options.length < 2) jm.innerHTML = mOpts;
            jm.value = `${vS.getFullYear()}-${String(vS.getMonth() + 1).padStart(2, '0')}`;
        }

        const mGrid = $('calendar-header-months');
        const dGrid = $('calendar-header-days');
        const body = $('timeline-body');
        if (!mGrid || !dGrid || !body) return;

        mGrid.innerHTML = `<div class="border-r border-slate-700 flex items-center justify-center h-full sticky left-0 z-[60] bg-slate-800 w-[var(--sidebar-w)]"></div>`;
        dGrid.innerHTML = `<div class="p-1 text-[12px] font-black text-slate-500 uppercase flex items-center justify-between border-r border-slate-400 bg-slate-100 h-full sticky left-0 z-[50] w-[var(--sidebar-w)]"><span>ROOM</span><div class="flex items-center gap-1"><button onclick="window.toggleAllGroups()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-sm cursor-pointer" title="Master Toggle"><i data-lucide="layers" class="!w-[13px] !h-[13px]"></i></button><button onclick="window.toggleZoom()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-sm cursor-pointer" title="Toggle Zoom"><i data-lucide="zoom-in" class="!w-[13px] !h-[13px]"></i></button></div></div>`;
        body.innerHTML = '';

        const days = Array.from({ length: dShow }, (_, i) => new Date(vS.getFullYear(), vS.getMonth(), vS.getDate() + i, 12, 0, 0));
        let cMon = -1, cSpan = 0;
        days.forEach((d, i) => {
            if (d.getMonth() !== cMon) {
                if (cMon !== -1) {
                    mGrid.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${days[i - 1].getFullYear()}</div>`;
                }
                cMon = d.getMonth();
                cSpan = 1;
            } else {
                cSpan++;
            }
            if (i === days.length - 1) {
                mGrid.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${d.getFullYear()}</div>`;
            }
        });

        const todayStr = window.getLocalYMD(new Date());
        const yD = new Date();
        yD.setDate(new Date().getDate() - 1);
        const yStr = window.getLocalYMD(yD);

        days.forEach(d => {
            const iT = window.getLocalYMD(d) === todayStr;
            dGrid.innerHTML += `<div class="flex flex-col items-center justify-center border-r border-slate-400 ${iT ? 'bg-blue-100' : ''}"><div class="text-[10px] font-black text-slate-500 uppercase leading-none">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="text-[16px] font-black ${iT ? 'text-blue-600' : 'text-slate-800'} leading-tight">${d.getDate()}</div></div>`;
        });

        const curProp = getPropId();
        let hotelRooms = [...getHotelRooms()];
        const fmpDates = getFmpDates();
        const searchTerm = getSearchTerm();

        const actStaff = getStaff().filter(s => {
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            if (s.status === 'cancelled') {
                return !!(searchTerm && (((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(searchTerm) || (s.bookId || '').toUpperCase().includes(searchTerm)));
            }
            return true;
        });

        const vsUTC = window.parseYMD(window.getLocalYMD(vS));
        const veUTC = vsUTC + dShow * 86400000;
        const tRows = [];
        const uConf = [];

        // Catch Unassigned Bookings
        actStaff.forEach(s => {
            if (['cancelled', 'noshow'].includes(s.status)) return;
            const rList = getRooms(s);
            const hasRoom = rList.length > 0 && rList.some(rName => hotelRooms.some(hr => matchesRoom(rName, hr.id)));
            if (!hasRoom && window.parseYMD(s.checkIn) <= veUTC && window.parseYMD(s.checkOut) >= vsUTC) {
                uConf.push(s);
            }
        });

        if (uConf.length > 0) {
            tRows.push({ isDivider: true, label: "UNASSIGNED / UNCONFIRMED", isUnconfirmedZone: true });
            const rows = [];
            uConf.forEach(s => {
                let placed = false;
                for (let r of rows) {
                    if (!r.some(e => window.parseYMD(s.checkIn) < window.parseYMD(e.checkOut) && window.parseYMD(e.checkIn) < window.parseYMD(s.checkOut))) {
                        r.push(s);
                        placed = true;
                        break;
                    }
                }
                if (!placed) rows.push([s]);
            });
            rows.forEach((r, idx) => tRows.push({ isUnassigned: true, label: `U-${idx + 1}`, bookings: r }));
        }

        // Visible rooms: active rooms always show, inactive rooms only if they have bookings in view
        const visibleRooms = hotelRooms.filter(r => {
            if (!r.inactive) return true;
            return actStaff.some(s => {
                if (['cancelled', 'noshow'].includes(s.status)) return false;
                const inMs = window.parseYMD(s.checkIn), outMs = window.parseYMD(s.checkOut);
                if (inMs > veUTC || outMs < vsUTC) return false;
                return getRooms(s).some(rm => matchesRoom(rm, r.id));
            });
        });

        const activeRooms = visibleRooms.filter(r => !r.inactive);
        const archivedRooms = visibleRooms.filter(r => !!r.inactive);

        // Group active rooms strictly by category so banners never duplicate
        const categoriesMap = new Map();
        activeRooms.forEach(r => {
            const cat = r.category || r.type || 'ROOMS';
            if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
            categoriesMap.get(cat).push(r);
        });

        categoriesMap.forEach((roomList, catName) => {
            tRows.push({ isDivider: true, label: catName });

            let lastBaseRoom = null;
            roomList.forEach(r => {
                const { isDorm, baseRoom } = classifyRoomForCalendar(r);

                const isAssigned = s => {
                    if (['unconfirmed', 'charged', 'noshow', 'vol'].includes(s.status)) return false;
                    return getRooms(s).some(rm => matchesRoom(rm, r.id)) && s.status !== 'cancelled' && window.parseYMD(s.checkIn) <= veUTC && window.parseYMD(s.checkOut) >= vsUTC;
                };

                if (isDorm) {
                    if (baseRoom && baseRoom !== lastBaseRoom) {
                        tRows.push({ isSubHeader: true, label: baseRoom, floor: r.floor });
                        lastBaseRoom = baseRoom;
                    }
                    tRows.push({
                        isRoom: true,
                        isBed: true,
                        id: r.id,
                        displayId: formatBedDisplayLabel(r.id),
                        type: catName,
                        bed: r.bed || r.bunk || '',
                        floor: '',
                        icon: r.icon || r.bunk || '',
                        bookings: actStaff.filter(isAssigned)
                    });
                } else {
                    lastBaseRoom = null;
                    tRows.push({
                        isRoom: true,
                        isPrivate: true,
                        id: r.id,
                        displayId: r.name || r.id,
                        type: catName,
                        bed: r.bed || r.bunk || '',
                        floor: r.floor,
                        icon: r.icon || r.bunk || '',
                        bookings: actStaff.filter(isAssigned)
                    });
                }
            });
        });

        // Archived historical rooms at bottom
        if (archivedRooms.length > 0) {
            tRows.push({ isDivider: true, label: "ARCHIVED / CLOSED ROOMS (PAST DATA)", isArchivedZone: true });
            archivedRooms.forEach(r => {
                const isAssigned = s => getRooms(s).some(rm => matchesRoom(rm, r.id)) && s.status !== 'cancelled' && window.parseYMD(s.checkIn) <= veUTC && window.parseYMD(s.checkOut) >= vsUTC;
                tRows.push({
                    isRoom: true,
                    isArchived: true,
                    id: r.id,
                    displayId: `[ARCHIVED] ${r.id}`,
                    type: r.type,
                    bed: r.bed || '',
                    floor: r.floor,
                    bookings: actStaff.filter(isAssigned)
                });
            });
        }

        // Render to DOM
        const tt = $('custom-tooltip');
        let cGrp = '';

        tRows.forEach(rD => {
            if (rD.isDivider) {
                cGrp = (rD.label || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
                const isDCol = cGrp === 'unassigned-unconfirmed';
                const hRow = document.createElement('div');
                hRow.className = `timeline-grid ${rD.isUnconfirmedZone ? 'mt-4' : ''} cursor-pointer transition-colors unselectable group-header`;
                hRow.dataset.group = cGrp;

                if (rD.isUnconfirmedZone) {
                    hRow.innerHTML = `<div class="unassigned-header bg-amber-200 hover:bg-amber-300 text-slate-800 p-0.5 text-[10px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 transition-colors shadow-md w-full" onclick="window.toggleGroup('${cGrp}')"><span>${rD.label}</span><i data-lucide="chevron-up" class="transition-transform duration-200 !w-[13px] !h-[13px]" id="icon-${cGrp}"></i></div>`;
                    body.appendChild(hRow);
                    return;
                }

                hRow.innerHTML = `<div class="bg-slate-800 hover:bg-slate-700 text-white border-t border-slate-600 p-0.5 text-[11px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 transition-colors shadow-[2px_0_4px_rgba(0,0,0,0.1)] w-full" onclick="window.toggleGroup('${cGrp}')"><span class="truncate pr-1">${rD.label}</span><div class="flex items-center gap-1 shrink-0"><span id="state-${cGrp}" class="text-[8px] bg-slate-600 px-1 rounded text-slate-300">ALL</span><i data-lucide="chevron-up" class="transition-transform duration-200 !w-[13px] !h-[13px]" id="icon-${cGrp}"></i></div></div>`;
                body.appendChild(hRow);

                const tRIds = hotelRooms.filter(hr => (hr.category || hr.type) === rD.label).map(hr => hr.id);
                const cap = tRIds.length;
                const aRow = document.createElement('div');
                aRow.className = `timeline-grid avail-row-${cGrp} h-[20px]`;
                aRow.style.display = 'none';

                let cHtml = `<div class="bg-slate-900 border-r border-slate-700 flex items-center justify-end pr-2 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)] w-[var(--sidebar-w)] text-[9px] text-slate-400 font-black uppercase tracking-widest unselectable">AVAIL &rarr;</div>`;
                for (let i = 0; i < dShow; i++) {
                    const dT = days[i].getTime();
                    const occ = new Set();
                    actStaff.forEach(s => {
                        if (['unconfirmed', 'charged', 'cancelled', 'noshow', 'vol'].includes(s.status)) return;
                        if (dT >= window.parseYMD(s.checkIn) && dT < window.parseYMD(s.checkOut)) {
                            getRooms(s).forEach(r => {
                                if (r && tRIds.some(tId => matchesRoom(r, tId))) occ.add(r);
                            });
                        }
                    });
                    const av = cap - occ.size;
                    const pct = cap > 0 ? av / cap : 0;
                    let cCls = (av === cap) ? 'bg-[#4ade80] text-black' : (pct >= 0.75) ? 'bg-black text-[#4ade80]' : (pct >= 0.5) ? 'bg-black text-white' : (pct >= 0.25) ? 'bg-[#7f1d1d] text-white' : (av > 0) ? 'bg-[#dc2626] text-white' : 'bg-[#ef4444] text-black font-black';
                    cHtml += `<div class="flex items-center justify-center border-r border-slate-800 text-[10px] font-black ${cCls}">${av}</div>`;
                }
                aRow.innerHTML = cHtml;
                body.appendChild(aRow);
                return;
            }

            if (rD.isSubHeader) {
                const sRow = document.createElement('div');
                sRow.className = `timeline-grid group-${cGrp} sub-header-row h-[22px]`;
                sRow.innerHTML = `<div class="bg-slate-200 border-y border-slate-300 flex items-center px-2 sticky left-0 z-20 shadow-sm unselectable w-full"><div class="flex items-center gap-1 sticky left-0 bg-slate-200 pr-2"><span class="text-[11px] font-black text-slate-700 uppercase tracking-widest">${rD.label}</span>${getFloorIcon(rD.floor)}</div></div>`;
                body.appendChild(sRow);
                return;
            }

            const row = document.createElement('div');
            row.className = `timeline-grid bed-row group-${cGrp}`;
            if (cGrp === 'unassigned-unconfirmed') {
                row.style.display = window.isUnassignedTrayOpen ? 'grid' : 'none';
            }

            let hHtml = '';
            if (rD.isUnassigned) {
                hHtml = `<span class="text-[11px] font-black text-amber-700">${rD.label}</span>`;
            } else if (rD.isBed) {
                hHtml = `<div class="flex items-center justify-between px-1 w-full gap-1 pl-3"><div class="flex items-center gap-0.5 shrink-0"><span class="text-[12px] font-bold text-slate-600">${rD.displayId}</span>${getBunkIcon(rD.icon)}</div><span class="text-[9px] font-bold text-slate-500 tracking-tighter truncate">${(rD.bed || '').toUpperCase() === 'SINGLE' ? '' : (rD.bed || '')}</span></div>`;
            } else {
                hHtml = `<div class="flex items-center justify-between px-1 w-full gap-1"><div class="flex items-center gap-0.5 shrink-0"><span class="text-[13px] font-black text-slate-700">${rD.displayId}</span>${getFloorIcon(rD.floor)}${getBunkIcon(rD.icon)}</div><span class="text-[10px] font-bold text-slate-600 tracking-tighter truncate">${(rD.bed || '').toUpperCase() === 'SINGLE' || (rD.bed || '').toUpperCase() === 'PRIVATE' ? '' : (rD.bed || '')}</span></div>`;
            }

            row.innerHTML = `<div class="border-r border-slate-400 ${rD.isUnassigned ? 'bg-amber-100' : 'bg-slate-50'} flex items-center justify-center uppercase overflow-hidden shrink-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.05)] unselectable w-[var(--sidebar-w)]">${hHtml}</div>`;

            for (let i = 0; i < dShow; i++) {
                const c = document.createElement('div');
                const iT = window.getLocalYMD(days[i]) === todayStr;
                let fmpShade = '';
                const dMs = days[i].getTime();
                for (let f of fmpDates) {
                    const diff = Math.round((dMs - new Date(f + "T12:00:00").getTime()) / 86400000);
                    if (diff === 0) { fmpShade = 'day-fmp-dark'; break; }
                    if (diff >= -2 && diff <= 2) { fmpShade = 'day-fmp-medium'; break; }
                }
                c.className = `day-column ${fmpShade} ${iT ? 'day-today' : ''} ${rD.isUnassigned ? 'bg-amber-50/50' : ''}`;
                c.dataset.colIndex = i;
                c.dataset.dateIso = window.getLocalYMD(days[i]);
                c.dataset.roomId = rD.isUnassigned ? "" : (rD.id || "");
                row.appendChild(c);
            }

            rD.bookings.forEach(s => {
                const eS = getDayIndex(s.checkIn) + 0.3;
                const eE = getDayIndex(s.checkOut) + 0.25;
                if (eS >= dShow || eE <= 0) return;
                const due = window.getDue ? window.getDue(s) : 0;
                let bSty = 'border border-black/10';

                if (s.status === 'future' || s.status === 'new') {
                    if (s.checkIn === todayStr) bSty += ' checkin-today';
                    else if (s.checkIn <= yStr) bSty += ' late-checkin';
                } else if (s.status === 'here') {
                    if (s.checkOut === todayStr) bSty += ' overdue-checkout-today';
                    else if (s.checkOut <= yStr) bSty += ' overdue-checkout-past';
                }

                if (s.status === 'new') bSty += ' status-new-pulse';
                else if (s.badCC) bSty = '!border-red-500 !border-dashed !border-[3px]';
                else if (due > 0) bSty = '!border-red-500 !border-[3px]';

                const srcC = {
                    'booking.com': { bg: 'bg-[#003580]', text: 'B' },
                    'agoda': { bg: 'bg-[#87B2D6]', text: 'A' },
                    'hostelworld': { bg: 'bg-[#F15A24]', text: 'H' },
                    'airbnb': { bg: 'bg-[#FF5A5F]', text: 'A' },
                    'direct': { bg: 'bg-emerald-500', text: 'D' },
                    'expedia': { bg: 'bg-[#facc15]', text: '<span class="text-[#003580]">E</span>' },
                    'ctrip': { bg: 'bg-[#3b82f6]', text: 'T' },
                    'walk-in': { bg: 'bg-slate-600', text: 'W' },
                    'walkin': { bg: 'bg-slate-600', text: 'W' }
                };

                const src = srcC[s.source] || { bg: 'bg-slate-700', text: '?' };
                const bar = document.createElement('div');
                bar.className = `unselectable staff-bar status-${s.status} ${bSty} ${s.linkedId ? 'linked-' + s.linkedId : ''}`;
                bar.style.left = `calc(var(--sidebar-w) + (100% - var(--sidebar-w)) * ${Math.max(0, eS) / dShow})`;
                bar.style.width = `calc((100% - var(--sidebar-w)) * ${(Math.min(dShow, eE) - Math.max(0, eS)) / dShow})`;

                if (searchTerm && !(s.firstName + ' ' + s.lastName).toUpperCase().includes(searchTerm) && !(s.bookId || '').toUpperCase().includes(searchTerm)) {
                    bar.style.opacity = "0.15";
                }

                let bHtml = `<div class="bar-sticky-content gap-0.5">`;
                if (s.linkedId) bHtml += `<div class="w-4 h-4 shrink-0 mr-0.5">${window.SVGS.link}</div>`;
                bHtml += `<span class="${s.refundability === 'ref' && window.parseYMD(s.checkIn) - Date.now() > 7 * 86400000 ? 'italic font-black' : 'font-bold'} truncate text-[11px]" style="letter-spacing:-0.3px;">${s.lastName}</span>`;
                if (s.pax > 1) bHtml += `<span class="text-[8px] opacity-60 leading-none self-start mt-0.5 ml-0.5">x${s.pax}</span>`;
                if (s.upgrade === 'free') bHtml += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${window.SVGS.upFree}</div>`;
                else if (s.upgrade === 'paid') bHtml += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${window.SVGS.upPaid}</div>`;
                if (s.extended) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.ext}</div>`;
                if (s.rating === 'good') bHtml += `<div class="w-4 h-4 shrink-0 ml-0.5">${window.SVGS.fbGood}</div>`;
                else if (s.rating === 'bad') bHtml += `<div class="w-4 h-4 shrink-0 ml-0.5">${window.SVGS.fbBad}</div>`;
                if (s.emailSpecial) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailSpec}</div>`;
                else if (s.emailPrePost === 'confirmed') bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailPreConf}</div>`;
                else if (s.emailPrePost === 'sent' || s.emailPrePost === true) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailPre}</div>`;
                else if (s.emailConfirm === 2 || s.emailConfirm === 'not_fmp') bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailNotFmp}</div>`;
                else if (s.emailConfirm) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailConf}</div>`;
                bHtml += `<div class="ml-1 ${src.bg} text-white w-[15px] h-[15px] text-[13px] font-black flex items-center justify-center shrink-0 rounded-sm leading-none pb-[1px] pt-[0.5px]">${src.text}</div><div class="w-2 shrink-0"></div></div>`;
                bar.innerHTML = bHtml;

                let tags = [];
                if (s.refundability === 'ref') tags.push('Refundable');
                if (s.upgrade === 'free') tags.push('Free Upgrade');
                if (s.upgrade === 'paid') tags.push('Paid Upgrade');
                if (s.extended) tags.push('Extended');
                if (s.emailConfirm === 2 || s.emailConfirm === 'not_fmp') tags.push('Conf Sent (Not FMP)');
                else if (s.emailConfirm) tags.push('Conf Sent');
                if (s.emailPrePost) tags.push(`Pre/Post ${s.emailPrePost}`);
                if (s.emailSpecial) tags.push('Special Sent');
                if (s.linkedId) tags.push(`Linked: ${s.linkedId}`);

                let ttHtml = `<div class="font-black text-[15px] text-blue-300 leading-tight mb-1">${s.firstName || ''} ${s.lastName || ''}</div><div>Total: ฿${Number(s.totalPrice || 0).toFixed(2)} | <span class="${due > 0 ? 'text-red-400' : 'text-green-400'}">Due: ฿${due.toFixed(2)} ${s.badCC ? '(*BAD CC*)' : ''}</span></div><div class="text-slate-300 mt-1">${s.checkIn ? s.checkIn.substr(5) : ''} → ${s.checkOut ? s.checkOut.substr(5) : ''} (${s.pax} PAX)</div><div class="text-slate-300 mt-0.5">Rooms: ${getRooms(s).filter(Boolean).join(', ') || 'Unassigned'}</div>`;
                if (s.bookedType) ttHtml += `<div class="text-slate-300 mt-0.5">Booked: ${s.bookedType}</div>`;
                ttHtml += `<div class="text-slate-300 mt-0.5">Src: ${(s.source || 'other').toUpperCase()}</div>`;
                if (tags.length > 0) ttHtml += `<div class="mt-1 pt-1 border-t border-slate-600 text-yellow-200 text-[10px] uppercase font-bold max-w-[200px] leading-tight">${tags.join(' • ')}</div>`;
                if (s.phone || s.email) ttHtml += `<div class="mt-1 pt-1 border-t border-slate-600 text-slate-400 text-[10px] leading-tight">${s.phone || ''}<br>${s.email || ''}</div>`;

                bar.onmouseenter = () => {
                    if (s.linkedId) $$('.linked-' + s.linkedId).forEach(el => el.classList.add('link-glow'));
                    if (tt) { tt.innerHTML = ttHtml; tt.style.display = 'block'; }
                };
                bar.onmousemove = e => {
                    if (!tt) return;
                    tt.style.left = (e.clientX + 235 > window.innerWidth ? e.clientX - 235 : e.clientX + 15) + 'px';
                    tt.style.top = (e.clientY + 165 > window.innerHeight ? e.clientY - 165 : e.clientY + 15) + 'px';
                };
                bar.onmouseleave = () => {
                    if (s.linkedId) $$('.linked-' + s.linkedId).forEach(el => el.classList.remove('link-glow'));
                    if (tt) tt.style.display = 'none';
                };
                bar.onclick = e => {
                    e.stopPropagation();
                    if (tt) tt.style.display = 'none';
                    if (window.editStaff) window.editStaff(s.id);
                };
                row.appendChild(bar);
            });
            body.appendChild(row);
        });

        if (window.masterState && window.masterState !== 0) {
            const g = new Set();
            $$('.group-header').forEach(el => { if (el.dataset.group) g.add(el.dataset.group); });
            g.forEach(grp => window.toggleGroup(grp, window.masterState));
        }

        if (window.lucide) window.lucide.createIcons();
    };

    window.toggleLegendDrawer = () => {
        const leg = document.getElementById('calendar-legend');
        const chevron = document.getElementById('legend-toggle-chevron');
        const label = document.getElementById('legend-toggle-label');
        if (!leg) return;
        const isHidden = (leg.style.display === 'none' || leg.classList.contains('hidden'));
        if (isHidden) {
            leg.style.display = 'flex';
            leg.classList.remove('hidden');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
            if (label) label.innerText = 'Hide Key';
        } else {
            leg.style.display = 'none';
            leg.classList.add('hidden');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
            if (label) label.innerText = 'Show Key';
        }
        if (window.lucide) window.lucide.createIcons();
    };
    window.toggleMobileLegend = window.toggleLegendDrawer;

    window.mountLegendSvgs = () => {
        if (!window.SVGS) return false;
        const keys = ['upFree', 'upPaid', 'ext', 'link', 'mailConf', 'mailNotFmp', 'mailPre', 'mailPreConf', 'mailSpec', 'fbGood', 'fbBad'];
        keys.forEach(k => {
            const el = document.getElementById('leg-svg-' + k);
            if (el && window.SVGS[k]) {
                el.innerHTML = window.SVGS[k];
            }
        });
        return true;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.mountLegendSvgs();
            window.render();
        });
    } else {
        window.mountLegendSvgs();
        window.render();
    }
})();
