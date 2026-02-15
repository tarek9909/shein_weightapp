<?php
$servername = "localhost";
$dbname = "bxqxjgah_shein";
$username = "bxqxjgah_shein";
$password = "Y8LbeGZwf4UxeL3cbbk8";  // your database name

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>
