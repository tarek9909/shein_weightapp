import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

export const getDashboardSummary = (monthId) =>
  apiFetch(`${API_ORIGIN}/dashboard/getSummary.php?month_id=${encodeURIComponent(monthId)}`);
