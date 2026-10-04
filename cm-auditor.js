// ==========================================================================
// CHANNEL MANAGER MISSING BOOKING AUDITOR & LIVE MATRIX (cm-auditor.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-auditor.js
// ==========================================================================

window.getBaselineDocId = () => `baseline_${window.currentPropertyId}`;

window.loadPropertyBaseline = async () => {
    try {
        const { doc, getDoc } = window.cmFs;
        const baselineSnap = await getDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'ota_sync', window.getBaselineDocId()));
        if (baselineSnap.exists()) {
            window.snapshotData = baselineSnap.data().matrix || {};
            window.dismissedIds = baselineSnap.data().dismissed || [];
        } else {
            window.snapshotData = {};
            window.dismissedIds = [];
        }
        window.updateDismissedUI();
    } catch (baseErr) {
        console.warn("Could not load baseline for property:", window.currentPropertyId, baseErr);
        window.snapshotData = {};
        window.dismissedIds = [];
    }
};

window.updateDismissedUI = () => {
    const btn = document.getElementById('reset-dismissed-btn');
    if (!btn) return;
    if ((window.dismissedIds || []).length > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
};

window.dismissBooking = async (id) => {
    window.dismissedIds = window.dismissedIds || [];
    if (!window.dismissedIds.includes(id)) window.dismissedIds.push(id);
    try {
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'ota_sync', window.getBaselineDocId()), {
            matrix: window.snapshotData || {},
            dismissed: window.dismissedIds,
            property: window.currentPropertyId,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        window.updateDismissedUI();
        window.checkMissing();
    } catch (e) {
        window.customAlert("Failed to dismiss. Check database permissions.");
    }
};

window.resetDismissed = async () => {
    window.dismissedIds = [];
    try {
        const { doc, setDoc } = window.cmFs;
        await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'ota_sync', window.getBaselineDocId()), {
            matrix: window.snapshotData || {},
            dismissed: window.dismissedIds,
            property: window.currentPropertyId,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        window.updateDismissedUI();
        window.checkMissing();
    } catch (e) {
        window.customAlert("Failed to reset. Check database permissions.");
    }
};

window.findPmsBooking = (id, extraPredicate = null) => {
    if (!id && !extraPredicate) return null;
    const cleanId = id ? String(id).trim() : null;
    const curProp = window.currentPropertyId;

    return (window.staff || []).find(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        if (sProp !== curProp) return false;

        if (cleanId) {
            if (s.bookId === cleanId || s.id === cleanId) return true;
            if (cleanId.includes('-') && s.bookId === cleanId.split('-')[1]) return true;

            if (s.notes) {
                if (s.notes.includes(cleanId)) return true;
                if (s.notes.includes(`[Merged Book ID]: ${cleanId}`)) return true;
                if (s.notes.includes(`--- MERGED WITH BOOKING ${cleanId} ---`)) return true;
            }
        }

        if (extraPredicate && extraPredicate(s)) return true;
        return false;
    });
};

window.checkMissing = () => {
    const rawText = document.getElementById('audit-text')?.value || '';
    const resultDiv = document.getElementById('audit-result');
    if (!resultDiv) return;
    if (!rawText.trim()) { resultDiv.innerHTML = ''; return; }

    const foundIds = new Set();
    const missingHtml = [];
    let actionCount = 0;

    const ignoreIds = ['16646458'];
    const dismissed = window.dismissedIds || [];

    const lowerText = rawText.toLowerCase();
    let source = 'bdc';
    if (lowerText.includes('hostelworld') || /\b\d{5,7}-\d+\b/.test(rawText)) {
        source = 'hw';
    } else if (lowerText.includes('airbnb') || lowerText.includes('switch to traveling') || lowerText.includes('upcoming reservations')) {
        source = 'airbnb';
    } else if (lowerText.includes('booking.com') || lowerText.includes('extranet')) {
        source = 'bdc';
    }

    const addMissing = (id, guestName, badge, type, displayId) => {
        if (ignoreIds.includes(id) || dismissed.includes(id) || foundIds.has(id)) return;
        foundIds.add(id);
        actionCount++;

        let cardStyle = '', icon = '';
        if (type === 'missing') {
            cardStyle = 'bg-rose-50 border-rose-200 text-rose-900';
            icon = '<i data-lucide="arrow-right" class="text-rose-500 shrink-0" size="16"></i>';
        } else if (type === 'cancel') {
            cardStyle = 'bg-amber-50 border-amber-300 text-amber-900';
            icon = '<i data-lucide="arrow-right" class="text-amber-500 shrink-0" size="16"></i>';
        } else if (type === 'ota_cancel') {
            cardStyle = 'bg-slate-100 border-slate-300 text-slate-700 opacity-80';
            icon = '<i data-lucide="arrow-right" class="text-slate-400 shrink-0" size="16"></i>';
        }

        missingHtml.push(`
            <div class="${cardStyle} px-3 py-2 rounded-lg border shadow-sm flex items-center justify-between gap-3 text-xs">
                <div class="font-bold truncate flex items-center gap-2 flex-1 min-w-0">
                    ${icon} <span class="truncate font-black text-sm">${guestName}</span> <span class="opacity-60 font-mono text-xs shrink-0">(${displayId})</span> 
                    <span class="bg-white/60 text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider shrink-0 border border-black/10">${badge}</span>
                </div>
                <button onclick="window.dismissBooking('${id}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded shadow-sm border border-slate-200 transition-colors shrink-0 flex items-center gap-1 cursor-pointer">
                    Dismiss <i data-lucide="x" size="11"></i>
                </button>
            </div>
        `);
    };

    if (source === 'hw') {
        const hwRegex = /\b(\d{5,7}-\d+)\b/g;
        let match;
        while ((match = hwRegex.exec(rawText)) !== null) {
            const id = match[1];
            const startIndex = match.index + id.length;
            const textAfterId = rawText.substring(startIndex);
            const firstDigitIndex = textAfterId.search(/\d/);
            const rawName = firstDigitIndex > -1 ? textAfterId.substring(0, firstDigitIndex) : textAfterId.substring(0, 50);

            let guestName = rawName
                .replace(/Visa|Mastercard|Amex|JCB|Diners|UnionPay|Discover|Maestro|Cash|None/gi, '')
                .replace(/Late|Reference|Card|Type/gi, '')
                .replace(/[\n\r\t]/g, ' ')
                .trim();

            if (!guestName || guestName.length < 2) guestName = "UNKNOWN GUEST";

            const pmsBooking = window.findPmsBooking(id);
            if (!pmsBooking) {
                addMissing(id, guestName, 'Missing in PMS', 'missing', id);
            }
        }
    } else if (source === 'airbnb') {
        const lines = rawText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('entire') || lines[i].toLowerCase().includes('private room') || lines[i].toLowerCase().includes('group')) {
                const rawName = lines[i - 1];
                if (!rawName) continue;

                const guestName = rawName.split(/['’]s group/i)[0].trim();
                const pmsBooking = window.findPmsBooking(null, s => 
                    s.source === 'airbnb' && s.status !== 'cancelled' && s.status !== 'noshow' &&
                    (s.firstName?.toLowerCase().includes(guestName.toLowerCase()) ||
                     s.lastName?.toLowerCase().includes(guestName.toLowerCase()) ||
                     guestName.toLowerCase().includes(s.firstName?.toLowerCase()) ||
                     guestName.toLowerCase().includes(s.lastName?.toLowerCase()))
                );

                if (!pmsBooking) {
                    const pseudoId = 'ABNB_' + guestName.replace(/\s+/g, '').toUpperCase();
                    addMissing(pseudoId, guestName, 'Missing Airbnb', 'missing', 'AirBnB');
                }
            }
        }
    } else {
        const lines = rawText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
        const numRegex = /\b\d{10}\b/g;

        for (let i = 0; i < lines.length; i++) {
            let match;
            while ((match = numRegex.exec(lines[i])) !== null) {
                const id = match[0];
                const pmsBooking = window.findPmsBooking(id);
                let guestName = "UNKNOWN GUEST";
                let isCancelled = false;

                for (let j = i; j >= Math.max(0, i - 12); j--) {
                    if (/\b(adult|child|adults|children)\b/i.test(lines[j])) {
                        if (j - 1 >= 0) {
                            const rawLine = lines[j - 1];
                            guestName = rawLine
                                .replace(/THB|฿/gi, '')
                                .replace(/Payment via Booking\.com/i, '')
                                .replace(/Bank transfer/i, '')
                                .replace(/StatusPriceCommission and chargesBooking number/i, '')
                                .replace(/[\d,.]+/g, '')
                                .trim();

                            for (let k = Math.max(0, j - 2); k <= i; k++) {
                                if (lines[k] && /cancelled|canceled/i.test(lines[k])) isCancelled = true;
                            }
                        }
                        break;
                    }
                }
                if (!guestName || guestName.length < 2) guestName = "UNKNOWN GUEST";

                if (!pmsBooking && !isCancelled) addMissing(id, guestName, 'Missing', 'missing', id);
                else if (!pmsBooking && isCancelled) addMissing(id, guestName, 'OTA Cancelled', 'ota_cancel', id);
                else if (pmsBooking && isCancelled && pmsBooking.status !== 'cancelled') addMissing(id, guestName, 'Cancel in PMS!', 'cancel', id);
            }
        }
    }

    if (actionCount === 0) {
        resultDiv.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-400 text-emerald-800 p-2.5 rounded-lg shadow-sm text-center">
                <div class="font-black text-sm mb-0.5 flex items-center justify-center gap-1.5">
                    <i data-lucide="check-circle" size="16" class="text-emerald-500"></i> ALL CLEAR
                </div>
                <p class="font-bold text-xs text-emerald-600">No missing or pending cancelled bookings found for this property.</p>
            </div>`;
    } else {
        resultDiv.innerHTML = `
            <div class="bg-slate-50 border border-slate-300 p-2.5 rounded-lg shadow-sm">
                <div class="font-black text-xs text-slate-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                    <i data-lucide="alert-triangle" size="14" class="text-rose-600"></i> ${actionCount} ACTION ITEM${actionCount > 1 ? 'S' : ''} FOUND
                </div>
                <div class="flex flex-col gap-1.5">
                    ${missingHtml.join('')}
                </div>
            </div>`;
    }
    if (window.lucide) window.lucide.createIcons();
};

window.renderManualGrid = () => {
    const filterEl = document.getElementById('grid-filter');
    const filter = filterEl ? filterEl.value : 'changes';
    const head = document.getElementById('sync-head');
    const body = document.getElementById('sync-body');
    const noMsg = document.getElementById('no-changes-msg');

    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    const colsToShowRaw = [];
    (window.viewDates || []).forEach(d => {
        let show = false;
        if (filter === 'all') show = true;
        else {
            (window.roomTypes || []).forEach(t => {
                const live = (window.liveInventory?.[d]?.[t] !== undefined) ? window.liveInventory[d][t] : 0;
                const snap = window.snapshotData?.[d]?.[t] !== undefined ? window.snapshotData[d][t] : (window.totalRoomsByType?.[t] || 0);
                const isUrgent = live <= 2 && (window.totalRoomsByType?.[t] || 0) > 2;

                if (filter === 'changes' && live !== snap) show = true;
                if (filter === 'urgent' && isUrgent) show = true;
            });
        }
        if (show) colsToShowRaw.push(d);
    });

    if (colsToShowRaw.length === 0) {
        if (noMsg) noMsg.classList.remove('hidden');
        const title = document.getElementById('no-data-title');
        const desc = document.getElementById('no-data-desc');
        if (title && desc) {
            if (filter === 'urgent') {
                title.innerText = "NO URGENT DATES";
                desc.innerText = "You have plenty of availability everywhere.";
            } else {
                title.innerText = "EVERYTHING IS SYNCED";
                desc.innerText = "No changes detected since your last sync.";
            }
        }
        return;
    } else {
        if (noMsg) noMsg.classList.add('hidden');
    }

    const finalCols = [];
    for (let i = 0; i < colsToShowRaw.length; i++) {
        if (i > 0) {
            const prevD = new Date(colsToShowRaw[i - 1] + "T12:00:00Z");
            const currD = new Date(colsToShowRaw[i] + "T12:00:00Z");
            const diff = Math.round((currD - prevD) / 86400000);
            if (diff > 1) finalCols.push({ type: 'gap' });
        }
        finalCols.push({ type: 'date', val: colsToShowRaw[i] });
    }

    let trHead = `<tr class="frozen-row"><th class="frozen-corner w-24 min-w-[7rem] max-w-[9rem] text-[11px] whitespace-normal break-words text-left leading-tight">ROOM TYPE</th>`;
    finalCols.forEach(col => {
        if (col.type === 'gap') {
            trHead += `<th class="w-2 min-w-[8px] bg-amber-400 border-x-[2px] border-white" title="Skipped Dates"></th>`;
        } else {
            const dt = new Date(col.val + "T12:00:00Z");
            trHead += `<th class="w-[32px] min-w-[32px] px-0 py-1 leading-tight text-center border-b border-slate-400">
                <span class="text-blue-300 text-[10px] uppercase font-bold tracking-tight block">${window.mNames[dt.getUTCMonth()]}</span>
                <span class="text-sm font-black">${dt.getUTCDate()}</span>
            </th>`;
        }
    });
    trHead += `</tr>`;
    head.innerHTML = trHead;

    (window.roomTypes || []).forEach((t, index) => {
        const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-100';
        const shortName = window.displayAbbrev?.[t] || t;

        let tr = `<tr class="${rowBg} hover:bg-slate-200 transition-colors">
            <td class="frozen-col font-black text-[11px] sm:text-xs leading-snug whitespace-normal break-words ${rowBg}" title="${t}">
                ${shortName}<br><span class="text-slate-400 font-bold text-[9px] uppercase mt-0.5 inline-block tracking-widest">CAP: ${window.totalRoomsByType?.[t] || 0}</span>
            </td>`;

        finalCols.forEach(col => {
            if (col.type === 'gap') {
                tr += `<td class="bg-amber-300 border-x-[2px] border-white"></td>`;
            } else {
                const d = col.val;
                const live = (window.liveInventory?.[d]?.[t] !== undefined) ? window.liveInventory[d][t] : 0;
                const snap = window.snapshotData?.[d]?.[t] !== undefined ? window.snapshotData[d][t] : (window.totalRoomsByType?.[t] || 0);
                const isUrgent = live <= 2 && (window.totalRoomsByType?.[t] || 0) > 2;

                let content = `<span class="font-bold text-sm text-slate-700">${live}</span>`;

                if (live !== snap) {
                    content = `<div class="flex flex-col items-center justify-center leading-none"><span class="text-[10px] font-bold text-red-400 line-through mb-0.5">${snap}</span><span class="font-black text-red-600 text-base">${live}</span></div>`;
                }
                if (filter === 'urgent' && isUrgent) {
                    content = `<span class="font-black text-orange-600 text-base">${live}</span>`;
                }
                if (live !== snap && filter === 'urgent' && isUrgent) {
                    content = `<div class="flex flex-col items-center justify-center leading-none"><span class="text-[10px] font-bold text-red-400 line-through mb-0.5">${snap}</span><span class="font-black text-red-600 text-base">${live}</span></div>`;
                }

                tr += `<td>${content}</td>`;
            }
        });
        tr += `</tr>`;
        body.innerHTML += tr;
    });

    if (window.lucide) window.lucide.createIcons();
};

window.markSynced = () => {
    const shortKey = window.toDisplayPropKey ? window.toDisplayPropKey(window.currentPropertyId) : 'SWIMS';
    window.customAlert(`Mark all current availability as synced for ${shortKey}? This will clear your 'Changes' list until new bookings arrive.`, true, async () => {
        window.showLoader('SAVING SYNC...');
        window.snapshotData = JSON.parse(JSON.stringify(window.liveInventory || {}));
        try {
            const { doc, setDoc } = window.cmFs;
            await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'ota_sync', window.getBaselineDocId()), {
                matrix: window.snapshotData,
                dismissed: window.dismissedIds || [],
                property: window.currentPropertyId,
                updatedAt: new Date().toISOString()
            });
            window.renderManualGrid();
        } catch (e) {
            window.customAlert("Save failed. Check permissions on 'ota_sync' collection: " + e.message);
        }
        window.hideLoader();
    });
};
