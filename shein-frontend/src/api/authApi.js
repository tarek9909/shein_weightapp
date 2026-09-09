import { API_ORIGIN } from "./baseUrl";
import { apiFetch } from "./http";

 const BASE_URL = API_ORIGIN + "/auth";
export const login = async (username, password) => {
  const res = await fetch(`${BASE_URL}/login.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return await res.json();
};

export const resetPassword = (old_password, new_password, confirm_password) =>
  apiFetch(`${BASE_URL}/resetPassword.php`, {
    method: "POST",
    body: JSON.stringify({ old_password, new_password, confirm_password }),
  });

export const getManagedUsers = () => apiFetch(`${BASE_URL}/users.php`);

export const createManagedUser = ({ username, password, role }) =>
  apiFetch(`${BASE_URL}/users.php`, {
    method: "POST",
    body: JSON.stringify({ username, password, role }),
  });

export const updateManagedUser = (id, role) =>
  apiFetch(`${BASE_URL}/updateUser.php`, { method: "POST", body: JSON.stringify({ id, role }) });

export const setManagedUserActive = (id, is_active) =>
  apiFetch(`${BASE_URL}/disableUser.php`, { method: "POST", body: JSON.stringify({ id, is_active }) });

export const deleteManagedUser = (id) =>
  apiFetch(`${BASE_URL}/users/${id}.php`, { method: "DELETE" });

export const resetManagedUserPassword = (id, password) =>
  apiFetch(`${BASE_URL}/resetUserPassword.php`, { method: "POST", body: JSON.stringify({ id, password }) });
