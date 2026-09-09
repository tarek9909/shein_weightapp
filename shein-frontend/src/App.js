// src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

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
import HamburgerMenu from "./components/HamburgerMenu";
import PrivateRoute from "./components/PrivateRoute";
import "./App.css";

/* Separate layout so we can hide hamburger on login */
function AppLayout() {
  const location = useLocation();
  const isLogin = location.pathname === "/login";

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
              <PrivateRoute>
                <Reports />
              </PrivateRoute>
            }
          />

          <Route
            path="/orders"
            element={
              <PrivateRoute>
                <OrdersPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/shein-accounts"
            element={
              <PrivateRoute>
                <SheinAccountsPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/delivery"
            element={
              <PrivateRoute>
                <DeliveryWorkspace />
              </PrivateRoute>
            }
          />

          <Route
            path="/cargo"
            element={
              <PrivateRoute>
                <CargoPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/history"
            element={
              <PrivateRoute>
                <ActivityHistoryPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/losses"
            element={
              <PrivateRoute>
                <LossesWorkspace />
              </PrivateRoute>
            }
          />
<Route path="/reset-password" element={<ResetPasswordPage />} />

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
