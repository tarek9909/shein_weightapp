<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require "../db.php";
require "../auth/auth.php";
require_once "./_shipmentNotes.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_decode(file_get_contents("php://input"), true);
$id = (int)($data["id"] ?? 0);

if ($id <= 0) {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "id is required"]);
  exit;
}

$get = $conn->prepare("SELECT month_id, tracking_no FROM customs WHERE id=? AND user_id=? LIMIT 1");
$get->bind_param("ii", $id, $user_id);
$get->execute();
$row = $get->get_result()->fetch_assoc();
if (!$row) {
  http_response_code(404);
  echo json_encode(["success" => false, "error" => "Custom entry not found"]);
  exit;
}
$month_id = (int)($row["month_id"] ?? 0);
$tracking_no = trim((string)($row["tracking_no"] ?? ""));

$stmt = $conn->prepare("DELETE FROM customs WHERE id=? AND user_id=?");
$stmt->bind_param("ii", $id, $user_id);

if ($stmt->execute()) {
  if ($month_id > 0 && $tracking_no !== "") {
    refresh_split_notes_for_tracking($conn, $user_id, $month_id, $tracking_no);
  }
  echo json_encode(["success" => true, "affected" => $stmt->affected_rows]);
} else {
  http_response_code(500);
  echo json_encode(["success" => false, "error" => "Internal server error"]);
}
?>
