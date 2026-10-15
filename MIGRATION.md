# GMCL API — PHP (CodeIgniter) → Node.js (Express + Drizzle) migration

This service replaces the mobile API of the PHP project (`gmcl_php/modules/api`, CodeIgniter 3.0.0 HMVC).
Every non-SitePanel API endpoint is migrated with the same URL, request parameters, database reads/writes and
response bytes. HTML pages and the SitePanel are intentionally not part of it.

## Running

```bash
npm install
npm start            # node server.js — listens on PORT from .env (3001)
npm run dev          # restart on file changes
```

The existing `.env` is used unchanged (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`).
Optional settings are listed in `.env.example`:

| Variable | Default | Purpose |
|---|---|---|
| `APP_TIMEZONE` | `Asia/Kolkata` | Timezone used for PHP `date()` values (order dates, tokens, etc.). Production PHP used Asia/Kolkata. |
| `APP_BASE_URL` | `http(s)://<Host header>/` | `base_url()` used in image paths and links. Set it (ending in `/`) if the API sits behind a proxy or sub-path. |
| `UPLOAD_DIR` | `./uploaded_files` | PHP's `UPLOAD_DIR`: product/category images, `thumb_cache`, uploaded customer photos and testimonials. Point it at the existing `uploaded_files` folder. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS` | sendmail | SMTP for the mails PHP sent with `mail()`; without `MAIL_HOST` the local `sendmail` binary is used, like PHP. |
| `PHP_DOCROOT` | `/home/gmcljain/public_html/` | Path shown in reproduced PHP error messages. |
| `DB_POOL_SIZE` | `10` | MySQL connection pool size. |

The server also serves `/uploaded_files/*` (product images, thumbnails) and `/assets/developers/images/*`
(the no-image placeholder), which Apache served for the PHP API.

## Testing with Postman

`postman/GMCL_API.postman_collection.json` has a request for every migrated endpoint (237 requests in 9 folders),
and `postman/GMCL_API.local.postman_environment.json` holds the local settings (`baseUrl`, API key, test login).

- **In Postman:** import both files, select the "GMCL API - local" environment, then run the collection (or run
  "1. User → login" first when sending requests by hand; it stores `{{token}}` for the Member and Cart folders).
- **From the command line:** `npm run test:api` (add `-- --env-var baseUrl=http://host:port` for another server).
- The tests check each response's HTTP status and `success` value against what the PHP API returned for the
  same request on a database with `migrations/001_add_missing_schema.sql` applied (run the migration first). The
  collection passed every assertion against both the PHP API and this Node API, and can be run repeatedly. It writes to the database: it registers a throwaway user (deleted again by the last folder),
  places a COD order, adds/edits addresses, and posts reviews, testimonials and enquiries. Use a test database.
- **Registering your own user (`1. User → register`):** set the variables `newEmail`, `newMobile` (10 digits)
  and `newPassword` (at least 6 characters with a number and a symbol, e.g. `Sanjeev@123`) in the environment or
  the collection, then send `register`. Your values are used as they are. If `newEmail`/`newMobile` are empty,
  the request generates a unique `postman<timestamp>@example.com` and a random mobile, so collection runs never
  collide. The "Run last" folder deletes only that auto-generated account; it skips an account you registered
  with your own email.
- Upload requests (`member/update_image`, `pages/post_testimonial`, `user/face_authotication`) have their file
  field disabled; pick an image in Postman to test the upload.

## Project structure

```
app.js / server.js     Express app and HTTP server
config/                env, database (mysql2 pool + Drizzle per request), PHP config items and language lines
schema/                Drizzle schema of all 68 tables (generated from gmcl.sql; names/types/defaults/indexes as in MySQL)
routes/                one router per PHP controller; routes/index.js mounts them under /api
middleware/            request context (CodeIgniter's $this), Api_Controller auth, member guard, error handler
controller/            request handling and response building, one file per PHP controller (Cart is split in two)
model/                 all SQL (Drizzle query builder / sql templates), ports of the PHP models and DB helpers
utils/                 PHP/CodeIgniter compatibility: json encoder, form validation, xss_clean, input, uploads, mail…
assets/                noimg1.gif placeholder used by get_image()
```

## How compatibility is achieved

The goal was byte-for-byte identical responses, so the CodeIgniter behaviours that clients can observe were
ported rather than approximated:

- **PHP version.** Production ran **PHP 5.6** (`.htaccess`: cPanel `ea-php56`; `Cart.php` cannot even load on
  PHP 7). Its semantics are reproduced: 14-digit float output, `(int)"1e3" === 1`, "Missing argument" warnings
  instead of errors, PHP 5 fatal-error output.
- **Response encoding.** `my_json_encode()` is ported exactly (`utils/phpJson.js`). NULLs inside arrays become `""`
  (but not inside objects), non-ASCII text becomes `&#NNNN;` entities, `JSON_HEX_AMP`, escaped slashes, and
  `strip_tags()` over the whole JSON text. Every response keeps the leading space the PHP API printed (a stray
  space after `?>` in the api module config), plus the same CORS / Cache-Control / Pragma / Expires headers.
- **Types.** mysqli returned every column as a string; the connection is configured to do the same, so IDs,
  prices and counts keep their PHP types (`"5"` vs `5`, `"100.00"`).
- **Requests.** `$_POST`/`$_GET`/`$_FILES` are rebuilt with PHP's rules: only urlencoded/multipart POST bodies,
  `a[]` arrays, last duplicate wins, CI's invisible-character stripping. `get_post()` reads GET first (CI 3.0.0).
  Every route accepts any HTTP verb and extra trailing segments, like CodeIgniter.
- **Validation.** CodeIgniter 3.0.0 `Form_validation` + the app's `MY_Form_validation` (`utils/formValidation.js`):
  same rules, the same message lookup, trimming written back to POST, rules ignored on non-POST requests.
- **Security filters.** `xss_clean()` (CI 3.0.0 + `MY_Security`) and the `Safe_encrypt` password encoding are
  ported. Both were verified against PHP output.
- **Authentication.** `Api_Controller`: the `Authorization` header must be an active token in `wl_apl_tokens` or the
  static API key; Member and Transporter also require a token user. Same error JSON as PHP.
- **Errors.** Where PHP failed (missing model/helper files, undefined functions, SQL errors with `db_debug` on,
  missing tables/columns in the database), Node fails the same way with the same status, error number/message
  and the CodeIgniter error page, after the same database side effects.
- **SQL.** Queries are ported one-to-one (same tables, joins, conditions, ordering, `SQL_CALC_FOUND_ROWS` on the
  same connection). Request values are **bound parameters**; PHP pasted them into the SQL text. Normal input
  behaves identically; input containing quotes, which broke PHP's SQL, no longer causes SQL errors (and no
  longer allows SQL injection).

## Verification

A PHP 5.6 reference server ran the original code against a copy of the database (`gmcl.sql`). Each endpoint was
called on both servers with the same request, and the status, headers, body bytes and affected table rows were
compared, with the database reset before each write test.

| Controller | Cases | Identical | Remaining differences (all expected) |
|---|---|---|---|
| Category | 5 | 5 | — |
| Transporter + Payment | 12 | 12 | — |
| Inherited MY_Controller methods (all controllers) | 10 | 10 | — |
| User | 126 | 113 | 13: the random login token generated on each call |
| Member (+33 fixture cases with the missing tables/columns added) | 181 + 33 | 181 + 33 | — |
| Pages | 139 | 139 | — |
| Products | 160 | 152 | 4: `ORDER BY RAND()` related products; 4: MySQL syntax-error text quotes CI's backtick-quoted SQL for invalid `amount` filters |
| Cart (basket) | 141 | 140 | 1: `checkshipping_apply`, an excluded HTML test form |
| Cart (checkout) | 88 | 88 | — |

The comparison treats these as equal: timestamps written during the call (they differ by the seconds between the
two calls) and, on database-error pages, the PHP file/line and exact SQL formatting lines (the status, error
number and MySQL message must match).

Not verifiable locally: success paths whose tables/columns are missing from `gmcl.sql` (covered for Member with
fixtures), push-notification delivery (FCM's legacy API), real mail delivery, and thumbnails of real product
images (no product images were provided; generation is implemented with the same sizing rules).

## Excluded from the migration

| PHP | Reason |
|---|---|
| `modules/sitepanel/*` (all SitePanel controllers, models, views, `seo/create_seo_url` used by SitePanel JS) | SitePanel — excluded by requirement |
| Website modules: `pages`, `products`, `category`, `cart`, `members`, `users`, `blogs`, `blog_categories`, `brand`, `broucher`, `faq`, `gallery`, `image_gallery`, `video_gallery`, `news`, `testimonials`, `home`, `payment`, `captcha`, `seo` (sitemap/rss), `apps/controllers/*` | HTML pages / views (their AJAX branches also return rendered HTML) — excluded by requirement |
| `api/parameter`, `api/parameters` | API documentation HTML pages (views) — answered with 404 |
| `api/cart/checkshipping_apply` | Developer HTML test form — not registered |
| `api/controllers/Pages1-1-2021.php`, `Products20-01-2023.php` | Backup files; not routable in CodeIgniter |

Unknown methods on an API controller answer like PHP did (the api module's empty `error_404`, after the
credential check); unknown controllers under `/api` answer `UnderConstruction`.

## Things to know before switching over

- **Database gaps → run the migration.** The code (PHP and Node alike) uses 14 tables and 17 columns that do not
  exist in `gmcl.sql` (e.g. `wl_customers.is_face_authentication`, `verify_code`, `wl_referral_customers`,
  `wl_device_registration`, `tbl_admin_lang`, `wl_slots`, `wl_localities`, address-book columns). Without them those
  endpoints answer a "Database Error" page (HTTP 500), e.g. `user/face_authotication`:
  *Unknown column 'is_face_authentication'*. Apply `migrations/001_add_missing_schema.sql` to every database the
  API uses (`mysql -u <user> -p <db> < migrations/001_add_missing_schema.sql`). It only creates tables and adds
  columns (no existing data changes); `001_add_missing_schema.down.sql` reverts it. The column types are inferred
  from how the code uses them (validation lengths, values written, matching columns in existing tables), because
  no definition exists anywhere in the project — review them before running it on production. The Drizzle schema
  (`schema/`) includes these tables/columns. Verified: with the migration applied, PHP 5.6 and Node answer every
  endpoint the same way, and the database errors are gone.
- **Broken in PHP, reproduced as is:** all `/api/transporter/*` (missing `transporter_model`), all `/api/payment/*`
  (missing `payment/knet` helper), and calls to functions that exist nowhere in the project (`SMSSend`,
  `invoice_data`, `get_total_earn_amount`, `get_product_stock_price`). Fixing these would change the API contract,
  so it was left for a deliberate decision.
- **Sessions.** The PHP API also started a PHP session (`PHPSESSID` cookie) on each request, and login stored the
  user in it. Node keeps no session between requests. This only differs for clients that send that cookie back
  (browsers, Postman, possibly iOS's default cookie handling): there PHP sometimes used the *session* user instead
  of the token user — e.g. the `wish_count` of `cart/add_to_wishlist` counts the wishlist of whoever last logged
  in on that cookie. Clients that do not store cookies (typical Android HTTP clients) see identical results.
- **Mail** is sent asynchronously (the response never depended on it); push notifications are sent before the
  response, like PHP.

## Endpoint inventory (PHP API → Node.js route → HTTP method → controller → model → status)

"ALL" = any HTTP verb, as CodeIgniter accepted (methods that check `REQUEST_METHOD` themselves say so).
Every route is under the `Api_Controller` credential check except `/api/payment/*` (Public_Controller in PHP).

### Cart.php → `/api/cart`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Cart::index (no segment)` | `/api/cart` | ALL | `cart.index` | `cart.model.couponRow`, `cart.model.shippingRow`, `cart.model.cartRowsWithSubtotal`, `cart.model.cartTotalRow`, `common.model.getDbFieldValue`, `cart.model.getShippingRate`, `cart.model.deleteShippingUserOrApp`, `cart.model.deleteShipping`, `cart.model.insertShipping`, `cart.model.getDiscount`, `cart.model.canUseCoupon`, `cart.model.shippingRowByUser`, `cart.model.insertCoupon`, `cart.model.deleteCoupon`, `cart.model.deleteCouponMisspelled` | Migrated ✔ |
| `Cart::index` | `/api/cart/index` | ALL | `cart.index` | `cart.model.couponRow`, `cart.model.shippingRow`, `cart.model.cartRowsWithSubtotal`, `cart.model.cartTotalRow`, `common.model.getDbFieldValue`, `cart.model.getShippingRate`, `cart.model.deleteShippingUserOrApp`, `cart.model.deleteShipping`, `cart.model.insertShipping`, `cart.model.getDiscount`, `cart.model.canUseCoupon`, `cart.model.shippingRowByUser`, `cart.model.insertCoupon`, `cart.model.deleteCoupon`, `cart.model.deleteCouponMisspelled` | Migrated ✔ |
| `Cart::shopping_count` | `/api/cart/shopping_count` | ALL | `cart.shoppingCount` | `cart.model.cartRows` | Migrated ✔ |
| `Cart::check_area` | `/api/cart/check_area` | ALL | `cart.checkArea` | `common.model.fetchRow`, `common.model.getDbFieldValue` | Migrated ✔ — needs migration 001 (wl_localities) |
| `Cart::get_time_by_delivery_date` | `/api/cart/get_time_by_delivery_date` | ALL | `cart.getTimeByDeliveryDate` | `cart.model.countPaidOrdersInSlot` | Migrated ✔ |
| `Cart::get_delivery_date` | `/api/cart/get_delivery_date` | ALL | `cart.getDeliveryDate` | `cart.model.countPaidOrdersInSlot` | Migrated ✔ |
| `Cart::remove_cart` | `/api/cart/remove_cart` | ALL | `cart.removeCart` | `cart.model.deleteCoupon`, `cart.model.deleteCart`, `cart.model.deleteCartItem`, `cart.model.cartIdsByApp`, `cart.model.cartRows` | Migrated ✔ |
| `Cart::update_quantity` | `/api/cart/update_quantity` | ALL | `cart.updateQuantity` | `cart.model.deleteCouponUserOrApp`, `cart.model.deleteCoupon`, `common.model.getDbFieldValue`, `cart.model.cartQtyRows`, `cart.model.updateCartQty` | Migrated ✔ |
| `Cart::update_cart_qty` | `/api/cart/update_cart_qty` | ALL | `cart.updateCartQty` | `cart.model.cartQtyRows`, `cart.model.updateCartQty` | Migrated ✔ |
| `Cart::add_to_cart` | `/api/cart/add_to_cart` | ALL | `cart.addCart` | `cart.member.model.productColors`, `cart.member.model.productSizes`, `cart.member.model.getProduct`, `cart.model.insertCart`, `cart.model.cartItemKeys`, `helper.model.getProductPrice`, `common.model.getDbFieldValue`, `common.model.getDbSingleRow`, `cart.model.cartRows` | Migrated ✔ |
| `Cart::add_cart` | `/api/cart/add_cart` | ALL | `cart.addCart` | `cart.member.model.productColors`, `cart.member.model.productSizes`, `cart.member.model.getProduct`, `cart.model.insertCart`, `cart.model.cartItemKeys`, `helper.model.getProductPrice`, `common.model.getDbFieldValue`, `common.model.getDbSingleRow`, `cart.model.cartRows` | Migrated ✔ |
| `Cart::empty_cart` | `/api/cart/empty_cart` | ALL | `cart.emptyCart` | `cart.model.deleteCart`, `cart.model.deleteShipping`, `cart.model.deleteCoupon` | Migrated ✔ — POST only (checked in the method) |
| `Cart::check_product_exits_into_cart` | `/api/cart/check_product_exits_into_cart` | ALL | `cart.checkProductExitsIntoCart` | `cart.model.cartItemKeys` | Migrated ✔ — helper; by URL: "Missing argument" warning, then runs |
| `Cart::add_to_wishlist` | `/api/cart/add_to_wishlist` | ALL | `cart.addToWishlist` | `cart.member.model.countWishlist`, `cart.member.model.addWishlist`, `cart.member.model.wishlistFoundRows`, `common.model.getDbFieldValue` | Migrated ✔ |
| `Cart::set_delivery` | `/api/cart/set_delivery` | ALL | `cart.setDelivery` | `cart.model.deleteDelivery`, `cart.model.insertDelivery`, `cart.model.countPaidOrdersInSlot` | Migrated ✔ — needs migration 001 (tbl_temp_delivery) |
| `Cart::shipping_apply` | `/api/cart/shipping_apply` | ALL | `cart.shippingApply` | `cart.model.getShippingRate`, `cart.model.deleteShippingUserOrApp`, `cart.model.deleteShipping`, `cart.model.insertShipping` | Migrated ✔ |
| `Cart::shipping` | `/api/cart/shipping` | ALL | `cart.shipping` | `cart.model.getShippingMethods` | Migrated ✔ |
| `Cart::cart_shipping` | `/api/cart/cart_shipping` | ALL | `cart.cartShipping` | `cart.model.getShippingMethods` | Migrated ✔ |
| `Cart::coupon_apply` | `/api/cart/coupon_apply` | ALL | `cart.couponApply` | `cart.model.cartRowsWithSubtotal`, `cart.model.shippingRow`, `cart.model.cartTotalRow`, `cart.model.getDiscount`, `cart.model.canUseCoupon`, `cart.model.couponRow`, `cart.model.shippingRowByUser`, `cart.model.insertCoupon`, `cart.model.deleteCoupon`, `cart.model.deleteCouponMisspelled` | Migrated ✔ — one branch: DB error 1146 (PHP typo table bl_temp_discountcoupon) |
| `Cart::apply_coupon_code` | `/api/cart/apply_coupon_code` | ALL | `cart.applyCouponCode` | `cart.model.cartTotalRow`, `cart.model.shippingRowByUser`, `cart.model.shippingRow`, `cart.model.insertCoupon`, `cart.model.deleteCoupon`, `cart.model.deleteCouponMisspelled` | Migrated ✔ — helper; by URL: "Missing argument" warning, then runs |
| `Cart::is_valid_coupon` | `/api/cart/is_valid_coupon` | ALL | `cart.isValidCoupon` | `cart.model.getDiscount` | Migrated ✔ |
| `Cart::valid_mobile` | `/api/cart/valid_mobile` | ALL | `cart.validMobile` | — | Migrated ✔ — callback; by URL: "Missing argument" warning, then runs |
| `Cart::set_default_address` | `/api/cart/set_default_address` | ALL | `cart.setDefaultAddress` | `cart.member.model.setDefaultAddress`, `common.model.getDbFieldValue` | Migrated ✔ |
| `Cart::delete_address` | `/api/cart/delete_address` | ALL | `cart.deleteAddress` | `cart.member.model.deleteAddress`, `common.model.getDbFieldValue` | Migrated ✔ |
| `Cart::addresses` | `/api/cart/addresses` | ALL | `cart.addresses` | `cart.member.model.memberAddressBookGuest`, `cart.member.model.memberAddressBook` | Migrated ✔ |
| `Cart::add_address` | `/api/cart/add_address` | ALL | `cart.addAddress` | `cart.member.model.countDefaultAddresses`, `cart.member.model.insertAddress` | Migrated ✔ |
| `Cart::edit_address` | `/api/cart/edit_address` | ALL | `cart.editAddress` | `cart.member.model.countDefaultAddresses`, `cart.member.model.updateAddress`, `common.model.getDbFieldValue`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Cart::add_deliveryinfo` | `/api/cart/add_deliveryinfo` | ALL | `checkout.addDeliveryinfo` | `order.model.getMemberRow`, `order.model.getMemberAddressBookSalesman`, `order.model.rawUpdate`, `order.model.rawInsert`, `order.model.cartRows`, `order.model.tempRow`, `order.model.cartTotal` | Migrated ✔ |
| `Cart::deliveryinfo` | `/api/cart/deliveryinfo` | ALL | `checkout.deliveryinfo` | `order.model.getMemberRow`, `order.model.fieldValue`, `order.model.rawUpdate`, `order.model.rawInsert`, `order.model.getMemberAddressBookGuest`, `order.model.getMemberAddressBook`, `order.model.cartRows`, `order.model.tempRow`, `order.model.cartTotal` | Migrated ✔ — guest (login_type 1) needs migration 001 (tbl_temp_delivery_address.city_id) |
| `Cart::procced_payment_form` | `/api/cart/procced_payment_form` | ALL | `checkout.proccedPaymentForm` | `order.model.cartRows`, `order.model.tempRow`, `order.model.cartTotal`, `order.model.getMemberAddressBookSalesman`, `order.model.rawUpdate`, `order.model.getMemberAddressBookGuest`, `order.model.getMemberAddressBook`, `order.model.fieldValue` | Migrated ✔ |
| `Cart::payment` | `/api/cart/payment` | ALL | `checkout.payment` | `order.model.cartRows`, `order.model.tempRow`, `order.model.cartTotal`, `order.model.getMemberAddressBookSalesman`, `order.model.getMemberAddressBookGuest`, `order.model.getMemberAddressBook`, `order.model.getMemberRow`, `order.model.getDbSingleRow`, `order.model.cartRowsPlain`, `order.model.getAutoIncrement`, `order.model.fieldValue`, `order.model.rawInsert`, `order.model.rawUpdate`, `order.model.getOrderMaster`, `order.model.getOrderDetail`, `order.model.orderProducts`, `order.model.decrementStock`, `order.model.clearTempCart` | Migrated ✔ — places the order (wl_order, wl_orders_products, stock, coupons, mails) |
| `Cart::invoice_mail_data` | `/api/cart/invoice_mail_data` | ALL | `checkout.invoiceMailData` | — | Migrated ✔ — by URL without id: warning; with id: fatal error invoice_data() not in project |
| `Cart::invoice` | `/api/cart/invoice` | ALL | `checkout.invoice` | `order.model.getOrderMaster`, `order.model.getOrderDetail`, `order.model.productDefaultMedia`, `order.model.adminLangRow` | Migrated ✔ — needs migration 001 (tbl_admin_lang) |
| `Cart::print_invoice` | `/api/cart/print_invoice` | ALL | `checkout.printInvoice` | `order.model.getOrderMaster`, `order.model.getOrderDetail`, `order.model.adminLangRow` | Migrated ✔ — needs migration 001 (tbl_admin_lang) |
| `Cart::site_currency` | `/api/cart/site_currency` | ALL | `checkout.siteCurrency` | `order.model.fieldValue` | Migrated ✔ |
| `Cart::display_cart_image` | `/api/cart/display_cart_image` | ALL | `checkout.displayCartImage` | `order.model.productImageBytes` | Migrated ✔ — raw image bytes (image/jpeg) |
| `Cart::show_top_cart` | `/api/cart/show_top_cart` | ALL | `checkout.showTopCart` | — | Migrated ✔ — CI show_error: view show_top_html.php missing |
| `Cart::fetch_spamwords` | `/api/cart/fetch_spamwords` | ALL | `myController.fetchSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; needs migration 001 (tbl_spam_words) |
| `Cart::filter_spamwords` | `/api/cart/filter_spamwords` | ALL | `myController.filterSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Cart::has_spamwords` | `/api/cart/has_spamwords` | ALL | `myController.hasSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Cart::check_spamwords` | `/api/cart/check_spamwords` | ALL | `myController.checkSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |

### Category.php → `/api/category`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Category::index (no segment)` | `/api/category` | ALL | `category.index` | `category.model.getCategoryRow`, `category.model.getCategory` | Migrated ✔ |
| `Category::index` | `/api/category/index` | ALL | `category.index` | `category.model.getCategoryRow`, `category.model.getCategory` | Migrated ✔ |
| `Category::category_listing` | `/api/category/category_listing` | ALL | `category.categoryListing` | `category.model.getCategoryRow`, `category.model.getCategory` | Migrated ✔ |
| `Category::sub_category` | `/api/category/sub_category` | ALL | `category.subCategory` | `category.model.getCategory` | Migrated ✔ |
| `Category::fetch_spamwords` | `/api/category/fetch_spamwords` | ALL | `myController.fetchSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; needs migration 001 (tbl_spam_words) |
| `Category::filter_spamwords` | `/api/category/filter_spamwords` | ALL | `myController.filterSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Category::has_spamwords` | `/api/category/has_spamwords` | ALL | `myController.hasSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Category::check_spamwords` | `/api/category/check_spamwords` | ALL | `myController.checkSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |

### Member.php → `/api/member`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Member::index (no segment)` | `/api/member` | ALL | `member.index` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — requires a user token (constructor) |
| `Member::index` | `/api/member/index` | ALL | `member.index` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::member_topheader` | `/api/member/member_topheader` | ALL | `member.memberTopheader` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::edit_account` | `/api/member/edit_account` | ALL | `member.editAccount` | `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Member::update_image` | `/api/member/update_image` | ALL | `member.updateImage` | `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Member::face_authotication` | `/api/member/face_authotication` | ALL | `member.faceAuthotication` | `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ — needs migration 001 (is_face_authentication) |
| `Member::addresses` | `/api/member/addresses` | ALL | `member.addresses` | `member.model.getMemberAddressBook`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::delete_address` | `/api/member/delete_address` | ALL | `member.deleteAddress` | `member.model.dbFieldValue`, `member.model.deleteRows`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::add_address` | `/api/member/add_address` | ALL | `member.addAddress` | `member.model.countDefaultAddresses`, `member.model.insertRow`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — needs migration 001 (address-book columns) |
| `Member::edit_address` | `/api/member/edit_address` | ALL | `member.editAddress` | `member.model.dbFieldValue`, `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ — needs migration 001 (address-book columns) |
| `Member::email_check` | `/api/member/email_check` | ALL | `member.routeEmailCheck` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::mobile_check` | `/api/member/mobile_check` | ALL | `member.routeMobileCheck` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::valid_mobile` | `/api/member/valid_mobile` | ALL | `member.routeValidMobile` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — callback; by URL: "Missing argument" warning, then runs |
| `Member::valid_area` | `/api/member/valid_area` | ALL | `member.routeValidArea` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — callback; by URL: "Missing argument" warning, then runs |
| `Member::smepwd_check` | `/api/member/smepwd_check` | ALL | `member.routeSmepwdCheck` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::oldpwd_check` | `/api/member/oldpwd_check` | ALL | `member.routeOldpwdCheck` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::change_password` | `/api/member/change_password` | ALL | `member.changePassword` | `member.model.getMemberRow`, `member.model.updateRows`, `member.model.isEmailExists` | Migrated ✔ |
| `Member::wishlist` | `/api/member/wishlist` | ALL | `member.wishlist` | `member.model.getWishlists`, `member.model.firstProductMedia`, `member.model.productImageExists`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getFoundRows` | Migrated ✔ |
| `Member::delete_member_wishlist` | `/api/member/delete_member_wishlist` | ALL | `member.deleteMemberWishlist` | `member.model.deleteWishlist`, `member.model.getWishlists`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getFoundRows` | Migrated ✔ |
| `Member::reason_list` | `/api/member/reason_list` | ALL | `member.reasonList` | `member.model.getReasons`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::cancel_order` | `/api/member/cancel_order` | ALL | `member.cancelOrder` | `member.model.getOrderMaster`, `member.model.dbFieldValue`, `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::members_listing` | `/api/member/members_listing` | ALL | `member.membersListing` | `member.model.getMembers`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getFoundRows` | Migrated ✔ |
| `Member::member_support_old` | `/api/member/member_support_old` | ALL | `member.memberSupportOld` | `member.model.getSupports`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::post_support_old` | `/api/member/post_support_old` | ALL | `member.postSupportOld` | `member.model.insertRow`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Member::member_support` | `/api/member/member_support` | ALL | `member.memberSupport` | `member.model.getSupportInquiry`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::post_support` | `/api/member/post_support` | ALL | `member.postSupport` | `member.model.insertRow`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Member::count_notification` | `/api/member/count_notification` | ALL | `member.countNotification` | `member.model.getMemberNotifications`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getFoundRows` | Migrated ✔ |
| `Member::member_notification` | `/api/member/member_notification` | ALL | `member.memberNotification` | `member.model.getMemberNotifications`, `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::return_product` | `/api/member/return_product` | ALL | `member.returnProduct` | `member.model.getOrderMaster`, `member.model.dbFieldValue`, `member.model.updateRows`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — needs migration 001 (wl_reasons_lang, wl_orders_products columns) |
| `Member::return_order` | `/api/member/return_order` | ALL | `member.returnOrder` | `member.model.getOrderMaster`, `member.model.dbFieldValue`, `member.model.updateRows`, `member.model.getOrderDetail`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — Delivered orders: update, then CI show_error Export_model |
| `Member::orders` | `/api/member/orders` | ALL | `member.orders` | `member.model.getOrders`, `member.model.firstOrderProduct`, `member.model.defaultCurrencyField`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::print_invoice` | `/api/member/print_invoice` | ALL | `member.printInvoice` | `member.model.getMembers`, `member.model.getOrderMaster`, `member.model.getOrderDetail`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ — DB error 1146 (PHP typo table " wl_products_media") |
| `Member::invoice` | `/api/member/invoice` | ALL | `member.invoice` | `member.model.getOrderMaster`, `member.model.getOrderDetail`, `member.model.defaultCurrencyField`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Member::product_feedback` | `/api/member/product_feedback` | ALL | `member.productFeedback` | `member.model.getMemberReviews`, `member.model.productDefaultMedia`, `member.model.productImageExists`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::admin_details` | `/api/member/admin_details` | ALL | `member.adminDetails` | `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getDbSingleRow` | Migrated ✔ — needs migration 001 (tbl_admin_lang) |
| `Member::device_registration` | `/api/member/device_registration` | ALL | `member.deviceRegistration` | `member.model.dbFieldValue`, `member.model.updateRows`, `member.model.insertRow`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — needs migration 001 (wl_device_registration) |
| `Member::check_price_zero` | `/api/member/check_price_zero` | ALL | `member.routeCheckPriceZero` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::notification` | `/api/member/notification` | ALL | `member.notification` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — fatal error: Members_model::get_member_notification() missing |
| `Member::count_notificationssss` | `/api/member/count_notificationssss` | ALL | `member.countNotificationssss` | `member.model.countUnreadNotifications`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — needs migration 001 (wl_notifications columns) |
| `Member::refer_friend` | `/api/member/refer_friend` | ALL | `member.referFriend` | `member.model.countReferrals`, `member.model.findReferral`, `member.model.insertRow`, `member.model.isEmailExists`, `member.model.getMemberRow`, `helper.model.getContent` | Migrated ✔ — needs migration 001 (wl_referral_customers) |
| `Member::member_coupons` | `/api/member/member_coupons` | ALL | `member.memberCoupons` | `member.model.getDiscountCoupon`, `member.model.defaultCurrencyField`, `member.model.isEmailExists`, `member.model.getMemberRow`, `common.model.getFoundRows` | Migrated ✔ |
| `Member::rewards_point` | `/api/member/rewards_point` | ALL | `member.rewardsPoint` | `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — fatal error: get_total_earn_amount() not in project |
| `Member::track_order` | `/api/member/track_order` | ALL | `member.trackOrder` | `member.model.getOrderMaster`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ — CI show_error: Transporter_model missing (when an order matches) |
| `Member::delete_own_accounts` | `/api/member/delete_own_accounts` | ALL | `member.deleteOwnAccounts` | `member.model.countCustomer`, `member.model.isEmailExists`, `member.model.getMemberRow` | Migrated ✔ |
| `Member::fetch_spamwords` | `/api/member/fetch_spamwords` | ALL | `myController.fetchSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; needs migration 001 (tbl_spam_words) |
| `Member::filter_spamwords` | `/api/member/filter_spamwords` | ALL | `myController.filterSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Member::has_spamwords` | `/api/member/has_spamwords` | ALL | `myController.hasSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Member::check_spamwords` | `/api/member/check_spamwords` | ALL | `myController.checkSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |

### Pages.php → `/api/pages`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Pages::index (no segment)` | `/api/pages` | ALL | `pages.index` | — | Migrated ✔ — empty body (as PHP) |
| `Pages::index` | `/api/pages/index` | ALL | `pages.index` | — | Migrated ✔ — empty body (as PHP) |
| `Pages::error_404` | `/api/pages/error_404` | ALL | `pages.error404` | — | Migrated ✔ — empty body (as PHP) |
| `Pages::notification_test` | `/api/pages/notification_test` | ALL | `pages.notificationTest` | — | Migrated ✔ |
| `Pages::refer_to_friends` | `/api/pages/refer_to_friends` | ALL | `pages.referToFriends` | `pages.model.countInvites`, `pages.model.insertInvite`, `pages.model.getProductFriendlyUrl`, `common.model.getDbSingleRow`, `helper.model.getContent` | Migrated ✔ |
| `Pages::faq` | `/api/pages/faq` | ALL | `pages.faq` | `pages.model.getFaq` | Migrated ✔ |
| `Pages::news` | `/api/pages/news` | ALL | `pages.news` | `pages.products.model.phpCmp`, `pages.model.getNews` | Migrated ✔ |
| `Pages::testimonial` | `/api/pages/testimonial` | ALL | `pages.testimonial` | `pages.model.getTestimonial` | Migrated ✔ |
| `Pages::testimonial_details` | `/api/pages/testimonial_details` | ALL | `pages.testimonialDetails` | `pages.model.getTestimonial` | Migrated ✔ |
| `Pages::post_testimonial` | `/api/pages/post_testimonial` | ALL | `pages.postTestimonial` | `pages.model.insertTestimonial`, `pages.model.updateTestimonialUrl` | Migrated ✔ |
| `Pages::news_details` | `/api/pages/news_details` | ALL | `pages.newsDetails` | `pages.model.getNews`, `pages.model.getNewsMedia` | Migrated ✔ |
| `Pages::price_list` | `/api/pages/price_list` | ALL | `pages.priceList` | `pages.model.getBrouchers` | Migrated ✔ |
| `Pages::image_gallery` | `/api/pages/image_gallery` | ALL | `pages.imageGallery` | `pages.model.getGallery` | Migrated ✔ |
| `Pages::video_gallery` | `/api/pages/video_gallery` | ALL | `pages.videoGallery` | `pages.model.getGallery` | Migrated ✔ |
| `Pages::update_keys` | `/api/pages/update_keys` | ALL | `pages.updateKeys` | `pages.model.findApiAccess`, `pages.model.updateApiAccess`, `pages.model.insertApiAccess` | Migrated ✔ — needs migration 001 (api_access) |
| `Pages::banner_list` | `/api/pages/banner_list` | ALL | `pages.bannerList` | `pages.products.model.getProducts`, `pages.products.model.decorateProducts`, `pages.products.model.getCategoryList`, `pages.model.getBanners`, `common.model.getDbFieldValue`, `helper.model.displaySymbol`, `helper.model.getOrdersId`, `helper.model.getOrderProductsReviewId`, `helper.model.getOrderProductsId` | Migrated ✔ |
| `Pages::search_list` | `/api/pages/search_list` | ALL | `pages.searchList` | `pages.model.searchCategories`, `pages.products.model.getProducts` | Migrated ✔ — with keyword: DB error (PHP builds invalid SQL) |
| `Pages::services` | `/api/pages/services` | ALL | `pages.services` | `pages.model.getServicePages` | Migrated ✔ |
| `Pages::services_details` | `/api/pages/services_details` | ALL | `pages.servicesDetails` | `pages.model.getCmsPage` | Migrated ✔ |
| `Pages::cms_pages` | `/api/pages/cms_pages` | ALL | `pages.cmsPages` | `pages.model.getCmsPage` | Migrated ✔ |
| `Pages::aboutus` | `/api/pages/aboutus` | ALL | `pages.aboutus` | — | Migrated ✔ |
| `Pages::catalog` | `/api/pages/catalog` | ALL | `pages.catalog` | — | Migrated ✔ |
| `Pages::gallery` | `/api/pages/gallery` | ALL | `pages.gallery` | — | Migrated ✔ |
| `Pages::bone_china_design` | `/api/pages/bone_china_design` | ALL | `pages.boneChinaDesign` | — | Migrated ✔ |
| `Pages::privacy_policy` | `/api/pages/privacy_policy` | ALL | `pages.privacyPolicy` | — | Migrated ✔ |
| `Pages::terms_conditions` | `/api/pages/terms_conditions` | ALL | `pages.termsConditions` | — | Migrated ✔ |
| `Pages::our_science` | `/api/pages/our_science` | ALL | `pages.ourScience` | — | Migrated ✔ |
| `Pages::our_people` | `/api/pages/our_people` | ALL | `pages.ourPeople` | — | Migrated ✔ |
| `Pages::return_policy` | `/api/pages/return_policy` | ALL | `pages.returnPolicy` | — | Migrated ✔ |
| `Pages::how_to_buy` | `/api/pages/how_to_buy` | ALL | `pages.howToBuy` | — | Migrated ✔ |
| `Pages::clear_cache` | `/api/pages/clear_cache` | ALL | `pages.clearCache` | — | Migrated ✔ |
| `Pages::valid_mobile` | `/api/pages/valid_mobile` | ALL | `pages.validMobile` | — | Migrated ✔ — callback; by URL: "Missing argument" warning, then runs |
| `Pages::post_newsletter` | `/api/pages/post_newsletter` | ALL | `pages.postNewsletter` | `pages.model.isSubscribed`, `pages.model.insertNewsletter` | Migrated ✔ |
| `Pages::admin_details` | `/api/pages/admin_details` | ALL | `pages.adminDetails` | `common.model.getDbSingleRow` | Migrated ✔ |
| `Pages::contactus` | `/api/pages/contactus` | ALL | `pages.contactus` | `pages.model.insertEnquiry`, `helper.model.getContent` | Migrated ✔ |
| `Pages::get_cities` | `/api/pages/get_cities` | ALL | `pages.getCities` | `pages.model.getCities` | Migrated ✔ |
| `Pages::get_locations` | `/api/pages/get_locations` | ALL | `pages.getLocations` | `pages.model.getLocations` | Migrated ✔ — needs migration 001 (wl_localities) |
| `Pages::get_slots` | `/api/pages/get_slots` | ALL | `pages.getSlots` | `pages.model.getSlots` | Migrated ✔ — needs migration 001 (wl_slots) |
| `Pages::reason` | `/api/pages/reason` | ALL | `pages.reason` | `pages.model.getReasons` | Migrated ✔ — needs migration 001 (wl_reasons_lang) |
| `Pages::fetch_spamwords` | `/api/pages/fetch_spamwords` | ALL | `myController.fetchSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; needs migration 001 (tbl_spam_words) |
| `Pages::filter_spamwords` | `/api/pages/filter_spamwords` | ALL | `myController.filterSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Pages::has_spamwords` | `/api/pages/has_spamwords` | ALL | `myController.hasSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Pages::check_spamwords` | `/api/pages/check_spamwords` | ALL | `myController.checkSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |

### Payment.php → `/api/payment`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Payment::index (no segment)` | `/api/payment` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::index (no segment)` | `/api/payment` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::fetch_spamwords` | `/api/payment/fetch_spamwords` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::filter_spamwords` | `/api/payment/filter_spamwords` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::has_spamwords` | `/api/payment/has_spamwords` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::check_spamwords` | `/api/payment/check_spamwords` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::index` | `/api/payment/index` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::order_success` | `/api/payment/order_success` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::check_order_cancle` | `/api/payment/check_order_cancle` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::order_cancle` | `/api/payment/order_cancle` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::order_response` | `/api/payment/order_response` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |
| `Payment::order_result` | `/api/payment/order_result` | ALL | `payment.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing helper payment/knet: CI show_error (HTTP 500), no auth |

### Products.php → `/api/products`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Products::index (no segment)` | `/api/products` | ALL | `products.index` | `product.model.relatedProducts`, `product.model.getProducts`, `product.model.firstMedia`, `product.model.productMediaExists`, `helper.model.displaySymbol`, `common.model.getFoundRows`, `common.model.getDbFieldValue`, `common.model.getDbSingleRow`, `common.model.countRecord`, `helper.model.getProductPrice` | Migrated ✔ |
| `Products::index` | `/api/products/index` | ALL | `products.index` | `product.model.relatedProducts`, `product.model.getProducts`, `product.model.firstMedia`, `product.model.productMediaExists`, `helper.model.displaySymbol`, `common.model.getFoundRows`, `common.model.getDbFieldValue`, `common.model.getDbSingleRow`, `common.model.countRecord`, `helper.model.getProductPrice` | Migrated ✔ |
| `Products::suggestion_search` | `/api/products/suggestion_search` | ALL | `products.suggestionSearch` | `common.model.fetchAll` | Migrated ✔ |
| `Products::product_paging` | `/api/products/product_paging` | ALL | `products.productPaging` | `product.model.relatedProducts`, `product.model.getProducts`, `product.model.firstMedia`, `product.model.productMediaExists`, `helper.model.displaySymbol`, `common.model.getFoundRows`, `common.model.getDbFieldValue`, `common.model.getDbSingleRow`, `common.model.countRecord`, `helper.model.getProductPrice` | Migrated ✔ |
| `Products::get_size_price_old` | `/api/products/get_size_price_old` | ALL | `products.getSizePriceOld` | `common.model.getDbSingleRow` | Migrated ✔ — fatal error: get_product_stock_price() not in project |
| `Products::detail` | `/api/products/detail` | ALL | `products.detail` | `product.model.getProducts`, `product.model.relatedProducts`, `product.model.productMedia`, `product.model.getProductSizes`, `product.model.getProductColors`, `product.model.getReviews`, `common.model.countRecord`, `helper.model.getProductPrice`, `helper.model.productOverallRating`, `common.model.getDbFieldValue`, `product.model.productIdStockList`, `common.model.getDbSingleRow` | Migrated ✔ — related products come from ORDER BY RAND() |
| `Products::get_view_stock` | `/api/products/get_view_stock` | ALL | `products.getViewStock` | `product.model.productIdStockList`, `common.model.getDbSingleRow` | Migrated ✔ |
| `Products::get_product_review` | `/api/products/get_product_review` | ALL | `products.getProductReview` | `product.model.getReviews` | Migrated ✔ |
| `Products::product_review_post` | `/api/products/product_review_post` | ALL | `products.productReviewPost` | `common.model.safeInsert` | Migrated ✔ |
| `Products::product_enquiry` | `/api/products/product_enquiry` | ALL | `products.productEnquiry` | `product.model.getProducts`, `common.model.safeInsert`, `helper.model.getContent` | Migrated ✔ — POST only (checked in the method) |
| `Products::producer` | `/api/products/producer` | ALL | `products.producer` | — | Migrated ✔ — fatal error: producer_model never loaded |
| `Products::producers` | `/api/products/producers` | ALL | `products.producers` | — | Migrated ✔ — fatal error: producer_model never loaded |
| `Products::flyer` | `/api/products/flyer` | ALL | `products.flyer` | — | Migrated ✔ |
| `Products::search_attribute` | `/api/products/search_attribute` | ALL | `products.searchAttribute` | `category.model.getCategory`, `product.attribute.model.getActiveBrands`, `product.attribute.model.getActiveColors`, `product.attribute.model.getActiveSizes` | Migrated ✔ |
| `Products::color` | `/api/products/color` | ALL | `products.color` | `product.attribute.model.getActiveColors` | Migrated ✔ |
| `Products::size` | `/api/products/size` | ALL | `products.size` | `product.attribute.model.getActiveSizes` | Migrated ✔ |
| `Products::brand` | `/api/products/brand` | ALL | `products.brand` | `product.attribute.model.getActiveBrands` | Migrated ✔ |
| `Products::featured` | `/api/products/featured` | ALL | `products.featured` | `product.model.getProducts` | Migrated ✔ — always DB error 1064 (PHP builds invalid SQL) |
| `Products::price_range` | `/api/products/price_range` | ALL | `products.priceRange` | — | Migrated ✔ |
| `Products::get_size_price` | `/api/products/get_size_price` | ALL | `products.getSizePrice` | `helper.model.getProductPrice` | Migrated ✔ |
| `Products::home` | `/api/products/home` | ALL | `products.home` | `product.model.getProducts` | Migrated ✔ — always DB error 1064 (PHP builds invalid SQL) |
| `Products::certificate_authority` | `/api/products/certificate_authority` | ALL | `products.certificateAuthority` | — | Migrated ✔ — CI show_error: Certificate_authority_model missing |
| `Products::fetch_spamwords` | `/api/products/fetch_spamwords` | ALL | `myController.fetchSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; needs migration 001 (tbl_spam_words) |
| `Products::filter_spamwords` | `/api/products/filter_spamwords` | ALL | `myController.filterSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Products::has_spamwords` | `/api/products/has_spamwords` | ALL | `myController.hasSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `Products::check_spamwords` | `/api/products/check_spamwords` | ALL | `myController.checkSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |

### Transporter.php → `/api/transporter`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `Transporter::index (no segment)` | `/api/transporter` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::index (no segment)` | `/api/transporter` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::fetch_spamwords` | `/api/transporter/fetch_spamwords` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::filter_spamwords` | `/api/transporter/filter_spamwords` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::has_spamwords` | `/api/transporter/has_spamwords` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::check_spamwords` | `/api/transporter/check_spamwords` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::member_topheader` | `/api/transporter/member_topheader` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::index` | `/api/transporter/index` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::edit_account` | `/api/transporter/edit_account` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::set_online_offline` | `/api/transporter/set_online_offline` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::set_current_location` | `/api/transporter/set_current_location` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::mobile_check` | `/api/transporter/mobile_check` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::valid_mobile` | `/api/transporter/valid_mobile` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::valid_area` | `/api/transporter/valid_area` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::smepwd_check` | `/api/transporter/smepwd_check` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::oldpwd_check` | `/api/transporter/oldpwd_check` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::change_password` | `/api/transporter/change_password` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::accept_order` | `/api/transporter/accept_order` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::reject_order` | `/api/transporter/reject_order` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::set_order_paid` | `/api/transporter/set_order_paid` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::delivered` | `/api/transporter/delivered` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::new_orders` | `/api/transporter/new_orders` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::orders` | `/api/transporter/orders` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::print_invoice` | `/api/transporter/print_invoice` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::invoice` | `/api/transporter/invoice` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::admin_details` | `/api/transporter/admin_details` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::device_registration` | `/api/transporter/device_registration` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::check_price_zero` | `/api/transporter/check_price_zero` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::notification` | `/api/transporter/notification` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::count_notification` | `/api/transporter/count_notification` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::refer_friend` | `/api/transporter/refer_friend` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |
| `Transporter::member_coupons` | `/api/transporter/member_coupons` | ALL | `transporter.constructorFailure` | — | Migrated ✔ — PHP constructor loads missing transporter_model: auth check, then CI show_error (HTTP 500) |

### User.php → `/api/user`

| PHP API | Node.js route | HTTP | Controller | Model / query | Status |
|---|---|---|---|---|---|
| `User::index (no segment)` | `/api/user` | ALL | `user.index` | `user.model.verifyUser`, `user.model.safeUpdate`, `user.model.customerFieldNotDeleted`, `user.model.defaultCurrencyField` | Migrated ✔ |
| `User::index` | `/api/user/index` | ALL | `user.index` | `user.model.verifyUser`, `user.model.safeUpdate`, `user.model.customerFieldNotDeleted`, `user.model.defaultCurrencyField` | Migrated ✔ — POST only (constructor check); /api/user (root) is not checked, like PHP |
| `User::face_authotication` | `/api/user/face_authotication` | ALL | `user.faceAuthotication` | `user.model.findFaceCustomer`, `user.model.safeUpdate` | Migrated ✔ — POST only; needs migration 001 (is_face_authentication). A matched user with a photo then reaches the missing AWS RekognitionClient (fatal error) |
| `User::login` | `/api/user/login` | ALL | `user.login` | `user.model.verifyUser`, `user.model.safeUpdate`, `user.model.customerFieldNotDeleted`, `user.model.defaultCurrencyField` | Migrated ✔ — POST only (constructor check) |
| `User::forgotten_password` | `/api/user/forgotten_password` | ALL | `user.forgottenPassword` | `user.model.adminRow`, `user.model.findPasswordAccount`, `helper.model.getContent` | Migrated ✔ — POST only |
| `User::valid_mobile` | `/api/user/valid_mobile` | ALL | `user.validMobile` | — | Migrated ✔ — callback; by URL: "Missing argument" warning, then runs |
| `User::checkreferral` | `/api/user/checkreferral` | ALL | `user.checkreferral` | `user.model.countReferral` | Migrated ✔ — needs migration 001 (wl_referral_customers) |
| `User::register` | `/api/user/register` | ALL | `user.register` | `user.model.adminRow`, `user.model.fieldValue`, `user.model.safeUpdate`, `user.model.safeInsert`, `user.model.verifyUser`, `helper.model.getContent`, `user.model.defaultCurrencyField` | Migrated ✔ — POST only |
| `User::otp` | `/api/user/otp` | ALL | `user.otp` | — | Migrated ✔ — POST only; always CI show_error: Export_model does not exist |
| `User::check_verify_code` | `/api/user/check_verify_code` | ALL | `user.checkVerifyCode` | `user.model.customerVerifyCode` | Migrated ✔ — needs migration 001 (verify_code) |
| `User::resend` | `/api/user/resend` | ALL | `user.resend` | `user.model.singleRow`, `user.model.safeUpdate` | Migrated ✔ — POST only; OTP branch ends in fatal error SMSSend() (function not in project) |
| `User::logout` | `/api/user/logout` | ALL | `user.logout` | — | Migrated ✔ |
| `User::email_check` | `/api/user/email_check` | ALL | `user.emailCheck` | `user.model.isEmailExists` | Migrated ✔ |
| `User::mobile_check` | `/api/user/mobile_check` | ALL | `user.mobileCheck` | `user.model.isEmailExists` | Migrated ✔ |
| `User::valid_captcha_code` | `/api/user/valid_captcha_code` | ALL | `user.validCaptchaCode` | — | Migrated ✔ — warning + fatal error (captcha library not loaded) |
| `User::verify` | `/api/user/verify` | ALL | `user.verify` | `user.model.activateAccount`, `user.model.markVerifiedByMd5` | Migrated ✔ — redirect to users/login |
| `User::country` | `/api/user/country` | ALL | `user.country` | `user.model.countries` | Migrated ✔ — needs migration 001 (wl_countries_lang) |
| `User::state` | `/api/user/state` | ALL | `user.state` | `user.model.states` | Migrated ✔ |
| `User::city` | `/api/user/city` | ALL | `user.city` | `user.model.cities` | Migrated ✔ |
| `User::guest_login` | `/api/user/guest_login` | ALL | `user.guestLogin` | `user.model.countCustomers`, `user.model.safeInsert`, `user.model.fieldValue`, `user.model.safeUpdate`, `user.model.assignTempData`, `user.model.defaultCurrencyField` | Migrated ✔ — POST only; needs migration 001 (verify_code); then fatal error SMSSend() (function not in project) |
| `User::guest_otp` | `/api/user/guest_otp` | ALL | `user.guestOtp` | `user.model.singleRow`, `user.model.safeUpdate`, `user.model.defaultCurrencyField` | Migrated ✔ — needs migration 001 (verify_code) |
| `User::transporter_login` | `/api/user/transporter_login` | ALL | `user.transporterLogin` | `user.model.findTransporter`, `user.model.safeUpdate` | Migrated ✔ — needs migration 001 (wl_transporters) |
| `User::transporter_forgotten_password` | `/api/user/transporter_forgotten_password` | ALL | `user.transporterForgottenPassword` | `user.model.adminRow`, `user.model.findPasswordAccount`, `helper.model.getContent` | Migrated ✔ — needs migration 001 (wl_transporters) |
| `User::test_sendsms` | `/api/user/test_sendsms` | ALL | `user.testSendsms` | — | Migrated ✔ — fatal error: SMSSend() not in project |
| `User::fetch_spamwords` | `/api/user/fetch_spamwords` | ALL | `myController.fetchSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; needs migration 001 (tbl_spam_words) |
| `User::filter_spamwords` | `/api/user/filter_spamwords` | ALL | `myController.filterSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `User::has_spamwords` | `/api/user/has_spamwords` | ALL | `myController.hasSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
| `User::check_spamwords` | `/api/user/check_spamwords` | ALL | `myController.checkSpamwords` | `(inline SQL: tbl_spam_words)` | Migrated ✔ — inherited MY_Controller method; "Missing argument" warning; needs migration 001 (tbl_spam_words) |
