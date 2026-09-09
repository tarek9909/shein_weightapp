import { useEffect, useState, useMemo } from "react";
import "../CustomModal.css";

function ModalIcon({ variant }) {
  if (variant === "danger") {
    return (
      <div className="cmIconBadge cmIconDanger" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }
  if (variant === "success") {
    return (
      <div className="cmIconBadge cmIconSuccess" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
    );
  }
  if (variant === "warning") {
    return (
      <div className="cmIconBadge cmIconWarning" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
    );
  }
  // Default / Info
  return (
    <div className="cmIconBadge cmIconInfo" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </div>
  );
}

export function CustomModal({
  isOpen,
  title,
  message,
  inputProps, // optional: { placeholder, defaultValue, type }
  confirmText = "OK",
  cancelText = "Cancel",
  showCancel = false,
  variant, // optional: 'danger' | 'warning' | 'success' | 'info'
  onConfirm,
  onCancel,
  onClose, // optional (close icon)
}) {
  const [value, setValue] = useState(inputProps?.defaultValue ?? "");

  const activeVariant = useMemo(() => {
    if (variant) return variant;
    const t = String(title || "").toLowerCase();
    const m = String(message || "").toLowerCase();
    if (t.includes("delete") || t.includes("remove") || m.includes("delete") || m.includes("remove") || t.includes("error")) {
      return "danger";
    }
    if (t.includes("warning") || m.includes("warning")) return "warning";
    if (t.includes("success")) return "success";
    return "info";
  }, [variant, title, message]);

  useEffect(() => {
    if (isOpen) setValue(inputProps?.defaultValue ?? "");
  }, [isOpen, inputProps]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!onConfirm) return;
        if (inputProps) onConfirm(value);
        else onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (onCancel) onCancel();
        else if (onClose) onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, inputProps, onConfirm, onCancel, onClose, value]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!onConfirm) return;
    if (inputProps) onConfirm(value);
    else onConfirm();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  return (
    <div
      className="cmOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className={`cmModal cmModal--${activeVariant}`}>
        <div className="cmHead">
          <div className="cmHeadMain">
            <ModalIcon variant={activeVariant} />
            <div className="cmTitle">{title || "Message"}</div>
          </div>
          {onClose && (
            <button className="cmX" onClick={onClose} aria-label="Close" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="cmBody">
          {message ? <div className="cmMsg">{message}</div> : null}

          {inputProps ? (
            <div className="cmInputWrap">
              <input
                className="cmInput"
                type={inputProps.type || "text"}
                placeholder={inputProps.placeholder || ""}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
          ) : null}
        </div>

        <div className="cmFooter">
          {showCancel && (
            <button type="button" className="cmBtnSoft" onClick={handleCancel}>
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={activeVariant === "danger" && showCancel ? "cmBtnDanger" : "cmBtn"}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
