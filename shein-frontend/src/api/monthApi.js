import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/month";

export const getMonths = () => apiFetch(`${BASE_URL}/getMonths.php`);

export const addMonth = (name) =>
  apiFetch(`${BASE_URL}/addMonth.php`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateMonth = (id, name) =>
  apiFetch(`${BASE_URL}/updateMonth.php`, {
    method: "POST",
    body: JSON.stringify({ id, name }),
  });

export const deleteMonth = (id) =>
  apiFetch(`${BASE_URL}/deleteMonth.php`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
