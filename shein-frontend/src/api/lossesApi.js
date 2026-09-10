import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = `${API_ORIGIN}/losses`;

export const searchLossOrders = (monthId, q = "") =>
  apiFetch(`${BASE_URL}/searchOrders?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}`);

export const getLossOrderCustomers = (orderId) =>
  apiFetch(`${BASE_URL}/getOrderCustomers?order_id=${encodeURIComponent(orderId)}`);

export const addLoss = (payload) => apiFetch(`${BASE_URL}/add`, { method: "POST", body: JSON.stringify(payload) });
export const addLosses = (rows) => apiFetch(`${BASE_URL}/addBulk`, { method: "POST", body: JSON.stringify({ rows }) });
export const listLosses = (monthId, q = "", status = "active") =>
  apiFetch(`${BASE_URL}/list?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
export const updateLoss = (payload) => apiFetch(`${BASE_URL}/update`, { method: "POST", body: JSON.stringify(payload) });
export const reverseLoss = (payload) => apiFetch(`${BASE_URL}/reverse`, { method: "POST", body: JSON.stringify(payload) });
