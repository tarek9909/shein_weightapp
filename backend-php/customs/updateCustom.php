<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require "../db.php";
require "../auth/auth.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);

$id = (int)($data["id"] ?? 0);
$customs_fee = (float)($data["customs_fee"] ?? 0);
$note = isset($data["note"]) ? trim((string)$data["note"]) : null;
$tracking_no = array_key_exists("tracking_no", (array)$data)
  ? trim((string)($data["tracking_no"] ?? ""))
  : null;

if ($id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "id is required"]);
  exit;
}

if ($tracking_no !== null && $tracking_no !== "") {
  $dup = $conn->prepare("
    SELECT id, month_id, tracking_no
    FROM customs
    WHERE user_id=?
      AND id<>?
      AND tracking_no IS NOT NULL
      AND UPPER(TRIM(tracking_no)) = UPPER(TRIM(?))
    ORDER BY id DESC
    LIMIT 1
  ");
  if (!$dup) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Internal server error"]);
    exit;
  }
  $dup->bind_param("iis", $user_id, $id, $tracking_no);
  if (!$dup->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Internal server error"]);
    exit;
  }
  $dupRow = $dup->get_result()->fetch_assoc();
  if ($dupRow) {
    http_response_code(409);
    echo json_encode([
      "success" => false,
      "error" => "Tracking number already exists in customs",
      "duplicate" => [
        "id" => (int)($dupRow["id"] ?? 0),
        "month_id" => (int)($dupRow["month_id"] ?? 0),
        "tracking_no" => (string)($dupRow["tracking_no"] ?? ""),
      ],
    ]);
    exit;
  }
}

if ($tracking_no !== null) {
  if ($tracking_no === "") $tracking_no = null;
  $stmt = $conn->prepare("UPDATE customs SET customs_fee=?, note=?, tracking_no=? WHERE id=? AND user_id=?");
  $stmt->bind_param("dssii", $customs_fee, $note, $tracking_no, $id, $user_id);
} else {
  $stmt = $conn->prepare("UPDATE customs SET customs_fee=?, note=? WHERE id=? AND user_id=?");
  $stmt->bind_param("dsii", $customs_fee, $note, $id, $user_id);
}

if ($stmt->execute()) {
  echo json_encode(["success" => true, "affected" => $stmt->affected_rows]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
