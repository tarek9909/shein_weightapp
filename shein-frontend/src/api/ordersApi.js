import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/orders";

export const getOrders = (month_id) =>
  apiFetch(`${BASE_URL}/getOrders.php?month_id=${month_id}`);

export const addOrder = (month_id, order_name, order_details, amount_to_collect = 0, customer_ids = []) =>
  apiFetch(`${BASE_URL}/addOrder.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, order_name, order_details, amount_to_collect, customer_ids }),
  });

export const getOrderCustomers = (order_id) =>
  apiFetch(`${BASE_URL}/${order_id}/customers`);

export const getOrderCustomersDetail = (order_id) =>
  apiFetch(`${BASE_URL}/getOrderCustomers.php?order_id=${encodeURIComponent(order_id)}`);

export const collectCustomerPayment = (payload) =>
  apiFetch(`${BASE_URL}/collectCustomerPayment.php`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const putProfitAside = (payload) =>
  apiFetch(`${BASE_URL}/putProfitAside.php`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateOrder = (id, order_name, order_details, amount_to_collect = 0) =>
  apiFetch(`${BASE_URL}/updateOrder.php`, {
    method: "POST",
    body: JSON.stringify({ id, order_name, order_details, amount_to_collect }),
  });

export const deleteOrder = (id) =>
  apiFetch(`${BASE_URL}/deleteOrder.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
