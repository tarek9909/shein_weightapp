import { useEffect, useMemo, useState } from "react";
import {
  bulkCreateDirectoryCustomers,
  createDirectoryCustomer,
  deleteDirectoryCustomer,
  getCustomerDirectory,
  updateDirectoryCustomer,
} from "../api/customersApi";
import "../customerDirectory.css";

const EMPTY_FORM = { customer_name: "", phone: "", notes: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function parseBulkLine(line) {
  const parts = line
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)|\t/)
    .map((part) => part.trim().replace(/^"|"$/g, ""));
  return {
    customer_name: parts[0] || "",
    phone: parts[1] || "",
    notes: parts.slice(2).join(", "),
  };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });

  const parsedBulkCount = useMemo(
    () => bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length,
    [bulkText]
  );

  const loadCustomers = async (search = query) => {
    setLoading(true);
    try {
      const response = await getCustomerDirectory(search);
      setCustomers(Array.isArray(response?.customers) ? response.customers : []);
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not load customers." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (notice.text) setNotice({ type: "", text: "" });
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || !form.customer_name.trim()) {
      setNotice({ type: "error", text: "Customer name is required." });
      return;
    }
    setSaving(true);
    setNotice({ type: "", text: "" });
    try {
      if (editingId) {
        const response = await updateDirectoryCustomer(editingId, form);
        setCustomers((current) => current.map((customer) => (
          customer.id === editingId ? response.customer : customer
        )));
        setNotice({ type: "success", text: "Customer updated successfully." });
      } else {
        const response = await createDirectoryCustomer(form);
        setCustomers((current) => [response.customer, ...current]);
        setNotice({ type: "success", text: "Customer added successfully." });
      }
      resetForm();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not save customer." });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async () => {
    const rows = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseBulkLine)
      .filter((customer) => customer.customer_name);
    if (!rows.length || bulkSaving) {
      setNotice({ type: "error", text: "Enter at least one customer name, one per line." });
      return;
    }
    setBulkSaving(true);
    setNotice({ type: "", text: "" });
    try {
      const response = await bulkCreateDirectoryCustomers(rows);
      setBulkText("");
      await loadCustomers(query);
      setNotice({
        type: "success",
        text: `${response.created_count || 0} customer${response.created_count === 1 ? "" : "s"} added. ${response.skipped_count || 0} duplicate or empty row${response.skipped_count === 1 ? "" : "s"} skipped.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not add customers in bulk." });
    } finally {
      setBulkSaving(false);
    }
  };

  const startEdit = (customer) => {
    setEditingId(customer.id);
    setForm({
      customer_name: customer.customer_name || "",
      phone: customer.phone || "",
      notes: customer.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (customer) => {
    if (!window.confirm(`Delete ${customer.customer_name}?`)) return;
    try {
      await deleteDirectoryCustomer(customer.id);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      if (editingId === customer.id) resetForm();
      setNotice({ type: "success", text: "Customer deleted." });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not delete customer." });
    }
  };

  return (
    <main className="customerDirectoryPage">
      <header className="customerDirectoryHeader">
        <div>
          <div className="customerDirectoryEyebrow">CUSTOMER DIRECTORY</div>
          <h1>Customers</h1>
          <p>Save reusable customers, then select them while creating an order.</p>
        </div>
        <div className="customerDirectoryCount">
          <strong>{customers.length}</strong>
          <span>shown</span>
        </div>
      </header>

      {notice.text && (
        <div className={`customerDirectoryNotice is-${notice.type}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="customerDirectoryLayout">
        <section className="customerDirectoryCard">
          <div className="customerDirectoryCardHeading">
            <div>
              <h2>{editingId ? "Edit customer" : "Add customer"}</h2>
              <p>These records are private to the current user workspace.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="customerDirectoryForm">
            <label htmlFor="customer-name">Customer name</label>
            <input id="customer-name" name="customer_name" value={form.customer_name} onChange={updateField} placeholder="e.g. Sara Ahmed" autoComplete="name" />
            <label htmlFor="customer-phone">Phone (optional)</label>
            <input id="customer-phone" name="phone" value={form.phone} onChange={updateField} placeholder="e.g. +961..." autoComplete="tel" />
            <label htmlFor="customer-notes">Notes (optional)</label>
            <textarea id="customer-notes" name="notes" value={form.notes} onChange={updateField} placeholder="Address, delivery preference, or other note" rows="3" />
            <div className="customerDirectoryFormActions">
              {editingId && <button type="button" className="customerDirectoryButton secondary" onClick={resetForm}>Cancel</button>}
              <button type="submit" className="customerDirectoryButton" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add customer"}
              </button>
            </div>
          </form>
        </section>

        <section className="customerDirectoryCard">
          <div className="customerDirectoryCardHeading">
            <div>
              <h2>Bulk add</h2>
              <p>One customer per line. Optional format: <code>Name, phone, notes</code>.</p>
            </div>
            <span className="customerDirectoryBulkCount">{parsedBulkCount}</span>
          </div>
          <textarea
            className="customerDirectoryBulkInput"
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            placeholder={'Sara Ahmed\nOmar Haddad, +961 70 000 000\nMaya Saleh, +961 71 000 000, VIP'}
            rows="10"
          />
          <button type="button" className="customerDirectoryButton" onClick={handleBulkSubmit} disabled={bulkSaving || !parsedBulkCount}>
            {bulkSaving ? "Adding customers..." : `Add ${parsedBulkCount || "customers"} in bulk`}
          </button>
        </section>
      </div>

      <section className="customerDirectoryCard customerDirectoryListCard">
        <div className="customerDirectoryListHeading">
          <div>
            <h2>Saved customers</h2>
            <p>Search and manage your reusable customer list.</p>
          </div>
          <input className="customerDirectorySearch" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers..." aria-label="Search customers" />
        </div>
        {loading ? (
          <div className="customerDirectoryEmpty">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="customerDirectoryEmpty">No customers found.</div>
        ) : (
          <div className="customerDirectoryTableWrap">
            <table className="customerDirectoryTable">
              <thead><tr><th>Name</th><th>Phone</th><th>Notes</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td><strong>{customer.customer_name}</strong></td>
                    <td>{customer.phone || "—"}</td>
                    <td>{customer.notes || "—"}</td>
                    <td>{formatDate(customer.created_at)}</td>
                    <td className="customerDirectoryActions">
                      <button type="button" className="customerDirectorySmallButton" onClick={() => startEdit(customer)}>Edit</button>
                      <button type="button" className="customerDirectorySmallButton danger" onClick={() => handleDelete(customer)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
