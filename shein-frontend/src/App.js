// src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import OrdersPage from "./pages/OrdersPage";
import DeliveryPage from "./pages/DeliveryPage";
import DeliveryTrackingPage from "./pages/DeliveryTrackingPage";
import AddedDeliveriesPage from "./pages/AddedDeliveriesPage";
import History from "./pages/History";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import HamburgerMenu from "./components/HamburgerMenu";
import PrivateRoute from "./components/PrivateRoute";

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
            path="/delivery"
            element={
              <PrivateRoute>
                <DeliveryPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/deliverytrack"
            element={
              <PrivateRoute>
                <DeliveryTrackingPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/addeddelivery"
            element={
              <PrivateRoute>
                <AddedDeliveriesPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/history"
            element={
              <PrivateRoute>
                <History />
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
