import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/ordersDetails";

export const getCustomers = (cart_id) =>
  apiFetch(`${BASE_URL}/getCustomers.php?cart_id=${cart_id}`);

export const addCustomer = (cart_id, customer_name, usd_to_collect) =>
  apiFetch(`${BASE_URL}/addCustomer.php`, {
    method: "POST",
    body: JSON.stringify({ cart_id, customer_name, usd_to_collect }),
  });

export const updateCustomer = (id, customer_name, usd_to_collect) =>
  apiFetch(`${BASE_URL}/updateCustomer.php`, {
    method: "POST",
    body: JSON.stringify({ id, customer_name, usd_to_collect }),
  });

export const deleteCustomer = (id) =>
  apiFetch(`${BASE_URL}/deleteCustomer.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
