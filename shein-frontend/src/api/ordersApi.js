import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/orders";

export const getOrders = (month_id) =>
  apiFetch(`${BASE_URL}/getOrders.php?month_id=${month_id}`);

export const addOrder = (month_id, order_name, order_details) =>
  apiFetch(`${BASE_URL}/addOrder.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, order_name, order_details }),
  });

export const updateOrder = (id, order_name, order_details) =>
  apiFetch(`${BASE_URL}/updateOrder.php`, {
    method: "POST",
    body: JSON.stringify({ id, order_name, order_details }),
  });

export const deleteOrder = (id) =>
  apiFetch(`${BASE_URL}/deleteOrder.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
