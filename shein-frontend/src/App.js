import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import OrdersPage from "./pages/OrdersPage";
import SheinAccountsPage from "./pages/SheinAccountsPage";
import DeliveryWorkspace from "./pages/DeliveryWorkspace";
import CargoPage from "./pages/CargoPage";
import LossesWorkspace from "./pages/LossesWorkspace";
import ActivityHistoryPage from "./pages/ActivityHistoryPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UserAccountsPage from "./pages/UserAccountsPage.jsx";
import HamburgerMenu from "./components/HamburgerMenu";
import PrivateRoute from "./components/PrivateRoute";
import "./App.css";

/* Separate layout so we can hide hamburger on login and listen for session expiration */
function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = location.pathname === "/login";

  useEffect(() => {
    const handleSessionExpired = (event) => {
      const from =
        event?.detail?.from ||
        (location.pathname + location.search);
      if (!location.pathname.startsWith("/login")) {
        navigate(`/login?redirect=${encodeURIComponent(from)}`, {
          replace: true,
          state: { from: location },
        });
      }
    };

    window.addEventListener("shein:session-expired", handleSessionExpired);
    return () => window.removeEventListener("shein:session-expired", handleSessionExpired);
  }, [location, navigate]);

  return (
    <>
      {!isLogin && <HamburgerMenu />}
      <div className="app-content">
        <Routes>
          {/* LOGIN */}
          <Route path="/login" element={<LoginPage />} />

          {/* PROTECTED ROUTES */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />

          <Route
            path="/reports"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <Reports />
              </PrivateRoute>
            }
          />

          <Route
            path="/orders"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <OrdersPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/shein-accounts"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <SheinAccountsPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/user-accounts"
            element={
              <PrivateRoute allowedRoles={["admin"]}>
                <UserAccountsPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/delivery"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <DeliveryWorkspace />
              </PrivateRoute>
            }
          />

          <Route
            path="/cargo"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <CargoPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/history"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <ActivityHistoryPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/losses"
            element={
              <PrivateRoute allowedRoles={["admin", "operations"]}>
                <LossesWorkspace />
              </PrivateRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PrivateRoute>
                <ResetPasswordPage />
              </PrivateRoute>
            }
          />

          {/* FALLBACK */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}

export default App;
