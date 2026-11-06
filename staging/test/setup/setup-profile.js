// ==========================================================================
// setup/setup-profile.js - Property Profile, Branding, Payments & Add-ons
// Wild & Wandering Property Management System
// ==========================================================================

import { customAlert } from '../core/ui-dialogs.js';

// --- Base Direct Settlement Methods (Always active) ---
export const BASE_DIRECT_PAYMENTS = [
    { key: "cash", label: "Cash", type: "revenue", isBase: true, active: true },
    { key: "card", label: "Credit Card (POS)", type: "revenue", isBase: true, active: true },
    { key: "cc-fee", label: "Credit Card Fee / Surcharge", type: "revenue", isBase: true, active: true },
    { key: "qr", label: "Thai PromptPay / QR", type: "revenue", isBase: true, active: true },
    { key: "transfer", label: "Bank Transfer", type: "revenue", isBase: true, active: true },
    { key: "other", label: "Other Direct Settlement", type: "revenue", isBase: true, active: true }
];

// --- Standard Known OTA Channels ---
export const STANDARD_OTA_REGISTRY = [
    { code: "bdc", name: "Booking.com" },
    { code: "hw", name: "Hostelworld" },
    { code: "agoda", name: "Agoda" },
    { code: "airbnb", name: "Airbnb" },
    { code: "expedia", name: "Expedia" },
    { code: "trip", name: "Trip.com" }
];

// Helper: Generates a pair of -PAY and -KP methods
export function createOtaPaymentPair(code, name, isActive = true) {
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
        { key: `${cleanCode}-pay`, label: `${name} Payout / Collect`, type: "revenue", channel: cleanCode, channelName: name, active: isActive },
        { key: `${cleanCode}-kp`, label: `${name} Commission (Withheld)`, type: "commission", channel: cleanCode, channelName: name, active: isActive }
    ];
}

// Generate the initial default payment methods
export function buildDefaultPaymentMethods() {
    const list = [...BASE_DIRECT_PAYMENTS];
    // Start with Booking.com and Hostelworld active by default; others available to toggle
    list.push(...createOtaPaymentPair("bdc", "Booking.com", true));
    list.push(...createOtaPaymentPair("hw", "Hostelworld", true));
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
    const togglesContainer = document.getElementById('ota-channel-toggles-container');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.paymentMethods = payments || window.paymentMethods || [...DEFAULT_PAYMENT_METHODS];

    // 1. Render the Quick Channel Toggle Pills
    if (togglesContainer) {
        // Collect all channels currently present in the list
        const activeChannels = new Set(
            window.paymentMethods
                .filter(m => m.channel && m.active !== false)
                .map(m => m.channel.toLowerCase())
        );

        togglesContainer.innerHTML = STANDARD_OTA_REGISTRY.map(ota => {
            const isToggled = activeChannels.has(ota.code.toLowerCase());
            return `
                <button type="button" onclick="window.toggleOtaChannel('${ota.code}', '${ota.name}')" class="px-2 py-0.5 rounded font-black text-[9px] uppercase border cursor-pointer transition-colors ${
                    isToggled ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs' : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                }">
                    ${isToggled ? '✓ ' : ''}${ota.name}
                </button>
            `;
        }).join('');
    }

    // Separate active and archived
    const activeMethods = window.paymentMethods.filter(m => m.active !== false);
    const archivedMethods = window.paymentMethods.filter(m => m.active === false);

    // 2. Render Active Rows
    activeMethods.forEach((m) => {
        const actualIdx = window.paymentMethods.findIndex(x => x.key === m.key);
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="font-mono text-xs font-bold text-slate-500 py-1 px-2">
                <span class="px-1 py-0.2 rounded bg-slate-100 border border-slate-200">${m.key}</span>
            </td>
            <td class="py-1 px-2">
                <input type="text" value="${m.label || ''}" class="table-input font-bold" onchange="window.paymentMethods[${actualIdx}].label = this.value">
            </td>
            <td class="py-1 px-2">
                <select class="table-input font-bold" onchange="window.paymentMethods[${actualIdx}].type = this.value">
                    <option value="revenue" ${m.type === 'revenue' ? 'selected' : ''}>Collected Revenue</option>
                    <option value="commission" ${m.type === 'commission' ? 'selected' : ''}>OTA Withheld (Commission)</option>
                </select>
            </td>
            <td class="text-center py-1 px-2">
                ${m.isBase 
                    ? `<span class="text-[9px] text-slate-300 font-bold uppercase select-none">CORE</span>`
                    : `<button type="button" onclick="window.archivePaymentMethodRow('${m.key}')" class="text-slate-400 hover:text-amber-600 cursor-pointer text-[10px] font-bold" title="Deactivate / Archive Channel">
                           Archive
                       </button>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 3. Render Collapsible Archived / Historical Methods Tray (If any exist)
    if (archivedMethods.length > 0) {
        const archHeader = document.createElement('tr');
        archHeader.className = "bg-slate-800 text-slate-300 cursor-pointer select-none";
        archHeader.onclick = () => window.toggleArchivedPaymentRows();
        archHeader.innerHTML = `
            <td colspan="4" class="p-1.5 px-2 text-[9.5px] font-black uppercase tracking-wider">
                <div class="flex items-center justify-between">
                    <span class="text-amber-300 flex items-center gap-1.5">
                        <i data-lucide="archive" size="12"></i> Archived / Disconnected Channels (${archivedMethods.length / 2} OTAs)
                        <span class="text-slate-400 normal-case font-normal">(Preserved for historical booking balance & commission reporting)</span>
                    </span>
                    <i data-lucide="chevron-down" id="archived-pay-chevron" size="12" class="transition-transform duration-200 rotate-[-90deg]"></i>
                </div>
            </td>
        `;
        tbody.appendChild(archHeader);

        archivedMethods.forEach((m) => {
            const actualIdx = window.paymentMethods.findIndex(x => x.key === m.key);
            const tr = document.createElement('tr');
            tr.className = "archived-pay-row hidden bg-slate-50 border-b border-slate-200 text-slate-400";
            tr.innerHTML = `
                <td class="font-mono text-[10px] py-1 px-2 line-through">${m.key}</td>
                <td class="py-1 px-2 text-[10px] font-semibold">${m.label}</td>
                <td class="py-1 px-2 text-[10px] uppercase">${m.type}</td>
                <td class="text-center py-1 px-2">
                    <button type="button" onclick="window.reactivatePaymentMethodRow('${m.key}')" class="px-1.5 py-0.2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[8.5px] uppercase rounded cursor-pointer shadow-2xs">
                        Restore
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Toggle an OTA channel ON or OFF without deleting historical references
export function toggleOtaChannel(code, name) {
    window.paymentMethods = window.paymentMethods || [];
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const payKey = `${cleanCode}-pay`;
    const kpKey = `${cleanCode}-kp`;

    const payEntry = window.paymentMethods.find(m => m.key === payKey);
    const kpEntry = window.paymentMethods.find(m => m.key === kpKey);

    if (payEntry && kpEntry) {
        // Toggle active status
        const nextState = !(payEntry.active !== false);
        payEntry.active = nextState;
        kpEntry.active = nextState;
    } else {
        // Add fresh pair
        window.paymentMethods.push(...createOtaPaymentPair(cleanCode, name, true));
    }

    renderPaymentMethodsTable();
}

export function archivePaymentMethodRow(key) {
    const item = window.paymentMethods.find(m => m.key === key);
    if (!item) return;

    if (item.channel) {
        // Archive both the pay and kp keys for the channel together
        window.paymentMethods.forEach(m => {
            if (m.channel === item.channel) m.active = false;
        });
    } else {
        item.active = false;
    }
    renderPaymentMethodsTable();
}

export function reactivatePaymentMethodRow(key) {
    const item = window.paymentMethods.find(m => m.key === key);
    if (!item) return;

    if (item.channel) {
        window.paymentMethods.forEach(m => {
            if (m.channel === item.channel) m.active = true;
        });
    } else {
        item.active = true;
    }
    renderPaymentMethodsTable();
}

export function toggleArchivedPaymentRows() {
    const rows = document.querySelectorAll('.archived-pay-row');
    const ch = document.getElementById('archived-pay-chevron');
    if (!rows.length) return;
    const isHidden = rows[0].classList.contains('hidden');
    rows.forEach(r => r.classList.toggle('hidden', !isHidden));
    if (ch) ch.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

export function addCustomOtaChannelPair() {
    const name = prompt("Enter OTA Channel Name (e.g. Tiket, Traveloka, Ctrip):");
    if (!name || !name.trim()) return;

    const code = prompt("Enter Short Prefix Code (e.g. tiket, traveloka, ctrip):", name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (!code || !code.trim()) return;

    const pair = createOtaPaymentPair(code.trim(), name.trim(), true);
    window.paymentMethods = window.paymentMethods || [];

    pair.forEach(item => {
        const exist = window.paymentMethods.find(m => m.key === item.key);
        if (exist) exist.active = true;
        else window.paymentMethods.push(item);
    });

    renderPaymentMethodsTable(window.paymentMethods);
    customAlert("Channel Added", `Added ${pair[0].key} and ${pair[1].key} to payment methods.`);
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
    window.toggleOtaChannel = toggleOtaChannel;
    window.archivePaymentMethodRow = archivePaymentMethodRow;
    window.reactivatePaymentMethodRow = reactivatePaymentMethodRow;
    window.toggleArchivedPaymentRows = toggleArchivedPaymentRows;
    window.addCustomOtaChannelPair = addCustomOtaChannelPair;
    window.restoreDefaultAddonsAndPayments = restoreDefaultAddonsAndPayments;
    window.renderAddonsTable = renderAddonsTable;
    window.moveAddonRow = moveAddonRow;
    window.addBlankAddonRow = addBlankAddonRow;
    window.deleteAddonRow = deleteAddonRow;
}
