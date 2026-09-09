import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/ordersDetails";

const REDESIGN_BASE_URL = API_ORIGIN + "/delivery";

export const getDeliveryCustomers = (monthId, q = "", status = "all") =>
  apiFetch(
    `${REDESIGN_BASE_URL}/getCustomers?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`
  );

export const assignDeliveries = (monthId, assignments) =>
  apiFetch(`${REDESIGN_BASE_URL}/assign`, {
    method: "POST",
    body: JSON.stringify({ month_id: monthId, assignments }),
  });

export const collectDeliveries = (monthId, customerIds, note = "", selfCollect = false) =>
  apiFetch(`${REDESIGN_BASE_URL}/collect`, {
    method: "POST",
    body: JSON.stringify({ month_id: monthId, customer_ids: customerIds, note, self_collect: Boolean(selfCollect) }),
  });

export const revertDeliveries = (monthId, customerIds) =>
  apiFetch(`${REDESIGN_BASE_URL}/revertAssignment`, {
    method: "POST",
    body: JSON.stringify({ month_id: monthId, customer_ids: customerIds }),
  });

export const getDeliveryChargePresets = () =>
  apiFetch(`${API_ORIGIN}/settings/getDeliveryChargePresets`);

export const addDeliveryChargePreset = (payload) =>
  apiFetch(`${API_ORIGIN}/settings/addDeliveryChargePreset`, { method: "POST", body: JSON.stringify(payload) });

export const updateDeliveryChargePreset = (payload) =>
  apiFetch(`${API_ORIGIN}/settings/updateDeliveryChargePreset`, { method: "POST", body: JSON.stringify(payload) });

export const deleteDeliveryChargePreset = (id) =>
  apiFetch(`${API_ORIGIN}/settings/deleteDeliveryChargePreset`, { method: "POST", body: JSON.stringify({ id }) });

export const getCustomerDebts = (month_id, status = "") =>
  apiFetch(
    `${BASE_URL}/getCustomerDebts?month_id=${month_id}${
      status ? `&status=${encodeURIComponent(status)}` : ""
    }`
  );

export const addCustomerDebt = (payload) =>
  apiFetch(`${BASE_URL}/addCustomerDebt`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateCustomerDebt = (id, payload) =>
  apiFetch(`${BASE_URL}/updateCustomerDebt`, {
    method: "POST",
    body: JSON.stringify({ id, ...payload }),
  });

export const closeCustomerDebt = (id, paid_amount, note = "") =>
  apiFetch(`${BASE_URL}/closeCustomerDebt`, {
    method: "POST",
    body: JSON.stringify({ id, paid_amount, note }),
  });

export const getCustomersForDeliveryByMonth = (monthId) =>
  apiFetch(`${BASE_URL}/getCustomersForDeliveryByMonth?month_id=${encodeURIComponent(monthId)}`);

export const updateCustomerDelivery = (id, delivery_number, status) =>
  apiFetch(`${BASE_URL}/updateCustomerDelivery`, { method: "POST", body: JSON.stringify({ id, delivery_number, status }) });

export const checkDeliveryNumberByMonth = (monthId, deliveryNumber) =>
  apiFetch(`${BASE_URL}/checkDeliveryNumberByMonth?month_id=${encodeURIComponent(monthId)}&delivery_number=${encodeURIComponent(deliveryNumber)}`);

export const updateCustomerUsdToCollect = (id, usd_to_collect) =>
  apiFetch(`${BASE_URL}/updateCustomerUsdToCollect`, { method: "POST", body: JSON.stringify({ id, usd_to_collect }) });

export const previewDeliveryExcelImport = (monthId, file) => {
  const data = new FormData();
  data.append("month_id", monthId);
  data.append("file", file);
  return apiFetch(`${BASE_URL}/previewDeliveryExcelImport`, { method: "POST", body: data });
};

export const applyDeliveryExcelImport = (monthId, rows) =>
  apiFetch(`${BASE_URL}/applyDeliveryExcelImport`, { method: "POST", body: JSON.stringify({ month_id: monthId, rows }) });

export const getDeliveryLosses = (monthId, status = "pending") =>
  apiFetch(`${BASE_URL}/getDeliveryLosses?month_id=${encodeURIComponent(monthId)}&status=${encodeURIComponent(status)}`);

export const addDeliveryLosses = (monthId, rows) =>
  apiFetch(`${BASE_URL}/addDeliveryLosses`, { method: "POST", body: JSON.stringify({ month_id: monthId, rows }) });

export const updateDeliveryLoss = (id, payload) =>
  apiFetch(`${BASE_URL}/updateDeliveryLoss`, { method: "POST", body: JSON.stringify({ id, ...payload }) });

export const deleteDeliveryLoss = (id) =>
  apiFetch(`${BASE_URL}/deleteDeliveryLoss`, { method: "POST", body: JSON.stringify({ id }) });

export const confirmDeliveryLosses = (monthId, ids) =>
  apiFetch(`${BASE_URL}/confirmDeliveryLosses`, { method: "POST", body: JSON.stringify({ month_id: monthId, ids }) });
