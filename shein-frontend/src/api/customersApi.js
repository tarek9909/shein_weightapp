import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/ordersDetails";

export const getCustomers = (cart_id) =>
  apiFetch(`${BASE_URL}/getCustomers.php?cart_id=${cart_id}`);

export const addCustomer = (cart_id, customer_name, usd_to_collect, delivery_charge_usd = 0) =>
  apiFetch(`${BASE_URL}/addCustomer.php`, {
    method: "POST",
    body: JSON.stringify({ cart_id, customer_name, usd_to_collect, delivery_charge_usd }),
  });

export const updateCustomer = (id, customer_name, usd_to_collect, delivery_charge_usd = null) =>
  apiFetch(`${BASE_URL}/updateCustomer.php`, {
    method: "POST",
    body: JSON.stringify({ id, customer_name, usd_to_collect, delivery_charge_usd }),
  });

export const deleteCustomer = (id) =>
  apiFetch(`${BASE_URL}/deleteCustomer.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
