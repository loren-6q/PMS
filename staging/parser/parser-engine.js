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

// --- Universal Date Normalizer (Zero-Drift YYYY-MM-DD) ---
export function parseFlexibleDate(rawStr) {
    if (!rawStr) return '';
    const str = rawStr.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

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

// --- Master Multi-Channel OTA Router ---
export function parseOtaClipboardText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const result = parseBookingCom(rawText) ||
                   parseHostelworld(rawText) ||
                   parseAgoda(rawText) ||
                   parseAirbnb(rawText) ||
                   parseExpedia(rawText);

    if (result) {
        if (result.bookedType && window.hotelRooms) {
            const types = [...new Set(window.hotelRooms.map(r => r.category || r.type).filter(Boolean))];
            const lowerBooked = result.bookedType.toLowerCase();
            const matched = types.find(t => lowerBooked.includes(t.toLowerCase()) || t.toLowerCase().includes(lowerBooked));
            if (matched) {
                result.bookedType = matched;
            }
        }

        if (result.netPrice === null && result.totalPrice > 0) {
            const commissions = window.currentPropertyConfig?.commissions || {};
            const channelRate = parseFloat(commissions[result.source] || commissions.default || 0);
            if (channelRate > 0) {
                result.netPrice = Number((result.totalPrice * (1 - (channelRate / 100))).toFixed(2));
                result.netIsEstimated = true;
            }
        }

        if (!result.bookDate) {
            result.bookDate = getLocalYMD(new Date());
            result.bookDateIsEstimated = true;
        }

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
        const modal = document.getElementById('email-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        return;
    }

    const parsed = parseOtaClipboardText(text);
    if (parsed) {
        openGuestModal(parsed);
    } else {
        const modal = document.getElementById('email-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
            const textarea = document.getElementById('parse-textarea');
            if (textarea) textarea.value = text;
        } else {
            customAlert("Parsing Failed", "Could not recognize OTA reservation formatting in clipboard.");
        }
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
        const modal = document.getElementById('email-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        openGuestModal(parsed);
    } else {
        customAlert("Unrecognized Format", "Could not match text to Booking.com, Agoda, Hostelworld, Airbnb, or Expedia.");
    }
}

if (typeof window !== 'undefined') {
    window.parseBooking = parseBooking;
    window.processAndImportClipboard = processAndImportClipboard;
    window.parseOtaClipboardText = parseOtaClipboardText;
    window.parseFlexibleDate = parseFlexibleDate;
}
