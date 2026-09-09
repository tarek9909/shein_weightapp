<?php
require_once "_common.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];
$data = json_input();

$api_email = norm_email($data["email"] ?? "");
$shein_email = norm_email($data["shein_email"] ?? "");
$shein_password = (string)($data["shein_password"] ?? "");
$gmail_email = norm_email($data["gmail_email"] ?? "");
$gmail_app_password = str_replace(" ", "", (string)($data["gmail_app_password"] ?? ""));
$cookies_json = isset($data["cookies_json"]) ? (string)$data["cookies_json"] : null;
$profile_key = isset($data["profile_key"]) ? trim((string)$data["profile_key"]) : null;

if ($api_email === "" || $shein_email === "" || $shein_password === "" || $gmail_email === "" || $gmail_app_password === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Missing required fields"]);
  exit;
}

$id = isset($data["id"]) ? (int)$data["id"] : 0;

if ($id > 0) {
  $stmt = $conn->prepare("
    UPDATE shein_accounts
    SET api_email=?, shein_email=?, shein_password=?, gmail_email=?, gmail_app_password=?, cookies_json=?, profile_key=?
    WHERE id=? AND user_id=?
  ");
  $stmt->bind_param(
    "sssssssii",
    $api_email,
    $shein_email,
    $shein_password,
    $gmail_email,
    $gmail_app_password,
    $cookies_json,
    $profile_key,
    $id,
    $user_id
  );
  $ok = $stmt->execute();
  if (!$ok) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "Internal server error"]);
    exit;
  }
  echo json_encode(["ok" => true, "message" => "Updated"]);
  exit;
}

$stmt = $conn->prepare("
  INSERT INTO shein_accounts (user_id, api_email, shein_email, shein_password, gmail_email, gmail_app_password, cookies_json, profile_key)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    shein_email=VALUES(shein_email),
    shein_password=VALUES(shein_password),
    gmail_email=VALUES(gmail_email),
    gmail_app_password=VALUES(gmail_app_password),
    cookies_json=VALUES(cookies_json),
    profile_key=VALUES(profile_key)
");
$stmt->bind_param(
  "isssssss",
  $user_id,
  $api_email,
  $shein_email,
  $shein_password,
  $gmail_email,
  $gmail_app_password,
  $cookies_json,
  $profile_key
);

if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

echo json_encode(["ok" => true, "message" => "Saved"]);
