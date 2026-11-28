// ==========================================================================
// pms/pms-vol-sync.js - Connects PMS to Separate Volunteer Calendar DB (volcalendar1)
// Wild & Wandering Property Management System
// ==========================================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { customAlert } from '../core/ui-dialogs.js';
import { toDisplayPropKey } from '../core/properties.js';
import { roundCurrency } from '../core/money.js';

const $ = id => document.getElementById(id);

const VOL_APP_ID = 'vol-calendar-wet-v1';
const volFirebaseConfig = {
    apiKey: "AIzaSyDd_i6as2LtvNWE1I44HFCU0LyJ4iO7KKQ",
    authDomain: "volcalendar1.firebaseapp.com",
    projectId: "volcalendar1",
    storageBucket: "volcalendar1.firebasestorage.app",
    messagingSenderId: "1081934202587",
    appId: "1:1081934202587:web:28b226efb37216a2442efe"
};

const LEDGER_OPTIONS = [
    { key: 'hw_wet', label: 'HW WET (Hostelworld @ WET)' },
    { key: 'bdc_wet', label: 'BDC WET (Booking.com @ WET)' },
    { key: 'hw_swims', label: 'HW SWIMS (Hostelworld @ SWIMS)' },
    { key: 'bdc_swims', label: 'BDC SWIMS (Booking.com @ SWIMS)' },
    { key: 'agoda', label: 'AGODA' }
];

let volApp = null;
let volDb = null;

// --------------------------------------------------------------------------
// 1. VOLUNTEER CALENDAR FIREBASE CONNECTION & FETCH
// --------------------------------------------------------------------------

async function getVolDb() {
    if (!volApp) {
        volApp = getApps().find(a => a.name === 'pmsVolSyncApp') || initializeApp(volFirebaseConfig, 'pmsVolSyncApp');
    }
    if (!volDb) {
        volDb = getFirestore(volApp);
    }
    const auth = getAuth(volApp);
    if (!auth.currentUser) {
        await signInAnonymously(auth);
    }
    return volDb;
}

async function fetchAllVolStaff(dbInstance) {
    const snap = await getDocs(collection(dbInstance, 'artifacts', VOL_APP_ID, 'public', 'data', 'staff'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function showVolToast(title, msg, isWarn = false) {
    if (typeof window.showToast === 'function') {
        window.showToast(title, msg, isWarn ? 'error' : 'success');
        return;
    }
    let container = $('vol-sync-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'vol-sync-toast-container';
        container.className = 'fixed bottom-4 right-4 z-[10100] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-3.5 py-2.5 rounded-lg shadow-xl border text-xs font-bold max-w-sm transition-opacity duration-300 ${
        isWarn ? 'bg-amber-900 text-amber-50 border-amber-500' : 'bg-slate-900 text-white border-emerald-500'
    }`;
    toast.innerHTML = `<div class="font-black uppercase text-[10px] ${isWarn ? 'text-amber-300' : 'text-emerald-400'}">${title}</div><div class="mt-0.5">${msg}</div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --------------------------------------------------------------------------
// 2. NAME NORMALIZATION, MATCH SCORING & LEDGER RESOLUTION
// --------------------------------------------------------------------------

function normalizeRawName(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[.,_()/\\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function cleanVolunteerName(firstName = '', lastName = '') {
    let fn = normalizeRawName(firstName);
    let ln = normalizeRawName(lastName);

    // Volunteers add a trailing "V" on OTA bookings (e.g. "JOHN SMITH V")
    if (ln) {
        ln = ln.replace(/(?:^|\s+)V$/i, '').trim();
    }
    if (fn && !ln) {
        fn = fn.replace(/\s+V$/i, '').trim();
    }

    let combined = `${fn} ${ln}`.replace(/\s+/g, ' ').trim();
    combined = combined.replace(/\s+V$/i, '').trim();
    return combined;
}

function daysBetween(ymdA, ymdB) {
    if (!ymdA || !ymdB) return 9999;
    const msA = Date.parse(ymdA + 'T12:00:00Z');
    const msB = Date.parse(ymdB + 'T12:00:00Z');
    if (isNaN(msA) || isNaN(msB)) return 9999;
    return Math.round(Math.abs(msA - msB) / 86400000);
}

function scoreVolCandidate(volDoc, ctx) {
    const { cleanName, tokens, checkIn, checkOut, linkedVolCalId } = ctx;

    if (linkedVolCalId && volDoc.id === linkedVolCalId) {
        return { score: 1000, nameScore: 150, reason: 'Linked record' };
    }

    const vClean = cleanVolunteerName(volDoc.name || '', '');
    const vTokens = vClean.split(' ').filter(Boolean);
    if (!vClean || !cleanName) {
        return { score: -100, nameScore: 0, reason: '' };
    }

    let nameScore = 0;
    let reason = '';

    const pmsSorted = [...tokens].sort().join(' ');
    const volSorted = [...vTokens].sort().join(' ');

    if (vClean === cleanName) {
        nameScore = 120;
        reason = 'Exact name match';
    } else if (tokens.length > 0 && pmsSorted === volSorted) {
        nameScore = 110;
        reason = 'Exact name match (reordered)';
    } else if (vTokens.length >= 2 && tokens.length >= 2) {
        const volInPms = vTokens.every(t => tokens.includes(t));
        const pmsInVol = tokens.every(t => vTokens.includes(t));
        if (volInPms || pmsInVol) {
            nameScore = 90;
            reason = 'Full name match';
        }
    }

    if (nameScore === 0) {
        // Handle single-word nicknames / first-name-only entries in Vol Cal (e.g. "FABI" vs "FABIAN MULLER")
        const shorter = vTokens.length <= tokens.length ? vTokens : tokens;
        const longer = vTokens.length <= tokens.length ? tokens : vTokens;
        const meaningfulMatches = shorter.filter(st =>
            st.length >= 3 && longer.some(lt => lt === st || (lt.startsWith(st) && st.length >= 4) || (st.startsWith(lt) && lt.length >= 4))
        );
        if (shorter.length === 1 && meaningfulMatches.length === 1) {
            nameScore = 65;
            reason = 'First/short name match';
        } else if (meaningfulMatches.length > 0) {
            const ratio = meaningfulMatches.length / Math.max(vTokens.length, tokens.length);
            nameScore = Math.round(ratio * 70);
            reason = 'Partial name match';
        }
    }

    let dateScore = 0;
    if (nameScore >= 40 && checkIn && volDoc.checkIn) {
        const volOut = volDoc.checkOut || volDoc.checkIn;
        const pmsOut = checkOut || checkIn;
        if (checkIn < volOut && volDoc.checkIn < pmsOut) {
            dateScore = 45;
            reason = reason ? `${reason} + Overlapping dates` : 'Overlapping dates';
        } else {
            const diff = Math.min(daysBetween(checkIn, volDoc.checkIn), daysBetween(checkIn, volOut));
            if (diff <= 7) {
                dateScore = 25;
                reason = reason ? `${reason} + Nearby dates` : 'Nearby dates';
            } else if (diff <= 30) {
                dateScore = 10;
            }
        }
    }

    let statusScore = 0;
    const st = String(volDoc.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'noshow') statusScore = -150;
    else if (st === 'here' || st === 'future') statusScore = 15;
    else if (st === 'left') statusScore = 5;

    return {
        score: nameScore + dateScore + statusScore,
        nameScore,
        reason
    };
}

function rankVolCandidates(volList, pmsContext) {
    return volList
        .map(v => ({
            doc: v,
            ...scoreVolCandidate(v, pmsContext)
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(b.doc.checkIn || '').localeCompare(String(a.doc.checkIn || ''));
        });
}

function resolvePropSuffix() {
    const cfg = window.currentPropertyConfig || {};
    if (cfg.volCalPropKey) {
        const custom = String(cfg.volCalPropKey).trim().toLowerCase();
        if (custom === 'wet' || custom === 'swims') return custom;
    }
    const curId = window.currentPropertyId || '';
    const displayKey = toDisplayPropKey ? toDisplayPropKey(curId) : '';
    const hint = `${curId} ${cfg.short || ''} ${cfg.name || ''} ${displayKey}`.toLowerCase();
    if (hint.includes('swims')) return 'swims';
    if (hint.includes('wet')) return 'wet';
    return 'wet';
}

export function resolveVolLedgerKey(source, payments = [], savedKey = '') {
    if (savedKey && LEDGER_OPTIONS.some(o => o.key === savedKey)) {
        return savedKey;
    }

    const propSuffix = resolvePropSuffix();
    const src = String(source || '').trim().toLowerCase();

    if (src.includes('hostelworld') || src === 'hwl') return `hw_${propSuffix}`;
    if (src.includes('booking') || src === 'bdc') return `bdc_${propSuffix}`;
    if (src.includes('agoda') || src === 'ago') return 'agoda';

    const methodsStr = (payments || []).map(p => String(p.method || '').toLowerCase()).join(' ');
    if (methodsStr.includes('hwl') || methodsStr.includes('hostelworld')) return `hw_${propSuffix}`;
    if (methodsStr.includes('bdc') || methodsStr.includes('booking')) return `bdc_${propSuffix}`;
    if (methodsStr.includes('ago') || methodsStr.includes('agoda')) return 'agoda';

    return `bdc_${propSuffix}`;
}

function computePmsPaymentState({ source, totalPrice, netPrice, payments = [] }) {
    let positivePaid = 0;
    let negativePaid = 0;

    (payments || []).forEach(p => {
        const amt = Number(p.amt) || 0;
        if (amt > 0) positivePaid += amt;
        else if (amt < 0) negativePaid += Math.abs(amt);
    });

    positivePaid = roundCurrency(positivePaid);
    negativePaid = roundCurrency(negativePaid);
    const netPaid = roundCurrency(positivePaid - negativePaid);
    const hasRefundPayment = negativePaid > 0;
    const isRefunded = hasRefundPayment && netPaid <= 0.01;

    const src = String(source || '').toLowerCase();
    let proposedAmt = positivePaid;
    let amountHint = '';

    if (positivePaid > 0) {
        amountHint = 'From PMS payments recorded on folio';
    } else if (src.includes('hostelworld') && totalPrice > netPrice && netPrice > 0) {
        proposedAmt = roundCurrency(totalPrice - netPrice);
        amountHint = 'Estimated Hostelworld deposit (Total - Net)';
    } else if (src.includes('booking') && totalPrice > 0) {
        proposedAmt = roundCurrency(totalPrice);
        amountHint = 'Booking.com full booking price';
    } else if (totalPrice > 0) {
        proposedAmt = roundCurrency(totalPrice);
        amountHint = 'From booking total price';
    } else {
        proposedAmt = 0;
        amountHint = 'No payments recorded on PMS folio yet';
    }

    return {
        positivePaid,
        negativePaid,
        netPaid,
        isRefunded,
        proposedAmt,
        amountHint
    };
}

// --------------------------------------------------------------------------
// 3. PMS CONTEXT READER & LINK PERSISTENCE
// --------------------------------------------------------------------------

function readLiveModalBookingContext() {
    const id = $('guest-id')?.value || '';
    const firstName = $('first-name')?.value.trim().toUpperCase() || '';
    const lastName = $('last-name')?.value.trim().toUpperCase() || '';
    const status = ($('guest-status-hidden')?.value || $('status-cycle-btn')?.dataset?.value || 'future').toLowerCase();
    const checkIn = $('check-in')?.value || '';
    const checkOut = $('check-out')?.value || '';
    const source = $('booking-source')?.value || 'direct';
    const totalPrice = Number($('total-price')?.value) || 0;
    const netPrice = Number($('net-price')?.value) || 0;

    const payments = Array.from(document.querySelectorAll('.payment-row') || []).map(r => ({
        date: r.querySelector('.pay-date')?.value || '',
        amt: Number(r.querySelector('.pay-amt')?.value) || 0,
        method: r.querySelector('.pay-method')?.value || 'cash'
    }));

    const existingRec = (window.staff || []).find(s => s.id === id);
    const linkedVolCalId = $('guest-modal')?.dataset?.volCalId || existingRec?.volCalId || '';
    const savedLedgerKey = $('guest-modal')?.dataset?.volLedgerKey || existingRec?.volLedgerKey || '';

    return {
        id,
        firstName,
        lastName,
        status,
        checkIn,
        checkOut,
        source,
        totalPrice,
        netPrice,
        payments,
        volCalId: linkedVolCalId,
        volLedgerKey: savedLedgerKey
    };
}

async function persistVolLinkOnPmsBooking(pmsId, volCalId, volLedgerKey) {
    const gModal = $('guest-modal');
    if (gModal) {
        gModal.dataset.volCalId = volCalId || '';
        gModal.dataset.volLedgerKey = volLedgerKey || '';
    }

    if (!pmsId) return;

    const staffList = window.staff || [];
    const localRec = staffList.find(s => s.id === pmsId);
    if (localRec) {
        localRec.volCalId = volCalId;
        localRec.volLedgerKey = volLedgerKey;
    }

    // Only write to Firestore if this PMS booking already exists in staff list
    if (localRec && window.db && window.appId) {
        try {
            const pmsDocRef = doc(window.db, 'artifacts', window.appId, 'public', 'data', 'staff', pmsId);
            await updateDoc(pmsDocRef, {
                volCalId,
                volLedgerKey
            });
        } catch (err) {
            console.warn('[VolSync] Could not save volCalId back to PMS booking:', err);
        }
    }
}

// --------------------------------------------------------------------------
// 4. VOLUNTEER SYNC CONFIRMATION & PICKER MODAL
// --------------------------------------------------------------------------

function ensureVolSyncModal() {
    let modal = $('vol-sync-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'vol-sync-modal';
    modal.className = 'hidden fixed inset-0 z-[10050] bg-slate-900/60 backdrop-blur-xs items-center justify-center p-3';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-slate-800 text-xs">
            <div class="bg-slate-900 px-3.5 py-2.5 text-white flex justify-between items-center">
                <span class="font-black uppercase tracking-wide flex items-center gap-1.5 text-pink-300">
                    <i data-lucide="users" size="15"></i>
                    Sync to Volunteer Calendar
                </span>
                <button type="button" id="vol-sync-close" class="text-slate-400 hover:text-white cursor-pointer text-base leading-none">&times;</button>
            </div>
            <div class="p-3.5 space-y-3">
                <div id="vol-sync-pms-summary" class="bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-[11px] font-bold text-slate-700"></div>

                <div id="vol-sync-match-banner" class="rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase"></div>

                <div>
                    <div class="flex justify-between items-center mb-1">
                        <label class="text-[10px] font-black uppercase text-slate-500">Target Volunteer in Vol Cal</label>
                        <input type="text" id="vol-sync-search" placeholder="Filter volunteer name..." class="px-2 py-0.5 border border-slate-300 rounded text-[11px] font-bold uppercase w-40 outline-none focus:ring-1 focus:ring-pink-500">
                    </div>
                    <select id="vol-sync-target" class="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 uppercase outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"></select>
                    <div id="vol-sync-current-ledger" class="mt-1.5 flex flex-wrap gap-1 text-[10px] font-bold"></div>
                </div>

                <div class="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200">
                    <div>
                        <label class="block text-[10px] font-black uppercase text-slate-500 mb-1">Vol Cal Ledger Line</label>
                        <select id="vol-sync-ledger-key" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black uppercase text-slate-800 outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer">
                            ${LEDGER_OPTIONS.map(o => `<option value="${o.key}">${o.label}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-black uppercase text-slate-500 mb-1">Amount (฿)</label>
                        <input type="number" id="vol-sync-amt" step="0.01" min="0" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-emerald-700 outline-none focus:ring-2 focus:ring-pink-500">
                        <div id="vol-sync-amt-hint" class="text-[9px] font-bold text-slate-400 mt-0.5 leading-tight"></div>
                    </div>
                </div>

                <label class="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 cursor-pointer select-none">
                    <input type="checkbox" id="vol-sync-ref" class="w-4 h-4 accent-pink-600 cursor-pointer">
                    <span class="font-black uppercase text-pink-900 text-[11px]">Mark this line as Refunded in Vol Cal</span>
                </label>
            </div>
            <div class="bg-slate-100 px-3.5 py-2.5 border-t border-slate-200 flex justify-between items-center gap-2">
                <a href="https://loren-6q.github.io/WETvCal/" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-black uppercase rounded-lg text-[11px] flex items-center gap-1 transition-colors" title="Open Volunteer Calendar in New Window">
                    <i data-lucide="external-link" size="13"></i>
                    <span>Open Vol Cal</span>
                </a>
                <div class="flex items-center gap-2">
                    <button type="button" id="vol-sync-cancel" class="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-200 text-slate-700 font-black uppercase rounded-lg cursor-pointer text-[11px]">Cancel</button>
                    <button type="button" id="vol-sync-confirm" class="px-4 py-1.5 bg-pink-600 hover:bg-pink-700 text-white font-black uppercase rounded-lg shadow-sm cursor-pointer text-[11px] flex items-center gap-1">
                        <i data-lucide="check" size="14"></i>
                        <span>Push to Vol Cal</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    };
    $('vol-sync-close').onclick = close;
    $('vol-sync-cancel').onclick = close;
    modal.addEventListener('click', e => {
        if (e.target === modal) close();
    });

    return modal;
}

function renderSelectedVolLedgerPreview(volDoc, activeKey) {
    const container = $('vol-sync-current-ledger');
    if (!container) return;
    if (!volDoc) {
        container.innerHTML = '';
        return;
    }

    const L = volDoc.ledger || {};
    const chips = [];

    if (L.deposit?.paid) {
        chips.push(`<span class="px-1.5 py-0.5 rounded ${L.deposit.ref ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">$ DEP: ${L.deposit.ref ? 'REFUNDED' : 'HELD'}</span>`);
    }

    LEDGER_OPTIONS.forEach(opt => {
        const entry = L[opt.key];
        const amt = Number(entry?.amt || 0);
        const isCurrent = opt.key === activeKey;
        if (amt > 0 || isCurrent) {
            const labelShort = opt.key.replace('_', ' ').toUpperCase();
            const cls = isCurrent
                ? 'bg-pink-100 text-pink-900 ring-1 ring-pink-400'
                : (entry?.ref ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700');
            chips.push(`<span class="px-1.5 py-0.5 rounded ${cls}">${labelShort}: ฿${amt}${entry?.ref ? ' (REF)' : ''}</span>`);
        }
    });

    container.innerHTML = chips.length > 0
        ? chips.join('')
        : '<span class="text-slate-400 italic">No existing deposits/payments on this Vol Cal record yet.</span>';
}

function formatVolOptionLabel(candidate) {
    const v = candidate.doc;
    const prefix = candidate.score >= 120 ? '★ MATCH: ' : (candidate.score >= 75 ? '• ' : '');
    const st = String(v.status || 'future').toUpperCase();
    return `${prefix}${v.name || 'UNKNOWN'} (${v.checkIn || '--'} → ${v.checkOut || '--'}) [${st}]`;
}

// --------------------------------------------------------------------------
// 5. PUBLIC ACTIONS: MANUAL VOL SYNC & REFUND SYNC
// --------------------------------------------------------------------------

export const syncToVolunteerApp = async () => {
    const ctx = readLiveModalBookingContext();

    if (ctx.status !== 'vol') {
        return customAlert('VOL Status Required', 'Vol Sync is only available for bookings with status VOL.');
    }

    const cleanName = cleanVolunteerName(ctx.firstName, ctx.lastName);
    if (!cleanName) {
        return customAlert('Missing Name', 'Guest name is required to match an existing volunteer in Volunteer Calendar.');
    }

    const btn = $('vol-sync-btn');
    const origBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="text-[9px] font-black">SYNCING...</span>`;
    }

    try {
        const dbInstance = await getVolDb();
        const volStaff = await fetchAllVolStaff(dbInstance);

        if (volStaff.length === 0) {
            return customAlert('No Volunteers Found', 'The Volunteer Calendar database has no volunteer records to match against.');
        }

        const tokens = cleanName.split(' ').filter(Boolean);
        const ranked = rankVolCandidates(volStaff, {
            cleanName,
            tokens,
            checkIn: ctx.checkIn,
            checkOut: ctx.checkOut,
            linkedVolCalId: ctx.volCalId
        });

        const defaultLedgerKey = resolveVolLedgerKey(ctx.source, ctx.payments, ctx.volLedgerKey);
        const payState = computePmsPaymentState(ctx);
        const bestMatch = ranked[0];
        const hasConfidentMatch = bestMatch && bestMatch.score >= 75;

        const modal = ensureVolSyncModal();
        const searchEl = $('vol-sync-search');
        const targetEl = $('vol-sync-target');
        const ledgerEl = $('vol-sync-ledger-key');
        const amtEl = $('vol-sync-amt');
        const amtHintEl = $('vol-sync-amt-hint');
        const refEl = $('vol-sync-ref');
        const summaryEl = $('vol-sync-pms-summary');
        const bannerEl = $('vol-sync-match-banner');

        const propDisplay = (toDisplayPropKey ? toDisplayPropKey(window.currentPropertyId) : '') || window.currentPropertyId || 'PMS';
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-slate-900 font-black uppercase">${ctx.firstName} ${ctx.lastName}</span>
                    <span class="px-1.5 py-0.5 rounded bg-slate-800 text-white text-[9px]">${propDisplay} • ${String(ctx.source || 'direct').toUpperCase()}</span>
                </div>
                <div class="text-slate-500 text-[10px] mt-0.5">
                    PMS Dates: ${ctx.checkIn || '--'} → ${ctx.checkOut || '--'} | PMS Paid: ฿${payState.positivePaid.toFixed(2)} | Net: ฿${payState.netPaid.toFixed(2)}
                </div>
            `;
        }

        if (bannerEl) {
            if (hasConfidentMatch) {
                bannerEl.className = 'rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300';
                bannerEl.innerText = `Matched: ${bestMatch.doc.name} (${bestMatch.reason || 'Match'})`;
            } else {
                bannerEl.className = 'rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300';
                bannerEl.innerText = `No close auto-match for "${cleanName}" — pick the volunteer below`;
            }
        }

        const populateSelect = (filterText = '') => {
            const q = normalizeRawName(filterText);
            const curSelected = targetEl.value || (hasConfidentMatch ? bestMatch.doc.id : '');
            const filtered = ranked.filter(c => {
                if (!q) return true;
                return normalizeRawName(c.doc.name).includes(q) || String(c.doc.checkIn || '').includes(q);
            });

            if (filtered.length === 0) {
                targetEl.innerHTML = `<option value="">-- NO MATCHING VOLUNTEERS --</option>`;
            } else {
                targetEl.innerHTML = filtered
                    .map(c => `<option value="${c.doc.id}">${formatVolOptionLabel(c)}</option>`)
                    .join('');
                if (curSelected && filtered.some(c => c.doc.id === curSelected)) {
                    targetEl.value = curSelected;
                } else if (hasConfidentMatch && filtered.some(c => c.doc.id === bestMatch.doc.id)) {
                    targetEl.value = bestMatch.doc.id;
                } else {
                    targetEl.value = filtered[0].doc.id;
                }
            }

            const selDoc = volStaff.find(v => v.id === targetEl.value);
            renderSelectedVolLedgerPreview(selDoc, ledgerEl.value);
        };

        if (ledgerEl) ledgerEl.value = defaultLedgerKey;
        if (searchEl) searchEl.value = '';
        targetEl.value = hasConfidentMatch ? bestMatch.doc.id : (ranked[0]?.doc.id || '');
        populateSelect('');

        const syncAmtFromSelection = () => {
            const selDoc = volStaff.find(v => v.id === targetEl.value);
            const existingLine = selDoc?.ledger?.[ledgerEl.value];
            const existingAmt = Number(existingLine?.amt || 0);
            if (payState.proposedAmt > 0) {
                amtEl.value = payState.proposedAmt;
                if (amtHintEl) amtHintEl.innerText = payState.amountHint;
            } else if (existingAmt > 0) {
                amtEl.value = existingAmt;
                if (amtHintEl) amtHintEl.innerText = 'Existing amount in Vol Cal';
            } else {
                amtEl.value = 0;
                if (amtHintEl) amtHintEl.innerText = payState.amountHint;
            }
            refEl.checked = payState.isRefunded || Boolean(existingLine?.ref);
            renderSelectedVolLedgerPreview(selDoc, ledgerEl.value);
        };

        syncAmtFromSelection();

        searchEl.oninput = () => populateSelect(searchEl.value);
        targetEl.onchange = syncAmtFromSelection;
        ledgerEl.onchange = syncAmtFromSelection;

        $('vol-sync-confirm').onclick = async () => {
            const targetId = targetEl.value;
            const ledgerKey = ledgerEl.value;
            const rawAmt = Number(amtEl.value) || 0;
            const isRef = Boolean(refEl.checked);

            if (!targetId) {
                return customAlert('Select Volunteer', 'Please choose an existing volunteer record from Volunteer Calendar.');
            }

            const confirmBtn = $('vol-sync-confirm');
            const origConfirmHtml = confirmBtn.innerHTML;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span>SAVING...</span>';

            try {
                const selectedVol = volStaff.find(v => v.id === targetId);
                const existingAmt = Number(selectedVol?.ledger?.[ledgerKey]?.amt || 0);
                const finalAmt = rawAmt > 0 ? roundCurrency(rawAmt) : (isRef && existingAmt > 0 ? existingAmt : 0);

                const volDocRef = doc(dbInstance, 'artifacts', VOL_APP_ID, 'public', 'data', 'staff', targetId);
                await updateDoc(volDocRef, {
                    [`ledger.${ledgerKey}`]: {
                        amt: finalAmt > 0 ? finalAmt : '',
                        ref: isRef
                    }
                });

                await persistVolLinkOnPmsBooking(ctx.id, targetId, ledgerKey);

                modal.classList.add('hidden');
                modal.style.display = 'none';

                const lineName = ledgerKey.replace('_', ' ').toUpperCase();
                const msg = `${selectedVol?.name || 'Volunteer'} → ${lineName}: ฿${finalAmt} (${isRef ? 'REFUNDED' : 'HELD'})`;
                showVolToast('Vol Cal Updated', msg);
            } catch (pushErr) {
                console.error('[VolSync Push Error]:', pushErr);
                customAlert('Vol Sync Failed', pushErr.message);
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = origConfirmHtml;
                if (window.lucide) window.lucide.createIcons();
            }
        };

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error('[VolSync Error]:', err);
        customAlert('Vol Sync Error', 'Could not connect to Volunteer Calendar database:\n' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origBtnHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

export const syncRefundToVolunteerApp = async (isRefunded = true, bookingArg = null) => {
    const ctx = bookingArg
        ? {
            id: bookingArg.id || '',
            firstName: bookingArg.firstName || '',
            lastName: bookingArg.lastName || '',
            status: String(bookingArg.status || '').toLowerCase(),
            checkIn: bookingArg.checkIn || '',
            checkOut: bookingArg.checkOut || '',
            source: bookingArg.source || 'direct',
            totalPrice: Number(bookingArg.totalPrice) || 0,
            netPrice: Number(bookingArg.netPrice) || 0,
            payments: Array.isArray(bookingArg.payments) ? bookingArg.payments : [],
            volCalId: bookingArg.volCalId || '',
            volLedgerKey: bookingArg.volLedgerKey || ''
        }
        : readLiveModalBookingContext();

    if (ctx.status !== 'vol') return false;

    try {
        const dbInstance = await getVolDb();
        const volStaff = await fetchAllVolStaff(dbInstance);
        if (volStaff.length === 0) return false;

        let targetVol = ctx.volCalId ? volStaff.find(v => v.id === ctx.volCalId) : null;

        if (!targetVol) {
            const cleanName = cleanVolunteerName(ctx.firstName, ctx.lastName);
            const tokens = cleanName.split(' ').filter(Boolean);
            const ranked = rankVolCandidates(volStaff, {
                cleanName,
                tokens,
                checkIn: ctx.checkIn,
                checkOut: ctx.checkOut,
                linkedVolCalId: ctx.volCalId
            });
            const top = ranked[0];
            const second = ranked[1];
            const isUnambiguous = top && top.score >= 120 && (!second || (top.score - second.score) >= 25);
            if (isUnambiguous) {
                targetVol = top.doc;
            }
        }

        if (!targetVol) {
            showVolToast('Vol Cal Link Needed', 'Refund saved in PMS. Open booking & click VOL SYNC to pick the volunteer in Vol Cal.', true);
            return false;
        }

        const ledgerKey = resolveVolLedgerKey(ctx.source, ctx.payments, ctx.volLedgerKey);
        const existingAmt = Number(targetVol.ledger?.[ledgerKey]?.amt || 0);
        const payState = computePmsPaymentState(ctx);
        const finalAmt = existingAmt > 0 ? existingAmt : payState.proposedAmt;

        const volDocRef = doc(dbInstance, 'artifacts', VOL_APP_ID, 'public', 'data', 'staff', targetVol.id);
        await updateDoc(volDocRef, {
            [`ledger.${ledgerKey}`]: {
                amt: finalAmt > 0 ? finalAmt : '',
                ref: Boolean(isRefunded)
            }
        });

        await persistVolLinkOnPmsBooking(ctx.id, targetVol.id, ledgerKey);

        const lineName = ledgerKey.replace('_', ' ').toUpperCase();
        showVolToast('Vol Cal Refund Synced', `${targetVol.name} → ${lineName} marked ${isRefunded ? 'REFUNDED' : 'HELD'}.`);
        return true;
    } catch (err) {
        console.error('[VolSync Refund Error]:', err);
        return false;
    }
};

window.syncToVolunteerApp = syncToVolunteerApp;
window.syncRefundToVolunteerApp = syncRefundToVolunteerApp;
