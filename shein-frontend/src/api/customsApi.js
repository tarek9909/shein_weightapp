import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/customs";

export const getCustoms = (month_id) =>
  apiFetch(`${BASE_URL}/getCustoms.php?month_id=${month_id}`);

export const addCustom = (month_id, customs_fee, extra = {}) =>
  apiFetch(`${BASE_URL}/addCustom.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, customs_fee, ...extra }),
  });

export const updateCustom = (id, customs_fee, note = null) =>
  apiFetch(`${BASE_URL}/updateCustom.php`, {
    method: "POST",
    body: JSON.stringify({ id, customs_fee, note }),
  });

export const deleteCustom = (id) =>
  apiFetch(`${BASE_URL}/deleteCustom.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
