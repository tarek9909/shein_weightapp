import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = `${API_ORIGIN}/cargo`;

export const getReceivableCarts = (monthId, q = "") =>
  apiFetch(`${BASE_URL}/getReceivableCarts.php?month_id=${encodeURIComponent(monthId)}&q=${encodeURIComponent(q)}`);

export const getShipmentDetail = (cartId) =>
  apiFetch(`${BASE_URL}/getShipmentDetail.php?cart_id=${encodeURIComponent(cartId)}`);

export const receiveShipment = ({ cart_id, tracking_no, source = "manual" }) =>
  apiFetch(`${BASE_URL}/receiveShipment.php`, {
    method: "POST",
    body: JSON.stringify({ cart_id, tracking_no, source }),
  });

export const getReceiptStatus = (orderId) =>
  apiFetch(`${BASE_URL}/getReceiptStatus.php?order_id=${encodeURIComponent(orderId)}`);
