// ToastProvider.jsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]); // {id, type, text, duration}
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((type, text, opts = {}) => {
    const id = ++idRef.current;
    const duration = Math.max(1200, Math.min(8000, opts.duration ?? 2500));
    setToasts((prev) => [...prev, { id, type, text, duration }]);
    // auto-dismiss
    setTimeout(() => remove(id), duration);
  }, [remove]);

  const api = useMemo(() => ({
    success: (text, opts) => show("success", text, opts),
    error:   (text, opts) => show("error", text, opts),
    info:    (text, opts) => show("info", text, opts),
  }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed z-50 top-3 right-3 sm:top-6 sm:right-6 flex flex-col gap-2 w-72 sm:w-80">
          {toasts.map((t) => (
            <Toast key={t.id} toast={t} onClose={() => remove(t.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

function Toast({ toast, onClose }) {
  const { type, text } = toast;
  const styles = {
    success: "border-emerald-300/80",
    error:   "border-red-300/80",
    info:    "border-blue-300/80",
  }[type] || "border-gray-300/80";

  const badge = {
    success: "bg-emerald-500",
    error:   "bg-red-500",
    info:    "bg-blue-500",
  }[type] || "bg-gray-500";

  const role = type === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      className={`relative rounded-xl border ${styles} shadow-lg bg-white/95 backdrop-blur px-3.5 py-2.5 text-sm text-gray-900 transition
                  animate-[fadeIn_.2s_ease-out]`}
      style={{}}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${badge}"></div>
      <div className="pl-1.5 pr-7">
        <p className="leading-5">{text}</p>
      </div>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-1.5 right-1.5 rounded-md p-1 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" className="opacity-70">
          <path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59L7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/>
        </svg>
      </button>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${badge} rounded-l-xl`} />
    </div>
  );
}
