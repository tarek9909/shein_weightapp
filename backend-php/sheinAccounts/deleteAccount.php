<?php
require_once "_common.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$data = json_input();
$id = isset($data["id"]) ? (int)$data["id"] : 0;
$email = norm_email($data["email"] ?? "");

if ($id <= 0 && $email === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "id or email is required"]);
  exit;
}

if ($id > 0) {
  $stmt = $conn->prepare("DELETE FROM shein_accounts WHERE id=? AND user_id=?");
  $stmt->bind_param("ii", $id, $user_id);
} else {
  $stmt = $conn->prepare("DELETE FROM shein_accounts WHERE api_email=? AND user_id=?");
  $stmt->bind_param("si", $email, $user_id);
}

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode(["ok" => true, "deleted" => $stmt->affected_rows]);
