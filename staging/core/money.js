// ==========================================================================
// core/money.js - Strict Currency Math & Financial Helpers
// Wild & Wandering Property Management System
// ==========================================================================

export function roundCurrency(val, currency = 'THB') {
    if (val === "" || val === null || val === undefined || isNaN(val)) return 0;
    const num = Number(val);
    const cur = String(currency).toUpperCase().trim();
    const decimalCurrencies = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'NZD'];
    if (decimalCurrencies.includes(cur)) {
        return Math.round(num * 100) / 100;
    }
    return Math.round(num);
}

export function formatCurrency(val, currency = 'THB') {
    const num = roundCurrency(val, currency);
    return num.toLocaleString('en-US', {
        minimumFractionDigits: currency === 'THB' ? 0 : 2,
        maximumFractionDigits: currency === 'THB' ? 0 : 2
    });
}

export function getPaid(booking) {
    if (!booking || !Array.isArray(booking.payments)) return 0;
    return booking.payments.reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
}

export function getDue(booking) {
    if (!booking) return 0;
    const total = Number(booking.totalPrice) || 0;
    const paid = getPaid(booking);
    return Number((total - paid).toFixed(2));
}

export function getComm(booking) {
    if (!booking || !Array.isArray(booking.payments)) return 0;
    const commMethods = ['hw-kp', 'airbnb-kp', 'bdc-kp', 'agoda-kp', 'expedia-kp', 'trip-kp', 'cc-fee'];
    return booking.payments
        .filter(p => commMethods.includes(p.method))
        .reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
}

if (typeof window !== 'undefined') {
    window.roundCurrency = roundCurrency;
    window.formatCurrency = formatCurrency;
    window.getPaid = getPaid;
    window.getDue = getDue;
    window.getComm = getComm;
}
