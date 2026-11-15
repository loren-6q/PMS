// ==========================================================================
// PMS TM30 & PASSPORT SYNC CONTROLLER (pms-tm30.js)
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    const $ = id => document.getElementById(id);
    const $$ = s => document.querySelectorAll(s);

    const getDb = () => window.db;
    const getAppId = () => window.appId || 'hotel-pms-v1';
    const getFs = () => window.fs || {};
    const getStaffList = () => window.staff || (window.getStaff ? window.getStaff() : []);
    
    // Core property ID accessor utilizing pms-core.js
    const getPropId = () => {
        const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
        return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
    };
    
    const getRoomsHelper = () => window.getRooms || (s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : [])));

    window.globalPassportSync = async () => {
        const btn = document.querySelector('button[onclick="window.globalPassportSync()"]');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader-2" size="12" class="animate-spin inline"></i> Syncing...';
            btn.disabled = true;
        }

        const db = getDb();
        const appId = getAppId();
        const { collection, query, where, getDocs, doc, updateDoc } = getFs();
        const curProp = getPropId();
        const displayKey = window.toDisplayPropKey ? window.toDisplayPropKey(curProp) : 'SWIMS';
        const staffList = getStaffList();
        const getRooms = getRoomsHelper();

        try {
            const passSnap = await getDocs(query(
                collection(db, 'artifacts', appId, 'public', 'data', 'submissions'),
                where("property", "==", curProp)
            ));

            let foundPassports = [];
            passSnap.forEach(d => {
                const data = d.data();
                if (data.status !== 'completed' && data.status !== 'failed' && !data.pmsSynced) {
                    foundPassports.push({ id: d.id, ...data });
                }
            });

            if (foundPassports.length === 0) {
                window.showAlert(`No pending unsynced passports found for ${displayKey}.`);
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            let syncCount = 0;
            let updatePromises = [];
            let bookingUpdates = {};

            for (let p of foundPassports) {
                let matchedBooking = null;
                if (p.roomNumber) {
                    let searchRooms = [p.roomNumber];
                    const normRoom = window.normalizeRoomId ? window.normalizeRoomId(p.roomNumber, curProp) : p.roomNumber;
                    searchRooms.push(normRoom);
                    
                    if (/^[a-zA-Z]0\d$/.test(p.roomNumber)) searchRooms.push(p.roomNumber[0] + p.roomNumber[2]);
                    else if (/^[a-zA-Z]\d$/.test(p.roomNumber)) searchRooms.push(p.roomNumber[0] + '0' + p.roomNumber[1]);
                    
                    matchedBooking = staffList.filter(x => {
                        const xProp = window.toCanonicalPropId ? window.toCanonicalPropId(x.property) : x.property;
                        return xProp === curProp;
                    }).find(s => {
                        const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled' && s.status !== 'noshow');
                        if (!isOcc) return false;
                        return getRooms(s).some(r => {
                            const normR = window.normalizeRoomId ? window.normalizeRoomId(r, curProp) : r;
                            return searchRooms.includes(r) || searchRooms.includes(normR);
                        });
                    });
                }

                if (!matchedBooking && p.firstName && p.lastName) {
                    matchedBooking = staffList.filter(x => {
                        const xProp = window.toCanonicalPropId ? window.toCanonicalPropId(x.property) : x.property;
                        return xProp === curProp;
                    }).find(s => {
                        const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled' && s.status !== 'noshow');
                        if (!isOcc) return false;
                        const bName = ((s.firstName || '') + " " + (s.lastName || '')).toUpperCase();
                        return bName.includes(p.lastName.toUpperCase()) && bName.includes(p.firstName.toUpperCase());
                    });
                }

                if (matchedBooking) {
                    syncCount++;
                    let checkoutFormatted = matchedBooking.checkOut ? `${matchedBooking.checkOut.split('-')[2]}/${matchedBooking.checkOut.split('-')[1]}/${matchedBooking.checkOut.split('-')[0]}` : "";
                    updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', p.id), {
                        checkoutDate: checkoutFormatted,
                        phoneNo: matchedBooking.phone || "",
                        pmsSynced: true,
                        status: "processing"
                    }));

                    if (!bookingUpdates[matchedBooking.id]) bookingUpdates[matchedBooking.id] = `\n\n[GLOBAL SYNC - ${new Date().toLocaleDateString('en-GB')}]\n`;
                    bookingUpdates[matchedBooking.id] += `• Synced Passport: ${p.firstName} ${p.lastName} (${p.passportNumber || 'N/A'})\n`;
                }
            }

            if (syncCount === 0) {
                window.showAlert(`Found ${foundPassports.length} pending passport(s), but could not match ANY to active bookings.`);
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            for (let bId in bookingUpdates) {
                let b = staffList.find(x => x.id === bId);
                if (b) {
                    let newNotes = (b.notes || "") + bookingUpdates[bId];
                    updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', bId), { notes: newNotes.trim() }));
                }
            }

            await Promise.all(updatePromises);
            window.showAlert(`✅ Global Sync Complete!\n\nSuccessfully matched ${syncCount} out of ${foundPassports.length} passports to existing bookings.`);
        } catch (e) {
            console.error("Global Sync Error", e);
            window.showAlert("Error during global sync: " + e.message);
        }

        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        if (window.lucide) window.lucide.createIcons();
    };

    window.syncTM30 = async () => {
        const btn = $('tm30-sync-btn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader-2" size="14" class="animate-spin inline"></i> SYNCING...';
            if (window.lucide) window.lucide.createIcons();
        }

        const db = getDb();
        const appId = getAppId();
        const { collection, query, where, getDocs, doc, updateDoc } = getFs();
        const curProp = getPropId();

        try {
            const rL = Array.from($$('.assigned-room-select')).map(sel => sel.value).filter(Boolean);
            const gFirstName = $('first-name')?.value.trim().toUpperCase() || '';
            const gLastName = $('last-name')?.value.trim().toUpperCase() || '';
            const checkOut = $('check-out')?.value || '';
            const phone = $('phone')?.value || '';

            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', 'submissions'),
                where("property", "==", curProp)
            );
            const passSnap = await getDocs(q);
            let pendingPassports = [];

            passSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.status !== 'completed' && data.status !== 'failed' && !data.pmsSynced) {
                    pendingPassports.push({ id: docSnap.id, ...data });
                }
            });

            if (rL.length === 0 && !gFirstName && !gLastName) {
                if (pendingPassports.length === 0) {
                    window.showAlert("No recent passports found to import.");
                    if (btn) btn.innerHTML = origText;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }

                let html = '<div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto no-scrollbar">';
                pendingPassports
                    .sort((a,b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()))
                    .slice(0, 10)
                    .forEach(s => {
                        const fName = `${s.firstName || ''} ${s.lastName || ''}`.trim();
                        const sJson = JSON.stringify(s).replace(/'/g, "&#39;");
                        html += `
                        <div class="p-3 border border-slate-200 rounded-lg hover:bg-purple-50 cursor-pointer flex justify-between items-center transition-colors" onclick='window.applyTM30Data(${sJson})'>
                            <div class="flex flex-col text-left">
                                <span class="font-black text-slate-800 text-sm uppercase">${fName}</span>
                                <span class="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">NAT: ${s.nationality || '???'} | ID: ${s.passportNumber || 'N/A'}</span>
                            </div>
                            <i data-lucide="arrow-right" size="16" class="text-purple-500 shrink-0"></i>
                        </div>`;
                    });
                html += '</div>';

                const titleEl = $('alert-header-title');
                if (titleEl) titleEl.innerText = 'Select Passport to Auto-Fill';
                const msgEl = $('alert-message');
                if (msgEl) msgEl.innerHTML = html;
                const actEl = $('alert-actions');
                if (actEl) actEl.innerHTML = `<button onclick="window.closeAlert()" class="btn-modal bg-slate-200 hover:bg-slate-300 text-slate-700 w-full transition-colors">Cancel</button>`;
                
                const alertM = $('alert-modal');
                if (alertM) {
                    alertM.classList.add('active');
                    alertM.style.display = 'flex';
                }
                if (window.lucide) window.lucide.createIcons();
                if (btn) btn.innerHTML = origText;
                return;
            }

            let checkoutFormatted = checkOut ? `${checkOut.split('-')[2]}/${checkOut.split('-')[1]}/${checkOut.split('-')[0]}` : "";
            let matchedPassports = [], updatePromises = [];

            pendingPassports.forEach(data => {
                let match = false;
                if (data.roomNumber) {
                    let searchRooms = [data.roomNumber];
                    const normRoom = window.normalizeRoomId ? window.normalizeRoomId(data.roomNumber, curProp) : data.roomNumber;
                    searchRooms.push(normRoom);

                    if (/^[a-zA-Z]0\d$/.test(data.roomNumber)) searchRooms.push(data.roomNumber[0] + data.roomNumber[2]);
                    else if (/^[a-zA-Z]\d$/.test(data.roomNumber)) searchRooms.push(data.roomNumber[0] + '0' + data.roomNumber[1]);
                    
                    if (rL.some(r => {
                        const normR = window.normalizeRoomId ? window.normalizeRoomId(r, curProp) : r;
                        return searchRooms.includes(r) || searchRooms.includes(normR);
                    })) match = true;
                }

                if (!match && data.firstName && data.lastName && gFirstName && gLastName) {
                    if (gLastName.includes(data.lastName.toUpperCase()) && gFirstName.includes(data.firstName.toUpperCase())) match = true;
                }

                if (match) {
                    matchedPassports.push(data);
                    updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', data.id), {
                        checkoutDate: checkoutFormatted,
                        phoneNo: phone,
                        pmsSynced: true,
                        status: "processing"
                    }));
                }
            });

            if (matchedPassports.length === 0) {
                window.showAlert(`No pending passports found matching this room or name.`);
                if (btn) btn.innerHTML = origText;
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            await Promise.all(updatePromises);

            let appendNotes = `\n\n[PASSPORT SYNC - ${new Date().toLocaleDateString('en-GB')}]\n`;
            matchedPassports.forEach(p => {
                const fName = `${p.firstName || ''} ${p.middleName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim();
                appendNotes += `• Passport: ${p.passportNumber || 'N/A'} | ${fName} | Nat: ${p.nationality || 'N/A'} | DOB: ${p.dobYear}-${p.dobMonth}-${p.dobDay}\n`;

                const fnEl = $('first-name'), lnEl = $('last-name'), ctryEl = $('guest-country');
                if (fnEl && !fnEl.value && p.firstName) fnEl.value = p.firstName.toUpperCase();
                if (lnEl && !lnEl.value && p.lastName) lnEl.value = p.lastName.toUpperCase();
                if (ctryEl && !ctryEl.value && p.nationality) {
                    try {
                        const fullCountry = new Intl.DisplayNames(['en'], { type: 'region' }).of(p.nationality);
                        ctryEl.value = fullCountry || p.nationality;
                    } catch (e) {
                        ctryEl.value = p.nationality;
                    }
                }
            });

            const notesEl = $('guest-notes');
            if (notesEl) notesEl.value = (notesEl.value + appendNotes).trim();
            if (window.updateHeaderName) window.updateHeaderName();

            window.showAlert(`✅ Smart Sync Complete!\n\n1. Sent Checkout Date & Phone to TM30 Queue.\n2. Pulled ${matchedPassports.length} passport(s) into PMS notes.\n\nDon't forget to hit Save!`);
        } catch (e) {
            console.error("Sync Error", e);
            window.showAlert("Error syncing passports. Please check your connection.");
        }

        if (btn) btn.innerHTML = origText;
        if (window.lucide) window.lucide.createIcons();
    };

    window.applyTM30Data = data => {
        const fnEl = $('first-name'), lnEl = $('last-name'), ctryEl = $('guest-country'), notesEl = $('guest-notes');
        if (data.firstName && fnEl) fnEl.value = data.firstName;
        if (data.lastName && lnEl) lnEl.value = data.lastName;

        if (data.nationality && ctryEl) {
            try {
                const fullCountry = new Intl.DisplayNames(['en'], { type: 'region' }).of(data.nationality);
                if (fullCountry && fullCountry !== data.nationality) ctryEl.value = fullCountry;
                else ctryEl.value = data.nationality;
            } catch (e) {
                ctryEl.value = data.nationality;
            }
        }

        const dobStr = `${data.dobYear || 'YYYY'}-${data.dobMonth || 'MM'}-${data.dobDay || 'DD'}`;
        const notesAppend = `\n\n[TM30 AUTO-FILL]\nPassport: ${data.passportNumber || 'N/A'}\nNat: ${data.nationality || 'N/A'}\nGender: ${data.gender || 'N/A'}\nDOB: ${dobStr}`;

        if (notesEl) notesEl.value = (notesEl.value + notesAppend).trim();
        if (window.updateHeaderName) window.updateHeaderName();
        window.closeAlert();
    };
})();
