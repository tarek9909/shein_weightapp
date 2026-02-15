import { apiFetch } from "./http";

const BASE_URL = process.env.REACT_APP_BASE_URL + "/ordersDetails";

// ✅ Month-only: load customers by month
export const getCustomersForDeliveryByMonth = (monthId) =>
  apiFetch(`${BASE_URL}/getCustomersForDeliveryByMonth.php?month_id=${monthId}`);

// ✅ Month-only: check delivery number uniqueness (month scoped)
// If you prefer GLOBAL uniqueness, you can make backend global and keep same function name.
export const checkDeliveryNumberByMonth = (monthId, deliveryNumber) =>
  apiFetch(
    `${BASE_URL}/checkDeliveryNumberByMonth.php?month_id=${monthId}&delivery_number=${encodeURIComponent(
      deliveryNumber
    )}`
  );

// ✅ Keep update as-is
export const updateCustomerDelivery = async (id, delivery_number, status) => {
  const res = await fetch(`${BASE_URL}/updateCustomerDelivery.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify({ id, delivery_number, status }),
  });

  // keep same return shape you already use
  return res.json();
};
 // ✅ ADD this in your deliveryApi:
export const updateCustomerUsdToCollect = (id, usd_to_collect) =>
  apiFetch(`${BASE_URL}/updateCustomerUsdToCollect.php`, {
    method: "POST",
    body: JSON.stringify({ id, usd_to_collect }),
  });