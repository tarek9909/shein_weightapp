// src/pages/LoginPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CustomModal } from "../components/CustomModal";
import { API_ORIGIN } from "../api/baseUrl";
import { isAuthenticated, setAuthSession } from "../utils/auth";
import "../login.css";

const BASE_URL = API_ORIGIN + "/auth";

export default function LoginPage() {
  // IMPORTANT: backend expects "username", not "email"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // If already authenticated, redirect to intended target
  useEffect(() => {
    if (isAuthenticated()) {
      const searchParams = new URLSearchParams(location.search);
      const redirectParam = searchParams.get("redirect");
      const fromPath = location.state?.from?.pathname
        ? (location.state.from.pathname + (location.state.from.search || ""))
        : redirectParam || "/";
      const target = fromPath.startsWith("/login") ? "/" : fromPath;
      navigate(target, { replace: true });
    }
  }, [location, navigate]);

  // modal
  const [modal, setModal] = useState({ isOpen: false });
  const closeModal = () => setModal({ isOpen: false });

  const openInfo = (title, message) => {
    setModal({
      isOpen: true,
      title,
      message,
      onConfirm: closeModal,
      onCancel: closeModal,
      onClose: closeModal,
      confirmText: "OK",
      showCancel: false,
    });
  };

  const isValid = useMemo(() => {
    if (!username.trim()) return false;
    if (!password) return false;
    return true;
  }, [username, password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid response from server");
      }

      // backend returns: { ok: true, token, user }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Login failed (${res.status})`);
      }

      setAuthSession(data.token, data.user || {});

      // Navigate to intended destination or default "/"
      const searchParams = new URLSearchParams(location.search);
      const redirectParam = searchParams.get("redirect");
      const fromPath = location.state?.from?.pathname
        ? (location.state.from.pathname + (location.state.from.search || ""))
        : redirectParam || "/";
      const target = fromPath.startsWith("/login") ? "/" : fromPath;
      navigate(target, { replace: true });
    } catch (err) {
      console.error(err);
      openInfo("Login Error", err.message || "Failed to login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginHead">
          <h1 className="loginTitle">Sign In</h1>
          <div className="loginSub">Use your account to access your own data.</div>
        </div>

        <form className="loginForm" onSubmit={handleSubmit}>
          <label className="loginLabel">Username</label>
          <input
            className="loginInput"
            autoComplete="username"
            placeholder="your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label className="loginLabel">Password</label>
          <input
            className="loginInput"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            className={isValid && !loading ? "loginBtn" : "loginBtn loginBtnDisabled"}
            type="submit"
            disabled={!isValid || loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <div className="loginHint">
            No sign-up here. Ask the admin to create your account.
          </div>
        </form>
      </div>

      <CustomModal {...modal} />
    </div>
  );
}
