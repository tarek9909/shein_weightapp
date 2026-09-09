<?php
require_once "_common.php";

$payload = require_auth();
$user_id = (int)$payload["user_id"];

$sql = "
  SELECT id, api_email AS email, shein_email, gmail_email, profile_key, created_at, updated_at
  FROM shein_accounts
  WHERE user_id=?
  ORDER BY id DESC
";

$stmt = $conn->prepare($sql);
if (!$stmt) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

$stmt->bind_param("i", $user_id);
if (!$stmt->execute()) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
}

$stmt->bind_result($id, $email, $shein_email, $gmail_email, $profile_key, $created_at, $updated_at);
$items = [];
while ($stmt->fetch()) {
  $items[] = [
    "id" => $id,
    "email" => $email,
    "shein_email" => $shein_email,
    "gmail_email" => $gmail_email,
    "profile_key" => $profile_key,
    "created_at" => $created_at,
    "updated_at" => $updated_at,
  ];
}

$stmt->close();

$chromeProfiles = [];
$localAppData = getenv("LOCALAPPDATA");
$chromeLocalState = $localAppData
  ? rtrim($localAppData, "\\/") . DIRECTORY_SEPARATOR . "Google" . DIRECTORY_SEPARATOR . "Chrome" . DIRECTORY_SEPARATOR . "User Data" . DIRECTORY_SEPARATOR . "Local State"
  : "";

if ($chromeLocalState !== "" && is_file($chromeLocalState)) {
  $localState = json_decode((string)file_get_contents($chromeLocalState), true);
  $profileInfo = $localState["profile"]["info_cache"] ?? [];

  foreach ($profileInfo as $directory => $info) {
    $name = trim((string)($info["name"] ?? ""));
    $accountName = trim((string)($info["gaia_name"] ?? ""));
    $email = trim((string)($info["user_name"] ?? ""));

    $chromeProfiles[] = [
      "profile_key" => (string)$directory,
      "name" => $name !== "" ? $name : (string)$directory,
      "account_name" => $accountName,
      "email" => $email,
    ];
  }
}

echo json_encode([
  "ok" => true,
  "users" => $items,
  "chrome_profiles" => $chromeProfiles,
]);
