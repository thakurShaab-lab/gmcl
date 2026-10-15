-- Reverts 001_add_missing_schema.sql (drops ONLY what it added, including any data stored in it since).

ALTER TABLE `wl_notifications` DROP COLUMN `notification_id`, DROP COLUMN `read_status`, DROP COLUMN `customer_id`;
ALTER TABLE `tbl_temp_delivery_address` DROP COLUMN `city_id`;
ALTER TABLE `wl_orders_products` DROP COLUMN `reason_comment`, DROP COLUMN `request_date`;
ALTER TABLE `wl_customers_address_book`
  DROP COLUMN `longitude`, DROP COLUMN `latitude`, DROP COLUMN `atype`, DROP COLUMN `street`, DROP COLUMN `block`,
  DROP COLUMN `house_no`, DROP COLUMN `floor_no`, DROP COLUMN `building`, DROP COLUMN `area`;
ALTER TABLE `wl_customers` DROP COLUMN `is_face_authentication`, DROP COLUMN `verify_code`, DROP COLUMN `referral_code`;

DROP TABLE IF EXISTS `tbl_temp_delivery`, `wl_transporters`, `tbl_spam_words`, `api_access`, `wl_categories_lang`,
  `wl_reasons_lang`, `wl_countries_lang`, `wl_localities_lang`, `wl_localities`, `wl_slots_lang`, `wl_slots`,
  `tbl_admin_lang`, `wl_device_registration`, `wl_referral_customers`;
