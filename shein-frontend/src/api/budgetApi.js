import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/budget";
export const getBudgets = (month_id) =>
  apiFetch(`${BASE_URL}/getBudget?month_id=${month_id}`);

export const addBudget = (month_id, value, description) =>
  apiFetch(`${BASE_URL}/addBudget`, {
    method: "POST",
    body: JSON.stringify({ month_id, value, description }),
  });

export const updateBudget = (id, value, description) =>
  apiFetch(`${BASE_URL}/updateBudget`, {
    method: "POST",
    body: JSON.stringify({ id, value, description }),
  });

export const deleteBudget = (id) =>
  apiFetch(`${BASE_URL}/deleteBudget`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
