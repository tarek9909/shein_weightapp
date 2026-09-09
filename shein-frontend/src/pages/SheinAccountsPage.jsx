import { useEffect, useState } from "react";
import {
  deleteSheinUserByOwner,
  getSheinUserDetail,
  listSheinUsers,
  registerSheinAccount,
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
  profile_key: "Default",
};

export default function SheinAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [chromeProfiles, setChromeProfiles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [modal, setModal] = useState({ isOpen: false });

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
    try {
      const data = await listSheinUsers();
      setAccounts(data?.users || []);
      setChromeProfiles(data?.chrome_profiles || []);
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to load SHEIN accounts.");
    }
  };

  const saveAccount = async () => {
    if (!form.email || !form.shein_email || !form.shein_password || !form.gmail_email || !form.gmail_app_password) {
      openInfo("Missing Data", "Please fill all fields.");
      return;
    }

    try {
      await registerSheinAccount({
        ...form,
      });
      localStorage.setItem("shein_api_email", form.email);
      setForm((prev) => ({ ...emptyForm, email: prev.email }));
      await loadAccounts();
      openInfo("Done", "SHEIN account saved.");
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to save SHEIN account.");
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
        profile_key: u.profile_key || "Default",
      });
      setEditOpen(true);
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to load account details.");
    }
  };

  const saveEdit = async () => {
    if (
      !editForm.email ||
      !editForm.shein_email ||
      !editForm.gmail_email
    ) {
      openInfo("Missing Data", "Please fill all fields in edit form.");
      return;
    }
    try {
      await registerSheinAccount({
        ...editForm,
      });
      setEditOpen(false);
      await loadAccounts();
      openInfo("Done", "SHEIN account updated.");
    } catch (err) {
      openInfo("SHEIN API", err?.message || "Failed to update SHEIN account.");
    }
  };

  const onDelete = async (email) => {
    openConfirm("Delete SHEIN Account", `Delete ${email}?`, async () => {
      try {
        await deleteSheinUserByOwner(email);
        if ((localStorage.getItem("shein_api_email") || "").toLowerCase() === email.toLowerCase()) {
          localStorage.removeItem("shein_api_email");
          setForm((p) => ({ ...p, email: "" }));
        }
        await loadAccounts();
        openInfo("Done", "SHEIN account deleted.");
      } catch (err) {
        openInfo("SHEIN API", err?.message || "Failed to delete SHEIN account.");
      }
    });
  };

  useEffect(() => {
    const savedEmail = localStorage.getItem("shein_api_email") || "";
    if (savedEmail) setForm((prev) => ({ ...prev, email: savedEmail }));
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ordPage">
      <div className="ordHeader">
        <div className="ordHeaderLeft">
          <h1 className="ordTitle">SHEIN Accounts</h1>
          <div className="ordSub">Add accounts in the left form, edit/delete from the list.</div>
        </div>
      </div>

      <div className="ordGrid">
        <div className="ordCard">
          <div className="ordCardHead">
            <div className="ordCardTitle">Add SHEIN Account</div>
          </div>
          <div className="ordCardBody" style={{ display: "grid", gap: 8 }}>
            <input
              className="loginInput"
              placeholder="Associated API email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
            <input
              className="loginInput"
              placeholder="SHEIN email"
              value={form.shein_email}
              onChange={(e) => setForm((p) => ({ ...p, shein_email: e.target.value }))}
            />
            <input
              className="loginInput"
              type="password"
              placeholder="SHEIN password"
              value={form.shein_password}
              onChange={(e) => setForm((p) => ({ ...p, shein_password: e.target.value }))}
            />
            <input
              className="loginInput"
              placeholder="Gmail email"
              value={form.gmail_email}
              onChange={(e) => setForm((p) => ({ ...p, gmail_email: e.target.value }))}
            />
            <input
              className="loginInput"
              type="password"
              placeholder="Gmail app password"
              value={form.gmail_app_password}
                onChange={(e) => setForm((p) => ({ ...p, gmail_app_password: e.target.value }))}
            />
            <CustomDropdown
              className="loginInput"
              value={form.profile_key}
              onChange={(e) => setForm((p) => ({ ...p, profile_key: e.target.value }))}
              options={chromeProfiles.map((profile) => ({
                value: profile.profile_key,
                label: `${profile.name}${profile.account_name ? ` — ${profile.account_name}` : ""}`,
              }))}
              placeholder="Select Chrome Profile"
            />
            <button className="ordBtn" onClick={saveAccount}>
              Add Account
            </button>
          </div>
        </div>

        <div className="ordCard">
          <div className="ordCardHead">
            <div className="ordCardTitle">Existing API Emails</div>
          </div>
          <div className="ordCardBody" style={{ display: "grid", gap: 10 }}>
            {accounts.length === 0 ? (
              <div className="ordSub">No accounts found.</div>
            ) : (
              accounts.map((u) => (
                <div
                  key={u.email}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div className="ordSub" style={{ wordBreak: "break-all" }}>{u.email}</div>
                    <div className="ordSub">Chrome profile: {u.profile_key || "Default"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="ordBtn" onClick={() => openEdit(u.email)}>
                      Edit
                    </button>
                    <button className="ceBtnDanger" onClick={() => onDelete(u.email)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {editOpen && (
        <div
          className="cmOverlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="cmModal">
            <div className="cmHead">
              <div className="cmTitle">Edit SHEIN Account</div>
              <button className="cmX" onClick={() => setEditOpen(false)} aria-label="Close">
                X
              </button>
            </div>
            <div className="cmBody" style={{ display: "grid", gap: 8 }}>
              <input className="cmInput" value={editForm.email} disabled />
              <input
                className="cmInput"
                placeholder="SHEIN email"
                value={editForm.shein_email}
                onChange={(e) => setEditForm((p) => ({ ...p, shein_email: e.target.value }))}
              />
              <input
                className="cmInput"
                type="password"
                placeholder="SHEIN password (leave blank to keep current)"
                value={editForm.shein_password}
                onChange={(e) => setEditForm((p) => ({ ...p, shein_password: e.target.value }))}
              />
              <input
                className="cmInput"
                placeholder="Gmail email"
                value={editForm.gmail_email}
                onChange={(e) => setEditForm((p) => ({ ...p, gmail_email: e.target.value }))}
              />
              <input
                className="cmInput"
                placeholder="Gmail app password (leave blank to keep current)"
                type="password"
                value={editForm.gmail_app_password}
                onChange={(e) => setEditForm((p) => ({ ...p, gmail_app_password: e.target.value }))}
              />
              <CustomDropdown
                className="cmInput"
                value={editForm.profile_key}
                onChange={(e) => setEditForm((p) => ({ ...p, profile_key: e.target.value }))}
                options={chromeProfiles.map((profile) => ({
                  value: profile.profile_key,
                  label: `${profile.name}${profile.account_name ? ` — ${profile.account_name}` : ""}`,
                }))}
                placeholder="Select Chrome Profile"
              />
            </div>
            <div className="cmFooter">
              <button className="cmBtnSoft" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button className="cmBtn" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomModal {...modal} />
    </div>
  );
}
