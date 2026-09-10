function isFiniteNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validateReceiveShipment(req, res, next) {
  if (req.method !== "POST" || req.path !== "/receiveShipment") return next();

  if (req.body?.weight_kg != null && req.body.weight_kg !== "" && !isFiniteNonNegative(req.body.weight_kg)) {
    return res.status(400).json({ ok: false, error: "weight_kg must be a finite non-negative number" });
  }
  if (req.body?.add_customs && req.body.customs_fee != null && req.body.customs_fee !== "" && !isFiniteNonNegative(req.body.customs_fee)) {
    return res.status(400).json({ ok: false, error: "customs_fee must be a finite non-negative number" });
  }
  return next();
}

module.exports = { validateReceiveShipment };
