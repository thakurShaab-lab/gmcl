/**
 * Port of apps/libraries/Dmailer.php (CodeIgniter Email, HTML mail). PHP ignored send failures, so does this.
 * SMTP is used when MAIL_HOST is set; otherwise the local sendmail binary (what PHP mail() used).
 */
const nodemailer = require('nodemailer');
const fs = require('fs');
const env = require('../config/env');

let transport;
function getTransport() {
  if (!transport) {
    transport = env.mail.host
      ? nodemailer.createTransport({
          host: env.mail.host,
          port: env.mail.port,
          secure: env.mail.secure,
          auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
        })
      : nodemailer.createTransport({ sendmail: true, newline: 'unix' });
  }
  return transport;
}

/**
 * mail_notify($mail_conf): { subject, to_email, from_email, from_name, body_part, attachment?, cc?, bcc? }
 * Note: the PHP library added "bcc" as a CC recipient; that is preserved.
 */
function mailNotify(conf) {
  if (!conf || typeof conf !== 'object' || Object.keys(conf).length === 0) return;
  const cc = [];
  if (conf.cc) cc.push(conf.cc);
  if (conf.bcc) cc.push(conf.bcc);
  const message = {
    from: { name: String(conf.from_name ?? ''), address: String(conf.from_email ?? '') },
    replyTo: { name: String(conf.from_name ?? ''), address: String(conf.from_email ?? '') },
    to: String(conf.to_email ?? ''),
    cc: cc.length ? cc : undefined,
    subject: String(conf.subject ?? ''),
    html: String(conf.body_part ?? ''),
  };
  if (conf.attachment && fs.existsSync(conf.attachment)) message.attachments = [{ path: conf.attachment }];
  // Fire and forget: the API response never depended on the mail result.
  getTransport()
    .sendMail(message)
    .catch(() => {});
}

module.exports = { mailNotify };
