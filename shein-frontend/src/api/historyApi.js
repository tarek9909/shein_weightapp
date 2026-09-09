import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/history";

export const getHistory = (month_id) =>
  apiFetch(`${BASE_URL}/getHistory?month_id=${month_id}`);

export const getActivity = (monthId, filters = {}) => {
  const params = new URLSearchParams({ month_id: String(monthId) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") params.set(key, String(value));
  });
  return apiFetch(`${BASE_URL}/getActivity?${params.toString()}`);
};
