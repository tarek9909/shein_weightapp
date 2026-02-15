import { useEffect, useState } from "react";
import "../CustomModal.css";

export function CustomModal({
  isOpen,
  title,
  message,
  inputProps,          // optional: { placeholder, defaultValue, type }
  confirmText = "OK",
  cancelText = "Cancel",
  showCancel = false,
  onConfirm,
  onCancel,
  onClose,             // optional (close icon)
}) {
  const [value, setValue] = useState(inputProps?.defaultValue ?? "");

  useEffect(() => {
    if (isOpen) setValue(inputProps?.defaultValue ?? "");
  }, [isOpen, inputProps?.defaultValue]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      if (inputProps) onConfirm(value);
      else onConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  return (
    <div className="cmOverlay" role="dialog" aria-modal="true">
      <div className="cmModal">
        <div className="cmHead">
          <div className="cmTitle">{title || "Message"}</div>
          {onClose && (
            <button className="cmX" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        <div className="cmBody">
          {message ? <div className="cmMsg">{message}</div> : null}

          {inputProps ? (
            <input
              className="cmInput"
              type={inputProps.type || "text"}
              placeholder={inputProps.placeholder || ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          ) : null}
        </div>

        <div className="cmFooter">
          {showCancel && (
            <button className="cmBtnSoft" onClick={handleCancel}>
              {cancelText}
            </button>
          )}
          <button className="cmBtn" onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
