import { useEffect, useMemo, useState } from "react";
import {
  createManagedUser,
  getManagedUsers,
  updateManagedUser,
  setManagedUserActive,
  deleteManagedUser,
  resetManagedUserPassword,
} from "../api/authApi";
import "../userAccounts.css";

const ACCOUNT_TYPES = [
  {
    value: "admin",
    title: "Administrator",
    badge: "Full Access",
    description: "Can create & manage user accounts, assign roles, reset credentials, and access all workspaces.",
    badgeClass: "badge-admin",
  },
  {
    value: "operations",
    title: "Operations",
    badge: "Operational",
    description: "Full workspace access: orders, delivery pipelines, cargo, customer debts, and loss tracking.",
    badgeClass: "badge-operations",
  },
  {
    value: "dashboard",
    title: "Dashboard",
    badge: "Analytics",
    description: "Focused view of the executive financial dashboard and private performance metrics.",
    badgeClass: "badge-dashboard",
  },
];

const EMPTY_FORM = { username: "", password: "", role: "operations" };

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "operations") return "Operations";
  return "Dashboard";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function UserAccountsPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Modal dialog states
  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [resetModalLoading, setResetModalLoading] = useState(false);
  const [resetModalError, setResetModalError] = useState("");

  const [deleteModalUser, setDeleteModalUser] = useState(null);
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);

  const selectedType = useMemo(
    () => ACCOUNT_TYPES.find((type) => type.value === form.role) || ACCOUNT_TYPES[1],
    [form.role]
  );

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getManagedUsers();
      setUsers(Array.isArray(response?.users) ? response.users : []);
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not load user accounts." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const ops = users.filter((u) => u.role === "operations").length;
    const dash = users.filter((u) => u.role === "dashboard").length;
    const active = users.filter((u) => u.is_active).length;
    return { total, admins, ops, dash, active };
  }, [users]);

  // Filtered accounts list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !searchTerm.trim() ||
        u.username.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        String(u.id).includes(searchTerm.trim());
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (notice.text) setNotice({ type: "", text: "" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const username = form.username.trim();
    if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username)) {
      setNotice({
        type: "error",
        text: "Username must be 3–100 characters and contain only letters, numbers, dot, underscore, or hyphen.",
      });
      return;
    }
    if (form.password.length < 12) {
      setNotice({
        type: "error",
        text: "Password must be at least 12 characters long for team security.",
      });
      return;
    }

    setSaving(true);
    setNotice({ type: "", text: "" });
    try {
      const response = await createManagedUser({
        username,
        password: form.password,
        role: form.role,
      });
      if (!response?.user) throw new Error(response?.error || "Could not create account.");
      setUsers((current) => [response.user, ...current]);
      setForm(EMPTY_FORM);
      setShowPassword(false);
      setNotice({
        type: "success",
        text: `Account "${username}" was created successfully with ${roleLabel(response.user.role)} privileges.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not create account." });
    } finally {
      setSaving(false);
    }
  };

  const toggleAccount = async (user) => {
    try {
      await setManagedUserActive(user.id, !user.is_active);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, is_active: !user.is_active } : item
        )
      );
      setNotice({
        type: "success",
        text: `Account "${user.username}" is now ${!user.is_active ? "Active" : "Disabled"}.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not update account status." });
    }
  };

  const changeRole = async (user, newRole) => {
    try {
      await updateManagedUser(user.id, newRole);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, role: newRole } : item))
      );
      setNotice({
        type: "success",
        text: `Updated "${user.username}" access tier to ${roleLabel(newRole)}.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not update access level." });
    }
  };

  const handleOpenResetModal = (user) => {
    setResetModalUser(user);
    setNewPasswordValue("");
    setResetModalError("");
  };

  const handleConfirmResetPassword = async () => {
    if (!resetModalUser) return;
    if (newPasswordValue.length < 12) {
      setResetModalError("Password must be at least 12 characters.");
      return;
    }
    setResetModalLoading(true);
    setResetModalError("");
    try {
      await resetManagedUserPassword(resetModalUser.id, newPasswordValue);
      setNotice({
        type: "success",
        text: `Password for "${resetModalUser.username}" was updated successfully.`,
      });
      setResetModalUser(null);
    } catch (error) {
      setResetModalError(error?.message || "Failed to reset password.");
    } finally {
      setResetModalLoading(false);
    }
  };

  const handleOpenDeleteModal = (user) => {
    setDeleteModalUser(user);
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalUser) return;
    setDeleteModalLoading(true);
    try {
      await deleteManagedUser(deleteModalUser.id);
      setUsers((current) =>
        current.map((item) =>
          item.id === deleteModalUser.id ? { ...item, is_active: false } : item
        )
      );
      setNotice({
        type: "success",
        text: `"${deleteModalUser.username}" was disabled and signed out.`,
      });
      setDeleteModalUser(null);
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not disable account." });
    } finally {
      setDeleteModalLoading(false);
    }
  };

  return (
    <main className="userAccountsPage">
      {/* Page Header */}
      <header className="userAccountsHeader">
        <div className="userAccountsHeaderLeft">
          <div className="userAccountsEyebrow">
            <span className="userAccountsEyebrowDot" />
            SECURITY & ACCESS GOVERNANCE
          </div>
          <h1 className="userAccountsTitle">Team User Accounts</h1>
          <p className="userAccountsSubtitle">
            Provision team logins, assign access privileges, and maintain strict multi-tenant workspace isolation.
          </p>
        </div>

        <div className="userAccountsHeaderRight">
          <button
            type="button"
            className="userAccountsRefreshBtn"
            onClick={loadUsers}
            disabled={loading}
            title="Refresh user list"
          >
            <svg
              className={`refreshIcon ${loading ? "isSpinning" : ""}`}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{loading ? "Syncing..." : "Sync Directory"}</span>
          </button>

          <div className="userAccountsSecurityBadge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Isolated Workspaces</span>
          </div>
        </div>
      </header>

      {/* KPI Stats Strip */}
      <section className="userAccountsStatsStrip">
        <div className="statCard statTotal">
          <div className="statCardIconWrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="statCardInfo">
            <span className="statCardLabel">Total Accounts</span>
            <strong className="statCardValue">{stats.total}</strong>
          </div>
        </div>

        <div className="statCard statAdmin">
          <div className="statCardIconWrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="statCardInfo">
            <span className="statCardLabel">Administrators</span>
            <strong className="statCardValue">{stats.admins}</strong>
          </div>
        </div>

        <div className="statCard statOps">
          <div className="statCardIconWrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div className="statCardInfo">
            <span className="statCardLabel">Operations Team</span>
            <strong className="statCardValue">{stats.ops}</strong>
          </div>
        </div>

        <div className="statCard statDash">
          <div className="statCardIconWrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div className="statCardInfo">
            <span className="statCardLabel">Dashboard Members</span>
            <strong className="statCardValue">{stats.dash}</strong>
          </div>
        </div>

        <div className="statCard statActive">
          <div className="statCardIconWrap">
            <span className="activePulseIndicator" />
          </div>
          <div className="statCardInfo">
            <span className="statCardLabel">Active Logins</span>
            <strong className="statCardValue">{stats.active}</strong>
          </div>
        </div>
      </section>

      {/* Global Alert Notification */}
      {notice.text && (
        <div className={`userAccountsNoticeBanner is-${notice.type}`}>
          <div className="noticeIcon">
            {notice.type === "success" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <span className="noticeText">{notice.text}</span>
          <button
            type="button"
            className="noticeCloseBtn"
            onClick={() => setNotice({ type: "", text: "" })}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Two-Column Master Layout */}
      <div className="userAccountsLayout">
        {/* Left Column: Create Account Card */}
        <section className="userAccountsCard userAccountsCreateCard">
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Create Account</h2>
              <p className="cardSubtitle">Provision a team member with their private login credentials.</p>
            </div>
            <span className="stepBadge">01</span>
          </div>

          <form onSubmit={handleSubmit} className="userAccountsForm">
            <div className="formGroup">
              <label className="fieldLabel" htmlFor="new-username">
                <span>Username</span>
                <span className="fieldRequirement">Letters, numbers, ., -, _</span>
              </label>
              <div className="inputWithIcon">
                <span className="inputIcon">@</span>
                <input
                  id="new-username"
                  name="username"
                  className="fieldInput"
                  value={form.username}
                  onChange={updateField}
                  placeholder="e.g. logistics_lead"
                  autoComplete="username"
                  maxLength={100}
                  required
                />
              </div>
            </div>

            <div className="formGroup">
              <label className="fieldLabel" htmlFor="new-password">
                <span>Initial Password</span>
                <span className={`fieldRequirement ${form.password.length >= 12 ? "isMet" : ""}`}>
                  {form.password.length >= 12 ? "✓ 12+ chars" : `${form.password.length}/12 min chars`}
                </span>
              </label>
              <div className="inputWithIcon">
                <span className="inputIcon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="new-password"
                  name="password"
                  className="fieldInput passwordField"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={updateField}
                  placeholder="Min. 12 characters"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="togglePasswordBtn"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <fieldset className="roleSelectionFieldset">
              <legend className="fieldLabel">
                <span>Select Access Privilege</span>
              </legend>

              <div className="roleCardsList">
                {ACCOUNT_TYPES.map((type) => {
                  const isSelected = form.role === type.value;
                  return (
                    <label
                      key={type.value}
                      className={`roleOptionCard ${isSelected ? "isSelected" : ""} role-${type.value}`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={type.value}
                        checked={isSelected}
                        onChange={updateField}
                        className="srOnlyRadio"
                      />
                      <div className="roleOptionRadioCircle">
                        {isSelected && <span className="roleOptionRadioDot" />}
                      </div>
                      <div className="roleOptionContent">
                        <div className="roleOptionHeader">
                          <span className="roleOptionTitle">{type.title}</span>
                          <span className={`roleOptionBadge ${type.badgeClass}`}>{type.badge}</span>
                        </div>
                        <p className="roleOptionDesc">{type.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="roleSummaryBox">
              <span className="roleSummaryIcon">🛡️</span>
              <div className="roleSummaryText">
                <strong>{selectedType.title} Mode:</strong> Each team login creates and owns its private months, orders, and dashboard analytics.
              </div>
            </div>

            <button className="primarySubmitBtn" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <span className="btnSpinner" />
                  <span>Provisioning Account...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Right Column: Directory List Card */}
        <section className="userAccountsCard userAccountsListCard">
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Managed Accounts Directory</h2>
              <p className="cardSubtitle">All team members operating in your workspace tenancy.</p>
            </div>
            <span className="countBadge">{filteredUsers.length}</span>
          </div>

          {/* Directory Toolbar: Search & Filter Tabs */}
          <div className="directoryToolbar">
            <div className="searchBox">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by username or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="searchInput"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="searchClearBtn"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="filterPills">
              <button
                type="button"
                className={`filterPill ${roleFilter === "all" ? "isActive" : ""}`}
                onClick={() => setRoleFilter("all")}
              >
                All ({users.length})
              </button>
              <button
                type="button"
                className={`filterPill ${roleFilter === "admin" ? "isActive" : ""}`}
                onClick={() => setRoleFilter("admin")}
              >
                Admins ({stats.admins})
              </button>
              <button
                type="button"
                className={`filterPill ${roleFilter === "operations" ? "isActive" : ""}`}
                onClick={() => setRoleFilter("operations")}
              >
                Operations ({stats.ops})
              </button>
              <button
                type="button"
                className={`filterPill ${roleFilter === "dashboard" ? "isActive" : ""}`}
                onClick={() => setRoleFilter("dashboard")}
              >
                Dashboard ({stats.dash})
              </button>
            </div>
          </div>

          {/* Directory Table */}
          {loading ? (
            <div className="directoryEmptyState">
              <span className="isSpinning loadSpinner" />
              <strong>Loading Team Directory...</strong>
              <p>Fetching active tenant accounts and permission records.</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="directoryEmptyState">
              <div className="emptyStateIcon">👥</div>
              <strong>No Accounts Match Your Criteria</strong>
              <p>
                {searchTerm || roleFilter !== "all"
                  ? "Try adjusting your search query or role filter."
                  : "Provision your first team account using the form on the left."}
              </p>
            </div>
          ) : (
            <div className="tableResponsiveWrapper">
              <table className="userAccountsTable">
                <thead>
                  <tr>
                    <th>User & Credentials</th>
                    <th>Access Privilege</th>
                    <th>Status</th>
                    <th>Workspace</th>
                    <th>Created</th>
                    <th className="thActions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const avatarLetter = String(user.username || "?").charAt(0).toUpperCase();
                    const roleClass = `userRole-${user.role || "dashboard"}`;
                    return (
                      <tr key={user.id} className={!user.is_active ? "isRowDisabled" : ""}>
                        {/* Username Cell */}
                        <td>
                          <div className="userIdentityCell">
                            <div className={`userAvatar ${roleClass}`}>{avatarLetter}</div>
                            <div className="userMeta">
                              <span className="userName">{user.username}</span>
                              <span className="userIdTag">ID #{user.id}</span>
                            </div>
                          </div>
                        </td>

                        {/* Access Role Selector Cell */}
                        <td>
                          <div className="roleSelectWrapper">
                            <select
                              value={user.role || "dashboard"}
                              onChange={(e) => changeRole(user, e.target.value)}
                              className={`customRoleSelect ${roleClass}`}
                              title="Change access level"
                            >
                              <option value="admin">Administrator</option>
                              <option value="operations">Operations</option>
                              <option value="dashboard">Dashboard</option>
                            </select>
                            <span className="selectChevron">▾</span>
                          </div>
                        </td>

                        {/* Status Badge Cell */}
                        <td>
                          <span className={`statusPill ${user.is_active ? "isActive" : "isInactive"}`}>
                            <span className="statusDot" />
                            {user.is_active ? "Active" : "Disabled"}
                          </span>
                        </td>

                        {/* Workspace Scope Cell */}
                        <td>
                          <span className="workspaceScopeBadge" title="Data is strictly isolated to this account">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <line x1="9" y1="3" x2="9" y2="21" />
                            </svg>
                            Private
                          </span>
                        </td>

                        {/* Created Date Cell */}
                        <td>
                          <span className="createdDateText">{formatDate(user.created_at)}</span>
                        </td>

                        {/* Action Buttons Cell */}
                        <td>
                          <div className="actionButtonGroup">
                            {/* Reset Password Button */}
                            <button
                              type="button"
                              className="actionBtn btnResetPassword"
                              onClick={() => handleOpenResetModal(user)}
                              title="Reset account password"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2l-2 2m-1.5 1.5L10 13l-4 4 2 2 4-4 7.5-7.5" />
                                <circle cx="7.5" cy="16.5" r="4.5" />
                              </svg>
                              <span>Password</span>
                            </button>

                            {/* Enable / Disable Button */}
                            <button
                              type="button"
                              className={`actionBtn ${user.is_active ? "btnDisable" : "btnEnable"}`}
                              onClick={() => toggleAccount(user)}
                              title={user.is_active ? "Suspend this account" : "Re-enable this account"}
                            >
                              {user.is_active ? (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                  </svg>
                                  <span>Disable</span>
                                </>
                              ) : (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Enable</span>
                                </>
                              )}
                            </button>

                            {/* Delete Button */}
                            {user.is_active && (
                              <button
                                type="button"
                                className="actionBtn btnDelete"
                                onClick={() => handleOpenDeleteModal(user)}
                                title="Soft-delete user and revoke tokens"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Modal Dialog: Reset Password */}
      {resetModalUser && (
        <div className="userAccountsModalOverlay" onClick={() => setResetModalUser(null)}>
          <div className="userAccountsModalBox" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalHeaderIcon keyModalIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2l-2 2m-1.5 1.5L10 13l-4 4 2 2 4-4 7.5-7.5" />
                  <circle cx="7.5" cy="16.5" r="4.5" />
                </svg>
              </div>
              <div>
                <h3 className="modalTitle">Reset Account Password</h3>
                <p className="modalSubtitle">
                  Assign a new security credential for <strong>@{resetModalUser.username}</strong>
                </p>
              </div>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={() => setResetModalUser(null)}
              >
                ×
              </button>
            </div>

            <div className="modalBody">
              <div className="formGroup">
                <label className="fieldLabel" htmlFor="modal-new-password">
                  <span>New Password</span>
                  <span className={`fieldRequirement ${newPasswordValue.length >= 12 ? "isMet" : ""}`}>
                    {newPasswordValue.length >= 12 ? "✓ Length Valid" : `${newPasswordValue.length}/12 min chars`}
                  </span>
                </label>
                <input
                  id="modal-new-password"
                  type="password"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Enter at least 12 characters"
                  className="fieldInput"
                  autoFocus
                />
              </div>

              {resetModalError && (
                <div className="userAccountsNoticeBanner is-error modalNotice">
                  <span>{resetModalError}</span>
                </div>
              )}
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="modalSecondaryBtn"
                onClick={() => setResetModalUser(null)}
                disabled={resetModalLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modalPrimaryBtn"
                onClick={handleConfirmResetPassword}
                disabled={resetModalLoading || newPasswordValue.length < 12}
              >
                {resetModalLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Confirm Delete/Disable */}
      {deleteModalUser && (
        <div className="userAccountsModalOverlay" onClick={() => setDeleteModalUser(null)}>
          <div className="userAccountsModalBox deleteConfirmModal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalHeaderIcon dangerModalIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="modalTitle">Disable User Account?</h3>
                <p className="modalSubtitle">
                  This will suspend <strong>@{deleteModalUser.username}</strong> and revoke all current login sessions.
                </p>
              </div>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={() => setDeleteModalUser(null)}
              >
                ×
              </button>
            </div>

            <div className="modalBody">
              <p className="modalNoticeWarningText">
                The user will immediately be prevented from signing in. Their existing orders and workspace data will remain securely preserved in the database. You can re-enable this account at any time.
              </p>
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="modalSecondaryBtn"
                onClick={() => setDeleteModalUser(null)}
                disabled={deleteModalLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modalDangerBtn"
                onClick={handleConfirmDelete}
                disabled={deleteModalLoading}
              >
                {deleteModalLoading ? "Disabling..." : "Disable Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
