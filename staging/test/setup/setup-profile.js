// ==========================================================================
// setup/setup-profile.js - Property Profile, Branding, Payments & Add-ons
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';

// --- Base Direct Settlement Methods ---
export const BASE_DIRECT_PAYMENTS = [
    { key: "cash", label: "Cash", type: "revenue", isBase: true },
    { key: "card", label: "Credit Card (POS)", type: "revenue", isBase: true },
    { key: "cc-fee", label: "Credit Card Surcharge / Fee", type: "revenue", isBase: true },
    { key: "qr", label: "Thai PromptPay / QR", type: "revenue", isBase: true },
    { key: "transfer", label: "Bank Transfer", type: "revenue", isBase: true },
    { key: "other", label: "Other Direct Settlement", type: "revenue", isBase: true }
];

// --- Standard OTA Channels (Auto-Generated -pay and -kp Pairs) ---
export const STANDARD_OTA_CHANNELS = [
    { code: "bdc", name: "Booking.com" },
    { code: "hw", name: "Hostelworld" },
    { code: "agoda", name: "Agoda" },
    { code: "airbnb", name: "Airbnb" },
    { code: "expedia", name: "Expedia" },
    { code: "trip", name: "Trip.com" }
];

// Helper: Generates paired -pay and -kp rows for any channel
export function createOtaPaymentPair(code, name) {
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
        { key: `${cleanCode}-pay`, label: `${name} Payout / Collect`, type: "revenue", channel: cleanCode },
        { key: `${cleanCode}-kp`, label: `${name} Commission (Withheld)`, type: "commission", channel: cleanCode }
    ];
}

// Generate the complete default payment array
export function buildDefaultPaymentMethods() {
    const list = [...BASE_DIRECT_PAYMENTS];
    STANDARD_OTA_CHANNELS.forEach(ota => {
        list.push(...createOtaPaymentPair(ota.code, ota.name));
    });
    return list;
}

export const DEFAULT_PAYMENT_METHODS = buildDefaultPaymentMethods();

export const DEFAULT_ADDONS = [
    { id: "towel", name: "Towel Rental", price: 50, category: "Amenity" },
    { id: "late-checkout", name: "Late Checkout (2 PM)", price: 200, category: "Service" },
    { id: "ferry-ticket", name: "Ferry Ticket Transfer", price: 450, category: "Travel" },
    { id: "laundry", name: "Laundry Bag (1kg)", price: 60, category: "Service" },
    { id: "scooter", name: "Scooter Rental (24h)", price: 250, category: "Rental" }
];

// --- 1. BRANDING & ASSET PREVIEWS ---

export function toggleCardSection(contentId, chevronId) {
    const el = document.getElementById(contentId);
    const ch = document.getElementById(chevronId);
    if (!el) return;
    const isHidden = el.classList.contains('hidden') || el.style.display === 'none';
    if (isHidden) {
        el.classList.remove('hidden');
        el.style.display = '';
        if (ch) ch.style.transform = 'rotate(0deg)';
    } else {
        el.classList.add('hidden');
        el.style.display = 'none';
        if (ch) ch.style.transform = 'rotate(-90deg)';
    }
}

// Preview uses the uploaded image first; property config second; WWicon only as final fallback
export function updateLogoPreview(type, url) {
    const previewEl = document.getElementById(`preview-logo-${type}`);
    if (!previewEl) return;

    const propCfg = window.currentPropertyConfig || {};
    const fieldMap = { primary: 'logoUrl', banner: 'bannerUrl', icon: 'iconUrl' };
    const propSavedAsset = propCfg[fieldMap[type]];

    if (url && String(url).startsWith('http')) {
        previewEl.src = url;
        previewEl.classList.remove('hidden');
    } else if (propSavedAsset && String(propSavedAsset).startsWith('http')) {
        previewEl.src = propSavedAsset;
        previewEl.classList.remove('hidden');
    } else {
        previewEl.src = 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
        previewEl.classList.remove('hidden');
    }
}

export function resetLogosToDefault() {
    const propCfg = window.currentPropertyConfig || {};
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

    // Reset to property's configured assets if they exist, otherwise WW fallback
    const logo = propCfg.logoUrl || 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
    const banner = propCfg.bannerUrl || 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
    const icon = propCfg.iconUrl || 'https://loren-6q.github.io/PMS/gfx/WWicon.png';

    setVal('prop-logo-url', logo);
    setVal('prop-banner-url', banner);
    setVal('prop-icon-url', icon);

    updateLogoPreview('primary', logo);
    updateLogoPreview('banner', banner);
    updateLogoPreview('icon', icon);

    customAlert("Logos Reset", "Restored active property brand assets.");
}

export async function handleLogoFileUpload(event, type) {
    const file = event.target?.files?.[0];
    if (!file) return;

    try {
        customAlert("Uploading Image...", `Processing ${file.name}...`);
        const { getStorage, ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js");
        const storage = getStorage();
        const propId = window.currentPropertyId || 'swims_resort';
        const fileRef = ref(storage, `artifacts/hotel-pms-v1/public/branding/${propId}/${type}_${Date.now()}_${file.name}`);

        await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(fileRef);

        const inputMap = { primary: 'prop-logo-url', banner: 'prop-banner-url', icon: 'prop-icon-url' };
        const targetInput = document.getElementById(inputMap[type]);
        if (targetInput) targetInput.value = downloadUrl;

        updateLogoPreview(type, downloadUrl);
        customAlert("Upload Complete", "Brand asset uploaded and linked.");
    } catch (err) {
        console.error("Upload error:", err);
        customAlert("Upload Failed", err.message);
    }
}

// --- 2. PAYMENT METHODS & AUTO-PAIRED OTA SETTLEMENT ---

export function renderPaymentMethodsTable(payments = null) {
    const tbody = document.getElementById('payment-methods-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.paymentMethods = payments || window.paymentMethods || [...DEFAULT_PAYMENT_METHODS];

    window.paymentMethods.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="font-mono text-xs font-bold text-slate-500 py-1 px-2">${m.key}</td>
            <td class="py-1 px-2">
                <input type="text" value="${m.label || ''}" class="table-input font-bold" onchange="window.paymentMethods[${idx}].label = this.value">
            </td>
            <td class="py-1 px-2">
                <select class="table-input font-bold" onchange="window.paymentMethods[${idx}].type = this.value">
                    <option value="revenue" ${m.type === 'revenue' ? 'selected' : ''}>Collected Revenue</option>
                    <option value="commission" ${m.type === 'commission' ? 'selected' : ''}>OTA Withheld (Commission)</option>
                </select>
            </td>
            <td class="text-center py-1 px-2">
                <button type="button" onclick="window.deletePaymentMethodRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer" title="Delete">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add a toolbar row at the bottom to dynamically add new OTA Channels or custom methods
    const footerTr = document.createElement('tr');
    footerTr.className = "bg-slate-50/80 border-t-2 border-slate-200 text-xs";
    footerTr.innerHTML = `
        <td colspan="4" class="py-1.5 px-2">
            <div class="flex items-center justify-between gap-2">
                <button type="button" onclick="window.addCustomOtaChannelPair()" class="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded font-black text-[9.5px] uppercase flex items-center gap-1 cursor-pointer">
                    <i data-lucide="plus" size="11"></i> Add OTA Channel (Auto -PAY & -KP)
                </button>
                <button type="button" onclick="window.addBlankPaymentRow()" class="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-black text-[9.5px] uppercase cursor-pointer">
                    + Custom Single Method
                </button>
            </div>
        </td>
    `;
    tbody.appendChild(footerTr);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Add an OTA channel pair (e.g. Tiket -> tiket-pay & tiket-kp)
export function addCustomOtaChannelPair() {
    const name = prompt("Enter OTA Channel Name (e.g. Tiket, Traveloka, Ctrip):");
    if (!name || !name.trim()) return;

    const code = prompt("Enter Short Prefix Code (e.g. tiket, traveloka, ctrip):", name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (!code || !code.trim()) return;

    const pair = createOtaPaymentPair(code.trim(), name.trim());
    window.paymentMethods = window.paymentMethods || [];

    // Ensure no duplicates
    pair.forEach(item => {
        if (!window.paymentMethods.some(m => m.key === item.key)) {
            window.paymentMethods.push(item);
        }
    });

    renderPaymentMethodsTable(window.paymentMethods);
    customAlert("Channel Added", `Added ${pair[0].key} and ${pair[1].key} to payment methods.`);
}

export function addBlankPaymentRow() {
    const key = prompt("Enter payment key identifier (e.g. promptpay-bar, crypto):");
    if (!key || !key.trim()) return;
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');

    window.paymentMethods = window.paymentMethods || [];
    window.paymentMethods.push({
        key: cleanKey,
        label: cleanKey.toUpperCase(),
        type: "revenue"
    });
    renderPaymentMethodsTable(window.paymentMethods);
}

export function deletePaymentMethodRow(idx) {
    window.paymentMethods.splice(idx, 1);
    renderPaymentMethodsTable(window.paymentMethods);
}

export function restoreDefaultAddonsAndPayments() {
    window.paymentMethods = buildDefaultPaymentMethods();
    window.addonsList = [...DEFAULT_ADDONS];
    renderPaymentMethodsTable();
    renderAddonsTable();
    customAlert("Restored", "Default direct payments, OTA pairs, and add-on services restored.");
}

// --- 3. ADD-ONS SERVICE CATALOGUE ---

export function renderAddonsTable(addons = null) {
    const tbody = document.getElementById('addon-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.addonsList = addons || window.addonsList || [...DEFAULT_ADDONS];

    window.addonsList.forEach((a, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="text-center py-1 px-1.5">
                <div class="order-btn-col">
                    <button type="button" onclick="window.moveAddonRow(${idx}, -1)" class="order-arrow-btn text-slate-400 hover:text-slate-800 ${idx === 0 ? 'opacity-30' : ''}">▲</button>
                    <button type="button" onclick="window.moveAddonRow(${idx}, 1)" class="order-arrow-btn text-slate-400 hover:text-slate-800 ${idx === window.addonsList.length - 1 ? 'opacity-30' : ''}">▼</button>
                </div>
            </td>
            <td class="py-1 px-1.5"><input type="text" value="${a.name || ''}" class="table-input font-bold" onchange="window.addonsList[${idx}].name = this.value"></td>
            <td class="py-1 px-1.5"><input type="text" value="${a.category || 'General'}" class="table-input font-bold" onchange="window.addonsList[${idx}].category = this.value"></td>
            <td class="text-center py-1 px-1.5"><input type="number" value="${a.price || 0}" class="table-input text-center font-black" onchange="window.addonsList[${idx}].price = parseFloat(this.value) || 0"></td>
            <td class="text-center py-1 px-1.5">
                <button type="button" onclick="window.deleteAddonRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function moveAddonRow(idx, dir) {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= window.addonsList.length) return;
    const temp = window.addonsList[idx];
    window.addonsList[idx] = window.addonsList[targetIdx];
    window.addonsList[targetIdx] = temp;
    renderAddonsTable(window.addonsList);
}

export function addBlankAddonRow() {
    window.addonsList = window.addonsList || [];
    window.addonsList.push({
        id: 'addon_' + Date.now(),
        name: 'New Service',
        price: 100,
        category: 'Service'
    });
    renderAddonsTable(window.addonsList);
}

export function deleteAddonRow(idx) {
    window.addonsList.splice(idx, 1);
    renderAddonsTable(window.addonsList);
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.toggleCardSection = toggleCardSection;
    window.updateLogoPreview = updateLogoPreview;
    window.resetLogosToDefault = resetLogosToDefault;
    window.handleLogoFileUpload = handleLogoFileUpload;
    window.renderPaymentMethodsTable = renderPaymentMethodsTable;
    window.addCustomOtaChannelPair = addCustomOtaChannelPair;
    window.addBlankPaymentRow = addBlankPaymentRow;
    window.deletePaymentMethodRow = deletePaymentMethodRow;
    window.restoreDefaultAddonsAndPayments = restoreDefaultAddonsAndPayments;
    window.renderAddonsTable = renderAddonsTable;
    window.moveAddonRow = moveAddonRow;
    window.addBlankAddonRow = addBlankAddonRow;
    window.deleteAddonRow = deleteAddonRow;
}
