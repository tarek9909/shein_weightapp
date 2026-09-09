import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = `${API_ORIGIN}/losses`;

export const searchLossOrders = (monthId, q = "") =>
  apiFetch(`${BASE_URL}/searchOrders.php?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}`);

export const getLossOrderCustomers = (orderId) =>
  apiFetch(`${BASE_URL}/getOrderCustomers.php?order_id=${encodeURIComponent(orderId)}`);

export const addLoss = (payload) => apiFetch(`${BASE_URL}/add.php`, { method: "POST", body: JSON.stringify(payload) });
export const listLosses = (monthId, q = "", status = "active") =>
  apiFetch(`${BASE_URL}/list.php?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
export const updateLoss = (payload) => apiFetch(`${BASE_URL}/update.php`, { method: "POST", body: JSON.stringify(payload) });
export const reverseLoss = (payload) => apiFetch(`${BASE_URL}/reverse.php`, { method: "POST", body: JSON.stringify(payload) });
