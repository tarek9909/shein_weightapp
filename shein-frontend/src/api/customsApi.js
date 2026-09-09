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

export const getDeliveredNotInCustoms = (monthId) =>
  apiFetch(`${BASE_URL}/getDeliveredNotInCustoms.php?month_id=${encodeURIComponent(monthId)}`);

export const getCargoPackages = (monthId) =>
  apiFetch(`${BASE_URL}/getCargoPackages.php?month_id=${encodeURIComponent(monthId)}`);

export const setCargoPackageStatus = (payload) =>
  apiFetch(`${BASE_URL}/setCargoPackageStatus.php`, { method: "POST", body: JSON.stringify(payload) });

export const getCargoPayrollPreview = (payload) =>
  apiFetch(`${BASE_URL}/getCargoPayrollPreview.php`, { method: "POST", body: JSON.stringify(payload) });

export const confirmCargoPayroll = (payload) =>
  apiFetch(`${BASE_URL}/confirmCargoPayroll.php`, { method: "POST", body: JSON.stringify(payload) });

export const getPendingCargoPayrolls = (monthId) =>
  apiFetch(`${BASE_URL}/getPendingCargoPayrolls.php?month_id=${encodeURIComponent(monthId)}`);

export const acceptPendingCargoPayroll = (payload) =>
  apiFetch(`${BASE_URL}/acceptPendingCargoPayroll.php`, { method: "POST", body: JSON.stringify(payload) });
