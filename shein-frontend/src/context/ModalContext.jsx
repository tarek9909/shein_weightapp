// ModalContext.jsx
import { createContext, useContext, useState } from "react";

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  const [modal, setModal] = useState(null);

  const showModal = ({ title, message, input, onConfirm, onCancel }) => {
    setModal({ title, message, input, onConfirm, onCancel });
  };

  const closeModal = () => setModal(null);

  return (
    <ModalContext.Provider value={{ showModal, closeModal }}>
      {children}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{modal.title}</h2>
            {modal.message && <p>{modal.message}</p>}
            {modal.input && (
              <input
                type="text"
                placeholder={modal.input.placeholder}
                defaultValue={modal.input.defaultValue || ""}
                id="modalInput"
              />
            )}
            <div className="modal-buttons">
              <button
                onClick={() => {
                  if (modal.input) {
                    const value = document.getElementById("modalInput").value;
                    modal.onConfirm(value);
                  } else {
                    modal.onConfirm();
                  }
                  closeModal();
                }}
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  modal.onCancel?.();
                  closeModal();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => useContext(ModalContext);
