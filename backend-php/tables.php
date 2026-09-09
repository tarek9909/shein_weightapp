<?php
require("db.php");

echo "<b>Connected to database.</b><br><br>";


// ---------------------------
// CREATE TABLE: month
// ---------------------------
$sql_month = "
CREATE TABLE IF NOT EXISTS month (
    id INT AUTO_INCREMENT PRIMARY KEY
);
";

if ($conn->query($sql_month) === TRUE) {
    echo "Table 'month' created.<br>";
} else {
    echo "Error creating month table: " . $conn->error . "<br>";
}


// ---------------------------
// CREATE TABLE: orders
// ---------------------------
$sql_orders = "
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    month_id INT NOT NULL,
    order_details VARCHAR(255),
    FOREIGN KEY (month_id) REFERENCES month(id)
);
";

if ($conn->query($sql_orders) === TRUE) {
    echo "Table 'orders' created.<br>";
} else {
    echo "Error creating orders table: " . $conn->error . "<br>";
}


// ---------------------------
// CREATE TABLE: payments
// ---------------------------
$sql_payments = "
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    month_id INT NOT NULL,
    payment_amount DECIMAL(10,2),
    FOREIGN KEY (month_id) REFERENCES month(id)
);
";

if ($conn->query($sql_payments) === TRUE) {
    echo "Table 'payments' created.<br>";
} else {
    echo "Error creating payments table: " . $conn->error . "<br>";
}


// ---------------------------
// CREATE TABLE: customs
// ---------------------------
$sql_customs = "
CREATE TABLE IF NOT EXISTS customs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    month_id INT NOT NULL,
    customs_fee DECIMAL(10,2),
    FOREIGN KEY (month_id) REFERENCES month(id)
);
";

if ($conn->query($sql_customs) === TRUE) {
    echo "Table 'customs' created.<br>";
} else {
    echo "Error creating customs table: " . $conn->error . "<br>";
}

echo "<br><b>All tables created successfully.</b>";

$conn->close();
?>
