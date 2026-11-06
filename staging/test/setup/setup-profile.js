// ==========================================================================
// setup/setup-profile.js - Property Profile, Branding, Payments & Add-ons
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';

export const DEFAULT_PAYMENT_METHODS = [
    { key: "cash", label: "Cash", type: "revenue" },
    { key: "card", label: "Credit Card (POS)", type: "revenue" },
    { key: "qr", label: "Thai PromptPay / QR", type: "revenue" },
    { key: "transfer", label: "Bank Transfer", type: "revenue" },
    { key: "bdc-pay", label: "Booking.com Virtual Card", type: "revenue" },
    { key: "bdc-kp", label: "Booking.com Commission (Withheld)", type: "commission" },
    { key: "hw-kp", label: "Hostelworld Deposit (Withheld)", type: "commission" },
    { key: "agoda-pay", label: "Agoda eCard / Payout", type: "revenue" },
    { key: "agoda-kp", label: "Agoda Commission (Withheld)", type: "commission" },
    { key: "airbnb-pay", label: "Airbnb Payout", type: "revenue" },
    { key: "expedia-pay", label: "Expedia Collect Payout", type: "revenue" },
    { key: "expedia-kp", label: "Expedia Commission (Withheld)", type: "commission" }
];

export const DEFAULT_ADDONS = [
    { id: "towel", name: "Towel Rental", price: 50, category: "Amenity" },
    { id: "late-checkout", name: "Late Checkout (2 PM)", price: 200, category: "Service" },
    { id: "ferry-ticket", name: "Ferry Ticket Transfer", price: 450, category: "Travel" },
    { id: "laundry", name: "Laundry Bag (1kg)", price: 60, category: "Service" },
    { id: "scooter", name: "Scooter Rental (24h)", price: 250, category: "Rental" }
];

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

export function updateLogoPreview(type, url) {
    const previewEl = document.getElementById(`preview-logo-${type}`);
    if (!previewEl) return;
    if (url && String(url).startsWith('http')) {
        previewEl.src = url;
        previewEl.classList.remove('hidden');
    } else {
        previewEl.src = 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
    }
}

export function resetLogosToDefault() {
    const defLogo = 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('prop-logo-url', defLogo);
    setVal('prop-banner-url', defLogo);
    setVal('prop-icon-url', defLogo);
    updateLogoPreview('primary', defLogo);
    updateLogoPreview('banner', defLogo);
    updateLogoPreview('icon', defLogo);
    customAlert("Logos Reset", "Restored default brand logos.");
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
                <button type="button" onclick="window.deletePaymentMethodRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

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

    if (window.lucide) window.lucide.createIcons();
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

export function deletePaymentMethodRow(idx) {
    window.paymentMethods.splice(idx, 1);
    renderPaymentMethodsTable(window.paymentMethods);
}

export function restoreDefaultAddonsAndPayments() {
    window.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
    window.addonsList = [...DEFAULT_ADDONS];
    renderPaymentMethodsTable();
    renderAddonsTable();
    customAlert("Restored", "Default payment methods and add-on services restored.");
}

if (typeof window !== 'undefined') {
    window.toggleCardSection = toggleCardSection;
    window.updateLogoPreview = updateLogoPreview;
    window.resetLogosToDefault = resetLogosToDefault;
    window.handleLogoFileUpload = handleLogoFileUpload;
    window.renderPaymentMethodsTable = renderPaymentMethodsTable;
    window.renderAddonsTable = renderAddonsTable;
    window.moveAddonRow = moveAddonRow;
    window.addBlankAddonRow = addBlankAddonRow;
    window.deleteAddonRow = deleteAddonRow;
    window.deletePaymentMethodRow = deletePaymentMethodRow;
    window.restoreDefaultAddonsAndPayments = restoreDefaultAddonsAndPayments;
}
