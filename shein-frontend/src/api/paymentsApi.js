import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/payments";

export const getPayments = (month_id) =>
  apiFetch(`${BASE_URL}/getPayments.php?month_id=${month_id}`);

export const addPayment = (month_id, payment_amount) =>
  apiFetch(`${BASE_URL}/addPayment.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, payment_amount }),
  });

export const addCustomerPayment = ({
  month_id,
  customer_items,
  note = "",
}) =>
  apiFetch(`${BASE_URL}/addPayment.php`, {
    method: "POST",
    body: JSON.stringify({
      month_id,
      payment_type: "customers",
      customer_items,
      note,
    }),
  });

export const updatePayment = (id, payment_amount) =>
  apiFetch(`${BASE_URL}/updatePayment.php`, {
    method: "POST",
    body: JSON.stringify({ id, payment_amount }),
  });

export const deletePayment = (id) =>
  apiFetch(`${BASE_URL}/deletePayment.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });

export const getPaymentCustomers = (month_id, q = "") =>
  apiFetch(
    `${BASE_URL}/getPaymentCustomers.php?month_id=${encodeURIComponent(month_id)}&q=${encodeURIComponent(q)}`
  );

export const getPaymentItems = (payment_id) =>
  apiFetch(`${BASE_URL}/getPaymentItems.php?payment_id=${encodeURIComponent(payment_id)}`);
