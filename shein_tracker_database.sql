-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: shein_tracker
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
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `order_no` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `carrier` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tracking_no` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status_text` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `delivered` tinyint(1) DEFAULT '0',
  `last_details` text COLLATE utf8mb4_general_ci,
  `last_timestamp` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_order` (`user_id`,`order_no`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (3,1,'GSH15A31300NR2U','IMILE','6020526552225','عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.',1,'عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.','1770635633','2026-02-15 21:38:49'),(4,1,'GSH15A31300NRGX','J&T','JTE300414875969','عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.',1,'عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.','1770974898','2026-02-15 21:38:54'),(7,1,'GSH15831400MP8D','IMILE','6020326306428','عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.',1,'عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.','1770457489','2026-02-15 21:39:00'),(8,1,'GSH158314000JFW','IMILE','6020426130563','عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.',1,'عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.','1770286989','2026-02-15 21:39:06'),(9,1,'GSH15831400MPFP','IMILE','6020426130563','عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.',1,'عزيزي العميل ، يتم تسليم طلبك. الرجاء النقر فوق \"تأكيد التسليم\" في \"طلباتي\" لكسب نقاط شين.','1770286989','2026-02-15 21:39:11'),(10,1,'GSH16031200MR79',NULL,NULL,NULL,0,NULL,NULL,'2026-02-15 20:59:17'),(11,1,'GSH15V317001BM8','IMILE','6021626571618','تم شحن الطلب',0,'تم شحن الطلب','1771194867','2026-02-15 23:42:10'),(12,1,'GSH15J31W000BH4',NULL,NULL,NULL,0,NULL,NULL,'2026-02-15 21:42:03'),(13,4,'GSH1603140000X1',NULL,NULL,NULL,0,NULL,NULL,'2026-02-16 01:06:53'),(14,4,'GSH160314000MXL',NULL,NULL,NULL,0,NULL,NULL,'2026-02-16 01:13:35'),(15,4,'GSH16031400280T',NULL,NULL,NULL,0,NULL,NULL,'2026-02-16 01:21:16'),(16,4,'GSH16031400NQN3',NULL,NULL,NULL,0,NULL,NULL,'2026-02-16 01:24:44'),(17,4,'GSH16N31C000FSJ',NULL,NULL,NULL,0,NULL,NULL,'2026-02-17 22:50:51'),(18,4,'GSH16N31W00M1HC',NULL,NULL,NULL,0,NULL,NULL,'2026-02-17 23:00:58'),(19,4,'GSH16N31W00N3MH',NULL,NULL,NULL,0,NULL,NULL,'2026-02-17 23:06:01'),(20,4,'GSH16N31W00M2SY',NULL,NULL,NULL,0,NULL,NULL,'2026-02-17 23:08:01'),(21,5,'GSH16M01C00MPFX',NULL,NULL,NULL,0,NULL,NULL,'2026-02-18 20:43:51'),(22,6,'GSH16M01C00MPFX',NULL,NULL,NULL,0,NULL,NULL,'2026-02-18 20:59:11'),(23,8,'GSH15F31T001TA6',NULL,NULL,NULL,0,NULL,NULL,'2026-02-18 22:27:31'),(24,4,'GSH15F31T001TA6',NULL,NULL,NULL,0,NULL,NULL,'2026-02-18 22:28:01');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
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
  `shein_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `shein_password_enc` text COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_app_password_enc` text COLLATE utf8mb4_general_ci NOT NULL,
  `storage_state_enc` text COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_shein_email` (`user_id`,`shein_email`),
  CONSTRAINT `shein_accounts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shein_accounts`
--

LOCK TABLES `shein_accounts` WRITE;
/*!40000 ALTER TABLE `shein_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `shein_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gmail_app_password_enc` text COLLATE utf8mb4_general_ci NOT NULL,
  `shein_email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `shein_password_enc` text COLLATE utf8mb4_general_ci NOT NULL,
  `shein_storage_state_enc` mediumtext COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'crypto990912@gmail.com','crypto990912@gmail.com','gAAAAABpkmQZsDiaMs73E3SyFbzKsOZG2TSSsxUp_0yVNLbh_Bfd3cDpyVgH_8WzSxZwGC-IyBO5T4JD0SXZVsCeNPguZZY0VIBKClfClDWWmVEgMbaTqsk=','crypto990912@gmail.com','gAAAAABpkmQZgsN6DQ7Doyy1BBHAZW5oHH8qL9FtyVGTifugoYtRZEgWK-iQOn8YkYCalqt3TZSEhBBhBV6oOOquMFnXzdC13Q==',NULL,'2026-02-15 01:13:23'),(2,'22','aswadt101@gmail.com','gAAAAABpkmjxVfCmba9P3LBIZYOg5_1cb2j6nguKiBuJrf09y0NvLhKhqBXxCJXwdlwMTUftOcciA9dCrShk3QSLMIMAEqdMYu7HfOAKJM1Z3Bvjtm7FdWA=','aswadt101@gmail.com','gAAAAABpkmjxt-nDrwvfmD1b8t3KDs_8Dq0PgFr1tCPmihDKO0ENByDij8Q7h56tnKPseBQD3dIkKUUvhfyguuUU8_dJ__QkAA==',NULL,'2026-02-16 00:46:41'),(3,'666','aswadt101@gmail.com','gAAAAABpkmkVqP-jNb3U2_Js45QGftbzzIQZEWMGrjgvJ6hTYt4rcAM5vYdNb8gNUxqHMirwbgGOphbDSyJ1dYZoq7OKXr3wKg==','aswadt101@gmail.com','gAAAAABpkmkV0Vqa3BXbGEyCNweT-2oSkeD6Mo9MDe-4P8V9rC8BftQYSGZ4-7wMkk8YznbUFh-WWtclliLZtNPqKEB8DvmmwA==',NULL,'2026-02-16 00:47:17'),(4,'Acc1','crypto990912@gmail.com','gAAAAABpkm2p80G7gYSfhGc4RkX6t1UGdO0cKzirldp8F8zFuLv1MdSTy2ujDzfof9c1FXsEsbkOYa1Vdzm4c0HuInz3sAxYoTGHC2mJG5bosf785gs76Ro=','crypto990912@gmail.com','gAAAAABpkm2pfM7dBARZ6CM6P19mjg5X28Ro8x8_G3JVIimY0gQQGXthGTnrM5I-0Bu9y0NzhR_-Aj99Xv9nvkkAYcyXY5z8Gw==',NULL,'2026-02-16 01:06:49'),(5,'Acc2','Mohammedalty2004@gmail','gAAAAABpliR94hTpmgsJnovHtD7b7g6EWTbteTt6Mlr0gDoyoXGkykxoHrlFefeCHX7pYuTzmxD2yYb5_-Wlr9fDNQKDSx8MXLhHItq5wvOa8qN8QYXAM98=','Mohammedalty2004@gmail','gAAAAABpliR92kiW1aNzp4nB6WQfVabLnVtlSIUAazrFXMUdKJ3k5ukZH_F4SDcCEAvOSqQFgW0-DPAi9XffRyiHmEalw8l06A==',NULL,'2026-02-18 20:43:41'),(6,'acc3','mohammedalty2004@gmail.com','gAAAAABpligb9ZRNUM9vv9_eVBtiSpLBtFfzRxZX0rM230TPczwURDBmvshZUTjCntDW4leQKI6ouwWv1A57o6j2se36lwetGeo_imWVDjWI1Ss7vuwZooA=','mohammedalty2004@gmail.com','gAAAAABpligbdxBJRCD7SmiG9w7CLdIH1DKKuH2XBeqR_UKNcEu8GYzf0TXWMN8EiW_WRJqjWKKS-TPZ_BmHldxhjNH4ZyXf5Q==',NULL,'2026-02-18 20:59:07'),(7,'990912','crypto990912@gmail.com','gAAAAABpljcaVuqVcDgJoviM0eZDV7bAScKWK7dbEERJaOxzy_kUAh4CngfO39d1Dy1xM8guHhZKFjS5PbLKCfW2iB5KkzsDofFzDMvZD1vh24eXngc6Bwo=','crypto990912@gmail.com','gAAAAABpljcagX3Yhs5Uy5wD8mC2JkrEiDiO3IOehajFDyNnwk82kvg2xIYHL7b7lg9hr76PZZR1YFBqUiGDjjxOXSlvYDrj7w==',NULL,'2026-02-18 22:03:06'),(8,'9909122222','aswadt12@gmail.com','gAAAAABplkAlli9nkxGdC6mz_oms1CSugnrGEL5ibINqBMTOZnLNkmwOjFk-MGt-NnCPhsLstNxM10WQIL2Wk2UigjRdxcdlfg==','aswadt12@gmail.com','gAAAAABplkAlye-CRf8s7-QX0QOShudFq6OSdEey5YNfcsjmdfASyaYnDWjUz7QAFk7JMInXOt2NtkF_4T8AU0lJZdDqrDbCog==',NULL,'2026-02-18 22:16:59'),(9,'9909122222555','aswadt12@gmail.com','gAAAAABplkA7pK1J2uL-SsEt1WC96zoI9FN-tk02nsiiwlLlk0C5uZVdPpZLqcMrk6ofKLk2Eq8waMbFvBTgsocq3FwP-yKSbQ==','aswadt12@gmail.com','gAAAAABplkA7PQcCK-Rvarps6hCh86XZec26J9MiruXRHqlMmNFrHUxgBXNdBEVWb5McF91iHze1juSc6Zg3LY0ogADX2eBX8w==',NULL,'2026-02-18 22:42:03');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'shein_tracker'
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
