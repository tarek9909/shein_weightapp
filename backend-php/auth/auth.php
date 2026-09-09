<?php
// backend/auth/auth.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

// ✅ Put your secret in ONE place so login + all APIs use the same key
// (Make it long/random in production)
function auth_secret() {
  return "CHANGE_THIS_SECRET_123";
}

/* ---------------- Base64URL helpers ---------------- */

function base64url_encode($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data) {
  // add padding if missing
  $remainder = strlen($data) % 4;
  if ($remainder) $data .= str_repeat('=', 4 - $remainder);
  return base64_decode(strtr($data, '-_', '+/'));
}

/* ---------------- JWT create/verify ---------------- */

function make_token($payload, $secret = null) {
  if ($secret === null) $secret = auth_secret();

  $header = ['alg' => 'HS256', 'typ' => 'JWT'];
  $h = base64url_encode(json_encode($header));
  $p = base64url_encode(json_encode($payload));
  $sig = base64url_encode(hash_hmac('sha256', "$h.$p", $secret, true));
  return "$h.$p.$sig";
}

function verify_token($token, $secret = null) {
  if ($secret === null) $secret = auth_secret();

  $parts = explode('.', $token);
  if (count($parts) !== 3) return false;

  [$h, $p, $sig] = $parts;

  $check = base64url_encode(hash_hmac('sha256', "$h.$p", $secret, true));
  if (!hash_equals($check, $sig)) return false;

  $payload = json_decode(base64url_decode($p), true);
  if (!$payload) return false;

  if (isset($payload['exp']) && time() > (int)$payload['exp']) return false;

  return $payload;
}

/* ---------------- Authorization header reader ---------------- */

// ✅ This is the fix: Apache/XAMPP often doesn't expose HTTP_AUTHORIZATION
function get_authorization_header() {
  if (!empty($_SERVER['HTTP_AUTHORIZATION'])) return $_SERVER['HTTP_AUTHORIZATION'];
  if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];

  if (function_exists('getallheaders')) {
    $headers = getallheaders();
    foreach ($headers as $k => $v) {
      if (strtolower($k) === 'authorization') return $v;
    }
  }

  if (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    foreach ($headers as $k => $v) {
      if (strtolower($k) === 'authorization') return $v;
    }
  }

  return null;
}

/* ---------------- Require auth ---------------- */

function require_auth() {
  $hdr = get_authorization_header();

  if (!$hdr) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Missing Authorization header"]);
    exit;
  }

  // Accept "Bearer xxx" OR raw token (just in case)
  $token = $hdr;
  if (stripos($hdr, "Bearer ") === 0) {
    $token = trim(substr($hdr, 7));
  } else {
    $token = trim($hdr);
  }

  if (!$token) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Missing token"]);
    exit;
  }

  $payload = verify_token($token, auth_secret());
  if (!$payload) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Invalid token"]);
    exit;
  }

  // A valid signature is not enough after a user has been deleted. Reject
  // stale tokens before a protected endpoint can hit a foreign-key failure.
  global $conn;
  $user_id = (int)($payload["user_id"] ?? 0);
  if ($user_id <= 0 || !isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Invalid token"]);
    exit;
  }
  $stmt = $conn->prepare("SELECT id FROM users WHERE id=? LIMIT 1");
  $stmt->bind_param("i", $user_id);
  $stmt->execute();
  if (!$stmt->get_result()->fetch_assoc()) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Invalid token"]);
    exit;
  }

  return $payload; // contains user_id, username, exp...
}
