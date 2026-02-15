import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/budget";
export const getBudgets = (month_id) =>
  apiFetch(`${BASE_URL}/getBudget.php?month_id=${month_id}`);

export const addBudget = (month_id, value, description) =>
  apiFetch(`${BASE_URL}/addBudget.php`, {
    method: "POST",
    body: JSON.stringify({ month_id, value, description }),
  });

export const updateBudget = (id, value, description) =>
  apiFetch(`${BASE_URL}/updateBudget.php`, {
    method: "POST",
    body: JSON.stringify({ id, value, description }),
  });

export const deleteBudget = (id) =>
  apiFetch(`${BASE_URL}/deleteBudget.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
