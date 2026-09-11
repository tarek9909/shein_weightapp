const { round2 } = require("./helpers");

function finiteAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function customerBaseAmount(customer) {
  return finiteAmount(customer?.base_amount_to_collect) ?? finiteAmount(customer?.usd_to_collect) ?? 0;
}

function customerFinalAmount(customer) {
  const storedFinal = finiteAmount(customer?.final_amount_to_collect);
  if (storedFinal !== null) return round2(storedFinal);
  const adjustment = finiteAmount(customer?.delivery_adjustment);
  return round2(customerBaseAmount(customer) + (adjustment ?? 0));
}

function customerIsCollected(customer) {
  return customer?.collection_status === "collected"
    || customer?.payment_status === "paid"
    || customer?.status === "paid"
    || customer?.delivery_status === "paid"
    || customer?.legacy_status === "paid"
    || customer?.legacy_delivery_status === "paid";
}

module.exports = { finiteAmount, customerBaseAmount, customerFinalAmount, customerIsCollected };
