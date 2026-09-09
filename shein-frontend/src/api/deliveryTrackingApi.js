import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN + "/ordersDetails/";
export const getCustomersWithDelivery = (search = "", cartId = "") => {
  const url = new URL(`${BASE_URL}/getCustomersWithDeliverytrack`);
  if (search) url.searchParams.append("search", search);
  if (cartId) url.searchParams.append("cart_id", cartId);
  return apiFetch(url.toString());
};

export const markCustomerCollected = (idOrPayload, extra = {}) => {
  const body =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? idOrPayload
      : { id: idOrPayload, ...extra };
  return apiFetch(`${BASE_URL}/markCollected`, {
    method: "POST",
    body: JSON.stringify(body),
  });
};

export const getCustomersWithAddedDelivery = (search = "") => {
  const url = new URL(`${BASE_URL}/getCustomersWithAddedDelivery`);
  if (search) url.searchParams.append("search", search);
  return apiFetch(url.toString());
};

export const revertCustomerDelivery = (id) =>
  apiFetch(`${BASE_URL}/revertCustomerDelivery`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });

export const confirmCustomerDelivery = (idOrPayload, extra = {}) => {
  const body =
    typeof idOrPayload === "object" && idOrPayload !== null
      ? idOrPayload
      : { id: idOrPayload, ...extra };
  return apiFetch(`${BASE_URL}/confirmCustomerDelivery`, {
    method: "POST",
    body: JSON.stringify(body),
  });
};

export const markCustomerPaid = (ids) =>
  apiFetch(`${BASE_URL}/markCustomerPaid`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });

export const revertCustomerToPending = (id) =>
  apiFetch(`${BASE_URL}/revertToPending`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
