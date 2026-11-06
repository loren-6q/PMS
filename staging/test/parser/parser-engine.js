// ==========================================================================
// parser/parser-engine.js - Master Extractor Router & Normalizer
// Wild & Wandering Property Management System
// ==========================================================================

import { parseBookingCom } from './ota-booking.js';
import { parseAgoda } from './ota-agoda.js';
import { parseHostelworld } from './ota-hostelworld.js';
import { parseAirbnb } from './ota-airbnb.js';
import { parseExpedia } from './ota-expedia.js';
import { suggestRoomsForBooking } from './room-assigner.js';
import { openGuestModal } from '../pms/pms-folio-modal.js';
import { customAlert } from '../core/ui-dialogs.js';
import { getLocalYMD } from '../core/dates.js';

// --------------------------------------------------------------------------
// 1. DATE NORMALIZATION & CALENDAR NAVIGATION UTILITIES
// --------------------------------------------------------------------------

// --- Universal Date Normalizer (Zero-Drift YYYY-MM-DD) ---
export function parseFlexibleDate(rawStr) {
    if (!rawStr) return '';
    const str = rawStr.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    
    // Match "Mon 23 Nov 2026" or "23 Nov 2026"
    const textMatch = str.match(/(?:[A-Za-z]+,?\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
    if (textMatch) {
        const d = String(textMatch[1]).padStart(2, '0');
        const mKey = textMatch[2].toLowerCase().slice(0, 3);
        const m = String(months[mKey] || 1).padStart(2, '0');
        const y = textMatch[3];
        return `${y}-${m}-${d}`;
    }

    const slashParts = str.split(/[\/\-\.]/);
    if (slashParts.length === 3 && slashParts[0].length <= 2 && slashParts[2].length === 4) {
        const d = parseInt(slashParts[0], 10);
        const m = parseInt(slashParts[1], 10);
        const y = parseInt(slashParts[2], 10);
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const parsedTimestamp = Date.parse(str);
    if (!isNaN(parsedTimestamp)) {
        return getLocalYMD(new Date(parsedTimestamp));
    }

    return '';
}

// --------------------------------------------------------------------------
// 2. MASTER MULTI-CHANNEL OTA ROUTER
// --------------------------------------------------------------------------

// --- Master Multi-Channel OTA Router ---
export function parseOtaClipboardText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const result = parseBookingCom(rawText) ||
                   parseHostelworld(rawText) ||
                   parseAgoda(rawText) ||
                   parseAirbnb(rawText) ||
                   parseExpedia(rawText);

    if (result) {
        // Resolve matching category in active property (longest string first)
        if (result.bookedType && window.hotelRooms) {
            const types = [...new Set(window.hotelRooms.map(r => r.category || r.type).filter(Boolean))];
            types.sort((a, b) => b.length - a.length);

            const lowerBooked = result.bookedType.toLowerCase();
            const matched = types.find(t => {
                const lowerT = t.toLowerCase();
                return lowerBooked.includes(lowerT) || lowerT.includes(lowerBooked);
            });
            if (matched) {
                result.bookedType = matched;
            }
        }

        // Net Price fallback calculation
        if (result.netPrice === null && result.totalPrice > 0) {
            const commissions = window.currentPropertyConfig?.commissions || {};
            const channelRate = parseFloat(commissions[result.source] || commissions.default || 0);
            if (channelRate > 0) {
                result.netPrice = Number((result.totalPrice * (1 - (channelRate / 100))).toFixed(2));
                result.netIsEstimated = true;
            }
        }

        // Ensure prepaid payments use the net payout
        if (result.netPrice !== null && Array.isArray(result.payments)) {
            result.payments.forEach(p => {
                if (['bdc-pay', 'agoda-pay', 'expedia-pay'].includes(p.method)) {
                    p.amt = result.netPrice;
                }
            });
        }

        // Booking date fallback
        if (!result.bookDate) {
            result.bookDate = getLocalYMD(new Date());
            result.bookDateIsEstimated = true;
        }

        // Intelligent Room Assignment (Event Tetris & Dorm Clustering)
        const assignedRooms = suggestRoomsForBooking({
            checkIn: result.checkIn,
            checkOut: result.checkOut,
            bookedType: result.bookedType,
            unitCount: result.unitCount || 1
        });

        result.rooms = assignedRooms;
        result.room = assignedRooms[0] || "";

        return result;
    }

    return null;
}

// --------------------------------------------------------------------------
// 3. CLIPBOARD & MANUAL PASTE ACTION CONTROLLERS
// --------------------------------------------------------------------------

// --- Clipboard Action Trigger ---
export async function processAndImportClipboard() {
    let text = '';
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
        }
    } catch (e) {
        console.warn("[Clipboard API Blocked]: Falling back to paste modal.", e);
    }

    if (!text || text.trim() === '') {
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        return;
    }

    const parsed = parseOtaClipboardText(text);
    if (parsed) {
        if (parsed.checkIn && typeof window.jumpToDate === 'function') {
            window.jumpToDate(parsed.checkIn);
        }
        openGuestModal(parsed);
    } else {
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        const textarea = document.getElementById('parse-textarea');
        if (textarea) textarea.value = text;
        customAlert("Parsing Failed", "Could not recognize OTA reservation formatting in clipboard.");
    }
}

// --- Manual Modal Parser Handler ---
export function parseBooking() {
    const textarea = document.getElementById('parse-textarea');
    const text = textarea?.value?.trim();
    
    if (!text) {
        return customAlert("Input Required", "Please paste reservation text first.");
    }

    const parsed = parseOtaClipboardText(text);
    
    if (parsed) {
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        if (parsed.checkIn && typeof window.jumpToDate === 'function') {
            window.jumpToDate(parsed.checkIn);
        }
        openGuestModal(parsed);
    } else {
        customAlert("Unrecognized Format", "Could not match text to Booking.com, Agoda, Hostelworld, Airbnb, or Expedia.");
    }
}

// --------------------------------------------------------------------------
// 4. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

if (typeof window !== 'undefined') {
    window.parseBooking = parseBooking;
    window.processAndImportClipboard = processAndImportClipboard;
    window.parseOtaClipboardText = parseOtaClipboardText;
    window.parseFlexibleDate = parseFlexibleDate;
}
