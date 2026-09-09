import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/customs";

export const getCustoms = (month_id) =>
  apiFetch(`${BASE_URL}/getCustoms?month_id=${month_id}`);

export const addCustom = (month_id, customs_fee, extra = {}) =>
  apiFetch(`${BASE_URL}/addCustom`, {
    method: "POST",
    body: JSON.stringify({ month_id, customs_fee, ...extra }),
  });

export const updateCustom = (id, customs_fee, note = null, tracking_no = undefined, weight_kg = undefined) => {
  const body = { id, customs_fee, note };
  if (tracking_no !== undefined) body.tracking_no = tracking_no;
  if (weight_kg !== undefined) body.weight_kg = weight_kg;
  return apiFetch(`${BASE_URL}/updateCustom`, {
    method: "POST",
    body: JSON.stringify(body),
  });
};

export const deleteCustom = (id) =>
  apiFetch(`${BASE_URL}/deleteCustom`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });

export const getDeliveredNotInCustoms = (monthId) =>
  apiFetch(`${BASE_URL}/getDeliveredNotInCustoms?month_id=${encodeURIComponent(monthId)}`);

export const getCargoPackages = (monthId) =>
  apiFetch(`${BASE_URL}/getCargoPackages?month_id=${encodeURIComponent(monthId)}`);

export const setCargoPackageStatus = (payload) =>
  apiFetch(`${BASE_URL}/setCargoPackageStatus`, { method: "POST", body: JSON.stringify(payload) });

export const getCargoPayrollPreview = (payload) =>
  apiFetch(`${BASE_URL}/getCargoPayrollPreview`, { method: "POST", body: JSON.stringify(payload) });

export const confirmCargoPayroll = (payload) =>
  apiFetch(`${BASE_URL}/confirmCargoPayroll`, { method: "POST", body: JSON.stringify(payload) });

export const getPendingCargoPayrolls = (monthId) =>
  apiFetch(`${BASE_URL}/getPendingCargoPayrolls?month_id=${encodeURIComponent(monthId)}`);

export const acceptPendingCargoPayroll = (payload) =>
  apiFetch(`${BASE_URL}/acceptPendingCargoPayroll`, { method: "POST", body: JSON.stringify(payload) });

export const getWeightTrackings = (monthId) =>
  apiFetch(`${BASE_URL}/getWeightTrackings?month_id=${encodeURIComponent(monthId)}`);

