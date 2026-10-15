/**
 * Port of modules/api/helpers/push_notification_helper.php (FCM legacy HTTP API).
 * As in PHP, the request is sent synchronously and a transport failure echoes the error and dies.
 */
const { sql } = require('drizzle-orm');
const { fetchRow, fetchAll } = require('../model/common.model');
const { str, phpDate, num } = require('./php');

const FCM_URL = 'https://fcm.googleapis.com/fcm/send';
const SERVER_KEY =
  'AAAAFtN-rNI:APA91bHAI0gT_IAVQ6CbN2Z-1knBqhJaijMOzeeuKsveD7HKgI2I_WpGr7PL---nj125sOsWdK2kH5K11ydPAxCVGkeS-X2yPgStZeqnG2co-OJFoUEvT1sJKJBO2pZTxmwDZgzjPo8o';

/** curl_exec() equivalent: resolves to the body, or throws { curlError } on transport failure. */
async function post(body) {
  try {
    const res = await fetch(FCM_URL, {
      method: 'POST',
      headers: { Authorization: `key=${SERVER_KEY}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30000),
    });
    return await res.text();
  } catch (e) {
    const err = new Error('curl');
    err.curlError = (e.cause && e.cause.message) || e.message;
    throw err;
  }
}

async function send(ci, body) {
  try {
    await post(body);
  } catch (e) {
    if (!e.curlError) throw e;
    ci.out.echo(e.curlError);
    ci.out.exit('error occured');
  }
}

async function sendNotificationAndroid(ci, deviceToken, data) {
  const fields = {
    to: deviceToken,
    notification: { body: data.mdesc, title: data.mtitle, 'content-available': true, priority: 'high', sound: 'default', color: '#cecece', badge: 1 },
    data: { priority: 'high', payload: { team: 'India', score: '5.6' }, message: data.mdesc, timestamp: phpDate('Y-m-d G:i:s') },
  };
  await send(ci, JSON.stringify(fields));
}

async function sendNotificationIos(ci, deviceToken, data) {
  if (deviceToken === '') return;
  const body = { to: deviceToken, notification: { title: data.mtitle, body: data.mdesc, sound: 'default', badge: '1' }, priority: 'high' };
  await send(ci, JSON.stringify(body));
}

/** get_device_info($userId) */
async function getDeviceInfo(db, userId) {
  if (str(userId) === '' || !(num(userId) > 0)) return null;
  return fetchRow(
    db,
    sql`SELECT first_name, last_name, mobile_number, device_id, app_id, app_type, customer_type FROM wl_customers WHERE customers_id = ${str(userId)}`,
  );
}

function payload(message, device, userId) {
  return {
    mtitle: message.message_title,
    mdesc: message.message,
    user_name: `${str(device.first_name)} ${str(device.last_name)}`,
    mobile_number: device.mobile_number,
    customer_type: device.customer_type,
    intervals: message.intervals,
    user_id: userId,
  };
}

/** set_apps_notification($userId, $message) — message: { message_title, message, intervals, ... } */
async function setAppsNotification(ci, userId, message) {
  if (str(userId) === '' || !(num(userId) > 0) || !message) return;
  const device = await getDeviceInfo(ci.db, userId);
  if (!device) return;
  const deviceId = device.device_id ? device.device_id : '';
  const data = payload(message, device, userId);
  if (device.app_type === 'android') await sendNotificationAndroid(ci, deviceId, data);
  if (device.app_type === 'ios') await sendNotificationIos(ci, deviceId, data);
}

/** set_apps_notification_multiple($message): every active customer with a device id. */
async function setAppsNotificationMultiple(ci, message) {
  if (!message) return;
  const devices = await fetchAll(
    ci.db,
    sql`SELECT first_name, last_name, mobile_number, device_id, app_id, app_type, customer_type FROM wl_customers WHERE status = '1'`,
  );
  for (const device of devices) {
    const deviceId = device.device_id ? device.device_id : '';
    if (deviceId === '') continue;
    const data = payload(message, device, null);
    if (device.app_type === 'android') await sendNotificationAndroid(ci, deviceId, data);
    if (device.app_type === 'ios') await sendNotificationIos(ci, deviceId, data);
  }
}

module.exports = { setAppsNotification, setAppsNotificationMultiple, getDeviceInfo };
