// ==========================================================================
// parser/parser-engine.js - Master Extractor Router, Normalizer & Paste Modal
// Wild & Wandering Property Management System
// ==========================================================================

import { parseHostelworld, isHostelworldText } from './ota-hostelworld.js';
import { parseBookingCom, isBookingComText } from './ota-booking.js';
import { parseAgoda, isAgodaText } from './ota-agoda.js';
import { parseAirbnb, isAirbnbText } from './ota-airbnb.js';
import { parseExpedia, isExpediaText } from './ota-expedia.js';

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --------------------------------------------------------------------------
// 1. MASTER MULTI-CHANNEL OTA EXTRACTOR ROUTER
// --------------------------------------------------------------------------

// --- Master OTA Dispatcher & Extractor ---
export const parseOtaEmailText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();

    if (isHostelworldText(text)) return parseHostelworld(text);
    if (isAirbnbText(text)) return parseAirbnb(text);
    if (isAgodaText(text)) return parseAgoda(text);
    if (isExpediaText(text)) return parseExpedia(text);
    if (isBookingComText(text)) return parseBookingCom(text);

    // Fallback: Default to Booking.com Extranet Pattern
    return parseBookingCom(text);
};

// --- Ingest Textarea into Modal Form Fields ---
export const parseEmail = () => {
    const txt = $('email-textarea')?.value;
    if (!txt || txt.trim() === '') return;

    const parsed = parseOtaEmailText(txt);
    if (!parsed) return;

    if ($('email-modal')) $('email-modal').style.display = 'none';

    const staff = window.staff || [];
    let existing = null;
    if (parsed.bookId) {
        existing = staff.find(s => s.bookId === parsed.bookId);
    } else if (parsed.source === 'airbnb') {
        existing = staff.find(s => s.source === 'airbnb' && s.status !== 'cancelled' && s.status !== 'noshow' && ((s.firstName + ' ' + s.lastName).includes(parsed.firstName) || (s.firstName + ' ' + s.lastName).includes(parsed.lastName)));
    }

    if (window.populateStaffForm) window.populateStaffForm(existing || {});

    [
        ['first-name', parsed.firstName],
        ['last-name', parsed.lastName],
        ['check-in', parsed.checkIn],
        ['check-out', parsed.checkOut],
        ['pax-count', parsed.pax],
        ['booking-source', parsed.source || 'other'],
        ['booking-date', parsed.bookDate],
        ['booking-id', parsed.bookId],
        ['booked-type', parsed.bookedType],
        ['phone', parsed.phone || (existing ? existing.phone : '')],
        ['email', parsed.email || (existing ? existing.email : '')],
        ['guest-country', parsed.country || (existing ? existing.country : '')],
        ['total-price', parsed.totalPrice > 0 ? parsed.totalPrice.toFixed(2) : (existing ? Number(existing.totalPrice).toFixed(2) : 0)],
        ['net-price', parsed.netPrice > 0 ? parsed.netPrice.toFixed(2) : (existing ? Number(existing.netPrice).toFixed(2) : 0)]
    ].forEach(([id, val]) => {
        const el = $(id);
        if (el && val !== "" && val !== 0) el.value = val;
    });

    let finalStat = existing ? existing.status : (parsed.status || 'new');
    let statHdn = $('guest-status-hidden');
    if (statHdn) statHdn.value = finalStat;

    let sBtn = $('status-cycle-btn');
    if (sBtn) {
        const cycle = window.STATUS_CYCLE || [];
        let sObj = cycle.find(x => x.val === finalStat) || cycle[0] || { val: 'new', bg: '#ec4899', txt: '#fff' };
        sBtn.dataset.value = sObj.val;
        sBtn.innerText = sObj.label || sObj.val.toUpperCase();
        sBtn.style.background = sObj.bg;
        sBtn.style.color = sObj.txt;
    }

    let nEl = $('guest-notes');
    if (nEl) {
        if (existing && existing.notes && !existing.notes.includes(parsed.notes)) {
            nEl.value = (existing.notes + "\n\n" + parsed.notes).trim();
        } else {
            nEl.value = parsed.notes || "";
        }
    }

    if (parsed.payments && parsed.payments.length > 0 && window.addPaymentRow) {
        $('payments-list').innerHTML = '';
        parsed.payments.forEach(p => window.addPaymentRow(p.date, p.amt.toFixed(2), p.method));
    }

    if (window.updateHeaderName) window.updateHeaderName();
    if (window.calcFinancials) window.calcFinancials();
    if (window.updateAvailableRooms) window.updateAvailableRooms();

    if (parsed.checkIn) {
        const d = new Date(parsed.checkIn + "T12:00:00");
        d.setDate(d.getDate() - 3);
        window.viewStart = d;
        if (window.render) window.render();
    }

    if ($('guest-modal')) $('guest-modal').style.display = 'flex';
    if (existing && window.showAlert) setTimeout(() => window.showAlert("Update Detected!\n\nThis booking already exists in the PMS. Existing data loaded and refreshed from text."), 200);
};

// --------------------------------------------------------------------------
// 2. IMPORT MODAL MOUNTING & LIFECYCLE CONTROLLERS
// --------------------------------------------------------------------------

// --- Ensure Import Clipboard Modal is Mounted in DOM ---
export const ensureExtractModalMounted = () => {
    let m = $('extract-modal') || $('email-modal') || $('import-modal');
    if (m) return m;

    m = document.createElement('div');
    m.id = 'extract-modal';
    m.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-3 hidden";
    m.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full border-2 border-slate-800 overflow-hidden flex flex-col">
            <div class="bg-emerald-700 text-white p-3 font-black uppercase text-xs flex items-center justify-between shadow-xs">
                <span class="flex items-center gap-1.5"><i data-lucide="file-input" size="15" class="text-emerald-200"></i> IMPORT OTA RESERVATION</span>
                <button type="button" onclick="window.closeExtractModal()" class="text-emerald-200 hover:text-white cursor-pointer font-bold text-lg leading-none">&times;</button>
            </div>
            <div class="p-3 space-y-2 text-xs">
                <p class="font-bold text-slate-600 text-[11px]">Paste OTA confirmation text (Booking.com, Agoda, Hostelworld, Airbnb, Expedia) below to instantly import:</p>
                <textarea id="extract-paste" class="w-full h-44 border border-slate-300 rounded p-2 text-xs font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none" placeholder="Paste booking confirmation email or extranet text here..."></textarea>
                <div class="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Auto-detects BDC • HW • Agoda • Airbnb • Expedia</span>
                    <div class="flex gap-2">
                        <button type="button" onclick="window.closeExtractModal()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded uppercase text-xs cursor-pointer">Cancel</button>
                        <button type="button" id="btn-modal-extract" onclick="window.processExtract()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded uppercase text-xs shadow-md cursor-pointer flex items-center gap-1.5 transition-colors">
                            <i data-lucide="check" size="14"></i> IMPORT BOOKING
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    if (window.lucide) window.lucide.createIcons();
    return m;
};

// --- Open OTA Paste Import Modal ---
export const openExtractModal = () => {
    const m = ensureExtractModalMounted();
    m.classList.remove('hidden');
    m.style.display = 'flex';
    
    const ta = m.querySelector('textarea') || $('extract-paste') || $('email-paste');
    if (ta) {
        ta.value = '';
        setTimeout(() => ta.focus(), 50);
    }
};

// --- Dismiss OTA Paste Import Modal ---
export const closeExtractModal = () => {
    const m = $('extract-modal') || $('email-modal') || $('import-modal');
    if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
    }
};

// --- Process Raw Pasted Text & Transfer to Folio Modal ---
export const processExtract = (rawText = null) => {
    let text = rawText;
    if (!text) {
        const m = $('extract-modal') || $('email-modal') || $('import-modal');
        const ta = m ? m.querySelector('textarea') : ($('extract-paste') || $('email-paste'));
        text = ta ? ta.value.trim() : '';
    }

    if (!text) {
        return window.showAlert ? window.showAlert("Please paste booking confirmation text first.") : alert("Please paste text first.");
    }

    const parsed = parseOtaEmailText(text);
    if (!parsed) {
        return window.showAlert ? window.showAlert("Could not extract booking details from the text.") : alert("Could not extract booking details.");
    }

    closeExtractModal();
    if (window.populateStaffForm) window.populateStaffForm(parsed);

    const suggested = window.suggestAvailableRoom ? window.suggestAvailableRoom(parsed.bookedType) : '';
    if (suggested && $('assigned-rooms-container')) {
        $('assigned-rooms-container').innerHTML = '';
        if (window.addRoomSelect) window.addRoomSelect(suggested, false);
    }

    if (window.showAlert) {
        window.showAlert(`Imported: ${parsed.firstName} ${parsed.lastName} (${parsed.bookId || 'New'})\nDates: ${parsed.checkIn} → ${parsed.checkOut}\nAssigned Room: ${suggested || 'Unassigned'}\nClick SAVE to confirm.`);
    }
};

// --- Bind Import Trigger Handler to Navbar Buttons ---
export const bindExtractNavbarBtn = () => {
    const headerButtons = Array.from(document.querySelectorAll('header button, header a, nav button, nav a, #btn-extract, #btn-import'));
    headerButtons.forEach(btn => {
        const txt = (btn.innerText || btn.textContent || '').trim().toUpperCase();
        const id = (btn.id || '').toLowerCase();
        const isMatch = id.includes('extract') || id.includes('import') || txt.includes('EXTRACT') || txt.includes('IMPORT') || txt.includes('PARSE');
        
        if (isMatch) {
            btn.innerText = 'Import';
            btn.disabled = false;
            btn.removeAttribute('disabled');
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            btn.className = "px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded shadow-xs flex items-center gap-1 transition-colors cursor-pointer";
            btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> <span>Import</span>`;
            btn.onclick = (e) => {
                if (e) e.preventDefault();
                openExtractModal();
            };
        }
    });
};

// --------------------------------------------------------------------------
// 3. GLOBAL WINDOW EXPORTS & SHORTCUT LISTENER
// --------------------------------------------------------------------------

window.parseEmail = parseEmail;
window.parseOtaEmailText = parseOtaEmailText;
window.ensureExtractModalMounted = ensureExtractModalMounted;
window.openExtractModal = openExtractModal;
window.openEmailModal = openExtractModal;
window.openImportModal = openExtractModal;
window.closeExtractModal = closeExtractModal;
window.closeEmailModal = closeExtractModal;
window.closeImportModal = closeExtractModal;
window.processExtract = processExtract;
window.parseAndImport = processExtract;
window.bindExtractNavbarBtn = bindExtractNavbarBtn;

window.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'e' || e.key === 'E' || e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        openExtractModal();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindExtractNavbarBtn);
} else {
    bindExtractNavbarBtn();
}
