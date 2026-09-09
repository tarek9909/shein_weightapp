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