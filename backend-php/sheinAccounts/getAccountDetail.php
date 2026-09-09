<?php
require_once "_common.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$email = isset($_GET["email"]) ? norm_email($_GET["email"]) : "";
$id = isset($_GET["id"]) ? (int)$_GET["id"] : 0;

if ($id <= 0 && $email === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "id or email is required"]);
  exit;
}

if ($id > 0) {
  $stmt = $conn->prepare("
    SELECT id, api_email AS email, shein_email, shein_password, gmail_email, gmail_app_password, cookies_json, profile_key
    FROM shein_accounts
    WHERE id=? AND user_id=?
    LIMIT 1
  ");
  $stmt->bind_param("ii", $id, $user_id);
} else {
  $stmt = $conn->prepare("
    SELECT id, api_email AS email, shein_email, shein_password, gmail_email, gmail_app_password, cookies_json, profile_key
    FROM shein_accounts
    WHERE api_email=? AND user_id=?
    LIMIT 1
  ");
  $stmt->bind_param("si", $email, $user_id);
}

$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
if (!$row) {
  http_response_code(404);
  echo json_encode(["ok" => false, "error" => "Account not found"]);
  exit;
}

echo json_encode(["ok" => true, "user" => $row]);
