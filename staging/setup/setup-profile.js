// ==========================================================================
// setup/setup-profile.js - Property Profile, Branding, Payments & Add-ons
// Wild & Wandering Property Management System
// ==========================================================================

import { storage, appId } from '../core/config.js';
import { ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
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
    { key: "airbnb-pay", label: "Airbnb Payout", type: "revenue" }
];

export const DEFAULT_ADDONS = [
    { id: "towel", name: "Towel Rental", price: 50, category: "Amenity" },
    { id: "late-checkout", name: "Late Checkout (2 PM)", price: 200, category: "Service" },
    { id: "ferry-ticket", name: "Ferry Ticket Transfer", price: 450, category: "Travel" },
    { id: "laundry", name: "Laundry Bag (1kg)", price: 60, category: "Service" }
];

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

export async function handleLogoFileUpload(event, type) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const propId = window.currentPropertyId || 'swims_resort';
    const filePath = `properties/${propId}/${type}_${Date.now()}_${file.name}`;
    const fileRef = sRef(storage, filePath);

    try {
        customAlert("Uploading...", "Uploading brand image to storage...");
        await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(fileRef);

        const inputEl = document.getElementById(`prop-${type === 'primary' ? 'logo' : (type === 'banner' ? 'banner' : 'icon')}-url`);
        if (inputEl) inputEl.value = downloadUrl;

        updateLogoPreview(type, downloadUrl);
        customAlert("Upload Complete", "Brand asset uploaded successfully.");
    } catch (err) {
        console.error("[Logo Upload Error]:", err);
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
                <input type="text" value="${m.label}" class="table-input font-bold" onchange="window.paymentMethods[${idx}].label = this.value">
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
            <td class="text-center font-mono font-bold text-slate-400 text-[10px] py-1 px-1.5">${idx + 1}</td>
            <td class="py-1 px-1.5"><input type="text" value="${a.name}" class="table-input font-bold" onchange="window.addonsList[${idx}].name = this.value"></td>
            <td class="py-1 px-1.5"><input type="text" value="${a.category || 'General'}" class="table-input font-bold" onchange="window.addonsList[${idx}].category = this.value"></td>
            <td class="text-center py-1 px-1.5"><input type="number" value="${a.price}" class="table-input text-center font-black" onchange="window.addonsList[${idx}].price = parseFloat(this.value) || 0"></td>
            <td class="py-1 px-1.5">
                <select class="table-input font-bold">
                    <option value="once" selected>Per Item / Stay</option>
                    <option value="daily">Per Day / Night</option>
                </select>
            </td>
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

export function addBlankAddonRow() {
    window.addonsList = window.addonsList || [];
    window.addonsList.push({
        id: 'item_' + Date.now(),
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

if (typeof window !== 'undefined') {
    window.updateLogoPreview = updateLogoPreview;
    window.handleLogoFileUpload = handleLogoFileUpload;
    window.renderPaymentMethodsTable = renderPaymentMethodsTable;
    window.renderAddonsTable = renderAddonsTable;
    window.addBlankAddonRow = addBlankAddonRow;
    window.deleteAddonRow = deleteAddonRow;
    window.deletePaymentMethodRow = deletePaymentMethodRow;
}
