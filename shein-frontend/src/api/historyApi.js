import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/history";

export const getHistory = (month_id) =>
  apiFetch(`${BASE_URL}/getHistory.php?month_id=${month_id}`);
