ALTER TABLE `cart_customers`
  ADD COLUMN `delivery_charge_usd` DECIMAL(10,2) DEFAULT NULL AFTER `usd_to_collect`;
