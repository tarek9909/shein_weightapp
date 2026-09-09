import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/month";

export const getMonths = () => apiFetch(`${BASE_URL}/getMonths`);

export const addMonth = (name) =>
  apiFetch(`${BASE_URL}/addMonth`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateMonth = (id, name) =>
  apiFetch(`${BASE_URL}/updateMonth`, {
    method: "POST",
    body: JSON.stringify({ id, name }),
  });

export const deleteMonth = (id) =>
  apiFetch(`${BASE_URL}/deleteMonth`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
