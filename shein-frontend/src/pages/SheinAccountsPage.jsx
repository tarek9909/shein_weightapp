import { useEffect, useMemo, useState } from "react";
import {
  cancelSheinProfileLogin,
  deleteSheinUserByOwner,
  finishSheinProfileLogin,
  getSheinProfileLoginStatus,
  getSheinUserDetail,
  listSheinUsers,
  registerSheinAccount,
  startSheinProfileLogin,
} from "../api/sheinTrackerApi";
import { CustomModal } from "../components/CustomModal";
import CustomDropdown from "../components/CustomDropdown";
import "../orders.css";

const emptyForm = {
  id: null,
  email: "",
  shein_email: "",
  shein_password: "",
  gmail_email: "",
  gmail_app_password: "",
  profile_key: "auto",
};

const activeLoginStatuses = new Set(["starting", "opening", "login_required", "logged_in"]);

export default function SheinAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [chromeProfiles, setChromeProfiles] = useState([]);
  const [serverProfiles, setServerProfiles] = useState([]);
  const [remoteBrowserUrl, setRemoteBrowserUrl] = useState("");
  const [profileSessions, setProfileSessions] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [modal, setModal] = useState({ isOpen: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const closeModal = () => setModal({ isOpen: false });

  const openInfo = (title, message) =>
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

  const openConfirm = (title, message, onYes) =>
    setModal({
      isOpen: true,
      title,
      message,
      confirmText: "Confirm",
      cancelText: "Cancel",
      showCancel: true,
      onConfirm: async () => {
        closeModal();
        await onYes();
      },
      onCancel: closeModal,
      onClose: closeModal,
    });

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await listSheinUsers();
      setAccounts(Array.isArray(data?.users) ? data.users : []);
      setChromeProfiles(Array.isArray(data?.chrome_profiles) ? data.chrome_profiles : []);
      setServerProfiles(Array.isArray(data?.server_profiles) ? data.server_profiles : []);
      setRemoteBrowserUrl(data?.remote_browser_url || "");
    } catch (err) {
      setAccounts([]);
      setChromeProfiles([]);
      setServerProfiles([]);
      openInfo("SHEIN API", err?.message || "Failed to load SHEIN accounts.");
    } finally {
      setLoading(false);
    }
  };

  const saveAccount = async () => {
    if (saving) return;
    if (!form.email || !form.shein_email) {
      openInfo("Missing Data", "API email and SHEIN email are required.");
      return;
    }

    setSaving(true);
    try {
      await registerSheinAccount(form);
      localStorage.setItem("shein_api_email", form.email);
      setForm((prev) => ({ ...emptyForm, email: prev.email }));
      await loadAccounts();
      openInfo("Done", "Account saved. Use Login beside the account to sign in through the VPS browser.");
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to save SHEIN account.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (email) => {
    try {
      const data = await getSheinUserDetail(email);
      const u = data?.user || {};
      setEditForm({
        id: u.id,
        email: u.email || email,
        shein_email: u.shein_email || "",
        shein_password: "",
        gmail_email: u.gmail_email || "",
        gmail_app_password: "",
        profile_key: u.profile_key || "auto",
      });
      setEditOpen(true);
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to load account details.");
    }
  };

  const saveEdit = async () => {
    if (saving) return;
    if (!editForm.email || !editForm.shein_email) {
      openInfo("Missing Data", "API email and SHEIN email are required.");
      return;
    }
    setSaving(true);
    try {
      await registerSheinAccount(editForm);
      setEditOpen(false);
      await loadAccounts();
      openInfo("Done", "SHEIN account updated.");
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to update SHEIN account.");
    } finally {
      setSaving(false);
    }
  };

  const updateLoginSession = (profileKey, login) => {
    if (!profileKey || !login) return;
    setProfileSessions((previous) => ({ ...previous, [profileKey]: login }));
  };

  const startLogin = async (account) => {
    const profileKey = account.profile_key;
    if (!profileKey) return openInfo("Profile missing", "Assign a browser profile first.");
    try {
      const data = await startSheinProfileLogin(profileKey);
      updateLoginSession(profileKey, data?.login);
      const urlMessage = data?.remote_browser_url
        ? `Open the VPS browser here: ${data.remote_browser_url}`
        : "Open your VPS noVNC/remote-browser page now.";
      openInfo("Login started", `${urlMessage}\n\nLog into SHEIN in the VPS browser, then use Check or Finish.`);
      if (data?.remote_browser_url) window.open(data.remote_browser_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      openInfo("Login", err?.message || "Could not start the VPS browser.");
    }
  };

  const checkLogin = async (profileKey) => {
    const session = profileSessions[profileKey];
    if (!session?.session_id) return openInfo("Login", "Start the VPS login first.");
    try {
      const data = await getSheinProfileLoginStatus(profileKey, session.session_id);
      updateLoginSession(profileKey, data?.login);
      if (data?.login?.logged_in) openInfo("Login complete", "SHEIN is logged in for this profile.");
    } catch (err) {
      openInfo("Login status", err?.message || "Could not check login status.");
    }
  };

  const finishLogin = async (profileKey) => {
    const session = profileSessions[profileKey];
    if (!session?.session_id) return openInfo("Login", "Start the VPS login first.");
    try {
      const data = await finishSheinProfileLogin(profileKey, session.session_id);
      updateLoginSession(profileKey, { ...(data?.login || {}), session_id: null });
      if (data?.login?.logged_in) {
        openInfo("Saved", "The VPS profile is ready for automatic scraping.");
      } else {
        openInfo("Login incomplete", "SHEIN was not detected as logged in. Keep the browser open and try again.");
      }
      await loadAccounts();
    } catch (err) {
      openInfo("Login", err?.message || "Could not finish login.");
    }
  };

  const cancelLogin = async (profileKey) => {
    const session = profileSessions[profileKey];
    if (!session?.session_id) return;
    try {
      await cancelSheinProfileLogin(profileKey, session.session_id);
      setProfileSessions((previous) => {
        const next = { ...previous };
        delete next[profileKey];
        return next;
      });
    } catch (err) {
      openInfo("Login", err?.message || "Could not cancel login.");
    }
  };

  const onDelete = async (email) => {
    if (saving) return;
    openConfirm("Delete SHEIN Account", `Delete ${email}?`, async () => {
      setSaving(true);
      try {
        await deleteSheinUserByOwner(email);
        if ((localStorage.getItem("shein_api_email") || "").toLowerCase() === email.toLowerCase()) {
          localStorage.removeItem("shein_api_email");
          setForm((p) => ({ ...p, email: "" }));
        }
        await loadAccounts();
        openInfo("Done", "SHEIN account deleted. Its profile was kept on disk for safety.");
      } catch (err) {
        openInfo("SHEIN API", err?.message || "Failed to delete SHEIN account.");
      } finally {
        setSaving(false);
      }
    });
  };

  useEffect(() => {
    const savedEmail = localStorage.getItem("shein_api_email") || "";
    if (savedEmail) setForm((prev) => ({ ...prev, email: savedEmail }));
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sessions = Object.values(profileSessions).filter((session) =>
      session?.session_id && activeLoginStatuses.has(session.status),
    );
    if (!sessions.length) return undefined;
    const timer = setInterval(async () => {
      for (const session of sessions) {
        try {
          const data = await getSheinProfileLoginStatus(session.profile_key, session.session_id);
          updateLoginSession(session.profile_key, data?.login);
        } catch (_) {
          // The user can still use the explicit Check button for details.
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [profileSessions]);

  const profileOptions = useMemo(() => {
    const map = new Map([["auto", { profile_key: "auto", name: "Create automatically" }]]);
    for (const profile of [...serverProfiles, ...chromeProfiles]) {
      if (profile?.profile_key && !map.has(profile.profile_key)) map.set(profile.profile_key, profile);
    }
    return [...map.values()];
  }, [chromeProfiles, serverProfiles]);

  const profileStatus = (profileKey) => {
    const session = profileSessions[profileKey];
    if (session?.status) return session.status;
    return serverProfiles.find((profile) => profile.profile_key === profileKey)?.status || "not_checked";
  };

  const profileDropdown = (value, onChange) => (
    <CustomDropdown
      className="loginInput"
      value={value}
      onChange={onChange}
      options={profileOptions.map((profile) => ({
        value: profile.profile_key,
        label: `${profile.name || profile.profile_key}${profile.status ? ` — ${profile.status}` : ""}`,
      }))}
      placeholder="Select browser profile"
    />
  );

  return (
    <div className="ordPage">
      <div className="ordHeader">
        <div className="ordHeaderLeft">
          <h1 className="ordTitle">SHEIN Accounts</h1>
          <div className="ordSub">Save an account, then log in once through the VPS browser.</div>
        </div>
      </div>

      <div className="ordGrid">
        <div className="ordCard">
          <div className="ordCardHead"><div className="ordCardTitle">Add SHEIN Account</div></div>
          <div className="ordCardBody" style={{ display: "grid", gap: 8 }}>
            <input className="loginInput" placeholder="Associated API email or ID" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <input className="loginInput" placeholder="SHEIN email" value={form.shein_email} onChange={(e) => setForm((p) => ({ ...p, shein_email: e.target.value }))} />
            <input className="loginInput" type="password" placeholder="SHEIN password (optional)" value={form.shein_password} onChange={(e) => setForm((p) => ({ ...p, shein_password: e.target.value }))} />
            <input className="loginInput" placeholder="Gmail email (optional)" value={form.gmail_email} onChange={(e) => setForm((p) => ({ ...p, gmail_email: e.target.value }))} />
            <input className="loginInput" type="password" placeholder="Gmail app password (optional)" value={form.gmail_app_password} onChange={(e) => setForm((p) => ({ ...p, gmail_app_password: e.target.value }))} />
            {profileDropdown(form.profile_key, (e) => setForm((p) => ({ ...p, profile_key: e.target.value })))}
            <div className="ordSub">Passwords are optional when you log in manually through the VPS browser.</div>
            <button className="ordBtn" disabled={saving} onClick={saveAccount}>{saving ? "Saving..." : "Add Account"}</button>
          </div>
        </div>

        <div className="ordCard">
          <div className="ordCardHead"><div className="ordCardTitle">Existing Accounts</div></div>
          <div className="ordCardBody" style={{ display: "grid", gap: 10 }}>
            {loading ? <div className="ordSub">Loading accounts...</div> : accounts.length === 0 ? <div className="ordSub">No accounts found.</div> : accounts.map((account) => {
              const profileKey = account.profile_key || "Default";
              const session = profileSessions[profileKey];
              const status = profileStatus(profileKey);
              return (
                <div key={account.id || account.email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div className="ordSub" style={{ wordBreak: "break-all" }}>{account.email}</div>
                    <div className="ordSub">Profile: {profileKey} — {status}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {session?.session_id ? (
                      <>
                        <button className="ordBtn" disabled={saving} onClick={() => checkLogin(profileKey)}>Check</button>
                        <button className="ordBtn" disabled={saving} onClick={() => finishLogin(profileKey)}>Finish</button>
                        <button className="cmBtnSoft" disabled={saving} onClick={() => cancelLogin(profileKey)}>Cancel</button>
                      </>
                    ) : (
                      <button className="ordBtn" disabled={saving} onClick={() => startLogin(account)}>Login on VPS</button>
                    )}
                    <button className="ordBtn" disabled={saving} onClick={() => openEdit(account.email)}>Edit</button>
                    <button className="ceBtnDanger" disabled={saving} onClick={() => onDelete(account.email)}>Delete</button>
                  </div>
                </div>
              );
            })}
            {remoteBrowserUrl && <div className="ordSub">Remote browser: <a href={remoteBrowserUrl} target="_blank" rel="noreferrer">Open VPS browser</a></div>}
          </div>
        </div>
      </div>

      {editOpen && (
        <div className="cmOverlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }} onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <div className="cmModal">
            <div className="cmHead"><div className="cmTitle">Edit SHEIN Account</div><button className="cmX" onClick={() => setEditOpen(false)} aria-label="Close">X</button></div>
            <div className="cmBody" style={{ display: "grid", gap: 8 }}>
              <input className="cmInput" value={editForm.email} disabled />
              <input className="cmInput" placeholder="SHEIN email" value={editForm.shein_email} onChange={(e) => setEditForm((p) => ({ ...p, shein_email: e.target.value }))} />
              <input className="cmInput" type="password" placeholder="SHEIN password (optional)" value={editForm.shein_password} onChange={(e) => setEditForm((p) => ({ ...p, shein_password: e.target.value }))} />
              <input className="cmInput" placeholder="Gmail email (optional)" value={editForm.gmail_email} onChange={(e) => setEditForm((p) => ({ ...p, gmail_email: e.target.value }))} />
              <input className="cmInput" placeholder="Gmail app password (optional)" type="password" value={editForm.gmail_app_password} onChange={(e) => setEditForm((p) => ({ ...p, gmail_app_password: e.target.value }))} />
              {profileDropdown(editForm.profile_key, (e) => setEditForm((p) => ({ ...p, profile_key: e.target.value })))}
            </div>
            <div className="cmFooter"><button className="cmBtnSoft" onClick={() => setEditOpen(false)}>Cancel</button><button className="cmBtn" disabled={saving} onClick={saveEdit}>{saving ? "Saving..." : "Save"}</button></div>
          </div>
        </div>
      )}

      <CustomModal {...modal} />
    </div>
  );
}
