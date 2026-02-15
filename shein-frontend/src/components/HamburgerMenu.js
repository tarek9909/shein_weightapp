import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../HamburgerMenu.css";

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const toggleMenu = () => setOpen(!open);

  // ✅ Read user from localStorage safely
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  }, []);

  const username =
    user?.username || user?.name || user?.email || "User";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setOpen(false);
    navigate("/login", { replace: true });
  };

  return (
    <>
      {/* Hamburger button */}
      <button className="hamburger-btn" onClick={toggleMenu}>
        ☰
      </button>

      {/* Overlay popup */}
      <div
        className={`menu-overlay ${open ? "open" : ""}`}
        onClick={toggleMenu}
      >
        <div
          className="menu-content"
          onClick={(e) => e.stopPropagation()}
        >
     

          <nav className="menu-links">
            <Link to="" > Hello <strong>{username}</strong></Link>
            <Link to="/" onClick={toggleMenu}>Dashboard</Link>
            <Link to="/orders" onClick={toggleMenu}>Orders</Link>
            <Link to="/delivery" onClick={toggleMenu}>Delivery addition</Link>
            <Link to="/deliverytrack" onClick={toggleMenu}>Delivery track</Link>
            <Link to="/addeddelivery" onClick={toggleMenu}>Delivery collection</Link>
            <Link to="/history" onClick={toggleMenu}>History</Link>
            <Link to="/reset-password" onClick={toggleMenu}>Reset Password</Link>

            <Link className="menu-logout" onClick={handleLogout}>
              Logout
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}
