import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

export const getReports = (monthId = "") =>
  apiFetch(`${API_ORIGIN}/reports/summary.php${monthId ? `?month_id=${encodeURIComponent(monthId)}` : ""}`);
