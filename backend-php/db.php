<?php
// Keep API failures JSON even when mysqli raises an exception before an
// endpoint has a chance to handle it. Never expose SQL/server details to the
// browser; they are logged for the server operator instead.
ini_set("display_errors", "0");
error_reporting(E_ALL);

if (!function_exists("backend_json_error")) {
    function backend_json_error(int $status = 500, string $message = "Internal server error"): void {
        if (!headers_sent()) {
            header("Content-Type: application/json; charset=utf-8");
        }
        http_response_code($status);
        echo json_encode(["ok" => false, "error" => $message]);
    }
}

if (!function_exists("backend_public_exception_message")) {
    function backend_public_exception_message(Throwable $error, string $fallback = "Internal server error"): string {
        $status = (int)$error->getCode();
        return ($status >= 400 && $status < 500 && trim($error->getMessage()) !== "")
            ? trim($error->getMessage())
            : $fallback;
    }
}

set_exception_handler(function (Throwable $error): void {
    error_log("[shein-php] Unhandled exception: " . (string)$error);
    backend_json_error();
});

register_shutdown_function(function (): void {
    $error = error_get_last();
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if ($error && in_array($error["type"], $fatalTypes, true)) {
        error_log("[shein-php] Unhandled fatal error: " . ($error["message"] ?? "Unknown fatal error"));
        if (!headers_sent()) {
            backend_json_error();
        }
    }
});

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$servername = getenv("DB_HOST") ?: "localhost";
$dbname = getenv("DB_NAME") ?: "shein";
$username = getenv("DB_USER") ?: "root";
$password = getenv("DB_PASSWORD");
if ($password === false) $password = "mysql";
$port = (int)(getenv("DB_PORT") ?: 3306);

$conn = new mysqli($servername, $username, $password, $dbname, $port);
$conn->set_charset("utf8mb4");
?>
