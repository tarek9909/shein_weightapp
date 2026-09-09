import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

export const getReports = (monthId = "") =>
  apiFetch(`${API_ORIGIN}/reports/summary${monthId ? `?month_id=${encodeURIComponent(monthId)}` : ""}`);
