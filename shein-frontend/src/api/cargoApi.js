import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = `${API_ORIGIN}/cargo`;

export const getReceivableCarts = (monthId, q = "") =>
  apiFetch(`${BASE_URL}/getReceivableCarts?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}`);

export const getShipmentDetail = (cartId) =>
  apiFetch(`${BASE_URL}/getShipmentDetail?cart_id=${encodeURIComponent(cartId)}`);

export const receiveShipment = ({ cart_id, tracking_no, source = "manual", add_customs = false, customs_fee = null, weight_kg = null, description = "freight" }) =>
  apiFetch(`${BASE_URL}/receiveShipment`, {
    method: "POST",
    body: JSON.stringify({ cart_id, tracking_no, source, add_customs, customs_fee, weight_kg, description }),
  });

export const getReceiptStatus = (orderId) =>
  apiFetch(`${BASE_URL}/getReceiptStatus?order_id=${encodeURIComponent(orderId)}`);
