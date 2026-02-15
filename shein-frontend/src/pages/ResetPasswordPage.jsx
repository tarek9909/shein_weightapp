import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetPassword } from "../api/authApi";
import { CustomModal } from "../components/CustomModal";
import "../login.css"; // reuse your login styles (or create resetpassword.css)

export default function ResetPasswordPage() {
  const nav = useNavigate();

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState({ isOpen: false });
  const closeModal = () => setModal({ isOpen: false });

  const openInfo = (title, message, onOk) => {
    setModal({
      isOpen: true,
      title,
      message,
      confirmText: "OK",
      showCancel: false,
      onConfirm: () => {
        closeModal();
        onOk?.();
      },
      onCancel: closeModal,
      onClose: closeModal,
    });
  };

  const isValid = useMemo(() => {
    if (!oldPass) return false;
    if (!newPass) return false;
    if (newPass.length < 6) return false;
    if (newPass !== confirmPass) return false;
    return true;
  }, [oldPass, newPass, confirmPass]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    try {
      const res = await resetPassword(oldPass, newPass, confirmPass);
      if (!res?.ok) throw new Error(res?.error || "Failed to reset password");

      // ✅ After success: show modal then logout user
      openInfo("Success", "Password updated. You will be logged out now.", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        nav("/login", { replace: true });
      });
    } catch (err) {
      openInfo("Reset Error", err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginHead">
          <h1 className="loginTitle">Reset Password</h1>
          <div className="loginSub">
            Enter your old password, then set a new password.
          </div>
        </div>

        <form className="loginForm" onSubmit={handleSubmit}>
          <label className="loginLabel">Old Password</label>
          <input
            className="loginInput"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
          />

          <label className="loginLabel">New Password</label>
          <input
            className="loginInput"
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 6 characters"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />

          <label className="loginLabel">Confirm New Password</label>
          <input
            className="loginInput"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat new password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
          />

          <button
            className={isValid && !loading ? "loginBtn" : "loginBtn loginBtnDisabled"}
            type="submit"
            disabled={!isValid || loading}
          >
            {loading ? "Saving..." : "Confirm Reset"}
          </button>

          <div className="loginHint">
            After success you’ll be logged out automatically.
          </div>
        </form>
      </div>

      <CustomModal {...modal} />
    </div>
  );
}
