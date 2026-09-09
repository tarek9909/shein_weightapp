-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: shein
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_log`
--

DROP TABLE IF EXISTS `activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `month_id` int DEFAULT NULL,
  `entity_type` varchar(32) COLLATE utf8mb4_general_ci NOT NULL,
  `entity_id` int DEFAULT NULL,
  `action` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `before_json` json DEFAULT NULL,
  `after_json` json DEFAULT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_log_user_month_time` (`user_id`,`month_id`,`created_at`),
  KEY `idx_activity_log_entity` (`user_id`,`entity_type`,`entity_id`),
  KEY `idx_activity_log_action` (`user_id`,`action`),
  CONSTRAINT `fk_activity_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_log`
--

LOCK TABLES `activity_log` WRITE;
/*!40000 ALTER TABLE `activity_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `activity_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budget`
--

DROP TABLE IF EXISTS `budget`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `budget` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `month_id` (`month_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `budget_ibfk_1` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`),
  CONSTRAINT `budget_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budget`
--

LOCK TABLES `budget` WRITE;
/*!40000 ALTER TABLE `budget` DISABLE KEYS */;
INSERT INTO `budget` VALUES (1,1,30100.00,'initial',1),(2,3,30100.00,'initial',1),(4,2,30100.00,'1213533',1),(5,4,10500.00,'initial23',1),(6,5,3010000.00,'initial',2),(7,6,99999999.99,'123123',2),(8,4,30100.00,'initial',1),(9,7,30100.00,'initial',1),(10,8,11000.00,'Initial',5),(12,9,16500.00,'Initial',5),(13,10,21800.00,'initial',5),(14,11,8300.00,'initial',5),(16,12,30100.00,'initial',6),(17,14,5000.00,'initial',6);
/*!40000 ALTER TABLE `budget` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cargo_package_sort_status`
--

DROP TABLE IF EXISTS `cargo_package_sort_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cargo_package_sort_status` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `user_id` int NOT NULL,
  `group_key` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `group_type` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'single',
  `display_label` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tracking_numbers_json` longtext COLLATE utf8mb4_general_ci,
  `status` enum('sorted','not_sorted') COLLATE utf8mb4_general_ci NOT NULL,
  `confirmed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cargo_sort_user_month_group` (`user_id`,`month_id`,`group_key`),
  KEY `idx_cargo_sort_month` (`month_id`),
  KEY `idx_cargo_sort_user` (`user_id`),
  CONSTRAINT `fk_cargo_sort_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cargo_sort_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cargo_package_sort_status`
--

LOCK TABLES `cargo_package_sort_status` WRITE;
/*!40000 ALTER TABLE `cargo_package_sort_status` DISABLE KEYS */;
INSERT INTO `cargo_package_sort_status` VALUES (2,12,6,'single:6020426130563','single','Package: 6020426130563','[\"6020426130563\"]','sorted','2026-02-21 20:59:10','2026-02-22 01:48:18','2026-02-22 01:59:10'),(4,12,6,'single:6020126719670','single','Package: 6020126719670','[\"6020126719670\"]','sorted','2026-02-21 21:32:14','2026-02-22 01:58:59','2026-02-22 02:32:14'),(7,12,6,'split:6012026221888|JTE300413093404','split','Split package: 6012026221888 + JTE300413093404','[\"6012026221888\",\"JTE300413093404\"]','sorted','2026-02-21 21:11:34','2026-02-22 02:11:34','2026-02-22 02:11:34'),(8,12,6,'single:6020326306428','single','Package: 6020326306428','[\"6020326306428\"]','sorted','2026-02-21 21:32:13','2026-02-22 02:32:13','2026-02-22 02:32:13'),(10,12,6,'joint:6020126286648','joint','Joint package: 6020126286648','[\"6020126286648\"]','sorted','2026-02-21 21:33:35','2026-02-22 02:33:12','2026-02-22 02:33:35'),(13,12,6,'single:6020226368543','single','Package: 6020226368543','[\"6020226368543\"]','sorted','2026-02-23 16:24:34','2026-02-23 21:24:34','2026-02-23 21:24:34');
/*!40000 ALTER TABLE `cargo_package_sort_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cargo_payroll_confirmations`
--

DROP TABLE IF EXISTS `cargo_payroll_confirmations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cargo_payroll_confirmations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `user_id` int NOT NULL,
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cargo_payroll_month` (`month_id`),
  KEY `idx_cargo_payroll_user` (`user_id`),
  CONSTRAINT `fk_cargo_payroll_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cargo_payroll_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cargo_payroll_confirmations`
--

LOCK TABLES `cargo_payroll_confirmations` WRITE;
/*!40000 ALTER TABLE `cargo_payroll_confirmations` DISABLE KEYS */;
INSERT INTO `cargo_payroll_confirmations` VALUES (1,12,6,'Payroll pending | Sorted packages: 2 | Per unit: 3.33 | Total payroll: 6.66 | Packages under 10kg are free (0) | Payroll confirmed from cargo sorting','2026-02-22 02:11:52');
/*!40000 ALTER TABLE `cargo_payroll_confirmations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cargo_payroll_pending`
--

DROP TABLE IF EXISTS `cargo_payroll_pending`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cargo_payroll_pending` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `user_id` int NOT NULL,
  `per_unit_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sorted_count` int NOT NULL DEFAULT '0',
  `total_payroll` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','accepted') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  `customs_id` int DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `summary_json` longtext COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cpp_month` (`month_id`),
  KEY `idx_cpp_user` (`user_id`),
  KEY `idx_cpp_status` (`status`),
  CONSTRAINT `fk_cpp_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cpp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cargo_payroll_pending`
--

LOCK TABLES `cargo_payroll_pending` WRITE;
/*!40000 ALTER TABLE `cargo_payroll_pending` DISABLE KEYS */;
INSERT INTO `cargo_payroll_pending` VALUES (1,12,6,3.33,4,13.32,'accepted',70,'Payroll pending | Sorted packages: 4 | Per unit: 3.33 | Total payroll: 13.32 | Pending payroll from cargo sorting','{\"per_unit_amount\":3.33,\"sorted_count\":4,\"packages\":[{\"group_key\":\"split:6012026221888|JTE300413093404\",\"display_label\":\"Split package: 6012026221888 + JTE300413093404\",\"group_type\":\"split\",\"tracking_numbers\":[\"6012026221888\",\"JTE300413093404\"],\"weight_kg\":27.8,\"is_free_under_10kg\":0,\"amount\":3.33,\"order_refs\":[\"order 141 \\/ cart 3\"],\"orders\":[141]},{\"group_key\":\"single:6020326306428\",\"display_label\":\"Package: 6020326306428\",\"group_type\":\"single\",\"tracking_numbers\":[\"6020326306428\"],\"weight_kg\":13.9,\"is_free_under_10kg\":0,\"amount\":3.33,\"order_refs\":[\"order 141 \\/ cart 6\"],\"orders\":[141]},{\"group_key\":\"single:6020126719670\",\"display_label\":\"Package: 6020126719670\",\"group_type\":\"single\",\"tracking_numbers\":[\"6020126719670\"],\"weight_kg\":14.3,\"is_free_under_10kg\":0,\"amount\":3.33,\"order_refs\":[\"order 141 \\/ cart 3\"],\"orders\":[141]},{\"group_key\":\"single:6020426130563\",\"display_label\":\"Package: 6020426130563\",\"group_type\":\"single\",\"tracking_numbers\":[\"6020426130563\"],\"weight_kg\":29.6,\"is_free_under_10kg\":0,\"amount\":3.33,\"order_refs\":[\"order 141 \\/ cart 56\"],\"orders\":[141]}],\"orders\":[{\"order_name\":141,\"amount\":13.32}],\"orders_count\":1,\"total_payroll\":13.32}','2026-02-22 02:32:29','2026-02-21 21:32:53'),(2,12,6,0.00,1,0.00,'accepted',72,'Payroll pending | Sorted packages: 1 | Per unit: 0.00 | Total payroll: 0.00 | Pending payroll from cargo sorting','{\"per_unit_amount\":0,\"sorted_count\":1,\"packages\":[{\"group_key\":\"joint:6020126286648\",\"display_label\":\"Joint package: 6020126286648\",\"group_type\":\"joint\",\"tracking_numbers\":[\"6020126286648\"],\"weight_kg\":16.8,\"is_free_under_10kg\":0,\"amount\":0,\"order_refs\":[\"order 141 \\/ cart 324\",\"order 141 \\/ cart 345\"],\"orders\":[141]}],\"orders\":[{\"order_name\":141,\"amount\":0}],\"orders_count\":1,\"total_payroll\":0}','2026-02-22 02:33:38','2026-02-23 16:24:51');
/*!40000 ALTER TABLE `cargo_payroll_pending` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cargo_payroll_pending_packages`
--

DROP TABLE IF EXISTS `cargo_payroll_pending_packages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cargo_payroll_pending_packages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pending_id` int NOT NULL,
  `group_key` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `display_label` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `group_type` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tracking_numbers_json` longtext COLLATE utf8mb4_general_ci,
  `weight_kg` decimal(10,3) NOT NULL DEFAULT '0.000',
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `order_refs_json` longtext COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cppp_pending_group` (`pending_id`,`group_key`),
  KEY `idx_cppp_pending` (`pending_id`),
  CONSTRAINT `fk_cppp_pending` FOREIGN KEY (`pending_id`) REFERENCES `cargo_payroll_pending` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cargo_payroll_pending_packages`
--

LOCK TABLES `cargo_payroll_pending_packages` WRITE;
/*!40000 ALTER TABLE `cargo_payroll_pending_packages` DISABLE KEYS */;
INSERT INTO `cargo_payroll_pending_packages` VALUES (1,1,'split:6012026221888|JTE300413093404','Split package: 6012026221888 + JTE300413093404','split','[\"6012026221888\",\"JTE300413093404\"]',27.800,3.33,'[\"order 141 \\/ cart 3\"]'),(2,1,'single:6020326306428','Package: 6020326306428','single','[\"6020326306428\"]',13.900,3.33,'[\"order 141 \\/ cart 6\"]'),(3,1,'single:6020126719670','Package: 6020126719670','single','[\"6020126719670\"]',14.300,3.33,'[\"order 141 \\/ cart 3\"]'),(4,1,'single:6020426130563','Package: 6020426130563','single','[\"6020426130563\"]',29.600,3.33,'[\"order 141 \\/ cart 56\"]'),(5,2,'joint:6020126286648','Joint package: 6020126286648','joint','[\"6020126286648\"]',16.800,0.00,'[\"order 141 \\/ cart 324\",\"order 141 \\/ cart 345\"]');
/*!40000 ALTER TABLE `cargo_payroll_pending_packages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_customers`
--

DROP TABLE IF EXISTS `cart_customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cart_id` int NOT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `usd_to_collect` decimal(10,2) NOT NULL,
  `delivery_charge_usd` decimal(10,2) DEFAULT NULL,
  `delivery_number` int DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `delivery_status` enum('not added','added','paid','delivered') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `received_at` datetime DEFAULT NULL,
  `delivery_method` enum('courier','self') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `delivery_assignment_status` enum('unassigned','assigned','collected') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'unassigned',
  `collection_status` enum('pending','collected') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  `payment_status` enum('unpaid','paid') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'unpaid',
  `base_amount_to_collect` decimal(10,2) DEFAULT NULL,
  `delivery_adjustment` decimal(10,2) NOT NULL DEFAULT '0.00',
  `final_amount_to_collect` decimal(10,2) DEFAULT NULL,
  `delivery_preset_id` int DEFAULT NULL,
  `collection_payment_id` int DEFAULT NULL,
  `collected_at` datetime DEFAULT NULL,
  `delivery_assigned_at` datetime DEFAULT NULL,
  `delivery_month_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_customers_delivery_number_month` (`user_id`,`delivery_month_id`,`delivery_number`),
  KEY `cart_id` (`cart_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_cart_customers_receipt_delivery` (`user_id`,`received_at`,`delivery_assignment_status`),
  KEY `idx_cart_customers_collection_payment` (`user_id`,`collection_payment_id`),
  CONSTRAINT `cart_customers_ibfk_1` FOREIGN KEY (`cart_id`) REFERENCES `order_carts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customers_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=308 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_customers`
--

LOCK TABLES `cart_customers` WRITE;
/*!40000 ALTER TABLE `cart_customers` DISABLE KEYS */;
INSERT INTO `cart_customers` VALUES (14,21,'tarek2',123123.00,NULL,33456,'confirmed',NULL,NULL,NULL,'assigned','pending','unpaid',123123.00,0.00,123123.00,NULL,NULL,NULL,NULL,NULL,1),(17,23,'sdad',123.00,NULL,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',123.00,0.00,123.00,NULL,NULL,NULL,NULL,NULL,1),(18,23,'asdasd',1232321.00,NULL,66935,'paid','',NULL,NULL,'collected','collected','paid',1232321.00,0.00,1232321.00,NULL,NULL,NULL,NULL,NULL,1),(19,23,'1231',123123.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',123123.00,0.00,123123.00,NULL,NULL,NULL,NULL,NULL,1),(20,23,'asdasd',12313.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',12313.00,0.00,12313.00,NULL,NULL,NULL,NULL,NULL,1),(21,23,'123123',1231.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',1231.00,0.00,1231.00,NULL,NULL,NULL,NULL,NULL,1),(22,23,'12313',123123.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',123123.00,0.00,123123.00,NULL,NULL,NULL,NULL,NULL,1),(23,21,'21es1',123123.00,NULL,70328,'collected',NULL,NULL,NULL,'collected','collected','paid',123123.00,0.00,123123.00,NULL,NULL,NULL,NULL,NULL,1),(24,21,'tarek',99999999.99,NULL,2560,'paid','',NULL,NULL,'collected','collected','paid',99999999.99,0.00,99999999.99,NULL,NULL,NULL,NULL,NULL,1),(25,21,'',0.00,NULL,2861,'paid','',NULL,NULL,'collected','collected','paid',0.00,0.00,0.00,NULL,NULL,NULL,NULL,NULL,1),(26,21,'',0.00,NULL,65589,'withdelivery','not added',NULL,NULL,'assigned','pending','unpaid',0.00,0.00,0.00,NULL,NULL,NULL,NULL,NULL,1),(27,21,'123121323113123123123123123123313',99999999.99,NULL,66596,'withdelivery','',NULL,NULL,'assigned','pending','unpaid',99999999.99,0.00,99999999.99,NULL,NULL,NULL,NULL,NULL,1),(37,21,'12581245',150.00,NULL,69985,'paid','',NULL,NULL,'collected','collected','paid',150.00,0.00,150.00,NULL,NULL,NULL,NULL,NULL,1),(38,6,'',0.00,NULL,66938,'paid','',NULL,NULL,'collected','collected','paid',0.00,0.00,0.00,NULL,NULL,NULL,NULL,NULL,1),(40,6,'asdadasf',560.00,NULL,66935,'paid','',NULL,NULL,'collected','collected','paid',560.00,0.00,560.00,NULL,NULL,NULL,NULL,NULL,1),(41,28,'tyrtyrt',1500.00,NULL,66398,'paid','',NULL,NULL,'collected','collected','paid',1500.00,0.00,1500.00,NULL,NULL,NULL,NULL,NULL,1),(42,29,'ismail',42900.00,NULL,63000,'paid','',NULL,NULL,'collected','collected','paid',42900.00,0.00,42900.00,NULL,NULL,NULL,NULL,NULL,1),(43,30,'ahmad\'',780.00,NULL,63001,'paid','',NULL,NULL,'collected','collected','paid',780.00,0.00,780.00,NULL,NULL,NULL,NULL,NULL,1),(44,31,'melina',500.00,NULL,69002,'paid','',NULL,NULL,'collected','collected','paid',500.00,0.00,500.00,NULL,NULL,NULL,NULL,NULL,1),(45,32,'yara',600.00,NULL,69003,'paid','',NULL,NULL,'collected','collected','paid',600.00,0.00,600.00,NULL,NULL,NULL,NULL,NULL,1),(46,33,'mazloum',950.00,NULL,69004,'paid','',NULL,NULL,'collected','collected','paid',950.00,0.00,950.00,NULL,NULL,NULL,NULL,NULL,1),(47,34,'daad',630.00,NULL,69005,'paid','',NULL,NULL,'collected','collected','paid',630.00,0.00,630.00,NULL,NULL,NULL,NULL,NULL,1),(48,35,'eline',150.00,NULL,69006,'paid','',NULL,NULL,'collected','collected','paid',150.00,0.00,150.00,NULL,NULL,NULL,NULL,NULL,1),(49,6,'asdasd',123123.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',123123.00,0.00,123123.00,NULL,NULL,NULL,NULL,NULL,1),(50,40,'sdfasdfsafs',1500.00,NULL,66940,'paid','',NULL,NULL,'collected','collected','paid',1500.00,0.00,1500.00,NULL,NULL,NULL,NULL,NULL,2),(51,40,'frewrew',3000.00,NULL,7,'pending',NULL,NULL,NULL,'assigned','pending','unpaid',3000.00,0.00,3000.00,NULL,NULL,NULL,NULL,NULL,2),(52,39,'wewerrwr',4500.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',4500.00,0.00,4500.00,NULL,NULL,NULL,NULL,NULL,2),(53,39,'asdfdasfsf',6000.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',6000.00,0.00,6000.00,NULL,NULL,NULL,NULL,NULL,2),(54,37,'ahmd',7500.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',7500.00,0.00,7500.00,NULL,NULL,NULL,NULL,NULL,2),(55,42,'Angel ismail',74.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',74.00,0.00,74.00,NULL,NULL,NULL,NULL,NULL,5),(56,42,'Daad',0.00,NULL,868871,'paid','paid',NULL,NULL,'collected','collected','paid',0.00,0.00,0.00,NULL,NULL,NULL,NULL,NULL,5),(57,42,'Sakka',23.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',23.00,0.00,23.00,NULL,NULL,NULL,NULL,NULL,5),(58,42,'Sara dahche',41.00,NULL,86752,'paid','paid',NULL,NULL,'collected','collected','paid',41.00,0.00,41.00,NULL,NULL,NULL,NULL,NULL,5),(59,42,'Omar hijazi',40.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',40.00,0.00,40.00,NULL,NULL,NULL,NULL,NULL,5),(60,42,'Nour yassine',88.00,NULL,86751,'paid','paid',NULL,NULL,'collected','collected','paid',88.00,0.00,88.00,NULL,NULL,NULL,NULL,NULL,5),(61,43,'Rawan barakat',88.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',88.00,0.00,88.00,NULL,NULL,NULL,NULL,NULL,5),(62,43,'Melina',108.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',108.00,0.00,108.00,NULL,NULL,NULL,NULL,NULL,5),(63,43,'Abra',32.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',32.00,0.00,32.00,NULL,NULL,NULL,NULL,NULL,5),(64,43,'Dina barja',44.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',44.00,0.00,44.00,NULL,NULL,NULL,NULL,NULL,5),(65,43,'Marwan barakat',12.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',12.00,0.00,12.00,NULL,NULL,NULL,NULL,NULL,5),(66,43,'Mariam alaweyeh',44.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',44.00,0.00,44.00,NULL,NULL,NULL,NULL,NULL,5),(67,43,'Sara chami',121.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',121.00,0.00,121.00,NULL,NULL,NULL,NULL,NULL,5),(68,43,'Sara abdelwali',75.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',75.00,0.00,75.00,NULL,NULL,NULL,NULL,NULL,5),(69,44,'Juliana',294.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',294.00,0.00,294.00,NULL,NULL,NULL,NULL,NULL,5),(70,44,'Yara kfoury',263.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',263.00,0.00,263.00,NULL,NULL,NULL,NULL,NULL,5),(71,45,'Maha choubassi',116.00,NULL,86745,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',116.00,0.00,116.00,NULL,NULL,NULL,NULL,NULL,5),(72,45,'Sherine salman',208.00,NULL,86750,'paid','paid',NULL,NULL,'collected','collected','paid',208.00,0.00,208.00,NULL,NULL,NULL,NULL,NULL,5),(73,45,'Sara abdelwali',72.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',72.00,0.00,72.00,NULL,NULL,NULL,NULL,NULL,5),(74,45,'Zeina halawi',124.00,NULL,86741,'paid','paid',NULL,NULL,'collected','collected','paid',124.00,0.00,124.00,NULL,NULL,NULL,NULL,NULL,5),(75,46,'Maryam abbas',101.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',101.00,0.00,101.00,NULL,NULL,NULL,NULL,NULL,5),(76,46,'Jaretna',6.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',6.00,0.00,6.00,NULL,NULL,NULL,NULL,NULL,5),(77,47,'Dina el nil',98.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',98.00,0.00,98.00,NULL,NULL,NULL,NULL,NULL,5),(78,48,'Fatima mahdi',184.00,NULL,85348,'paid','paid',NULL,NULL,'collected','collected','paid',184.00,0.00,184.00,NULL,NULL,NULL,NULL,NULL,5),(79,48,'Daad',379.00,NULL,853493,'paid','paid',NULL,NULL,'collected','collected','paid',379.00,0.00,379.00,NULL,NULL,NULL,NULL,NULL,5),(80,49,'Zahraa',36.00,NULL,999999999,'paid','paid',NULL,NULL,'collected','collected','paid',36.00,0.00,36.00,NULL,NULL,NULL,NULL,NULL,5),(81,49,'Boushra hammoud',24.00,NULL,85351,'paid','paid',NULL,NULL,'collected','collected','paid',24.00,0.00,24.00,NULL,NULL,NULL,NULL,NULL,5),(82,49,'Sara abdelwali',108.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',108.00,0.00,108.00,NULL,NULL,NULL,NULL,NULL,5),(83,49,'Malak othman',111.00,NULL,85346,'paid','paid',NULL,NULL,'collected','collected','paid',111.00,0.00,111.00,NULL,NULL,NULL,NULL,NULL,5),(84,49,'Malak akkary',96.00,NULL,85336,'paid','paid',NULL,NULL,'collected','collected','paid',96.00,0.00,96.00,NULL,NULL,NULL,NULL,NULL,5),(85,49,'Eline darwish',131.00,NULL,9999999,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',131.00,0.00,131.00,NULL,NULL,NULL,NULL,NULL,5),(86,50,'Zahraa halawi',126.00,NULL,85350,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',126.00,0.00,126.00,NULL,NULL,NULL,NULL,NULL,5),(87,51,'Maya chekh',0.00,NULL,853552,'paid','paid',NULL,NULL,'collected','collected','paid',0.00,0.00,0.00,NULL,NULL,NULL,NULL,NULL,5),(88,51,'Jaretna',7.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',7.00,0.00,7.00,NULL,NULL,NULL,NULL,NULL,5),(89,51,'Albert toubassu',120.00,NULL,85354,'paid','paid',NULL,NULL,'collected','collected','paid',120.00,0.00,120.00,NULL,NULL,NULL,NULL,NULL,5),(90,52,'Maya chekh',1080.00,NULL,85355,'paid','paid',NULL,NULL,'collected','collected','paid',1080.00,0.00,1080.00,NULL,NULL,NULL,NULL,NULL,5),(91,53,'Daad',185.00,NULL,86887,'paid','paid',NULL,NULL,'collected','collected','paid',185.00,0.00,185.00,NULL,NULL,NULL,NULL,NULL,5),(92,53,'Rebecca',30.00,NULL,85723,'paid','paid',NULL,NULL,'collected','collected','paid',30.00,0.00,30.00,NULL,NULL,NULL,NULL,NULL,5),(93,53,'Mervat',57.00,NULL,85722,'paid','paid',NULL,NULL,'collected','collected','paid',57.00,0.00,57.00,NULL,NULL,NULL,NULL,NULL,5),(94,54,'Thea khattar',46.00,NULL,83862,'withdelivery','not added',NULL,NULL,'assigned','pending','unpaid',46.00,0.00,46.00,NULL,NULL,NULL,NULL,NULL,5),(95,54,'Nahla matar',60.00,NULL,83861,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',60.00,0.00,60.00,NULL,NULL,NULL,NULL,NULL,5),(96,55,'Mikelle',228.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',228.00,0.00,228.00,NULL,NULL,NULL,NULL,NULL,5),(97,55,'79197',326.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',326.00,0.00,326.00,NULL,NULL,NULL,NULL,NULL,5),(98,55,'Hamdan al ali',149.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',149.00,0.00,149.00,NULL,NULL,NULL,NULL,NULL,5),(99,55,'Mona abbas',196.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',196.00,0.00,196.00,NULL,NULL,NULL,NULL,NULL,5),(100,55,'Fadia el kai',0.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',0.00,0.00,0.00,NULL,NULL,NULL,NULL,NULL,5),(101,56,'Siba chhadi',140.00,NULL,86749,'paid','paid',NULL,NULL,'collected','collected','paid',140.00,0.00,140.00,NULL,NULL,NULL,NULL,NULL,5),(102,56,'Karim ismail',12.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',12.00,0.00,12.00,NULL,NULL,NULL,NULL,NULL,5),(103,56,'Reem safadi',95.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',95.00,0.00,95.00,NULL,NULL,NULL,NULL,NULL,5),(104,56,'Chantale',83.00,NULL,86748,'paid','paid',NULL,NULL,'collected','collected','paid',83.00,0.00,83.00,NULL,NULL,NULL,NULL,NULL,5),(105,56,'Boushra',11.00,NULL,86753,'paid','paid',NULL,NULL,'collected','collected','paid',11.00,0.00,11.00,NULL,NULL,NULL,NULL,NULL,5),(106,56,'Hassan sakka',6.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',6.00,0.00,6.00,NULL,NULL,NULL,NULL,NULL,5),(107,57,'Bayan',263.00,NULL,86746,'paid','paid',NULL,NULL,'collected','collected','paid',263.00,0.00,263.00,NULL,NULL,NULL,NULL,NULL,5),(108,58,'Sara dahche',120.00,NULL,85344,'paid','paid',NULL,NULL,'collected','collected','paid',120.00,0.00,120.00,NULL,NULL,NULL,NULL,NULL,5),(109,58,'Hamza ramadan',49.00,NULL,99999999,'paid','paid',NULL,NULL,'collected','collected','paid',49.00,0.00,49.00,NULL,NULL,NULL,NULL,NULL,5),(110,58,'Yasmine 7asri',90.00,NULL,85334,'paid','paid',NULL,NULL,'collected','collected','paid',90.00,0.00,90.00,NULL,NULL,NULL,NULL,NULL,5),(111,58,'Obaida sab7a',220.00,NULL,85342,'paid','paid',NULL,NULL,'collected','collected','paid',220.00,0.00,220.00,NULL,NULL,NULL,NULL,NULL,5),(112,58,'Omar hijazi',47.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',47.00,0.00,47.00,NULL,NULL,NULL,NULL,NULL,5),(113,58,'Karim daaboul',25.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',25.00,0.00,25.00,NULL,NULL,NULL,NULL,NULL,5),(114,59,'Sherine salman',450.00,NULL,85340,'paid','paid',NULL,NULL,'collected','collected','paid',450.00,0.00,450.00,NULL,NULL,NULL,NULL,NULL,5),(115,59,'Hariri',75.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',75.00,0.00,75.00,NULL,NULL,NULL,NULL,NULL,5),(116,59,'Shatha',33.00,NULL,85353,'paid','paid',NULL,NULL,'collected','collected','paid',33.00,0.00,33.00,NULL,NULL,NULL,NULL,NULL,5),(117,59,'Rasheed',17.00,NULL,999998,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',17.00,0.00,17.00,NULL,NULL,NULL,NULL,NULL,5),(118,60,'Liliane rstum',46.00,NULL,85721,'paid','paid',NULL,NULL,'collected','collected','paid',46.00,0.00,46.00,NULL,NULL,NULL,NULL,NULL,5),(119,60,'Rasha 7addad',236.00,NULL,85341,'paid','paid',NULL,NULL,'collected','collected','paid',236.00,0.00,236.00,NULL,NULL,NULL,NULL,NULL,5),(120,60,'Dark',154.00,NULL,85345,'paid','paid',NULL,NULL,'collected','collected','paid',154.00,0.00,154.00,NULL,NULL,NULL,NULL,NULL,5),(121,61,'Daad',95.00,NULL,853492,'paid','paid',NULL,NULL,'collected','collected','paid',95.00,0.00,95.00,NULL,NULL,NULL,NULL,NULL,5),(122,61,'Eline',133.00,NULL,999999,'paid','paid',NULL,NULL,'collected','collected','paid',133.00,0.00,133.00,NULL,NULL,NULL,NULL,NULL,5),(123,61,'Fatima',200.00,NULL,85343,'paid','paid',NULL,NULL,'collected','collected','paid',200.00,0.00,200.00,NULL,NULL,NULL,NULL,NULL,5),(124,61,'Sariah',32.00,NULL,85352,'paid','paid',NULL,NULL,'collected','collected','paid',32.00,0.00,32.00,NULL,NULL,NULL,NULL,NULL,5),(125,61,'Narjes',142.00,NULL,85335,'paid','paid',NULL,NULL,'collected','collected','paid',142.00,0.00,142.00,NULL,NULL,NULL,NULL,NULL,5),(126,62,'Gaelle',307.00,NULL,85337,'paid','paid',NULL,NULL,'collected','collected','paid',307.00,0.00,307.00,NULL,NULL,NULL,NULL,NULL,5),(127,63,'Giovanna farah',189.00,NULL,85359,'paid','paid',NULL,NULL,'collected','collected','paid',189.00,0.00,189.00,NULL,NULL,NULL,NULL,NULL,5),(128,41,'Maria saad',800.00,NULL,85356,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',800.00,0.00,800.00,NULL,NULL,NULL,NULL,NULL,5),(129,64,'Daad',89.00,NULL,853491,'paid','paid',NULL,NULL,'collected','collected','paid',89.00,0.00,89.00,NULL,NULL,NULL,NULL,NULL,5),(130,64,'Siba',127.00,NULL,85338,'paid','paid',NULL,NULL,'collected','collected','paid',127.00,0.00,127.00,NULL,NULL,NULL,NULL,NULL,5),(131,64,'Ranim',341.00,NULL,85339,'paid','paid',NULL,NULL,'collected','collected','paid',341.00,0.00,341.00,NULL,NULL,NULL,NULL,NULL,5),(132,65,'Lucia',315.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',315.00,0.00,315.00,NULL,NULL,NULL,NULL,NULL,5),(133,65,'Daad',170.00,NULL,853494,'paid','paid',NULL,NULL,'collected','collected','paid',170.00,0.00,170.00,NULL,NULL,NULL,NULL,NULL,5),(134,65,'Em mhmd',140.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',140.00,0.00,140.00,NULL,NULL,NULL,NULL,NULL,5),(135,66,'Ousama',36.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',36.00,0.00,36.00,NULL,NULL,NULL,NULL,NULL,5),(136,66,'Sara abdelwali',73.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',73.00,0.00,73.00,NULL,NULL,NULL,NULL,NULL,5),(137,66,'Hend',18.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',18.00,0.00,18.00,NULL,NULL,NULL,NULL,NULL,5),(138,67,'Melina',341.00,NULL,85358,'paid','paid',NULL,NULL,'collected','collected','paid',341.00,0.00,341.00,NULL,NULL,NULL,NULL,NULL,5),(139,68,'79197',230.00,NULL,86743,'withdelivery',NULL,NULL,NULL,'assigned','pending','unpaid',230.00,0.00,230.00,NULL,NULL,NULL,NULL,NULL,5),(140,68,'Mhmd hussein',338.00,NULL,86742,'paid','paid',NULL,NULL,'collected','collected','paid',338.00,0.00,338.00,NULL,NULL,NULL,NULL,NULL,5),(141,68,'Nour khiami',115.00,NULL,86754,'paid','paid',NULL,NULL,'collected','collected','paid',115.00,0.00,115.00,NULL,NULL,NULL,NULL,NULL,5),(142,68,'Ranim othman',331.00,NULL,86744,'paid','paid',NULL,NULL,'collected','collected','paid',331.00,0.00,331.00,NULL,NULL,NULL,NULL,NULL,5),(143,68,'Rana salloum',326.00,NULL,86740,'paid','paid',NULL,NULL,'collected','collected','paid',326.00,0.00,326.00,NULL,NULL,NULL,NULL,NULL,5),(144,69,'Sara abdelwali',31.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',31.00,0.00,31.00,NULL,NULL,NULL,NULL,NULL,5),(145,70,'Maha mhmd',920.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',920.00,0.00,920.00,NULL,NULL,NULL,NULL,NULL,5),(146,71,'Bassel',46.00,NULL,86747,'paid','paid',NULL,NULL,'collected','collected','paid',46.00,0.00,46.00,NULL,NULL,NULL,NULL,NULL,5),(147,72,'Khelet fathi',9.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',9.00,0.00,9.00,NULL,NULL,NULL,NULL,NULL,5),(148,73,'Abra',72.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',72.00,0.00,72.00,NULL,NULL,NULL,NULL,NULL,5),(149,73,'Lucia',108.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',108.00,0.00,108.00,NULL,NULL,NULL,NULL,NULL,5),(150,73,'Maria saad',655.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',655.00,0.00,655.00,NULL,NULL,NULL,NULL,NULL,5),(151,74,'Ismail',174.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',174.00,0.00,174.00,NULL,NULL,NULL,NULL,NULL,5),(152,74,'Sakka',195.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',195.00,0.00,195.00,NULL,NULL,NULL,NULL,NULL,5),(153,74,'Daad',180.00,NULL,868872,'paid','paid',NULL,NULL,'collected','collected','paid',180.00,0.00,180.00,NULL,NULL,NULL,NULL,NULL,5),(154,75,'Omar sayyed',57.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',57.00,0.00,57.00,NULL,NULL,NULL,NULL,NULL,5),(155,75,'Ousama',94.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',94.00,0.00,94.00,NULL,NULL,NULL,NULL,NULL,5),(156,75,'Rfe2et mama',75.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',75.00,0.00,75.00,NULL,NULL,NULL,NULL,NULL,5),(157,76,'Rayane',375.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',375.00,0.00,375.00,NULL,NULL,NULL,NULL,NULL,5),(158,76,'Sara salloukh',102.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',102.00,0.00,102.00,NULL,NULL,NULL,NULL,NULL,5),(159,76,'Omar sayyed',96.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',96.00,0.00,96.00,NULL,NULL,NULL,NULL,NULL,5),(160,77,'Giovana',600.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',600.00,0.00,600.00,NULL,NULL,NULL,NULL,NULL,5),(161,78,'Mervat',86.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',86.00,0.00,86.00,NULL,NULL,NULL,NULL,NULL,5),(162,78,'Maya dweihy',139.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',139.00,0.00,139.00,NULL,NULL,NULL,NULL,NULL,5),(163,78,'Hiba saad',486.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',486.00,0.00,486.00,NULL,NULL,NULL,NULL,NULL,5),(164,78,'Sara abdelwali',15.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',15.00,0.00,15.00,NULL,NULL,NULL,NULL,NULL,5),(165,79,'Ranim othman',174.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',174.00,0.00,174.00,NULL,NULL,NULL,NULL,NULL,5),(166,80,'Rawan barakat',87.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',87.00,0.00,87.00,NULL,NULL,NULL,NULL,NULL,5),(167,80,'Daad',259.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',259.00,0.00,259.00,NULL,NULL,NULL,NULL,NULL,5),(168,80,'Farah',236.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',236.00,0.00,236.00,NULL,NULL,NULL,NULL,NULL,5),(169,80,'Nesrine saleh',172.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',172.00,0.00,172.00,NULL,NULL,NULL,NULL,NULL,5),(170,81,'Sandybelle',630.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',630.00,0.00,630.00,NULL,NULL,NULL,NULL,NULL,5),(171,82,'Ismail',13.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',13.00,0.00,13.00,NULL,NULL,NULL,NULL,NULL,5),(172,82,'Malak othman',87.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',87.00,0.00,87.00,NULL,NULL,NULL,NULL,NULL,5),(173,82,'Christelle',304.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',304.00,0.00,304.00,NULL,NULL,NULL,NULL,NULL,5),(174,82,'Reem rammal',135.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',135.00,0.00,135.00,NULL,NULL,NULL,NULL,NULL,5),(175,82,'Maysoun',43.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',43.00,0.00,43.00,NULL,NULL,NULL,NULL,NULL,5),(176,83,'Maryam abbas',221.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',221.00,0.00,221.00,NULL,NULL,NULL,NULL,NULL,5),(177,83,'Sakka',8.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',8.00,0.00,8.00,NULL,NULL,NULL,NULL,NULL,5),(178,84,'Layla',39.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',39.00,0.00,39.00,NULL,NULL,NULL,NULL,NULL,5),(179,84,'Sara abdelwali',54.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',54.00,0.00,54.00,NULL,NULL,NULL,NULL,NULL,5),(180,84,'Yousef hamed',444.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',444.00,0.00,444.00,NULL,NULL,NULL,NULL,NULL,5),(181,84,'Siba',111.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',111.00,0.00,111.00,NULL,NULL,NULL,NULL,NULL,5),(182,85,'Danuella abboud',92.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',92.00,0.00,92.00,NULL,NULL,NULL,NULL,NULL,5),(183,85,'Donia',61.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',61.00,0.00,61.00,NULL,NULL,NULL,NULL,NULL,5),(184,85,'Malak akkary',143.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',143.00,0.00,143.00,NULL,NULL,NULL,NULL,NULL,5),(185,85,'Antar',16.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',16.00,0.00,16.00,NULL,NULL,NULL,NULL,NULL,5),(186,85,'Omar',106.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',106.00,0.00,106.00,NULL,NULL,NULL,NULL,NULL,5),(187,85,'Rania.majdalany',106.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',106.00,0.00,106.00,NULL,NULL,NULL,NULL,NULL,5),(188,85,'Aya sis',20.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',20.00,0.00,20.00,NULL,NULL,NULL,NULL,NULL,5),(189,85,'Cecile',67.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',67.00,0.00,67.00,NULL,NULL,NULL,NULL,NULL,5),(190,85,'Daaboul',62.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',62.00,0.00,62.00,NULL,NULL,NULL,NULL,NULL,5),(191,86,'Roshine',194.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',194.00,0.00,194.00,NULL,NULL,NULL,NULL,NULL,5),(192,86,'Daad',201.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',201.00,0.00,201.00,NULL,NULL,NULL,NULL,NULL,5),(193,86,'Sara dahche',25.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',25.00,0.00,25.00,NULL,NULL,NULL,NULL,NULL,5),(194,86,'Karim.ismail',6.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',6.00,0.00,6.00,NULL,NULL,NULL,NULL,NULL,5),(195,86,'Roro koubaisi',99.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',99.00,0.00,99.00,NULL,NULL,NULL,NULL,NULL,5),(196,87,'Serine ismail',69.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',69.00,0.00,69.00,NULL,NULL,NULL,NULL,NULL,5),(197,62,'Roshine',203.00,NULL,85347,'paid','paid',NULL,NULL,'collected','collected','paid',203.00,0.00,203.00,NULL,NULL,NULL,NULL,NULL,5),(198,88,'Malak othman',453.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',453.00,0.00,453.00,NULL,NULL,NULL,NULL,NULL,5),(199,88,'Jocelyne khoury',206.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',206.00,0.00,206.00,NULL,NULL,NULL,NULL,NULL,5),(200,88,'Tia nehme',54.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',54.00,0.00,54.00,NULL,NULL,NULL,NULL,NULL,5),(201,88,'Karim daaboul',7.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',7.00,0.00,7.00,NULL,NULL,NULL,NULL,NULL,5),(202,89,'Rayane masri',422.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',422.00,0.00,422.00,NULL,NULL,NULL,NULL,NULL,5),(203,89,'79197',303.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',303.00,0.00,303.00,NULL,NULL,NULL,NULL,NULL,5),(204,89,'Rajab',34.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',34.00,0.00,34.00,NULL,NULL,NULL,NULL,NULL,5),(205,90,'Joumama choukeir',245.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',245.00,0.00,245.00,NULL,NULL,NULL,NULL,NULL,5),(206,90,'Lucia',415.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',415.00,0.00,415.00,NULL,NULL,NULL,NULL,NULL,5),(207,90,'Marie atallah',65.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',65.00,0.00,65.00,NULL,NULL,NULL,NULL,NULL,5),(208,91,'Sara abdelwali',71.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',71.00,0.00,71.00,NULL,NULL,NULL,NULL,NULL,5),(209,91,'Eline darwish',105.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',105.00,0.00,105.00,NULL,NULL,NULL,NULL,NULL,5),(210,91,'Hassoun',78.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',78.00,0.00,78.00,NULL,NULL,NULL,NULL,NULL,5),(211,92,'Hanin',17.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',17.00,0.00,17.00,NULL,NULL,NULL,NULL,NULL,5),(212,92,'Joelle.elia',248.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',248.00,0.00,248.00,NULL,NULL,NULL,NULL,NULL,5),(213,92,'Christelle',37.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',37.00,0.00,37.00,NULL,NULL,NULL,NULL,NULL,5),(214,92,'Fathi',8.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',8.00,0.00,8.00,NULL,NULL,NULL,NULL,NULL,5),(215,92,'Khay fatima',24.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',24.00,0.00,24.00,NULL,NULL,NULL,NULL,NULL,5),(216,93,'Sara aljarmany',496.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',496.00,0.00,496.00,NULL,NULL,NULL,NULL,NULL,5),(217,93,'Salwa hammoud',96.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',96.00,0.00,96.00,NULL,NULL,NULL,NULL,NULL,5),(218,94,'Abu 3amr zahraman',246.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',246.00,0.00,246.00,NULL,NULL,NULL,NULL,NULL,5),(219,94,'Sherine salman',276.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',276.00,0.00,276.00,NULL,NULL,NULL,NULL,NULL,5),(220,95,'Shami',94.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',94.00,0.00,94.00,NULL,NULL,NULL,NULL,NULL,5),(221,95,'Nadia',146.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',146.00,0.00,146.00,NULL,NULL,NULL,NULL,NULL,5),(222,96,'Farah shatila',116.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',116.00,0.00,116.00,NULL,NULL,NULL,NULL,NULL,5),(223,96,'Daad',161.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',161.00,0.00,161.00,NULL,NULL,NULL,NULL,NULL,5),(224,96,'Lucia',9.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',9.00,0.00,9.00,NULL,NULL,NULL,NULL,NULL,5),(225,97,'Dina el nil',101.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',101.00,0.00,101.00,NULL,NULL,NULL,NULL,NULL,5),(226,98,'Maha mhmd 1',497.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',497.00,0.00,497.00,NULL,NULL,NULL,NULL,NULL,5),(227,98,'Christina',87.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',87.00,0.00,87.00,NULL,NULL,NULL,NULL,NULL,5),(228,99,'Maha mhmd 2',500.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',500.00,0.00,500.00,NULL,NULL,NULL,NULL,NULL,5),(229,99,'Maha choubassj',102.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',102.00,0.00,102.00,NULL,NULL,NULL,NULL,NULL,5),(230,100,'Mehedine ismail',5.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',5.00,0.00,5.00,NULL,NULL,NULL,NULL,NULL,5),(231,100,'Liliane rstum',261.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',261.00,0.00,261.00,NULL,NULL,NULL,NULL,NULL,5),(232,100,'Daaboul',87.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',87.00,0.00,87.00,NULL,NULL,NULL,NULL,NULL,5),(233,100,'Ghaith tleis',61.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',61.00,0.00,61.00,NULL,NULL,NULL,NULL,NULL,5),(234,100,'Abra',171.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',171.00,0.00,171.00,NULL,NULL,NULL,NULL,NULL,5),(235,100,'Cynthia arabi',120.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',120.00,0.00,120.00,NULL,NULL,NULL,NULL,NULL,5),(236,100,'Chantale rached',47.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',47.00,0.00,47.00,NULL,NULL,NULL,NULL,NULL,5),(237,101,'Mkari',25.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',25.00,0.00,25.00,NULL,NULL,NULL,NULL,NULL,5),(238,101,'Ismail',50.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',50.00,0.00,50.00,NULL,NULL,NULL,NULL,NULL,5),(239,101,'Maryam abbas',167.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',167.00,0.00,167.00,NULL,NULL,NULL,NULL,NULL,5),(240,101,'Sakka',44.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',44.00,0.00,44.00,NULL,NULL,NULL,NULL,NULL,5),(241,101,'Omar sayyed',305.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',305.00,0.00,305.00,NULL,NULL,NULL,NULL,NULL,5),(242,101,'Sara dahche',44.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',44.00,0.00,44.00,NULL,NULL,NULL,NULL,NULL,5),(243,102,'Malak akkary',321.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',321.00,0.00,321.00,NULL,NULL,NULL,NULL,NULL,5),(244,102,'Naruman masri',159.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',159.00,0.00,159.00,NULL,NULL,NULL,NULL,NULL,5),(245,102,'Sara abdelwali',55.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',55.00,0.00,55.00,NULL,NULL,NULL,NULL,NULL,5),(246,102,'Hala baisary',41.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',41.00,0.00,41.00,NULL,NULL,NULL,NULL,NULL,5),(247,102,'Jana darweesh',47.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',47.00,0.00,47.00,NULL,NULL,NULL,NULL,NULL,5),(248,103,'Daad',256.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',256.00,0.00,256.00,NULL,NULL,NULL,NULL,NULL,5),(249,103,'Sana 7lay7el',306.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',306.00,0.00,306.00,NULL,NULL,NULL,NULL,NULL,5),(250,103,'Eline darwish',52.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',52.00,0.00,52.00,NULL,NULL,NULL,NULL,NULL,5),(251,104,'Maha mhmd',740.00,NULL,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',740.00,0.00,740.00,NULL,NULL,NULL,NULL,NULL,5),(256,124,'saeed',140.00,NULL,NULL,'paid','paid',NULL,NULL,'collected','collected','paid',140.00,0.00,140.00,NULL,NULL,NULL,NULL,NULL,6),(259,123,'Rayane Al Masri',557.00,8.00,92608,'paid','paid',NULL,NULL,'collected','collected','paid',557.00,0.00,557.00,NULL,NULL,NULL,NULL,NULL,6),(260,124,'Omar waleed Al sayyed',121.00,4.00,92603,'paid','paid',NULL,NULL,'collected','collected','paid',121.00,0.00,121.00,NULL,NULL,NULL,NULL,NULL,6),(262,123,'Maysoun .',55.00,4.00,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',55.00,0.00,55.00,NULL,NULL,NULL,NULL,NULL,6),(263,124,'Ranim Othman',101.00,6.00,92595,'paid','paid',NULL,NULL,'collected','collected','paid',101.00,0.00,101.00,NULL,NULL,NULL,NULL,NULL,6),(265,123,'Sara Test Duplicate',96.00,NULL,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',96.00,0.00,96.00,NULL,NULL,NULL,NULL,NULL,6),(266,124,'Sara Test Duplicate',130.00,NULL,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',130.00,0.00,130.00,NULL,NULL,NULL,NULL,NULL,6),(268,123,'Omar Waleed',88.00,NULL,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',88.00,0.00,88.00,NULL,NULL,NULL,NULL,NULL,6),(269,124,'Omar Waleed',103.00,NULL,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',103.00,0.00,103.00,NULL,NULL,NULL,NULL,NULL,6),(270,123,'Maysoun .',42.00,4.00,92597,'paid','paid',NULL,NULL,'collected','collected','paid',42.00,0.00,42.00,NULL,NULL,NULL,NULL,NULL,6),(271,124,'Maysoun .',42.00,0.00,69,'paid','paid',NULL,NULL,'collected','collected','paid',42.00,0.00,42.00,NULL,NULL,NULL,NULL,NULL,6),(273,123,'Manual Import Two',65.00,NULL,NULL,'pending','not added',NULL,NULL,'unassigned','pending','unpaid',65.00,0.00,65.00,NULL,NULL,NULL,NULL,NULL,6),(276,129,'Ghfran mhmd',569.00,15.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',569.00,0.00,569.00,NULL,NULL,NULL,NULL,NULL,6),(277,129,'Sherine shkeir',211.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',211.00,0.00,211.00,NULL,NULL,NULL,NULL,NULL,6),(278,129,'Claudette',108.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',108.00,0.00,108.00,NULL,NULL,NULL,NULL,NULL,6),(279,129,'Rayane bobo',82.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',82.00,0.00,82.00,NULL,NULL,NULL,NULL,NULL,6),(280,130,'Zahraa',176.00,2.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',176.00,0.00,176.00,NULL,NULL,NULL,NULL,NULL,6),(281,130,'Rola me3rawi',693.00,13.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',693.00,0.00,693.00,NULL,NULL,NULL,NULL,NULL,6),(282,131,'Wafica',65.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',65.00,0.00,65.00,NULL,NULL,NULL,NULL,NULL,6),(283,132,'Olga halabi',40.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',40.00,0.00,40.00,NULL,NULL,NULL,NULL,NULL,6),(284,132,'Ismail',35.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',35.00,0.00,35.00,NULL,NULL,NULL,NULL,NULL,6),(285,133,'Mart abdallah',166.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',166.00,0.00,166.00,NULL,NULL,NULL,NULL,NULL,6),(286,133,'Rasha',53.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',53.00,0.00,53.00,NULL,NULL,NULL,NULL,NULL,6),(287,133,'Omar darazi',14.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',14.00,0.00,14.00,NULL,NULL,NULL,NULL,NULL,6),(288,136,'Dina',267.00,10.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',267.00,0.00,267.00,NULL,NULL,NULL,NULL,NULL,6),(289,137,'Ekht rawan barakat',8.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',8.00,0.00,8.00,NULL,NULL,NULL,NULL,NULL,6),(290,137,'Mkari',7.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',7.00,0.00,7.00,NULL,NULL,NULL,NULL,NULL,6),(291,137,'Eline darwish',60.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',60.00,0.00,60.00,NULL,NULL,NULL,NULL,NULL,6),(292,137,'Celeste daccache',109.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',109.00,0.00,109.00,NULL,NULL,NULL,NULL,NULL,6),(293,138,'Omar darazi',45.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',45.00,0.00,45.00,NULL,NULL,NULL,NULL,NULL,6),(294,140,'Rayane masri',284.00,10.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',284.00,0.00,284.00,NULL,NULL,NULL,NULL,NULL,6),(295,141,'Cecile',198.00,2.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',198.00,0.00,198.00,NULL,NULL,NULL,NULL,NULL,6),(296,141,'Mira rizk',290.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',290.00,0.00,290.00,NULL,NULL,NULL,NULL,NULL,6),(297,141,'Rebecca',61.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',61.00,0.00,61.00,NULL,NULL,NULL,NULL,NULL,6),(298,142,'Mkari',4.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',4.00,0.00,4.00,NULL,NULL,NULL,NULL,NULL,6),(299,142,'Dina',27.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',27.00,0.00,27.00,NULL,NULL,NULL,NULL,NULL,6),(300,142,'Sakka',140.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',140.00,0.00,140.00,NULL,NULL,NULL,NULL,NULL,6),(301,144,'Joelle elia',273.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',273.00,0.00,273.00,NULL,NULL,NULL,NULL,NULL,6),(302,144,'Rana salloum',290.00,5.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',290.00,0.00,290.00,NULL,NULL,NULL,NULL,NULL,6),(303,144,'Skafi',21.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',21.00,0.00,21.00,NULL,NULL,NULL,NULL,NULL,6),(304,145,'Khalto hanin',20.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',20.00,0.00,20.00,NULL,NULL,NULL,NULL,NULL,6),(305,146,'Melina',120.00,0.00,NULL,'pending',NULL,NULL,NULL,'unassigned','pending','unpaid',120.00,0.00,120.00,NULL,NULL,NULL,NULL,NULL,6);
/*!40000 ALTER TABLE `cart_customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_debt_payments`
--

DROP TABLE IF EXISTS `customer_debt_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_debt_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `debt_id` int NOT NULL,
  `user_id` int NOT NULL,
  `payment_id` int NOT NULL,
  `paid_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customer_debt_payments_debt` (`debt_id`),
  KEY `idx_customer_debt_payments_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_debt_payments`
--

LOCK TABLES `customer_debt_payments` WRITE;
/*!40000 ALTER TABLE `customer_debt_payments` DISABLE KEYS */;
INSERT INTO `customer_debt_payments` VALUES (1,1,6,70,50.00,'','2026-02-22 20:45:26'),(2,1,6,71,150.00,'','2026-02-22 20:45:45');
/*!40000 ALTER TABLE `customer_debt_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_debts`
--

DROP TABLE IF EXISTS `customer_debts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_debts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `month_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `customer_name_snapshot` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `order_name_snapshot` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cart_id` int DEFAULT NULL,
  `cart_order_number_snapshot` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `original_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `outstanding_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('open','partial','closed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'open',
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `closed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customer_debts_user_month_status` (`user_id`,`month_id`,`status`),
  KEY `idx_customer_debts_customer` (`customer_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_debts`
--

LOCK TABLES `customer_debts` WRITE;
/*!40000 ALTER TABLE `customer_debts` DISABLE KEYS */;
INSERT INTO `customer_debts` VALUES (1,6,12,261,'Daad Said',48,'141',125,'345',200.00,0.00,'closed','','2026-02-22 20:45:16','2026-02-22 20:45:45','2026-02-22 15:45:45');
/*!40000 ALTER TABLE `customer_debts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customs`
--

DROP TABLE IF EXISTS `customs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `customs_fee` decimal(10,2) DEFAULT NULL,
  `tracking_no` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `invoice_no` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `weight_kg` decimal(10,3) DEFAULT NULL,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `delivery_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `order_id` int DEFAULT NULL,
  `cart_id` int DEFAULT NULL,
  `order_ref` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cart_ref` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_general_ci,
  `description` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `source_message` mediumtext COLLATE utf8mb4_general_ci,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `month_id` (`month_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_customs_tracking_no` (`tracking_no`),
  KEY `idx_customs_order_id` (`order_id`),
  KEY `idx_customs_cart_id` (`cart_id`),
  CONSTRAINT `customs_ibfk_1` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`),
  CONSTRAINT `customs_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customs`
--

LOCK TABLES `customs` WRITE;
/*!40000 ALTER TABLE `customs` DISABLE KEYS */;
INSERT INTO `customs` VALUES (2,1,360.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(3,3,8948.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(4,4,8948.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(5,4,28.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(6,2,12313.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(7,5,123123.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,2),(8,6,123.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,2),(9,7,14243.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(10,7,32.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),(11,8,597.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(12,8,1125.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(13,8,674.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(14,9,35.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(15,8,46.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(16,8,195.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(18,8,10.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(19,8,855.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(20,8,156.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(21,10,4873.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(22,8,195.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(23,8,24.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(24,9,961.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(25,10,16.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(27,10,2033.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(28,10,30.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5),(55,12,205.72,'6020426130563',NULL,29.600,6.95,0.00,48,123,'order 141','cart 56','cart 56 | order 141',NULL,'*AHM Group*\n\n*Client Code : AHM - TAA*\n*Unit Price = 6.95$/Kg*\n\n\n*Order #7 (Box):*\nInvoice# : 9633 - 230\nTracking Number# : 6020426130563\nWeight : 29.60 Kg\nPrice : $205.72\nDelivery : $0\n\n\n\n*Order #10 (Box):*\nInvoice# : 9633 - 549\nTracking Number# : 6020126719670\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : 0\n\n\n\n*Order #16 (Box):*\nInvoice# : 9633 - 1105\nTracking Number# : 6020126286648\nWeight : 16.80 Kg\nPrice : $116.76\nDelivery : $0\n\n*Order #18 (Box):*\nInvoice# : 9633 - 1333\nTracking Number# : 6020226368543\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : $0\n\n\n*Order #20 (Box):*\nInvoice# : 9633 - 1361\nTracking Number# : 6020326306428\nWeight : 13.90 Kg\nPrice : $96.61\nDelivery : $0\n\n\n\n\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Price of all boxes = $ 617.87\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Weight = 88.9 Kg*',6),(56,12,99.39,'6020126719670',NULL,14.300,6.95,0.00,48,115,'order 141','cart 3','cart 3 | order 141',NULL,'*AHM Group*\n\n*Client Code : AHM - TAA*\n*Unit Price = 6.95$/Kg*\n\n\n*Order #7 (Box):*\nInvoice# : 9633 - 230\nTracking Number# : 6020426130563\nWeight : 29.60 Kg\nPrice : $205.72\nDelivery : $0\n\n\n\n*Order #10 (Box):*\nInvoice# : 9633 - 549\nTracking Number# : 6020126719670\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : 0\n\n\n\n*Order #16 (Box):*\nInvoice# : 9633 - 1105\nTracking Number# : 6020126286648\nWeight : 16.80 Kg\nPrice : $116.76\nDelivery : $0\n\n*Order #18 (Box):*\nInvoice# : 9633 - 1333\nTracking Number# : 6020226368543\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : $0\n\n\n*Order #20 (Box):*\nInvoice# : 9633 - 1361\nTracking Number# : 6020326306428\nWeight : 13.90 Kg\nPrice : $96.61\nDelivery : $0\n\n\n\n\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Price of all boxes = $ 617.87\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Weight = 88.9 Kg*',6),(57,12,116.76,'6020126286648',NULL,16.800,6.95,0.00,48,124,'order 141','cart 324','cart 324 | order 141 | Joint shipment with: order 141 / cart 324 ; order 141 / cart 345',NULL,'*AHM Group*\n\n*Client Code : AHM - TAA*\n*Unit Price = 6.95$/Kg*\n\n\n*Order #7 (Box):*\nInvoice# : 9633 - 230\nTracking Number# : 6020426130563\nWeight : 29.60 Kg\nPrice : $205.72\nDelivery : $0\n\n\n\n*Order #10 (Box):*\nInvoice# : 9633 - 549\nTracking Number# : 6020126719670\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : 0\n\n\n\n*Order #16 (Box):*\nInvoice# : 9633 - 1105\nTracking Number# : 6020126286648\nWeight : 16.80 Kg\nPrice : $116.76\nDelivery : $0\n\n*Order #18 (Box):*\nInvoice# : 9633 - 1333\nTracking Number# : 6020226368543\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : $0\n\n\n*Order #20 (Box):*\nInvoice# : 9633 - 1361\nTracking Number# : 6020326306428\nWeight : 13.90 Kg\nPrice : $96.61\nDelivery : $0\n\n\n\n\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Price of all boxes = $ 617.87\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Weight = 88.9 Kg*',6),(58,12,99.39,'6020226368543',NULL,14.300,6.95,0.00,48,114,'order 141','cart 2','cart 2 | order 141',NULL,'*AHM Group*\n\n*Client Code : AHM - TAA*\n*Unit Price = 6.95$/Kg*\n\n\n*Order #7 (Box):*\nInvoice# : 9633 - 230\nTracking Number# : 6020426130563\nWeight : 29.60 Kg\nPrice : $205.72\nDelivery : $0\n\n\n\n*Order #10 (Box):*\nInvoice# : 9633 - 549\nTracking Number# : 6020126719670\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : 0\n\n\n\n*Order #16 (Box):*\nInvoice# : 9633 - 1105\nTracking Number# : 6020126286648\nWeight : 16.80 Kg\nPrice : $116.76\nDelivery : $0\n\n*Order #18 (Box):*\nInvoice# : 9633 - 1333\nTracking Number# : 6020226368543\nWeight : 14.30 Kg\nPrice : $99.39\nDelivery : $0\n\n\n*Order #20 (Box):*\nInvoice# : 9633 - 1361\nTracking Number# : 6020326306428\nWeight : 13.90 Kg\nPrice : $96.61\nDelivery : $0\n\n\n\n\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Price of all boxes = $ 617.87\n*ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Total Weight = 88.9 Kg*',6),(71,12,96.61,'JTE300413093404',NULL,13.900,NULL,0.00,48,122,'order 141','cart 3','cart 3 | order 141 | Split shipment pending - waiting for next package(s): JTE300413093404',NULL,'*Order #20 (Box):*\nInvoice# : 9633 - 1361\nTracking Number# :  JTE300413093404\nWeight : 13.90 Kg\nPrice : $96.61\nDelivery : $0',6),(72,12,0.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,'Payroll pending | Sorted packages: 1 | Per unit: 0.00 | Total payroll: 0.00 | Pending payroll from cargo sorting','payment','{\"per_unit_amount\":0,\"sorted_count\":1,\"packages\":[{\"group_key\":\"joint:6020126286648\",\"display_label\":\"Joint package: 6020126286648\",\"group_type\":\"joint\",\"tracking_numbers\":[\"6020126286648\"],\"weight_kg\":16.8,\"is_free_under_10kg\":0,\"amount\":0,\"order_refs\":[\"order 141 \\/ cart 324\",\"order 141 \\/ cart 345\"],\"orders\":[141]}],\"orders\":[{\"order_name\":141,\"amount\":0}],\"orders_count\":1,\"total_payroll\":0}',6),(73,11,102.00,NULL,NULL,NULL,NULL,0.00,NULL,NULL,NULL,NULL,NULL,'benzene',NULL,5);
/*!40000 ALTER TABLE `customs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delivery_charge_presets`
--

DROP TABLE IF EXISTS `delivery_charge_presets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_charge_presets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `label` varchar(32) COLLATE utf8mb4_general_ci NOT NULL,
  `adjustment_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_delivery_presets_user_label` (`user_id`,`label`),
  KEY `idx_delivery_presets_user_active` (`user_id`,`active`,`sort_order`),
  CONSTRAINT `fk_delivery_presets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delivery_charge_presets`
--

LOCK TABLES `delivery_charge_presets` WRITE;
/*!40000 ALTER TABLE `delivery_charge_presets` DISABLE KEYS */;
INSERT INTO `delivery_charge_presets` VALUES (1,1,'+10',10.00,1,40,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(2,1,'-5',-5.00,1,30,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(3,1,'+5',5.00,1,20,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(4,1,'0',0.00,1,10,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(5,2,'+10',10.00,1,40,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(6,2,'-5',-5.00,1,30,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(7,2,'+5',5.00,1,20,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(8,2,'0',0.00,1,10,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(9,4,'+10',10.00,1,40,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(10,4,'-5',-5.00,1,30,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(11,4,'+5',5.00,1,20,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(12,4,'0',0.00,1,10,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(13,5,'+10',10.00,1,40,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(14,5,'-5',-5.00,1,30,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(15,5,'+5',5.00,1,20,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(16,5,'0',0.00,1,10,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(17,6,'+10',10.00,1,40,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(18,6,'-5',-5.00,1,30,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(19,6,'+5',5.00,1,20,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(20,6,'0',0.00,1,10,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(21,8,'+10',10.00,1,40,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(22,8,'-5',-5.00,1,30,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(23,8,'+5',5.00,1,20,'2026-09-08 16:43:07','2026-09-08 16:43:07'),(24,8,'0',0.00,1,10,'2026-09-08 16:43:07','2026-09-08 16:43:07');
/*!40000 ALTER TABLE `delivery_charge_presets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delivery_losses`
--

DROP TABLE IF EXISTS `delivery_losses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_losses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `user_id` int NOT NULL,
  `status` enum('pending','confirmed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  `loss_type` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `signed_diff` decimal(10,2) DEFAULT NULL,
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name_snapshot` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `order_name_snapshot` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cart_id` int DEFAULT NULL,
  `cart_order_number_snapshot` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ref_label` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `source_key` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `confirmed_at` datetime DEFAULT NULL,
  `reversed_at` datetime DEFAULT NULL,
  `reversal_reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `reversed_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_delivery_losses_user_month_status` (`user_id`,`month_id`,`status`),
  KEY `idx_delivery_losses_customer` (`customer_id`),
  KEY `idx_delivery_losses_active` (`user_id`,`month_id`,`reversed_at`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delivery_losses`
--

LOCK TABLES `delivery_losses` WRITE;
/*!40000 ALTER TABLE `delivery_losses` DISABLE KEYS */;
INSERT INTO `delivery_losses` VALUES (1,12,6,'confirmed','out of stock item',4.00,4.00,'Out of stock item difference (net collect diff: +4.00)',264,'Maha Choubassi',48,'141',125,'345','Maha Choubassi | order 141 / cart 345','apply|264|48|125|5|out of stock item|5','2026-02-22 19:06:41','2026-02-22 19:06:53','2026-02-22 14:06:53',NULL,NULL,NULL),(2,12,6,'confirmed','delivery charge',4.00,-4.00,'Delivery charge difference (-4.00)',264,'Maha Choubassi',48,'141',125,'345','Maha Choubassi | order 141 / cart 345','apply|264|48|125|5|delivery charge|5','2026-02-22 19:06:41','2026-02-22 19:06:53','2026-02-22 14:06:53',NULL,NULL,NULL),(3,12,6,'confirmed','out of stock item',5.00,-5.00,'Out of stock item difference (net collect diff: -5.00)',263,'Ranim Othman',48,'141',124,'324','Ranim Othman | order 141 / cart 324','apply|263|48|124|4|out of stock item|4','2026-02-22 19:24:45','2026-02-22 19:25:00','2026-02-22 14:25:00',NULL,NULL,NULL),(4,12,6,'confirmed','delivery charge',2.00,2.00,'Delivery tracking charge difference (+2.00)',259,'Rayane Al Masri',48,'141',123,'56','Rayane Al Masri | order 141 / cart 56','delivery-tracking|charge|259|48|123','2026-02-22 19:30:34','2026-02-22 19:30:43','2026-02-22 14:30:43',NULL,NULL,NULL);
/*!40000 ALTER TABLE `delivery_losses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `month`
--

DROP TABLE IF EXISTS `month`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `month` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `month_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `month`
--

LOCK TABLES `month` WRITE;
/*!40000 ALTER TABLE `month` DISABLE KEYS */;
INSERT INTO `month` VALUES (1,'december',1),(2,'asdasd',1),(3,'sdfsf',1),(4,'january',1),(5,'asdasd',2),(6,'asafsdgggggg',2),(7,'LLLL',1),(8,'January',5),(9,'Jan2',5),(10,'Test',5),(11,'Feb',5),(12,'jan',6),(13,'sadsad',5),(14,'April',6);
/*!40000 ALTER TABLE `month` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_carts`
--

DROP TABLE IF EXISTS `order_carts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_carts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `cart_order_number` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `cart_price` decimal(10,2) DEFAULT NULL,
  `user_id` int NOT NULL,
  `shein_email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_order_no` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_account_id` int DEFAULT NULL,
  `shein_carrier` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_tracking_no` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_status_text` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_last_details` text COLLATE utf8mb4_general_ci,
  `shein_last_timestamp` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_delivered` tinyint(1) NOT NULL DEFAULT '0',
  `is_joint_shipment` tinyint(1) NOT NULL DEFAULT '0',
  `joint_shipment_count` int NOT NULL DEFAULT '0',
  `joint_combined_weight_kg` decimal(10,3) DEFAULT NULL,
  `joint_combined_weight_plus_2kg` decimal(10,3) DEFAULT NULL,
  `shein_is_split_shipment` tinyint(1) NOT NULL DEFAULT '0',
  `shein_split_count` int NOT NULL DEFAULT '0',
  `shein_split_tracking_numbers_json` longtext COLLATE utf8mb4_general_ci,
  `shein_split_package_refs_json` longtext COLLATE utf8mb4_general_ci,
  `shein_track_url` text COLLATE utf8mb4_general_ci,
  `shein_total_weight_g` int DEFAULT NULL,
  `shein_total_weight_kg` decimal(10,3) DEFAULT NULL,
  `shein_total_weight_plus_2kg` decimal(10,3) DEFAULT NULL,
  `last_track_refresh` datetime DEFAULT NULL,
  `last_weight_refresh` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_shein_order_per_account` (`shein_account_id`,`shein_order_no`),
  KEY `order_id` (`order_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_shein_order_no` (`shein_order_no`),
  KEY `idx_shein_account` (`shein_account_id`),
  KEY `idx_shein_tracking_user` (`user_id`,`shein_tracking_no`),
  CONSTRAINT `carts_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_carts_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_carts_shein_account_fk` FOREIGN KEY (`shein_account_id`) REFERENCES `shein_accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=149 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_carts`
--

LOCK TABLES `order_carts` WRITE;
/*!40000 ALTER TABLE `order_carts` DISABLE KEYS */;
INSERT INTO `order_carts` VALUES (6,1,'1',1.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(21,1,'57.',7.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(22,1,'50',50.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(23,1,'1',100.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(24,1,'3000',3000.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(28,9,'hdfghdfgh',42609.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(29,10,'1',42000.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(30,10,'2',609.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(31,11,'1',454.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(32,11,'2',447.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(33,11,'3',514.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(34,11,'4',425.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(35,11,'5',102.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(36,1,'5',0.00,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(37,13,'123',123.00,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(38,13,'1077',1077.00,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(39,14,'11000',11000.00,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(40,14,'111',111.00,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(41,18,'1',1841.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(42,20,'1',430.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(43,20,'2',413.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(44,20,'3',417.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(45,20,'4',406.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(46,20,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(47,20,'6',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(48,16,'1',1878.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(49,16,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(50,16,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(51,16,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(52,16,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(53,16,'6',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(54,16,'7',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(55,21,'1',1013.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(56,21,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(57,21,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(58,17,'1',2343.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(59,17,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(60,17,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(61,17,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(62,17,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(63,17,'6',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(64,18,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(65,18,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(66,18,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(67,18,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(68,19,'1',3017.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(69,19,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(70,19,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(71,19,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(72,19,'6',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(73,19,'7',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(74,19,'8',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(75,19,'9',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(76,22,'1',1517.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(77,22,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(78,22,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(79,22,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(80,24,'1',1718.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(81,24,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(82,24,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(83,24,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(84,23,'1',1394.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(85,23,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(86,23,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(87,23,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(88,25,'1',1884.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(89,25,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(90,25,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(91,25,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(92,25,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(93,26,'1',1191.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(94,26,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(95,26,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(96,26,'4',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(97,26,'5',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(98,34,'1',1512.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(99,34,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(100,34,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(101,35,'1',1502.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(102,35,'2',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(103,35,'3',0.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(104,36,'1',510.00,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(114,48,'2',2.00,6,'990913','GSH1581630002XB',NULL,'IMILE','6020226368543','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','1770371950',1,0,0,NULL,NULL,0,1,'[\"6020226368543\"]','[\"C26020101790982\"]','https://www.imile.com/track',13152,13.152,15.152,NULL,NULL),(115,48,'3',3.00,6,'990913','GSH158163000XBX',NULL,'IMILE','6020126719670','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','1770286908',1,0,0,NULL,NULL,0,1,'[\"6020126719670\"]','[\"C26013102207501\"]','https://www.imile.com/track',13158,13.158,15.158,NULL,NULL),(118,48,'6',6.00,6,'990912','GSH15831400MP8D',NULL,'IMILE','6020326306428','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','1770457489',1,0,0,NULL,NULL,0,1,'[\"6020326306428\"]','[\"C26020203065963\"]','https://www.imile.com/track',12710,12.710,14.710,NULL,NULL),(122,48,'3',0.00,6,'990912','GSH163314000EN9',NULL,'J&T','JTE300413093404','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','1769343734',1,0,0,NULL,NULL,1,2,'[\"6012026221888\",\"JTE300413093404\"]','[\"C26012001747523\",\"M26012000048170\"]','https://www.jtexpress.me/UAE?waybillNo=%5BshippingNo%5D&type=0',8115,8.115,10.115,NULL,NULL),(123,48,'56',0.00,6,'990912','GSH15831400MPFP',NULL,'IMILE','6020426130563','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','1770286989',1,0,0,NULL,NULL,0,1,'[\"6020426130563\"]','[\"M26013100036917\"]','https://www.imile.com/track',10138,10.138,12.138,NULL,NULL),(124,48,'324',0.00,6,'990913','GSH1XT16N00N069',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XT16N00N069',10843,10.843,12.843,NULL,NULL),(127,48,'3',0.00,6,'990912','GSH1XX31W000BKD',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XX31W000BKD',19773,19.773,21.773,NULL,NULL),(128,49,'1',0.00,5,'990912','GSH1X331S00M6HH',NULL,'J&T','JTE300422195298','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','ÃƒËœÃ‚Â¹ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â²Ãƒâ„¢Ã…Â  ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¹Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ…â€™ Ãƒâ„¢Ã…Â ÃƒËœÃ‚ÂªÃƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦ ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨Ãƒâ„¢Ã†â€™. ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â±ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§ÃƒËœÃ‚Â¡ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â± Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã‹â€ Ãƒâ„¢Ã¢â‚¬Å¡ \"ÃƒËœÃ‚ÂªÃƒËœÃ‚Â£Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â¯ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦\" Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  \"ÃƒËœÃ‚Â·Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â¨ÃƒËœÃ‚Â§ÃƒËœÃ‚ÂªÃƒâ„¢Ã…Â \" Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã†â€™ÃƒËœÃ‚Â³ÃƒËœÃ‚Â¨ Ãƒâ„¢Ã¢â‚¬Â Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â§ÃƒËœÃ‚Â· ÃƒËœÃ‚Â´Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â .','1772012598',1,0,0,NULL,NULL,1,2,'[\"JTE300420292893\",\"JTE300422195298\"]','[\"C26021801135152\",\"C26021900449260\"]','https://www.jtexpress.me/UAE?waybillNo=%5BshippingNo%5D&type=0',12594,12.594,14.594,NULL,NULL),(129,50,'1',0.00,6,'990912','GSH1XX31W0025HH',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]',NULL,20725,20.725,22.725,NULL,NULL),(130,50,'2',0.00,6,'990913','GSH1XX16W001HHR',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XX16W001HHR',19773,19.773,21.773,NULL,NULL),(131,50,'3',0.00,6,'990913','GSH1XX16W00MNWQ',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XX16W00MNWQ',1458,1.458,3.458,NULL,NULL),(132,50,'4',0.00,6,'990912','GSH1XX3130019ST',NULL,'IMILE','48583174603421','< p > Ã˜Â¹Ã˜Â²Ã™Å Ã˜Â²Ã™Å  Ã˜Â§Ã™â€žÃ˜Â¹Ã™â€¦Ã™Å Ã™â€ž Ã˜Å’ Ã™Å Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦ Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’. Ã˜Â§Ã™â€žÃ˜Â±Ã˜Â¬Ã˜Â§Ã˜Â¡ Ã˜Â§Ã™â€žÃ™â€ Ã™â€šÃ˜Â± Ã™ÂÃ™Ë†Ã™â€š \"Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦\" Ã™ÂÃ™Å  \"Ã˜Â·Ã™â€žÃ˜Â¨Ã˜Â§Ã˜ÂªÃ™Å \" Ã™â€žÃ™Æ’Ã˜Â³Ã˜Â¨ Ã™â€ Ã™â€šÃ˜Â§Ã˜Â· Ã˜Â´Ã™Å Ã™â€ . < / p >','< p > Ã˜Â¹Ã˜Â²Ã™Å Ã˜Â²Ã™Å  Ã˜Â§Ã™â€žÃ˜Â¹Ã™â€¦Ã™Å Ã™â€ž Ã˜Å’ Ã™Å Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦ Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’. Ã˜Â§Ã™â€žÃ˜Â±Ã˜Â¬Ã˜Â§Ã˜Â¡ Ã˜Â§Ã™â€žÃ™â€ Ã™â€šÃ˜Â± Ã™ÂÃ™Ë†Ã™â€š \"Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦\" Ã™ÂÃ™Å  \"Ã˜Â·Ã™â€žÃ˜Â¨Ã˜Â§Ã˜ÂªÃ™Å \" Ã™â€žÃ™Æ’Ã˜Â³Ã˜Â¨ Ã™â€ Ã™â€šÃ˜Â§Ã˜Â· Ã˜Â´Ã™Å Ã™â€ . < / p >','1775650578',1,0,0,NULL,NULL,1,2,'[\"48577262045853\",\"48583174603421\"]','[\"C26040501874072\",\"M26040400050052\"]','https://en.imile.com/track/',2386,2.386,4.386,NULL,NULL),(133,50,'5',0.00,6,'101','GSH1XX64300MKNH',NULL,'JD','JDW101072587963','< p > Ã˜Â¹Ã˜Â²Ã™Å Ã˜Â²Ã™Å  Ã˜Â§Ã™â€žÃ˜Â¹Ã™â€¦Ã™Å Ã™â€ž Ã˜Å’ Ã™Å Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦ Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’. Ã˜Â§Ã™â€žÃ˜Â±Ã˜Â¬Ã˜Â§Ã˜Â¡ Ã˜Â§Ã™â€žÃ™â€ Ã™â€šÃ˜Â± Ã™ÂÃ™Ë†Ã™â€š \"Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦\" Ã™ÂÃ™Å  \"Ã˜Â·Ã™â€žÃ˜Â¨Ã˜Â§Ã˜ÂªÃ™Å \" Ã™â€žÃ™Æ’Ã˜Â³Ã˜Â¨ Ã™â€ Ã™â€šÃ˜Â§Ã˜Â· Ã˜Â´Ã™Å Ã™â€ . < / p >','< p > Ã˜Â¹Ã˜Â²Ã™Å Ã˜Â²Ã™Å  Ã˜Â§Ã™â€žÃ˜Â¹Ã™â€¦Ã™Å Ã™â€ž Ã˜Å’ Ã™Å Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦ Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’. Ã˜Â§Ã™â€žÃ˜Â±Ã˜Â¬Ã˜Â§Ã˜Â¡ Ã˜Â§Ã™â€žÃ™â€ Ã™â€šÃ˜Â± Ã™ÂÃ™Ë†Ã™â€š \"Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â³Ã™â€žÃ™Å Ã™â€¦\" Ã™ÂÃ™Å  \"Ã˜Â·Ã™â€žÃ˜Â¨Ã˜Â§Ã˜ÂªÃ™Å \" Ã™â€žÃ™Æ’Ã˜Â³Ã˜Â¨ Ã™â€ Ã™â€šÃ˜Â§Ã˜Â· Ã˜Â´Ã™Å Ã™â€ . < / p >','1776092655',1,0,0,NULL,NULL,1,2,'[\"AJA100012766008\",\"JDW101072587963\"]','[\"C26040500204914\",\"M26040500004319\"]','https://www.jingdonglogistics.com/Tracking',5931,5.931,7.931,NULL,NULL),(136,51,'1',0.00,6,'50','GSH1X730U0021R4',NULL,'JD','JDW101085336662','Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’ Ã™ÂÃ™Å  Ã˜Â§Ã™â€žÃ˜Â·Ã˜Â±Ã™Å Ã™â€š Ã˜Â¥Ã™â€žÃ™Å Ã™Æ’.','Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’ Ã™ÂÃ™Å  Ã˜Â§Ã™â€žÃ˜Â·Ã˜Â±Ã™Å Ã™â€š Ã˜Â¥Ã™â€žÃ™Å Ã™Æ’.','1776120712',0,0,0,NULL,NULL,0,1,'[\"JDW101085336662\"]','[\"M26040800006514\"]','https://www.jingdonglogistics.com/Tracking',7723,7.723,9.723,NULL,NULL),(137,51,'2',0.00,6,'990912','GSH1X731C0004DN',NULL,'J&T','JTE000915876775','Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’ Ã™ÂÃ™Å  Ã˜Â§Ã™â€žÃ˜Â·Ã˜Â±Ã™Å Ã™â€š Ã˜Â¥Ã™â€žÃ™Å Ã™Æ’.','Ã˜Â·Ã™â€žÃ˜Â¨Ã™Æ’ Ã™ÂÃ™Å  Ã˜Â§Ã™â€žÃ˜Â·Ã˜Â±Ã™Å Ã™â€š Ã˜Â¥Ã™â€žÃ™Å Ã™Æ’.','1776167519',0,0,0,NULL,NULL,0,1,'[\"JTE000915876775\"]','[\"M26040900005548\"]','https://www.jtexpress-sa.com/trajectoryQuery?waybillNo=[shippingNo]&type=0',3676,3.676,5.676,NULL,NULL),(138,51,'3',0.00,6,'50','GSH1X730C00MFW3',NULL,'IMILE','48628984924701','Ã£â‚¬Â Ã™â€¦Ã˜Â±Ã™Æ’Ã˜Â² Ã˜ÂªÃ™Ë†Ã˜Â²Ã™Å Ã˜Â¹ Ã˜Â§Ã™â€žÃ˜Â±Ã™Å Ã˜Â§Ã˜Â¶ Ã£â‚¬â€˜ Ã˜Â§Ã™â€žÃ˜Â·Ã˜Â±Ã™Ë†Ã˜Â¯ Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â´Ã˜Â­Ã™Ë†Ã™â€ Ã˜Â© Ã˜Â¥Ã™â€žÃ™â€° Ã£â‚¬Â RUH DS14 Ã£â‚¬â€˜.','Ã£â‚¬Â Ã™â€¦Ã˜Â±Ã™Æ’Ã˜Â² Ã˜ÂªÃ™Ë†Ã˜Â²Ã™Å Ã˜Â¹ Ã˜Â§Ã™â€žÃ˜Â±Ã™Å Ã˜Â§Ã˜Â¶ Ã£â‚¬â€˜ Ã˜Â§Ã™â€žÃ˜Â·Ã˜Â±Ã™Ë†Ã˜Â¯ Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â´Ã˜Â­Ã™Ë†Ã™â€ Ã˜Â© Ã˜Â¥Ã™â€žÃ™â€° Ã£â‚¬Â RUH DS14 Ã£â‚¬â€˜.','1776267461',0,0,0,NULL,NULL,0,1,'[\"48628984924701\"]','[\"M26040700039614\"]','https://en.imile.com/track/',1233,1.233,3.233,NULL,NULL),(140,52,'1',0.00,6,'990913','GSH1XG162001GWG',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XG162001GWG',8088,8.088,10.088,NULL,NULL),(141,52,'2',0.00,6,'990912','GSH1XG312000KXH',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XG312000KXH',12697,12.697,14.697,NULL,NULL),(142,52,'3',0.00,6,'990912','GSH1XG31U00MBUG',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XG31U00MBUG',3810,3.810,5.810,NULL,NULL),(144,53,'1',0.00,6,'990912','GSH1XJ311000UAE',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XJ311000UAE',12181,12.181,14.181,NULL,NULL),(145,53,'2',0.00,6,'990912','GSH1XJ312002CYC',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1XJ312002CYC',752,0.752,2.752,NULL,NULL),(146,53,'Test',0.00,6,'50','GSH1SU30W00NHM8',NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,NULL,NULL,0,0,'[]','[]','https://ar.shein.com/orders/track?billno=GSH1SU30W00NHM8',4421,4.421,6.421,NULL,NULL);
/*!40000 ALTER TABLE `order_carts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `order_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `order_details` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `amount_to_collect` decimal(10,2) NOT NULL DEFAULT '0.00',
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `month_id` (`month_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`),
  CONSTRAINT `orders_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,1,'dfgdfgd','3158',0.00,1),(8,1,'118','3500',0.00,1),(9,3,'1','42609',0.00,1),(10,4,'1','42609',0.00,1),(11,4,'2','1942',0.00,1),(12,2,'123123','123123',0.00,1),(13,5,'rewrte','1200',0.00,2),(14,5,'qweqwe','11111',0.00,2),(15,7,'48205','48205',0.00,1),(16,8,'130','1878',0.00,5),(17,8,'131','2343',0.00,5),(18,8,'132','1841',0.00,5),(19,8,'133','3017',0.00,5),(20,8,'134','1666',0.00,5),(21,8,'135','1013',0.00,5),(22,9,'136','1517',0.00,5),(23,9,'137','1394',0.00,5),(24,9,'138','1718',0.00,5),(25,9,'139','1884',0.00,5),(26,9,'140','1191',0.00,5),(27,10,'1','27035',0.00,5),(28,9,'141','2378',0.00,5),(29,9,'142','2248',0.00,5),(32,9,'143','2413',0.00,5),(33,9,'144','534',0.00,5),(34,11,'145','1512',0.00,5),(35,11,'146','1502',0.00,5),(36,11,'147','510',0.00,5),(37,11,'148','1796',0.00,5),(48,12,'141','2378',3203.00,6),(49,11,'149','1575',2164.00,5),(50,14,'154','1520',2212.00,6),(51,14,'155','391',496.00,6),(52,14,'156','780',1004.00,6),(53,14,'157','407',724.00,6);
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_customer_items`
--

DROP TABLE IF EXISTS `payment_customer_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_customer_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `payment_id` int NOT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name_snapshot` varchar(255) DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `order_name_snapshot` varchar(255) DEFAULT NULL,
  `cart_id` int DEFAULT NULL,
  `cart_order_number_snapshot` varchar(100) DEFAULT NULL,
  `delivery_method` enum('courier','self') DEFAULT NULL,
  `delivery_number` varchar(100) DEFAULT NULL,
  `base_amount` decimal(10,2) DEFAULT NULL,
  `delivery_adjustment` decimal(10,2) DEFAULT NULL,
  `final_amount` decimal(10,2) DEFAULT NULL,
  `collected_at` datetime DEFAULT NULL,
  `collection_key` varchar(128) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `delivery_charge` decimal(10,2) NOT NULL DEFAULT '0.00',
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_items_collection_key` (`user_id`,`collection_key`),
  KEY `idx_pci_payment_id` (`payment_id`),
  KEY `idx_pci_customer_id` (`customer_id`),
  KEY `idx_pci_user_id` (`user_id`)
) ENGINE=MyISAM AUTO_INCREMENT=20 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_customer_items`
--

LOCK TABLES `payment_customer_items` WRITE;
/*!40000 ALTER TABLE `payment_customer_items` DISABLE KEYS */;
INSERT INTO `payment_customer_items` VALUES (1,60,255,'tarek',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,145.00,0.00,6,'2026-02-21 23:13:11'),(2,61,255,'tarek',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,145.00,0.00,6,'2026-02-21 23:13:56'),(3,62,256,'saeed',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,140.00,0.00,6,'2026-02-21 23:21:29'),(4,64,254,'5',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,55.00,0.00,6,'2026-02-22 00:22:24'),(5,64,253,'2',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,2.00,0.00,6,'2026-02-22 00:22:24'),(6,65,258,'dd',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,359.00,4.00,6,'2026-02-22 00:39:40'),(7,65,257,'rr',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,259.00,8.00,6,'2026-02-22 00:39:40'),(8,68,260,'Omar waleed Al sayyed',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,121.00,4.00,6,'2026-02-22 19:34:24'),(9,68,270,'Maysoun .',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,42.00,4.00,6,'2026-02-22 19:34:24'),(10,69,267,'Sara Test Duplicate',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,150.00,0.00,6,'2026-02-22 19:38:26'),(11,69,271,'Maysoun .',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,42.00,0.00,6,'2026-02-22 19:38:26'),(12,70,261,'Daad Said',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,50.00,0.00,6,'2026-02-22 20:45:26'),(13,71,261,'Daad Said',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,150.00,0.00,6,'2026-02-22 20:45:45'),(19,80,14,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,123123.00,0.00,1,'2026-09-08 21:14:18'),(18,79,14,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,123123.00,0.00,1,'2026-09-08 21:13:41');
/*!40000 ALTER TABLE `payment_customer_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `month_id` int NOT NULL,
  `payment_type` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'manual',
  `payment_amount` decimal(10,2) DEFAULT NULL,
  `original_amount` decimal(10,2) DEFAULT NULL,
  `delivery_charge` decimal(10,2) NOT NULL DEFAULT '0.00',
  `customer_count` int NOT NULL DEFAULT '0',
  `customer_ids_json` longtext COLLATE utf8mb4_general_ci,
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `month_id` (`month_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`),
  CONSTRAINT `payments_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=81 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (2,1,'manual',1500.00,NULL,0.00,0,NULL,NULL,1),(3,1,'manual',2200.00,NULL,0.00,0,NULL,NULL,1),(4,3,'manual',24481.00,NULL,0.00,0,NULL,NULL,1),(6,1,'manual',150.00,NULL,0.00,0,NULL,NULL,1),(7,3,'manual',1500.00,NULL,0.00,0,NULL,NULL,1),(8,1,'manual',330.00,NULL,0.00,0,NULL,NULL,1),(9,4,'manual',24481.00,NULL,0.00,0,NULL,NULL,1),(10,4,'manual',2625.00,NULL,0.00,0,NULL,NULL,1),(11,4,'manual',758.00,NULL,0.00,0,NULL,NULL,1),(12,4,'manual',53.00,NULL,0.00,0,NULL,NULL,1),(13,1,'manual',99999999.99,NULL,0.00,0,NULL,NULL,1),(14,4,'manual',46360.00,NULL,0.00,0,NULL,NULL,1),(15,4,'manual',151.00,NULL,0.00,0,NULL,NULL,1),(16,2,'manual',12313.00,NULL,0.00,0,NULL,NULL,1),(21,6,'manual',123235.00,NULL,0.00,0,NULL,NULL,2),(22,5,'manual',1500.00,NULL,0.00,0,NULL,NULL,2),(23,7,'manual',50091.00,NULL,0.00,0,NULL,NULL,1),(24,7,'manual',79.00,NULL,0.00,0,NULL,NULL,1),(25,7,'manual',190.00,NULL,0.00,0,NULL,NULL,1),(26,7,'manual',4955.00,NULL,0.00,0,NULL,NULL,1),(27,8,'manual',130.00,NULL,0.00,0,NULL,NULL,5),(33,8,'manual',218.00,NULL,0.00,0,NULL,NULL,5),(34,8,'manual',182.00,NULL,0.00,0,NULL,NULL,5),(35,8,'manual',120.00,NULL,0.00,0,NULL,NULL,5),(36,8,'manual',24.00,NULL,0.00,0,NULL,NULL,5),(37,8,'manual',138.00,NULL,0.00,0,NULL,NULL,5),(38,8,'manual',259.00,NULL,0.00,0,NULL,NULL,5),(39,8,'manual',500.00,NULL,0.00,0,NULL,NULL,5),(40,8,'manual',480.00,NULL,0.00,0,NULL,NULL,5),(41,8,'manual',186.00,NULL,0.00,0,NULL,NULL,5),(42,8,'manual',10.00,NULL,0.00,0,NULL,NULL,5),(43,10,'manual',16033.00,NULL,0.00,0,NULL,NULL,5),(44,8,'manual',2394.00,NULL,0.00,0,NULL,NULL,5),(45,8,'manual',482.00,NULL,0.00,0,NULL,NULL,5),(46,8,'manual',99.00,NULL,0.00,0,NULL,NULL,5),(47,8,'manual',2869.00,NULL,0.00,0,NULL,NULL,5),(48,8,'manual',75.00,NULL,0.00,0,NULL,NULL,5),(49,8,'manual',2605.00,NULL,0.00,0,NULL,NULL,5),(50,8,'manual',2951.00,NULL,0.00,0,NULL,NULL,5),(51,8,'manual',67.00,NULL,0.00,0,NULL,NULL,5),(52,8,'manual',773.00,NULL,0.00,0,NULL,NULL,5),(53,8,'manual',476.00,NULL,0.00,0,NULL,NULL,5),(54,9,'manual',995.00,NULL,0.00,0,NULL,NULL,5),(55,10,'manual',601.00,NULL,0.00,0,NULL,NULL,5),(56,10,'manual',176.00,NULL,0.00,0,NULL,NULL,5),(57,10,'manual',4838.00,NULL,0.00,0,NULL,NULL,5),(58,10,'manual',930.00,NULL,0.00,0,NULL,NULL,5),(59,10,'manual',424.00,NULL,0.00,0,NULL,NULL,5),(60,12,'customers',141.00,145.00,4.00,1,'[255]','Customer payment',6),(61,12,'customers',141.00,145.00,4.00,1,'[255]','Customer payment',6),(62,12,'customers',136.00,140.00,4.00,1,'[256]','Customer payment',6),(63,12,'manual',250.00,NULL,0.00,0,NULL,NULL,6),(64,12,'customers',55.00,57.00,2.00,2,'[254,253]','Customer payment',6),(65,12,'customers',606.00,618.00,12.00,2,'[258,257]','Customer payment',6),(66,12,'manual',184.00,NULL,0.00,0,NULL,NULL,6),(67,12,'manual',760.00,NULL,0.00,0,NULL,NULL,6),(68,12,'manual',163.00,NULL,0.00,0,NULL,NULL,6),(69,12,'customers',192.00,192.00,0.00,2,'[267,271]','Customer payment (Delivery collection)',6),(70,12,'manual',50.00,NULL,0.00,1,'[261]','Debt payment from Daad Said',6),(71,12,'manual',150.00,NULL,0.00,1,'[261]','Debt payment from Daad Said',6),(74,11,'manual',123.00,NULL,0.00,0,NULL,NULL,5);
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shein_accounts`
--

DROP TABLE IF EXISTS `shein_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shein_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `api_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `shein_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `shein_password` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `shein_password_enc` text COLLATE utf8mb4_general_ci,
  `gmail_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_app_password` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cookies_json` longtext COLLATE utf8mb4_general_ci,
  `profile_key` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `gmail_app_password_enc` text COLLATE utf8mb4_general_ci,
  `storage_state_enc` mediumtext COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_shein_email` (`user_id`,`shein_email`),
  UNIQUE KEY `uq_shein_accounts_user_email` (`user_id`,`api_email`),
  KEY `idx_shein_user` (`user_id`),
  CONSTRAINT `shein_accounts_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shein_accounts`
--

LOCK TABLES `shein_accounts` WRITE;
/*!40000 ALTER TABLE `shein_accounts` DISABLE KEYS */;
-- Third-party credentials are intentionally redacted from this distributable dump.
INSERT INTO `shein_accounts` VALUES (2,6,'990912','crypto990912@gmail.com',NULL,NULL,'crypto990912@gmail.com',NULL,NULL,'Default',NULL,NULL,'2026-02-19 00:03:32','2026-08-09 16:16:07'),(7,6,'990913','crypto990913@gmail.com',NULL,NULL,'crypto990913@gmail.com',NULL,NULL,'Default',NULL,NULL,'2026-02-19 21:15:55','2026-08-09 16:15:28'),(12,5,'50','taswad50@gmail.com',NULL,NULL,'taswad50@gmail.com',NULL,NULL,NULL,NULL,NULL,'2026-03-29 02:50:54','2026-03-29 02:52:27'),(14,5,'990912','crypto990912@gmail.com',NULL,NULL,'crypto990912@gmail.com',NULL,NULL,NULL,NULL,NULL,'2026-03-29 11:15:18','2026-03-29 11:15:18'),(15,6,'50','taswad50@gmail.com',NULL,NULL,'taswad50@gmail.com',NULL,NULL,'Default',NULL,NULL,'2026-03-29 12:54:37','2026-08-09 16:13:25'),(17,6,'101','aswadt101@gmail.com',NULL,NULL,'aswadt101@gmail.com',NULL,NULL,'Default',NULL,NULL,'2026-04-04 00:42:34','2026-08-09 16:14:57'),(21,6,'12','aswadt12@gmail.com',NULL,NULL,'aswadt12@gmail.com',NULL,NULL,'Default',NULL,NULL,'2026-04-26 23:01:34','2026-08-09 16:14:13');
/*!40000 ALTER TABLE `shein_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shein_api_orders`
--

DROP TABLE IF EXISTS `shein_api_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shein_api_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `order_no` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `carrier` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tracking_no` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status_text` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `delivered` tinyint(1) DEFAULT '0',
  `last_details` text COLLATE utf8mb4_general_ci,
  `last_timestamp` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_order` (`user_id`,`order_no`),
  CONSTRAINT `fk_shein_api_orders_user` FOREIGN KEY (`user_id`) REFERENCES `shein_api_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shein_api_orders`
--

LOCK TABLES `shein_api_orders` WRITE;
/*!40000 ALTER TABLE `shein_api_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `shein_api_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shein_api_users`
--

DROP TABLE IF EXISTS `shein_api_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shein_api_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `owner_user_id` int DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_app_password_enc` text COLLATE utf8mb4_general_ci NOT NULL,
  `shein_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `shein_password_enc` text COLLATE utf8mb4_general_ci NOT NULL,
  `shein_storage_state_enc` text COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shein_owner_email` (`owner_user_id`,`email`),
  KEY `ix_shein_api_users_owner_user_id` (`owner_user_id`),
  KEY `ix_shein_api_users_email` (`email`),
  CONSTRAINT `fk_shein_api_users_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shein_api_users`
--

LOCK TABLES `shein_api_users` WRITE;
/*!40000 ALTER TABLE `shein_api_users` DISABLE KEYS */;
/*!40000 ALTER TABLE `shein_api_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shipment_receipts`
--

DROP TABLE IF EXISTS `shipment_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipment_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `month_id` int NOT NULL,
  `order_id` int NOT NULL,
  `cart_id` int NOT NULL,
  `shipment_group_key` varchar(512) COLLATE utf8mb4_general_ci NOT NULL,
  `tracking_no` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `receipt_status` enum('received') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'received',
  `received_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `received_by` int NOT NULL,
  `source` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'manual',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shipment_receipts_user_tracking` (`user_id`,`tracking_no`),
  KEY `idx_shipment_receipts_order` (`user_id`,`order_id`),
  KEY `idx_shipment_receipts_cart` (`user_id`,`cart_id`),
  KEY `idx_shipment_receipts_group` (`user_id`,`shipment_group_key`),
  KEY `fk_shipment_receipts_month` (`month_id`),
  CONSTRAINT `fk_shipment_receipts_month` FOREIGN KEY (`month_id`) REFERENCES `month` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_shipment_receipts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipment_receipts`
--

LOCK TABLES `shipment_receipts` WRITE;
/*!40000 ALTER TABLE `shipment_receipts` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipment_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_settings`
--

DROP TABLE IF EXISTS `user_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `kg_price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_settings_user` (`user_id`),
  CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_settings`
--

LOCK TABLES `user_settings` WRITE;
/*!40000 ALTER TABLE `user_settings` DISABLE KEYS */;
INSERT INTO `user_settings` VALUES (1,6,3.75,'2026-02-19 20:41:14','2026-04-04 00:33:06'),(4,5,6.95,'2026-03-29 02:57:28','2026-03-29 02:57:28');
/*!40000 ALTER TABLE `user_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `role` enum('admin','dashboard','operations') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'admin',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `owner_user_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `auth_version` int NOT NULL DEFAULT '0',
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `ix_users_owner_user_id` (`owner_user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` (id,username,password_hash,role,created_at,owner_user_id) VALUES (1,'admin','$2y$10$J0ndZxqGXFB3aUiTT6nbTuVPgnwhLbapPWz/ffFMpvhTCz1ILWxL6','admin','2025-12-23 02:25:25',NULL),(2,'admin2','$2y$10$JfULHsUY71aWUKuJ/3QqaOImj1kVsi1DEjDSk4jS6XQvJxr0w.QVW','admin','2025-12-23 03:58:44',NULL),(4,'Sum3ul','$2y$10$95lfi0vBXAu9AVolwKo/n.p.dUzH9wLQsuCdS1cW8IxwIQBsh.3j.','admin','2026-01-14 01:29:54',NULL),(5,'Tarek','$2y$10$zVJ860IgtDw1fop45TGvbOP6VwmcQzqrK0uiJbjxJTiCZNBS/Je7O','admin','2026-01-14 01:36:31',NULL),(6,'Hammadd','$2y$10$GFcrQTmxRhdxNXBD.9I3pOZT/Kx66brklZaUwlA5hRw.DBgjCBKXa','admin','2026-01-14 19:55:52',NULL),(8,'Tarek9099','$2y$10$zXJEUMQtZuqCPOFChRaP/uufp4K4sPrJv4wL8qSImCtkAhJ97d72O','admin','2026-03-29 03:00:42',NULL),(9,'dashboard_demo_1','$2a$10$CTirYvWumwd9zJT3BVTxuuKllgl.v.bwzlHgs6Z1342hB7iHic8oe','dashboard','2026-09-09 00:00:00',1),(10,'dashboard_demo_2','$2a$10$dZy6ntjV8f/KhmDvvHA9iul4RsOCNBjz/hZ0comNQ5Ym5lEJ3hqIy','dashboard','2026-09-09 00:00:00',1),(11,'operations_demo_1','$2a$10$HSWQhjPtUdzkZGtGrNm8Z.WfmlaUwBYXPcp3WVINYQxw04VORHnJK','operations','2026-09-09 00:00:00',1),(12,'operations_demo_2','$2a$10$3pCG7t5nX/S3.f8JzooRMOQYnQOj.Zc5lb3o4anOMblGgrNrQDmhG','operations','2026-09-09 00:00:00',1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'shein'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-09 12:50:42
