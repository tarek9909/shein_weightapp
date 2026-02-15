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

$stmt = $conn->prepare("SELECT id, name FROM month WHERE user_id=? ORDER BY id DESC");
$stmt->bind_param("i", $user_id);
$stmt->execute();

$res = $stmt->get_result();
$months = [];
while ($row = $res->fetch_assoc()) $months[] = $row;

echo json_encode($months);
?>
