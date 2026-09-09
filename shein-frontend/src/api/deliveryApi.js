import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/ordersDetails";

const REDESIGN_BASE_URL = API_ORIGIN + "/delivery";

export const getDeliveryCustomers = (monthId, q = "", status = "all") =>
  apiFetch(
    `${REDESIGN_BASE_URL}/getCustomers.php?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`
  );

export const assignDeliveries = (monthId, assignments) =>
  apiFetch(`${REDESIGN_BASE_URL}/assign.php`, {
    method: "POST",
    body: JSON.stringify({ month_id: monthId, assignments }),
  });

export const collectDeliveries = (monthId, customerIds, note = "") =>
  apiFetch(`${REDESIGN_BASE_URL}/collect.php`, {
    method: "POST",
    body: JSON.stringify({ month_id: monthId, customer_ids: customerIds, note }),
  });

export const revertDeliveries = (monthId, customerIds) =>
  apiFetch(`${REDESIGN_BASE_URL}/revertAssignment.php`, {
    method: "POST",
    body: JSON.stringify({ month_id: monthId, customer_ids: customerIds }),
  });

export const getDeliveryChargePresets = () =>
  apiFetch(`${API_ORIGIN}/settings/getDeliveryChargePresets.php`);

export const addDeliveryChargePreset = (payload) =>
  apiFetch(`${API_ORIGIN}/settings/addDeliveryChargePreset.php`, { method: "POST", body: JSON.stringify(payload) });

export const updateDeliveryChargePreset = (payload) =>
  apiFetch(`${API_ORIGIN}/settings/updateDeliveryChargePreset.php`, { method: "POST", body: JSON.stringify(payload) });

export const deleteDeliveryChargePreset = (id) =>
  apiFetch(`${API_ORIGIN}/settings/deleteDeliveryChargePreset.php`, { method: "POST", body: JSON.stringify({ id }) });

export const getCustomerDebts = (month_id, status = "") =>
  apiFetch(
    `${BASE_URL}/getCustomerDebts.php?month_id=${month_id}${
      status ? `&status=${encodeURIComponent(status)}` : ""
    }`
  );

export const addCustomerDebt = (payload) =>
  apiFetch(`${BASE_URL}/addCustomerDebt.php`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateCustomerDebt = (id, payload) =>
  apiFetch(`${BASE_URL}/updateCustomerDebt.php`, {
    method: "POST",
    body: JSON.stringify({ id, ...payload }),
  });

export const closeCustomerDebt = (id, paid_amount, note = "") =>
  apiFetch(`${BASE_URL}/closeCustomerDebt.php`, {
    method: "POST",
    body: JSON.stringify({ id, paid_amount, note }),
  });
