import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/settings";

export const getKgPrice = () => apiFetch(`${BASE_URL}/getKgPrice`);

export const saveKgPrice = (kg_price) =>
  apiFetch(`${BASE_URL}/saveKgPrice`, {
    method: "POST",
    body: JSON.stringify({ kg_price }),
  });
