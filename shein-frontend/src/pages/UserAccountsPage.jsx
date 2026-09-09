import { useEffect, useMemo, useState } from "react";
import { createManagedUser, getManagedUsers, updateManagedUser, setManagedUserActive, deleteManagedUser, resetManagedUserPassword } from "../api/authApi";
import "../userAccounts.css";

const ACCOUNT_TYPES = [
  {
    value: "dashboard",
    title: "Dashboard",
    description: "Access to the main dashboard and this user’s own operational data.",
  },
  {
    value: "operations",
    title: "Operations",
    description: "Access to the dashboard plus orders, delivery, cargo, history, and losses.",
  },
];

const EMPTY_FORM = { username: "", password: "", role: "dashboard" };

function roleLabel(role) {
  return role === "operations" ? "Operations" : role === "admin" ? "Administrator" : "Dashboard";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

export default function UserAccountsPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });

  const selectedType = useMemo(
    () => ACCOUNT_TYPES.find((type) => type.value === form.role) || ACCOUNT_TYPES[0],
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
      setNotice({ type: "error", text: "Use 3–100 letters, numbers, dots, underscores, or hyphens for the username." });
      return;
    }
    if (form.password.length < 12) {
      setNotice({ type: "error", text: "The password must be at least 12 characters." });
      return;
    }

    setSaving(true);
    setNotice({ type: "", text: "" });
    try {
      const response = await createManagedUser({ username, password: form.password, role: form.role });
      if (!response?.user) throw new Error(response?.error || "Could not create account.");
      setUsers((current) => [response.user, ...current]);
      setForm(EMPTY_FORM);
      setNotice({ type: "success", text: `${username} was created with ${roleLabel(response.user.role)} access.` });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not create account." });
    } finally {
      setSaving(false);
    }
  };

  const toggleAccount = async (user) => {
    try {
      await setManagedUserActive(user.id, !user.is_active);
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, is_active: !user.is_active } : item));
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not update account status." });
    }
  };

  const changeRole = async (user, role) => {
    try {
      await updateManagedUser(user.id, role);
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not update account type." });
    }
  };

  const resetAccountPassword = async (user) => {
    const password = window.prompt(`New password for ${user.username} (at least 12 characters):`);
    if (password == null) return;
    if (password.length < 12) {
      setNotice({ type: "error", text: "The password must be at least 12 characters." });
      return;
    }
    try {
      await resetManagedUserPassword(user.id, password);
      setNotice({ type: "success", text: `Password reset for ${user.username}.` });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not reset password." });
    }
  };

  const deleteAccount = async (user) => {
    if (!window.confirm(`Disable ${user.username}? This is a soft delete and revokes their sessions.`)) return;
    try {
      await deleteManagedUser(user.id);
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, is_active: false } : item));
      setNotice({ type: "success", text: `${user.username} was disabled and signed out.` });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not delete account." });
    }
  };

  return (
    <main className="userAccountsPage">
      <header className="userAccountsHeader">
        <div>
          <div className="userAccountsEyebrow">ACCESS CONTROL</div>
          <h1>User accounts</h1>
          <p>Create separate logins with isolated operational data.</p>
        </div>
        <div className="userAccountsSecurityNote">
          <span className="userAccountsSecurityIcon" aria-hidden="true">✓</span>
          <span>Each login sees its own data</span>
        </div>
      </header>

      <div className="userAccountsLayout">
        <section className="userAccountsCard userAccountsCreateCard">
          <div className="userAccountsCardHeading">
            <div>
              <h2>Add an account</h2>
              <p>Give a team member their own sign-in and access level.</p>
            </div>
            <span className="userAccountsStep">01</span>
          </div>

          <form onSubmit={handleSubmit} className="userAccountsForm">
            <label className="userAccountsLabel" htmlFor="new-username">Username</label>
            <input
              id="new-username"
              name="username"
              className="userAccountsInput"
              value={form.username}
              onChange={updateField}
              placeholder="e.g. warehouse_team"
              autoComplete="username"
              maxLength={100}
            />

            <label className="userAccountsLabel" htmlFor="new-password">Temporary password</label>
            <input
              id="new-password"
              name="password"
              className="userAccountsInput"
              type="password"
              value={form.password}
              onChange={updateField}
              placeholder="At least 12 characters"
              autoComplete="new-password"
            />

            <fieldset className="userAccountsTypeFieldset">
              <legend className="userAccountsLabel">Access level</legend>
              <div className="userAccountsTypeGrid">
                {ACCOUNT_TYPES.map((type) => (
                  <label className={`userAccountsType ${form.role === type.value ? "isSelected" : ""}`} key={type.value}>
                    <input
                      type="radio"
                      name="role"
                      value={type.value}
                      checked={form.role === type.value}
                      onChange={updateField}
                    />
                    <span className="userAccountsRadio" aria-hidden="true" />
                    <span>
                      <strong>{type.title}</strong>
                      <small>{type.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="userAccountsSelectedHint">
              <span className="userAccountsHintDot" />
              <span><strong>{selectedType.title} access:</strong> {selectedType.description}</span>
            </div>

            {notice.text && (
              <div className={`userAccountsNotice is-${notice.type}`} role="status">
                <span aria-hidden="true">{notice.type === "success" ? "✓" : "!"}</span>
                {notice.text}
              </div>
            )}

            <button className="userAccountsPrimaryButton" type="submit" disabled={saving}>
              <span aria-hidden="true">+</span>
              {saving ? "Creating account…" : "Create account"}
            </button>
          </form>
        </section>

        <section className="userAccountsCard userAccountsListCard">
          <div className="userAccountsCardHeading">
            <div>
              <h2>Your managed accounts</h2>
              <p>Accounts created here start with an empty, private workspace.</p>
            </div>
            <span className="userAccountsCount">{users.length}</span>
          </div>

          {loading ? (
            <div className="userAccountsEmpty">Loading accounts…</div>
          ) : users.length === 0 ? (
            <div className="userAccountsEmpty">
              <span className="userAccountsEmptyIcon" aria-hidden="true">◎</span>
              <strong>No managed accounts yet</strong>
              <span>Create the first account using the form.</span>
            </div>
          ) : (
            <div className="userAccountsTableWrap">
              <table className="userAccountsTable">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Access</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <span className="userAccountsAvatar">{String(user.username || "?").slice(0, 1).toUpperCase()}</span>
                        <strong>{user.username}</strong>
                      </td>
                      <td>
                        <select value={user.role || "dashboard"} onChange={(event) => changeRole(user, event.target.value)}>
                          <option value="dashboard">Dashboard</option>
                          <option value="operations">Operations</option>
                        </select>
                      </td>
                      <td>{user.is_active ? "Active" : "Disabled"}</td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <button type="button" onClick={() => toggleAccount(user)}>{user.is_active ? "Disable" : "Enable"}</button>
                        <button type="button" onClick={() => resetAccountPassword(user)}>Reset password</button>
                        {user.is_active && <button type="button" onClick={() => deleteAccount(user)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
