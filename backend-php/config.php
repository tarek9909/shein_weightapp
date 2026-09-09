<?php
$projectRoot = realpath(__DIR__ . "/..");
$defaultWindowsPython = $projectRoot . DIRECTORY_SEPARATOR . ".venv" . DIRECTORY_SEPARATOR . "Scripts" . DIRECTORY_SEPARATOR . "python.exe";
$defaultUnixPython = $projectRoot . DIRECTORY_SEPARATOR . ".venv" . DIRECTORY_SEPARATOR . "bin" . DIRECTORY_SEPARATOR . "python";
$defaultCliScript = $projectRoot . DIRECTORY_SEPARATOR . "api" . DIRECTORY_SEPARATOR . "local_shein_cli.py";
$defaultApiBaseUrl = "http://127.0.0.1:8000";

if (!defined("SHEIN_LOCAL_PYTHON")) {
  $envPython = getenv("SHEIN_LOCAL_PYTHON");
  if (is_string($envPython) && trim($envPython) !== "") {
    define("SHEIN_LOCAL_PYTHON", trim($envPython));
  } elseif (DIRECTORY_SEPARATOR === "\\" && file_exists($defaultWindowsPython)) {
    define("SHEIN_LOCAL_PYTHON", $defaultWindowsPython);
  } elseif (file_exists($defaultUnixPython)) {
    define("SHEIN_LOCAL_PYTHON", $defaultUnixPython);
  } else {
    define("SHEIN_LOCAL_PYTHON", DIRECTORY_SEPARATOR === "\\" ? "python" : "python3");
  }
}

if (!defined("SHEIN_LOCAL_SCRAPER_CLI")) {
  $envCli = getenv("SHEIN_LOCAL_SCRAPER_CLI");
  if (is_string($envCli) && trim($envCli) !== "") {
    define("SHEIN_LOCAL_SCRAPER_CLI", trim($envCli));
  } else {
    define("SHEIN_LOCAL_SCRAPER_CLI", $defaultCliScript);
  }
}

if (!defined("SHEIN_LOCAL_API_BASE_URL")) {
  $envApiBase = getenv("SHEIN_LOCAL_API_BASE_URL");
  if (is_string($envApiBase) && trim($envApiBase) !== "") {
    define("SHEIN_LOCAL_API_BASE_URL", rtrim(trim($envApiBase), "/"));
  } else {
    define("SHEIN_LOCAL_API_BASE_URL", $defaultApiBaseUrl);
  }
}
