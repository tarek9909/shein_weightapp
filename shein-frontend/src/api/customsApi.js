import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/customs";

export const getCustoms = (month_id) =>
  apiFetch(`${BASE_URL}/getCustoms.php?month_id=${month_id}`);

export const addCustom = (month_id, customs_fee) =>
  apiFetch(`${BASE_URL}/addCustom.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, customs_fee }),
  });

export const updateCustom = (id, customs_fee) =>
  apiFetch(`${BASE_URL}/updateCustom.php`, {
    method: "POST",
    body: JSON.stringify({ id, customs_fee }),
  });

export const deleteCustom = (id) =>
  apiFetch(`${BASE_URL}/deleteCustom.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
