-- 001_add_missing_schema.sql
--
-- Adds the tables and columns that the API code (PHP and the Node.js port) reads and writes but that do not
-- exist in the database (gmcl.sql and the local database). Without them those endpoints answer with a
-- "Database Error" page (HTTP 500), e.g. user/face_authotication: Unknown column 'is_face_authentication'.
--
-- No definitions exist anywhere in the project, so every type below is inferred from how the code uses the
-- column: validation rules (max_length), the values written (e.g. '0'/'1' flags, random_string lengths) and the
-- matching columns of existing tables (wl_customers, wl_reasons, wl_cities...).
--
-- Safe to run on live data: only CREATE TABLE IF NOT EXISTS and ADD COLUMN (no existing column or row changes).
-- MySQL 5.6+ compatible. Run once (ADD COLUMN fails if the column already exists). Undo: 001_add_missing_schema.down.sql

SET NAMES utf8;

/* ------------------------------------------------------------------ new tables */

-- Referrals: member/refer_friend inserts, user/checkreferral reads.
CREATE TABLE IF NOT EXISTS `wl_referral_customers` (
  `refer_id` int(11) NOT NULL AUTO_INCREMENT,
  `posted_user` varchar(80) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT 'referring customer email',
  `posted_name` varchar(100) COLLATE utf8_unicode_ci DEFAULT NULL,
  `refer_user` varchar(80) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT 'referred friend email',
  `refer_name` varchar(100) COLLATE utf8_unicode_ci DEFAULT NULL,
  `refer_mobile` varchar(32) COLLATE utf8_unicode_ci DEFAULT NULL,
  `poster_id` int(11) NOT NULL DEFAULT '0',
  `referral_code` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL,
  `is_approved` enum('0','1') COLLATE utf8_unicode_ci NOT NULL DEFAULT '0',
  `refer_date` datetime DEFAULT NULL,
  PRIMARY KEY (`refer_id`),
  KEY `idx_refer_user` (`refer_user`),
  KEY `idx_poster_id` (`poster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Push registration: member/device_registration.
CREATE TABLE IF NOT EXISTS `wl_device_registration` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device_id` varchar(250) COLLATE utf8_unicode_ci DEFAULT NULL,
  `app_id` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  `receive_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_app_id` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Per-language admin details joined to tbl_admin by the invoice / admin_details endpoints.
CREATE TABLE IF NOT EXISTS `tbl_admin_lang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL DEFAULT '1',
  `language_id` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `company_name` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_language_id` (`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Delivery time slots: pages/get_slots.
CREATE TABLE IF NOT EXISTS `wl_slots` (
  `slot_id` int(11) NOT NULL AUTO_INCREMENT,
  `status` enum('0','1','2') COLLATE utf8_unicode_ci NOT NULL DEFAULT '1' COMMENT '0=Inactive,1=Active,2=Delete',
  PRIMARY KEY (`slot_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

CREATE TABLE IF NOT EXISTS `wl_slots_lang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slot_id` int(11) NOT NULL,
  `language_id` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `slot_name` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_slot_language` (`slot_id`, `language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Localities (areas): pages/get_locations, cart/check_area. The API joins on location_id; the SitePanel
-- location screens (Location.php) address rows by `id` — kept as an extra column for that code.
CREATE TABLE IF NOT EXISTS `wl_localities` (
  `location_id` int(11) NOT NULL AUTO_INCREMENT,
  `id` int(11) DEFAULT NULL,
  `title` varchar(100) COLLATE utf8_unicode_ci DEFAULT NULL,
  `country_id` int(11) NOT NULL DEFAULT '0',
  `state_id` int(11) NOT NULL DEFAULT '0',
  `city_id` int(11) NOT NULL DEFAULT '0',
  `status` enum('0','1','2') COLLATE utf8_unicode_ci NOT NULL DEFAULT '1' COMMENT '0=Inactive,1=Active,2=Delete',
  PRIMARY KEY (`location_id`),
  KEY `idx_city_id` (`city_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

CREATE TABLE IF NOT EXISTS `wl_localities_lang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `location_id` int(11) NOT NULL,
  `language_id` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `title` varchar(100) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_location_language` (`location_id`, `language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Per-language names joined by user/country, member return reasons, pages/reason, pages/search_list.
CREATE TABLE IF NOT EXISTS `wl_countries_lang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `country_id` int(11) NOT NULL,
  `language_id` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `country_name` varchar(64) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_country_language` (`country_id`, `language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

CREATE TABLE IF NOT EXISTS `wl_reasons_lang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reason_id` int(11) NOT NULL,
  `language_id` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `reason_name` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reason_language` (`reason_id`, `language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

CREATE TABLE IF NOT EXISTS `wl_categories_lang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `language_id` varchar(10) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `category_name` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_category_language` (`category_id`, `language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Per-device API keys: pages/update_keys.
CREATE TABLE IF NOT EXISTS `api_access` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device_id` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  `accesskey` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Spam words read by MY_Controller::fetch_spamwords().
CREATE TABLE IF NOT EXISTS `tbl_spam_words` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `words` varchar(255) COLLATE utf8_unicode_ci NOT NULL,
  `status` enum('0','1') COLLATE utf8_unicode_ci NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Delivery agents: user/transporter_login, user/transporter_forgotten_password (login columns mirror wl_customers).
CREATE TABLE IF NOT EXISTS `wl_transporters` (
  `transporter_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(80) COLLATE utf8_unicode_ci NOT NULL,
  `password` varchar(100) COLLATE utf8_unicode_ci NOT NULL,
  `first_name` varchar(32) COLLATE utf8_unicode_ci DEFAULT NULL,
  `last_name` varchar(32) COLLATE utf8_unicode_ci DEFAULT NULL,
  `mobile_number` varchar(32) COLLATE utf8_unicode_ci DEFAULT NULL,
  `avatar` varchar(80) COLLATE utf8_unicode_ci DEFAULT NULL,
  `area` int(11) DEFAULT NULL,
  `citye` int(11) DEFAULT NULL,
  `is_blocked` enum('0','1') COLLATE utf8_unicode_ci NOT NULL DEFAULT '0',
  `block_time` datetime DEFAULT NULL,
  `last_login_date` datetime DEFAULT NULL,
  `current_login` datetime DEFAULT NULL,
  `status` enum('0','1','2') COLLATE utf8_unicode_ci NOT NULL DEFAULT '1' COMMENT '0=Inactive,1=Active,2=Deleted',
  `is_online` enum('0','1') COLLATE utf8_unicode_ci NOT NULL DEFAULT '0',
  `app_id` text COLLATE utf8_unicode_ci,
  `app_type` text COLLATE utf8_unicode_ci,
  `device_id` text COLLATE utf8_unicode_ci,
  PRIMARY KEY (`transporter_id`),
  KEY `idx_user_name` (`user_name`),
  KEY `idx_mobile_number` (`mobile_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- Chosen delivery date/time of the current cart: cart/set_delivery.
CREATE TABLE IF NOT EXISTS `tbl_temp_delivery` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `app_id` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  `app_type` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL,
  `user_id` int(11) NOT NULL DEFAULT '0',
  `delivery_date` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `delivery_time` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_app_id` (`app_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

/* --------------------------------------------------------- new columns */

-- user/face_authotication, member/face_authotication; user OTP flows; guest registration.
ALTER TABLE `wl_customers`
  ADD COLUMN `is_face_authentication` enum('0','1') COLLATE utf8_unicode_ci NOT NULL DEFAULT '0',
  ADD COLUMN `verify_code` varchar(10) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT 'mobile OTP',
  ADD COLUMN `referral_code` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL;

-- member/add_address, member/edit_address (lengths from their validation rules).
ALTER TABLE `wl_customers_address_book`
  ADD COLUMN `longitude` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `latitude` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `atype` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT 'address type label',
  ADD COLUMN `street` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `block` varchar(20) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `house_no` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `floor_no` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `building` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  ADD COLUMN `area` varchar(250) COLLATE utf8_unicode_ci DEFAULT NULL;

-- member/cancel_order, member/return_product, member/return_order.
ALTER TABLE `wl_orders_products`
  ADD COLUMN `reason_comment` text COLLATE utf8_unicode_ci,
  ADD COLUMN `request_date` datetime DEFAULT NULL;

-- cart/deliveryinfo for guest users (login_type 1).
ALTER TABLE `tbl_temp_delivery_address`
  ADD COLUMN `city_id` int(11) DEFAULT NULL;

-- member/count_notificationssss, member/notification.
ALTER TABLE `wl_notifications`
  ADD COLUMN `notification_id` int(11) NOT NULL DEFAULT '0',
  ADD COLUMN `read_status` enum('0','1') NOT NULL DEFAULT '0',
  ADD COLUMN `customer_id` int(11) NOT NULL DEFAULT '0';
