<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit(0);

// Return JSON for PHP fatals/notices without exposing filesystem or database
// details to the browser. The server log retains the diagnostic information.
set_exception_handler(function ($e) {
  error_log("[shein-php] Unhandled SHEIN-account exception: " . (string)$e);
  if (!headers_sent()) http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
  exit;
});

set_error_handler(function ($severity, $message, $file, $line) {
  if (!(error_reporting() & $severity)) return false;
  throw new ErrorException($message, 0, $severity, $file, $line);
});

register_shutdown_function(function () {
  $err = error_get_last();
  if (!$err) return;
  $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
  if (!in_array($err["type"], $fatalTypes, true)) return;
  error_log("[shein-php] Unhandled SHEIN-account fatal error: " . ($err["message"] ?? "Unknown fatal error"));
  if (!headers_sent()) http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Internal server error"]);
});

require_once "../db.php";
require_once "../auth/auth.php";
require_once "../config.php";

function shein_local_python() {
  $python = defined("SHEIN_LOCAL_PYTHON") ? SHEIN_LOCAL_PYTHON : getenv("SHEIN_LOCAL_PYTHON");
  return trim((string)$python);
}

function shein_local_cli_script() {
  $script = defined("SHEIN_LOCAL_SCRAPER_CLI") ? SHEIN_LOCAL_SCRAPER_CLI : getenv("SHEIN_LOCAL_SCRAPER_CLI");
  return trim((string)$script);
}

function shein_local_api_base_url() {
  $baseUrl = defined("SHEIN_LOCAL_API_BASE_URL") ? SHEIN_LOCAL_API_BASE_URL : getenv("SHEIN_LOCAL_API_BASE_URL");
  return rtrim(trim((string)$baseUrl), "/");
}

function shein_local_api_url($path = "") {
  $baseUrl = shein_local_api_base_url();
  if ($baseUrl === "") return "";
  $path = ltrim((string)$path, "/");
  return $path === "" ? $baseUrl : $baseUrl . "/" . $path;
}

function shein_scraper_action_path($action) {
  static $map = [
    "track_one" => "/api/direct/track_one",
    "weight_one" => "/api/direct/weight_one",
    "weight_many" => "/api/direct/weight_many",
  ];
  return $map[$action] ?? "";
}

function json_input() {
  $raw = file_get_contents("php://input");
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function norm_email($value) {
  $v = strtolower(trim((string)$value));
  if (strpos($v, "@") !== false) {
    [$local, $domain] = explode("@", $v, 2);
    if ($local !== "" && $domain !== "" && strpos($domain, ".") === false) {
      $v = $local . "@" . $domain . ".com";
    }
  }
  return $v;
}

function call_shein_scraper_json($action, $payload) {
  $path = shein_scraper_action_path($action);
  if ($path === "") {
    return [false, "Unsupported scraper action: " . $action, null, 400];
  }

  $healthUrl = shein_local_api_url("/ping");
  if ($healthUrl === "") {
    return [false, "Local scraper API base URL is not configured", null, 0];
  }

  $healthJson = @file_get_contents($healthUrl);
  $healthData = is_string($healthJson) ? json_decode($healthJson, true) : null;
  if (!is_array($healthData) || empty($healthData["ok"])) {
    return [false, "Local scraper API is unavailable at " . $healthUrl, null, 503];
  }

  $url = shein_local_api_url($path);
  $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
  if ($body === false) {
    return [false, "Failed to encode scraper payload", null, 500];
  }

  $context = stream_context_create([
    "http" => [
      "method" => "POST",
      "header" => "Content-Type: application/json\r\nAccept: application/json\r\n",
      "content" => $body,
      "ignore_errors" => true,
      "timeout" => 180,
    ],
  ]);

  $responseBody = @file_get_contents($url, false, $context);
  $rawStatus = $http_response_header[0] ?? "";
  $statusCode = 0;
  if (preg_match('/\s(\d{3})\s/', $rawStatus, $m)) {
    $statusCode = (int)$m[1];
  }

  $data = is_string($responseBody) ? json_decode(trim($responseBody), true) : null;
  if (!is_array($data)) {
    $msg = "Invalid scraper API response";
    if ($statusCode > 0) $msg .= " (HTTP " . $statusCode . ")";
    return [false, $msg, null, $statusCode ?: 500];
  }

  if ($statusCode >= 400 || empty($data["ok"])) {
    $msg = $data["error"] ?? $data["detail"] ?? "Local scraper API request failed";
    return [false, $msg, $data, $statusCode ?: 500];
  }

  return [true, null, $data, $statusCode ?: 200];
}
