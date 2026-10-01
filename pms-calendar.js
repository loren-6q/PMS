// ==========================================================================
// PMS CALENDAR TIMELINE & GRID ENGINE (pms-calendar.js)
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

    const getStaff = () => window.staff || (window.getStaff ? window.getStaff() : []);
    const getHotelRooms = () => window.hotelRooms || (window.getHotelRooms ? window.getHotelRooms() : []);
    const getPropId = () => {
        const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
        return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
    };
    const getFmpDates = () => window.fmpDates || [];
    const getSearchTerm = () => (window.getSearchTerm ? window.getSearchTerm() : window.searchTerm) || "";
    const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

    const getDayIndex = str => {
        const t = window.parseYMD ? window.parseYMD(str) : 0;
        const vS = window.viewStart || new Date();
        return t ? Math.round((t - Date.UTC(vS.getFullYear(), vS.getMonth(), vS.getDate())) / 86400000) : -1;
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
            const d = new Date(m[idx].checkIn + "T12:00:00");
            d.setDate(d.getDate() - 3);
            window.viewStart = d;
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
            if (grp === 'unassigned-unconfirmed') {
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
        if (fStr === '3' || fStr === 'double') {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Double Floor"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>`;
        }
        return '';
    };

    const getBunkIcon = b => {
        if (!b) return '';
        const bStr = String(b).toLowerCase().trim();
        if (bStr === 'bottom' || bStr === 'bot' || bStr === 'bunk-bottom') {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Bottom Bunk"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
        }
        if (bStr === 'top' || bStr === 'bunk-top') {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Top Bunk"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
        }
        return '';
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

        const mGrid = $('calendar-header-months'), dGrid = $('calendar-header-days'), body = $('timeline-body');
        if (!mGrid || !dGrid || !body) return;

        mGrid.innerHTML = `<div class="border-r border-slate-700 flex items-center justify-center h-full sticky left-0 z-[60] bg-slate-800 w-[var(--sidebar-w)]"></div>`;
        dGrid.innerHTML = `<div class="p-1 text-[12px] font-black text-slate-500 uppercase flex items-center justify-between border-r border-slate-400 bg-slate-100 h-full sticky left-0 z-[50] w-[var(--sidebar-w)]"><span>ROOM</span><div class="flex items-center gap-1"><button onclick="window.toggleAllGroups()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-sm cursor-pointer" title="Master Toggle"><i data-lucide="layers" class="!w-[13px] !h-[13px]"></i></button><button onclick="window.toggleZoom()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-sm cursor-pointer" title="Toggle Zoom"><i data-lucide="zoom-in" class="!w-[13px] !h-[13px]"></i></button></div></div>`;
        body.innerHTML = '';

        const days = Array.from({ length: dShow }, (_, i) => new Date(vS.getFullYear(), vS.getMonth(), vS.getDate() + i, 12, 0, 0));
        let cMon = -1, cSpan = 0;
        days.forEach((d, i) => {
            if (d.getMonth() !== cMon) {
                if (cMon !== -1) mGrid.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${days[i - 1].getFullYear()}</div>`;
                cMon = d.getMonth();
                cSpan = 1;
            } else cSpan++;
            if (i === days.length - 1) mGrid.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${d.getFullYear()}</div>`;
        });

        const getYmd = window.getLocalYMD || (d => new Date(d).toISOString().split('T')[0]);
        const parseYMD = window.parseYMD || (str => Date.parse(str));
        const todayStr = getYmd(new Date());
        const yD = new Date();
        yD.setDate(new Date().getDate() - 1);
        const yStr = getYmd(yD);

        days.forEach(d => {
            const iT = getYmd(d) === todayStr;
            dGrid.innerHTML += `<div class="flex flex-col items-center justify-center border-r border-slate-400 ${iT ? 'bg-blue-100' : ''}"><div class="text-[10px] font-black text-slate-500 uppercase leading-none">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="text-[16px] font-black ${iT ? 'text-blue-600' : 'text-slate-800'} leading-tight">${d.getDate()}</div></div>`;
        });

        const curProp = getPropId();
        const hotelRooms = getHotelRooms();
        const fmpDates = getFmpDates();
        const searchTerm = getSearchTerm();

        const actStaff = getStaff().filter(s => {
            const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
            if (sProp !== curProp) return false;
            const rList = getRooms(s);
            const isUnassigned = rList.length === 0 || rList[0] === "";
            return window.isOccupyingBooking ? window.isOccupyingBooking(s.status, isUnassigned) : (s.status !== 'cancelled' && s.status !== 'noshow');
        });

        const vsUTC = parseYMD(getYmd(vS));
        const veUTC = vsUTC + dShow * 86400000;
        const tRows = [], uConf = [];

        actStaff.forEach(s => {
            if (parseYMD(s.checkIn) > veUTC || parseYMD(s.checkOut) < vsUTC) return;
            const rL = getRooms(s).length ? getRooms(s) : [""];
            if (s.status === 'unconfirmed' || s.status === 'charged') {
                for (let i = 0; i < Math.max(1, rL.length); i++) uConf.push(s);
            } else {
                const uCount = rL.filter(rid => {
                    const normR = window.normalizeRoomId ? window.normalizeRoomId(rid, curProp) : rid;
                    return !rid || !hotelRooms.some(h => h.id === rid || h.id === normR);
                }).length;
                for (let i = 0; i < uCount; i++) uConf.push(s);
            }
        });

        if (uConf.length > 0) {
            tRows.push({ isDivider: true, label: "UNASSIGNED / UNCONFIRMED", isUnconfirmedZone: true });
            const rows = [];
            uConf.forEach(s => {
                let p = false;
                for (let r of rows) {
                    if (!r.some(e => parseYMD(s.checkIn) < parseYMD(e.checkOut) && parseYMD(e.checkIn) < parseYMD(s.checkOut))) {
                        r.push(s);
                        p = true;
                        break;
                    }
                }
                if (!p) rows.push([s]);
            });
            rows.forEach((r, idx) => tRows.push({ isUnassigned: true, label: `U-${idx + 1}`, bookings: r }));
        }

        hotelRooms.forEach((r, idx, arr) => {
            if (!r.type || !r.id) return;
            if (r.type !== (idx > 0 && arr[idx - 1] ? arr[idx - 1].type : null)) tRows.push({ isDivider: true, label: r.type });

            const hasDash = r.id.includes('-');
            if (hasDash) {
                const parts = r.id.split('-');
                const baseRoom = parts[0];
                const prevRoom = idx > 0 ? arr[idx - 1] : null;
                const prevBaseRoom = (prevRoom && prevRoom.type === r.type && prevRoom.id && prevRoom.id.includes('-')) ? prevRoom.id.split('-')[0] : null;

                if (baseRoom !== prevBaseRoom) {
                    tRows.push({ isSubHeader: true, label: baseRoom, floor: r.floor });
                }

                tRows.push({
                    isRoom: true, isBed: true, id: r.id, displayId: r.id, type: r.type, bed: r.bed, floor: '', icon: r.icon,
                    bookings: actStaff.filter(s => {
                        const rList = getRooms(s).map(rm => window.normalizeRoomId ? window.normalizeRoomId(rm, curProp) : rm);
                        const normR = window.normalizeRoomId ? window.normalizeRoomId(r.id, curProp) : r.id;
                        return (rList.includes(r.id) || rList.includes(normR)) && s.status !== 'unconfirmed' && s.status !== 'charged' && parseYMD(s.checkIn) <= veUTC && parseYMD(s.checkOut) >= vsUTC;
                    })
                });
            } else {
                tRows.push({
                    isRoom: true, isPrivate: true, id: r.id, displayId: r.id, type: r.type, bed: r.bed, floor: r.floor, icon: r.icon,
                    bookings: actStaff.filter(s => {
                        const rList = getRooms(s).map(rm => window.normalizeRoomId ? window.normalizeRoomId(rm, curProp) : rm);
                        const normR = window.normalizeRoomId ? window.normalizeRoomId(r.id, curProp) : r.id;
                        return (rList.includes(r.id) || rList.includes(normR)) && s.status !== 'unconfirmed' && s.status !== 'charged' && parseYMD(s.checkIn) <= veUTC && parseYMD(s.checkOut) >= vsUTC;
                    })
                });
            }
        });

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
                    hRow.innerHTML = `<div class="unassigned-header bg-amber-200 hover:bg-amber-300 text-slate-800 p-0.5 text-[10px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 transition-colors shadow-md" style="grid-column: 1 / -1; width: fit-content; min-width: 100vw; height: 100%;" onclick="window.toggleGroup('${cGrp}')"><span>${rD.label}</span><i data-lucide="chevron-up" class="transition-transform duration-200 !w-[13px] !h-[13px]" id="icon-${cGrp}" style="${isDCol ? 'transform: rotate(180deg);' : ''}"></i></div>`;
                    return body.appendChild(hRow);
                } else {
                    hRow.innerHTML = `<div class="bg-slate-800 hover:bg-slate-700 text-white border-t border-slate-600 p-0.5 text-[11px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 transition-colors shadow-[2px_0_4px_rgba(0,0,0,0.1)] w-[var(--sidebar-w)]" style="grid-column: 1 / -1; width: fit-content; min-width: 100vw; height: 100%;" onclick="window.toggleGroup('${cGrp}')"><span class="truncate pr-1">${rD.label}</span><div class="flex items-center gap-1 shrink-0"><span id="state-${cGrp}" class="text-[8px] bg-slate-600 px-1 rounded text-slate-300">ALL</span><i data-lucide="chevron-up" class="transition-transform duration-200 !w-[13px] !h-[13px]" id="icon-${cGrp}"></i></div></div>`;
                    body.appendChild(hRow);

                    const tRIds = hotelRooms.filter(hr => hr.type === rD.label).map(hr => hr.id);
                    const cap = tRIds.length;
                    const aRow = document.createElement('div');
                    aRow.className = `timeline-grid avail-row-${cGrp} h-[20px]`;
                    aRow.style.display = 'none';

                    let cHtml = `<div class="bg-slate-900 border-r border-slate-700 flex items-center justify-end pr-2 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)] w-[var(--sidebar-w)] text-[9px] text-slate-400 font-black uppercase tracking-widest unselectable">AVAIL &rarr;</div>`;
                    for (let i = 0; i < dShow; i++) {
                        const dT = days[i].getTime();
                        const occ = new Set();
                        actStaff.forEach(s => {
                            if (['unconfirmed', 'charged', 'cancelled', 'noshow'].includes(s.status)) return;
                            if (dT >= parseYMD(s.checkIn) && dT < parseYMD(s.checkOut)) {
                                getRooms(s).forEach(r => {
                                    const normR = window.normalizeRoomId ? window.normalizeRoomId(r, curProp) : r;
                                    if (r && (tRIds.includes(r) || tRIds.includes(normR))) occ.add(r);
                                });
                            }
                        });
                        const av = cap - occ.size;
                        const pct = cap > 0 ? av / cap : 0;
                        let cCls = '';
                        if (av === cap) cCls = 'bg-[#4ade80] text-black';
                        else if (pct >= 0.75) cCls = 'bg-black text-[#4ade80]';
                        else if (pct >= 0.50) cCls = 'bg-black text-white';
                        else if (pct >= 0.25) cCls = 'bg-[#7f1d1d] text-white';
                        else if (av > 0) cCls = 'bg-[#dc2626] text-white';
                        else cCls = 'bg-[#ef4444] text-black font-black';
                        cHtml += `<div class="flex items-center justify-center border-r border-slate-800 text-[10px] font-black ${cCls}">${av}</div>`;
                    }
                    aRow.innerHTML = cHtml;
                    return body.appendChild(aRow);
                }
            }

            if (rD.isSubHeader) {
                const sRow = document.createElement('div');
                sRow.className = `timeline-grid group-${cGrp} h-[22px]`;
                sRow.innerHTML = `
                    <div class="bg-slate-200 border-y border-slate-300 flex items-center px-2 sticky left-0 z-20 shadow-sm unselectable" style="grid-column: 1 / -1; width: fit-content; min-width: 100vw; height: 100%;">
                        <div class="flex items-center gap-1 sticky left-0 bg-slate-200 pr-2">
                            <span class="text-[11px] font-black text-slate-700 uppercase tracking-widest">Room ${rD.label}</span>
                            ${getFloorIcon(rD.floor)}
                        </div>
                    </div>`;
                return body.appendChild(sRow);
            }

            const row = document.createElement('div');
            row.className = `timeline-grid bed-row group-${cGrp}`;
            if (cGrp === 'unassigned-unconfirmed') row.style.display = 'none';

            let hHtml = '';
            if (rD.isUnassigned) {
                hHtml = `<span class="text-[11px] font-black text-amber-700">${rD.label}</span>`;
            } else if (rD.isBed) {
                hHtml = `
                    <div class="flex items-center justify-between px-1 w-full gap-1 pl-3">
                        <div class="flex items-center gap-0.5 shrink-0">
                            <span class="text-[12px] font-bold text-slate-600">Bed ${rD.displayId}</span>
                            ${getBunkIcon(rD.icon)}
                        </div>
                        <span class="text-[9px] font-bold text-slate-500 tracking-tighter truncate">${(rD.bed || '').toUpperCase() === 'SINGLE' ? '' : (rD.bed || '')}</span>
                    </div>`;
            } else {
                hHtml = `
                    <div class="flex items-center justify-between px-1 w-full gap-1">
                        <div class="flex items-center gap-0.5 shrink-0">
                            <span class="text-[13px] font-black text-slate-700">${rD.displayId}</span>
                            ${getFloorIcon(rD.floor)}
                            ${getBunkIcon(rD.icon)}
                        </div>
                        <span class="text-[10px] font-bold text-slate-600 tracking-tighter truncate">${(rD.bed || '').toUpperCase() === 'SINGLE' ? '' : (rD.bed || '')}</span>
                    </div>`;
            }

            row.innerHTML = `<div class="border-r border-slate-400 ${rD.isUnassigned ? 'bg-amber-100' : 'bg-slate-50'} flex items-center justify-center uppercase overflow-hidden shrink-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.05)] unselectable w-[var(--sidebar-w)]">${hHtml}</div>`;

            for (let i = 0; i < dShow; i++) {
                const c = document.createElement('div');
                const iT = getYmd(days[i]) === todayStr;
                let fmpShade = '';
                const dMs = days[i].getTime();
                for (let f of fmpDates) {
                    const diff = Math.round((dMs - new Date(f + "T12:00:00").getTime()) / 86400000);
                    if (diff === 0) { fmpShade = 'day-fmp-dark'; break; }
                    if (diff >= -2 && diff <= 2) { fmpShade = 'day-fmp-medium'; break; }
                }
                c.className = `day-column ${fmpShade} ${iT ? 'day-today' : ''} ${rD.isUnassigned ? 'bg-amber-50/50' : ''}`;
                c.dataset.colIndex = i;
                c.dataset.dateNum = days[i].getDate();
                c.dataset.dateIso = getYmd(days[i]);
                c.dataset.roomId = rD.isUnassigned ? "" : (rD.id || "");
                row.appendChild(c);
            }

            rD.bookings.forEach(s => {
                const eS = getDayIndex(s.checkIn) + 0.3, eE = getDayIndex(s.checkOut) + 0.25;
                if (eS >= dShow || eE <= 0) return;
                const due = window.getDue ? window.getDue(s) : 0;
                const owes = due > 0;
                let bSty = 'border border-black/10', isA = false;

                if (s.status === 'future' || s.status === 'new') {
                    if (s.checkIn === todayStr) { bSty += ' checkin-today'; isA = true; }
                    else if (s.checkIn <= yStr) { bSty += ' late-checkin'; isA = true; }
                } else if (s.status === 'here') {
                    if (s.checkOut === todayStr) { bSty += ' overdue-checkout-today'; isA = true; }
                    else if (s.checkOut <= yStr) { bSty += ' overdue-checkout-past'; isA = true; }
                }

                if (s.status === 'new') { bSty += ' status-new-pulse'; isA = true; }
                if (!isA) {
                    if (s.badCC) bSty = '!border-red-500 !border-dashed !border-[3px]';
                    else if (owes) bSty = '!border-red-500 !border-[3px]';
                }

                const srcC = {
                    'booking.com': { bg: 'bg-[#003580]', text: 'B' },
                    'agoda': { bg: 'bg-[#87B2D6]', text: 'A' },
                    'hostelworld': { bg: 'bg-[#F15A24]', text: 'H' },
                    'airbnb': { bg: 'bg-[#FF5A5F]', text: 'A' },
                    'direct': { bg: 'bg-emerald-500', text: 'D' },
                    'expedia': { bg: 'bg-[#facc15]', text: '<span class="text-[#003580]">E</span>' },
                    'ctrip': { bg: 'bg-[#3b82f6]', text: 'T' }
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
                bHtml += `<span class="${s.refundability === 'ref' && parseYMD(s.checkIn) - Date.now() > 7 * 86400000 ? 'italic font-black' : 'font-bold'} truncate text-[11px]" style="letter-spacing:-0.3px;">${s.lastName}</span>`;
                if (s.pax > 1) bHtml += `<span class="text-[8px] opacity-60 leading-none self-start mt-0.5 ml-0.5">x${s.pax}</span>`;
                if (s.upgrade === 'free') bHtml += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${window.SVGS.upFree}</div>`;
                else if (s.upgrade === 'paid') bHtml += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${window.SVGS.upPaid}</div>`;
                if (s.extended) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.ext}</div>`;
                if (s.rating === 'good') bHtml += `<div class="w-4 h-4 shrink-0 ml-0.5">${window.SVGS.fbGood}</div>`;
                else if (s.rating === 'bad') bHtml += `<div class="w-4 h-4 shrink-0 ml-0.5">${window.SVGS.fbBad}</div>`;
                if (s.emailSpecial) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailSpec}</div>`;
                else if (s.emailPrePost === 'confirmed') bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailPreConf}</div>`;
                else if (s.emailPrePost === 'sent' || s.emailPrePost === true) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailPre}</div>`;
                else if (s.emailConfirm) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${window.SVGS.mailConf}</div>`;
                bHtml += `<div class="ml-1 ${src.bg} text-white w-[15px] h-[15px] text-[13px] font-black flex items-center justify-center shrink-0 rounded-sm leading-none pb-[1px] pt-[0.5px]">${src.text}</div><div class="w-2 shrink-0"></div></div>`;
                bar.innerHTML = bHtml;

                let tags = [];
                if (s.refundability === 'ref') tags.push('Refundable');
                if (s.upgrade === 'free') tags.push('Free Upgrade');
                if (s.upgrade === 'paid') tags.push('Paid Upgrade');
                if (s.extended) tags.push('Extended');
                if (s.emailConfirm) tags.push('Conf Sent');
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

        if (window.masterState !== 0) {
            const g = new Set();
            $$('.group-header').forEach(el => { if (el.dataset.group) g.add(el.dataset.group); });
            g.forEach(grp => window.toggleGroup(grp, window.masterState));
        }

        if (window.lucide) window.lucide.createIcons();
    };
})();
