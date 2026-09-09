import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { clearAuthSession, getUser } from "../utils/auth";
import "../HamburgerMenu.css";

const NAV_ITEMS = [
  {
    path: "/",
    label: "Dashboard",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    path: "/orders",
    label: "Orders",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    path: "/delivery",
    label: "Delivery",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    path: "/cargo",
    label: "Cargo",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16.5 9.4 7.55 4.24" />
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <line x1="12" y1="22" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    path: "/losses",
    label: "Losses",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
        <polyline points="16 17 22 17 22 11" />
      </svg>
    ),
  },
  {
    path: "/history",
    label: "History",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </svg>
    ),
  },
  {
    path: "/reports",
    label: "Reports",
    icon: <span aria-hidden="true">▤</span>,
  },

  {
    path: "/user-accounts",
    label: "User Accounts",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6" />
        <path d="M22 11h-6" />
      </svg>
    ),
  },
];

function canAccessNavItem(item, role) {
  if (item.path === "/user-accounts") return role === "admin";
  if (role === "dashboard") return item.path === "/";
  return true;
}

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleMenu = () => setOpen((v) => !v);

  const [currentUser, setCurrentUser] = useState(getUser());

  useEffect(() => {
    const handleAuthChanged = (e) => {
      setCurrentUser(e?.detail?.user || getUser());
    };
    window.addEventListener("shein:auth-changed", handleAuthChanged);
    return () => window.removeEventListener("shein:auth-changed", handleAuthChanged);
  }, []);

  const username = currentUser?.username || currentUser?.name || currentUser?.email || "Admin";
  const role = currentUser?.role || "admin";
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccessNavItem(item, role)),
    [role]
  );
  const roleLabel = role === "admin" ? "System Administrator" : role === "operations" ? "Operations User" : "Dashboard User";

  const initials = useMemo(() => {
    if (!username) return "OP";
    const parts = username.trim().split(/[\s_-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.slice(0, 2).toUpperCase();
  }, [username]);

  const handleLogout = () => {
    clearAuthSession();
    setOpen(false);
    navigate("/login", { replace: true });
  };

  const onNav = () => setOpen(false);

  return (
    <>
      <header className="topNavBar">
        <div className="topNavInner">
          {/* Brand Mark */}
          <div className="topNavLeft">
            <Link to="/" className="topNavBrand">
              <span className="topNavLogoIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </span>
              <div className="topNavBrandInfo">
                <span className="topNavBrandText">
                  SHEIN<span>OPS</span>
                </span>
                <span className="topNavBrandBadge">PRO</span>
              </div>
            </Link>
          </div>

          {/* Centered Navigation Links (Dashboard to Accounts) */}
          <nav className="topNavCenter">
            <div className="topNavLinksDesktop">
              {visibleNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`topNavLink ${isActive ? "topNavLinkActive" : ""}`}
                    title={item.label}
                  >
                    <span className="topNavIcon">{item.icon}</span>
                    <span className="topNavText">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Right Action Cluster */}
          <div className="topNavRight">
            {/* Live Operational Status */}
            <div className="topNavStatusPill" title="Operational Pipeline Connected">
              <span className="topNavStatusPulse" />
              <span className="topNavStatusText">Live Ops</span>
            </div>

            {/* User Profile Pill */}
            <div className="topNavUser">
              <span className="topNavUserAvatar">{initials}</span>
              <div className="topNavUserDetails">
                <span className="topNavUserName">{username}</span>
              </div>
            </div>

            {/* Quick Reset Password Link */}
            <Link
              to="/reset-password"
              className="topNavIconBtn"
              title="Reset Password / Security"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </Link>

            {/* Logout Button */}
            <button type="button" className="topNavLogoutBtn" onClick={handleLogout} title="Sign Out">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Logout</span>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              className={`topNavMobileToggle ${open ? "active" : ""}`}
              onClick={toggleMenu}
              aria-label="Toggle navigation menu"
              type="button"
            >
              <span className="hamburgerBar" />
              <span className="hamburgerBar" />
              <span className="hamburgerBar" />
            </button>
          </div>
        </div>
      </header>

      {/* Full-Featured Mobile Drawer */}
      <div className={`menu-overlay ${open ? "open" : ""}`} onClick={onNav}>
        <div className="menu-content" onClick={(e) => e.stopPropagation()}>
          <div className="menu-header-mobile">
            <div className="topNavBrand">
              <span className="topNavLogoIcon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </span>
              <div className="topNavBrandInfo">
                <span className="topNavBrandText">
                  SHEIN<span>OPS</span>
                </span>
                <span className="topNavBrandBadge">PRO</span>
              </div>
            </div>
            <button className="menu-close-mobile" onClick={onNav} type="button" aria-label="Close menu">
              ✕
            </button>
          </div>

          <div className="menu-user-card">
            <span className="topNavUserAvatar large">{initials}</span>
            <div className="menu-user-info">
              <span className="menu-user-name">{username}</span>
              <span className="menu-user-role">{roleLabel}</span>
            </div>
          </div>

          <nav className="menu-links">
            <div className="menu-section-label">Navigation</div>
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onNav}
                  className={`menu-link ${isActive ? "menu-link-active" : ""}`}
                >
                  <span className="menu-link-icon">{item.icon}</span>
                  <span className="menu-link-text">{item.label}</span>
                  {isActive && <span className="menu-link-indicator" />}
                </Link>
              );
            })}

            <div className="menu-section-label" style={{ marginTop: "12px" }}>Account</div>
            <Link to="/reset-password" onClick={onNav} className="menu-link">
              <span className="menu-link-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span className="menu-link-text">Reset Password</span>
            </Link>

            <button type="button" className="menu-logout-btn" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Log Out of System</span>
            </button>
          </nav>
        </div>
      </div>
    </>
  );
}
