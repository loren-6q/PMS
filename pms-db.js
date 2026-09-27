// ==========================================================================
// PMS DATABASE, FILTERS & MULTI-SELECT CONTROLLER (pms-db.js)
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    const $ = id => document.getElementById(id);
    const $$ = s => document.querySelectorAll(s);

    const getStaffList = () => window.staff || (window.getStaff ? window.getStaff() : []);
    const getHotelRoomsList = () => window.hotelRooms || (window.getHotelRooms ? window.getHotelRooms() : []);
    const getPropId = () => window.getCurrentPropertyId ? window.getCurrentPropertyId() : (window.currentPropertyId || 'swims_resort');
    const getSearchVal = () => window.getSearchTerm ? window.getSearchTerm() : (window.searchTerm || '');
    const getRoomsHelper = () => window.getRooms || (s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : [])));
    const getParseYMD = () => window.parseYMD || (str => {
        if (!str || typeof str !== 'string') return 0;
        const p = str.split('-');
        return p.length !== 3 ? 0 : Date.UTC(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
    });
    const getLocalYMD = () => window.getLocalYMD || (d => {
        if (!d) d = new Date();
        const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        return o.toISOString().split('T')[0];
    });

    let dbSortKey = "checkIn";
    let dbSortAsc = false;

    window.toggleMultiSelect = (id, btn) => {
        if (window.event) window.event.stopPropagation();
        const d = $(id);
        if (!d) return;
        const isHidden = d.style.display === 'none' || d.style.display === '' || d.classList.contains('hidden');
        $$('.multi-select-dropdown').forEach(x => {
            x.style.display = 'none';
            x.classList.add('hidden');
        });

        if (isHidden) {
            const r = btn.getBoundingClientRect();
            document.body.appendChild(d);
            d.style.position = 'absolute';
            d.style.top = (r.bottom + window.scrollY) + 'px';
            d.style.left = (r.left + window.scrollX) + 'px';
            d.style.width = Math.max(r.width, 160) + 'px';
            if (r.left + 160 > window.innerWidth) d.style.left = (window.scrollX + r.right - 160) + 'px';
            d.style.display = 'block';
            d.classList.remove('hidden');
        }
    };

    window.updateMultiLabel = (dId, lId, def) => {
        const c = $$(`#${dId} input[type="checkbox"]:checked`);
        const l = $(lId);
        if (l) {
            l.innerText = c.length === 0 ? def : (c.length === 1 ? c[0].parentNode.textContent.trim().toUpperCase() : c.length + ' SELECTED');
        }
    };

    window.getMultiValues = id => Array.from($(id)?.querySelectorAll('input[type="checkbox"]:checked') || []).map(cb => cb.value);

    document.addEventListener('click', e => {
        if (!e.target.closest('.multi-select-container') && !e.target.closest('.multi-select-dropdown')) {
            $$('.multi-select-dropdown').forEach(d => {
                d.style.display = 'none';
                d.classList.add('hidden');
            });
        }
    });

    window.applyDbPreset = val => {
        const today = new Date();
        const ymdFn = getLocalYMD();
        let s = '', e = '';
        if (val === 'today') {
            s = ymdFn(today); e = s;
        } else if (val === 'tomorrow') {
            const tmrw = new Date(today);
            tmrw.setDate(today.getDate() + 1);
            s = ymdFn(tmrw); e = s;
        } else if (val === 'this_week') {
            const t = new Date(today);
            const day = t.getDay();
            const diff = t.getDate() - day + (day === 0 ? -6 : 1);
            const start = new Date(t.setDate(diff));
            s = ymdFn(start);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            e = ymdFn(end);
        } else if (val === 'next_week') {
            const t = new Date(today);
            const day = t.getDay();
            const diff = t.getDate() - day + (day === 0 ? -6 : 1) + 7;
            const start = new Date(t.setDate(diff));
            s = ymdFn(start);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            e = ymdFn(end);
        } else if (val === 'this_month') {
            s = ymdFn(new Date(today.getFullYear(), today.getMonth(), 1));
            e = ymdFn(new Date(today.getFullYear(), today.getMonth() + 1, 0));
        } else if (val === 'next_month') {
            s = ymdFn(new Date(today.getFullYear(), today.getMonth() + 1, 1));
            e = ymdFn(new Date(today.getFullYear(), today.getMonth() + 2, 0));
        }

        const startEl = $('db-filter-start');
        const endEl = $('db-filter-end');
        if (startEl) startEl.value = s;
        if (endEl) endEl.value = e;
        window.renderDatabase();
    };

    window.formatDbDate = (dIn, dOut) => {
        if (!dIn || !dOut) return '';
        let iD = new Date(dIn + "T12:00:00Z"), oD = new Date(dOut + "T12:00:00Z");
        let iM = iD.getUTCMonth() + 1, iDay = iD.getUTCDate();
        let oM = oD.getUTCMonth() + 1, oDay = oD.getUTCDate();
        return iM === oM ? `${iM}/${iDay}-${oDay}` : `${iM}/${iDay}-${oM}/${oDay}`;
    };

    window.getFilteredBookings = (v = 'db', sKey = dbSortKey, sAsc = dbSortAsc) => {
        const nF = ($(`${v}-filter-name`)?.value || '').trim().toUpperCase();
        const sF = window.getMultiValues(`${v}-source-dropdown`) || [];
        const dS = $(`${v}-filter-start`)?.value || '';
        const dE = $(`${v}-filter-end`)?.value || '';
        const rF = window.getMultiValues(`${v}-room-dropdown`) || [];
        const minF = $(`${v}-filter-min`)?.value;
        const maxF = $(`${v}-filter-max`)?.value;
        const dF = $(`${v}-filter-due`)?.value || '';
        const statF = window.getMultiValues(`${v}-status-dropdown`) || [];

        const staffList = getStaffList();
        const curProp = getPropId();
        const hotelRooms = getHotelRoomsList();
        const searchTerm = getSearchVal();
        const getRooms = getRoomsHelper();

        return staffList.filter(s => {
            if (s.property !== curProp) return false;
            if (statF.length > 0 && !statF.includes(s.status)) return false;

            const fN = ((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase();
            const bId = (s.bookId || '').toUpperCase();
            if (searchTerm && !fN.includes(searchTerm) && !bId.includes(searchTerm)) return false;
            if (nF && !fN.includes(nF) && !bId.includes(nF)) return false;
            if (sF.length > 0 && !sF.includes(s.source)) return false;
            if (dS && s.checkOut <= dS) return false;
            if (dE && s.checkIn >= dE) return false;

            const due = window.getDue ? window.getDue(s) : 0;
            if (dF === 'zero' && due > 0) return false;
            if (dF === 'owes' && due <= 0) return false;

            const tP = Number(s.totalPrice || 0);
            if (minF && tP < Number(minF)) return false;
            if (maxF && tP > Number(maxF)) return false;

            const rL = getRooms(s);
            if (rF.length > 0) {
                const wU = rF.includes('UNASSIGNED');
                const hU = rL.length === 0 || rL.includes("");
                const hT = rL.some(r => {
                    const hr = hotelRooms.find(x => x.id === r);
                    return hr && rF.includes(hr.type);
                });
                if (!hT && (!wU || !hU)) return false;
            }
            return true;
        }).sort((a, b) => {
            let vA = a[sKey], vB = b[sKey];
            if (sKey === 'room') {
                vA = a.rooms?.[0] || a.room || 'ZZZ';
                vB = b.rooms?.[0] || b.room || 'ZZZ';
            }
            if (sKey === 'name') {
                vA = ((a.firstName || '') + ' ' + (a.lastName || '')).toUpperCase();
                vB = ((b.firstName || '') + ' ' + (b.lastName || '')).toUpperCase();
            }
            if (sKey === 'totalPrice') {
                vA = Number(vA || 0); vB = Number(vB || 0);
            }
            if (sKey === 'due') {
                vA = window.getDue ? window.getDue(a) : 0;
                vB = window.getDue ? window.getDue(b) : 0;
            }
            if (sKey === 'paid') {
                vA = window.getPaid ? window.getPaid(a) : 0;
                vB = window.getPaid ? window.getPaid(b) : 0;
            }
            return sAsc ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
        });
    };

    window.renderDatabase = () => {
        const body = $('database-body');
        if (!body) return;
        body.innerHTML = '';

        const getRooms = getRoomsHelper();
        const records = window.getFilteredBookings('db', dbSortKey, dbSortAsc);

        records.forEach(s => {
            const due = window.getDue ? window.getDue(s) : 0;
            const paid = window.getPaid ? window.getPaid(s) : 0;
            const asg = getRooms(s).filter(Boolean).join(', ') || '--';

            const tr = document.createElement('tr');
            tr.className = "border-b hover:bg-slate-50 cursor-pointer";
            tr.onclick = () => window.editStaff(s.id);
            tr.dataset.recordId = s.id;

            tr.innerHTML = `
                <td class="p-2 border-r border-slate-200 font-bold">${s.firstName || ''} ${s.lastName || ''}</td>
                <td class="p-2 border-r border-slate-200 uppercase">${s.source || ''}</td>
                <td class="p-2 border-r border-slate-200">${window.formatDbDate(s.checkIn, s.checkOut)}</td>
                <td class="p-2 border-r border-slate-200 font-black max-w-[96px] break-words whitespace-normal leading-tight">${asg}</td>
                <td class="p-2 border-r border-slate-200 text-right font-black">฿${Number(s.totalPrice || 0).toFixed(2)}</td>
                <td class="p-2 border-r border-slate-200 text-right font-black text-green-600">฿${paid.toFixed(2)}</td>
                <td class="p-2 border-r border-slate-200 text-right font-black ${due > 0 ? 'text-red-600' : ''} ${s.badCC ? 'underline decoration-dashed decoration-red-500' : ''}">฿${due.toFixed(2)}</td>
                <td class="p-2 uppercase"><span class="px-2 py-0.5 rounded text-[10px] text-white status-${s.status}">${s.status}</span></td>
            `;
            body.appendChild(tr);
        });

        if (window.lucide) window.lucide.createIcons();
    };

    window.sortDatabase = k => {
        if (dbSortKey === k) dbSortAsc = !dbSortAsc;
        else {
            dbSortKey = k;
            dbSortAsc = true;
        }
        window.renderDatabase();
    };

    window.bulkDelete = () => {
        const rows = $$('#database-body tr');
        if (rows.length === 0) return window.showAlert("Nothing to delete.");

        window.showAlert(`PERMANENTLY DELETE ${rows.length} RECORDS?\n\nThis will wipe all visible bookings!`, true, async () => {
            const loader = $('boot-loader');
            if (loader) loader.style.display = 'flex';

            const db = getDb();
            const appId = getAppId();
            const { doc, deleteDoc } = getFs();

            try {
                await Promise.all(Array.from(rows).map(tr => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', tr.dataset.recordId))));
                if (loader) loader.style.display = 'none';
                window.closeAlert();
            } catch (e) {
                if (loader) loader.style.display = 'none';
                window.showAlert("Delete blocked by Firebase Rules: " + e.message);
            }
        });
    };
})();
