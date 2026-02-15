import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/ordersDetails";

export const getCarts = (order_id) =>
  apiFetch(`${BASE_URL}/getCarts.php?order_id=${order_id}`);

export const addCart = (order_id, cart_order_number, cart_price) =>
  apiFetch(`${BASE_URL}/addCart.php`, {
    method: "POST",
    body: JSON.stringify({ order_id, cart_order_number, cart_price }),
  });

export const updateCart = (id, cart_order_number, cart_price) =>
  apiFetch(`${BASE_URL}/updateCart.php`, {
    method: "POST",
    body: JSON.stringify({ id, cart_order_number, cart_price }),
  });

export const deleteCart = (id) =>
  apiFetch(`${BASE_URL}/deleteCart.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
