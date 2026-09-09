ALTER TABLE `orders`
  ADD COLUMN `profit_put_aside` DECIMAL(10,2) NULL;

ALTER TABLE `orders`
  ADD COLUMN `profit_put_aside_at` DATETIME NULL;
