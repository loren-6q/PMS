// ==========================================================================
// core/ui-dialogs.js - Universal Alert, Modal & Toast Notification System
// Wild & Wandering Property Management System
// ==========================================================================

export function customAlert(title, message, isConfirm = false, onConfirm = null) {
    const modal = document.getElementById('custom-alert') || document.getElementById('alert-modal');
    const titleEl = document.getElementById('modal-title') || document.getElementById('alert-header-title');
    const msgEl = document.getElementById('custom-alert-msg') || document.getElementById('alert-message');
    const cancelBtn = document.getElementById('custom-alert-cancel') || document.getElementById('alert-cancel');
    const confirmBtn = document.getElementById('custom-alert-confirm') || document.getElementById('alert-confirm');

    if (!modal || !msgEl) {
        if (isConfirm) {
            if (window.confirm(`${title ? title + ': ' : ''}${message}`)) {
                if (onConfirm) onConfirm();
            }
        } else {
            window.alert(`${title ? title + ': ' : ''}${message}`);
        }
        return;
    }

    if (titleEl) titleEl.innerText = title || "System Alert";
    msgEl.innerText = message || "";

    if (cancelBtn) {
        cancelBtn.classList.toggle('hidden', !isConfirm);
        cancelBtn.style.display = isConfirm ? 'block' : 'none';
    }

    if (confirmBtn) {
        confirmBtn.innerText = isConfirm ? 'Confirm' : 'OK';
        confirmBtn.onclick = () => {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            modal.style.display = 'none';
            if (onConfirm) onConfirm();
        };
    }

    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

export function closeAlert() {
    const modal = document.getElementById('custom-alert') || document.getElementById('alert-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function showToast(title, message, type = "success") {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = "fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none";
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColor = type === "success" 
        ? "bg-emerald-600 border-emerald-500 shadow-emerald-500/20" 
        : "bg-rose-600 border-rose-500 shadow-rose-500/20";

    toast.className = `${bgColor} border text-white p-3 rounded-lg shadow-xl transform transition-all duration-300 translate-x-full opacity-0 max-w-xs pointer-events-auto`;
    toast.innerHTML = `
        <div class="flex items-start gap-2">
            <div>
                <h4 class="text-xs font-black uppercase tracking-widest">${title}</h4>
                <p class="text-[11px] font-bold text-white/90 mt-0.5 leading-tight">${message}</p>
            </div>
        </div>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('translate-x-full', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

if (typeof window !== 'undefined') {
    window.customAlert = customAlert;
    window.closeAlert = closeAlert;
    window.showToast = showToast;
    window.showAlert = (msg, isConfirm, onConfirm) => customAlert("Notification", msg, isConfirm, onConfirm);
}
