import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/payments";

export const getPayments = (month_id) =>
  apiFetch(`${BASE_URL}/getPayments.php?month_id=${month_id}`);

export const addPayment = (month_id, payment_amount) =>
  apiFetch(`${BASE_URL}/addPayment.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, payment_amount }),
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
