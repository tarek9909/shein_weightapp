import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

const BASE_URL = API_ORIGIN;

export const listSheinUsers = () =>
  apiFetch(`${BASE_URL}/sheinAccounts/getAccounts`);

export const listChromeProfiles = () =>
  apiFetch(`${BASE_URL}/sheinAccounts/getAccounts`);

export const registerSheinAccount = (payload) =>
  apiFetch(`${BASE_URL}/sheinAccounts/saveAccount`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getSheinUserDetail = (email) =>
  apiFetch(`${BASE_URL}/sheinAccounts/getAccountDetail?email=${encodeURIComponent(email)}`);

export const deleteSheinUserByOwner = (email) =>
  apiFetch(`${BASE_URL}/sheinAccounts/deleteAccount`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const startSheinProfileLogin = (profileKey) =>
  apiFetch(`${BASE_URL}/sheinAccounts/profileLoginStart`, {
    method: "POST",
    body: JSON.stringify({ profile_key: profileKey }),
  });

export const getSheinProfileLoginStatus = (profileKey, sessionId) =>
  apiFetch(
    `${BASE_URL}/sheinAccounts/profileLoginStatus?profile_key=${encodeURIComponent(profileKey)}&session_id=${encodeURIComponent(sessionId)}`,
  );

export const finishSheinProfileLogin = (profileKey, sessionId) =>
  apiFetch(`${BASE_URL}/sheinAccounts/profileLoginFinish`, {
    method: "POST",
    body: JSON.stringify({ profile_key: profileKey, session_id: sessionId }),
  });

export const cancelSheinProfileLogin = (profileKey, sessionId) =>
  apiFetch(`${BASE_URL}/sheinAccounts/profileLoginCancel`, {
    method: "DELETE",
    body: JSON.stringify({ profile_key: profileKey, session_id: sessionId }),
  });

// Legacy exports kept for compatibility
export const deleteSheinUser = deleteSheinUserByOwner;

// Refresh calls go through the Node backend, which securely bridges to Python.
export const refreshCartShein = (cartId, profileKey = "") =>
  apiFetch(`${BASE_URL}/ordersDetails/refreshCartShein`, {
    method: "POST",
    body: JSON.stringify({
      id: cartId,
      ...(profileKey ? { profile_key: profileKey } : {}),
    }),
  });

export const refreshOrderSheinTrack = (orderId, profileKey = "") =>
  apiFetch(`${BASE_URL}/ordersDetails/refreshOrderSheinTrack`, {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, ...(profileKey ? { profile_key: profileKey } : {}) }),
  });

export const refreshOrderSheinWeight = (orderId, profileKey = "") =>
  apiFetch(`${BASE_URL}/ordersDetails/refreshOrderSheinWeight`, {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, ...(profileKey ? { profile_key: profileKey } : {}) }),
  });

// Unused in current UI, kept as no-op compatibility helpers.
export const addSheinOrder = async () => ({ ok: true });
export const listSheinOrders = async () => ({ ok: true, orders: [] });
export const refreshSheinOrders = async () => ({ ok: true, updated: [] });
export const fetchSheinTrackOne = async () => ({ ok: false });
export const fetchSheinWeightOne = async () => ({ ok: false });
