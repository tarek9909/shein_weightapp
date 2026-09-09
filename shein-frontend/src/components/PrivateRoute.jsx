// src/components/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, clearAuthSession, getUser } from "../utils/auth";

const PrivateRoute = ({ children, allowedRoles }) => {
  const location = useLocation();

  if (!isAuthenticated()) {
    clearAuthSession();
    const currentPath = location.pathname + location.search;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(currentPath)}`}
        state={{ from: location }}
        replace
      />
    );
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const user = getUser();
    const userRole = user?.role || "admin";
    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default PrivateRoute;
