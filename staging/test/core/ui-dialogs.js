// ==========================================================================
// core/ui-dialogs.js - Universal Custom In-Page Modals & Alerts
// Wild & Wandering Property Management System
// ==========================================================================

let activeConfirmCallback = null;

function ensureDialogElements() {
    let modal = document.getElementById('ww-universal-dialog-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ww-universal-dialog-modal';
        modal.className = "hidden fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none";
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-300 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div class="bg-slate-900 text-white p-3 font-black uppercase flex justify-between items-center">
                    <span id="ww-dialog-title" class="tracking-wide">Alert</span>
                    <button type="button" onclick="window.closeCustomDialog()" class="text-slate-400 hover:text-white text-base leading-none cursor-pointer">&times;</button>
                </div>
                <div class="p-4 space-y-3">
                    <p id="ww-dialog-msg" class="font-bold text-slate-700 leading-relaxed whitespace-pre-line"></p>
                    <div class="pt-2 border-t border-slate-100 flex justify-end gap-2">
                        <button type="button" id="ww-dialog-btn-cancel" onclick="window.closeCustomDialog()" class="hidden px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold uppercase rounded cursor-pointer text-[10px]">
                            Cancel
                        </button>
                        <button type="button" id="ww-dialog-btn-confirm" onclick="window.executeCustomDialogConfirm()" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase rounded shadow-xs cursor-pointer text-[10px]">
                            OK
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.onclick = (e) => {
            if (e.target === modal) window.closeCustomDialog();
        };

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                window.closeCustomDialog();
            }
        });
    }
    return modal;
}

export function customAlert(title, message, isConfirm = false, onConfirm = null) {
    const modal = ensureDialogElements();
    const titleEl = document.getElementById('ww-dialog-title');
    const msgEl = document.getElementById('ww-dialog-msg');
    const cancelBtn = document.getElementById('ww-dialog-btn-cancel');
    const confirmBtn = document.getElementById('ww-dialog-btn-confirm');

    if (titleEl) titleEl.innerText = title || "Notice";
    if (msgEl) msgEl.innerText = message || "";

    activeConfirmCallback = typeof onConfirm === 'function' ? onConfirm : null;

    if (isConfirm) {
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        if (confirmBtn) {
            confirmBtn.innerText = "Confirm";
            confirmBtn.className = "px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase rounded shadow-xs cursor-pointer text-[10px]";
        }
    } else {
        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (confirmBtn) {
            confirmBtn.innerText = "OK";
            confirmBtn.className = "px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase rounded shadow-xs cursor-pointer text-[10px]";
        }
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeCustomDialog() {
    const modal = document.getElementById('ww-universal-dialog-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    activeConfirmCallback = null;
}

export function executeCustomDialogConfirm() {
    const cb = activeConfirmCallback;
    closeCustomDialog();
    if (typeof cb === 'function') {
        cb();
    }
}

if (typeof window !== 'undefined') {
    window.customAlert = customAlert;
    window.closeCustomDialog = closeCustomDialog;
    window.executeCustomDialogConfirm = executeCustomDialogConfirm;
}
