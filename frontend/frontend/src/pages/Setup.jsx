import { useState } from "react";
import { api } from "../api/client";

export default function Setup({ onDone }) {
  const [form, setForm] = useState({
    email: "",
    gmail_email: "",
    gmail_app_password: "",
    shein_email: "",
    shein_password: "",
  });

  const [msg, setMsg] = useState("");

  const set = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    setMsg("Saving...");

    try {
      await api.post("/api/register", form);
      localStorage.setItem("user_email", form.email);
      onDone(form.email);
    } catch (err) {
      setMsg("Error saving credentials.");
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Setup Account</h2>

        <form onSubmit={submit} className="flex" style={{ flexDirection: "column" }}>
          <input
            className="input"
            placeholder="Your Email (user id)"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
          />

          <div className="responsive-row">
            <input
              className="input"
              placeholder="Gmail Email"
              value={form.gmail_email}
              onChange={(e) => set("gmail_email", e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Gmail App Password"
              value={form.gmail_app_password}
              onChange={(e) => set("gmail_app_password", e.target.value)}
              required
            />
          </div>

          <div className="responsive-row">
            <input
              className="input"
              placeholder="SHEIN Email"
              value={form.shein_email}
              onChange={(e) => set("shein_email", e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="SHEIN Password"
              value={form.shein_password}
              onChange={(e) => set("shein_password", e.target.value)}
              required
            />
          </div>

          <button className="button button-primary">Save & Continue</button>

          {msg && <div className="small-text">{msg}</div>}
        </form>
      </div>
    </div>
  );
}
