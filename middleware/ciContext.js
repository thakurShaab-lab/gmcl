/**
 * Builds req.ci — the per-request equivalent of CodeIgniter's $this:
 *   ci.db        Drizzle instance on a dedicated connection (released when the response ends)
 *   ci.GET/POST/FILES   PHP superglobals (mutable, like PHP)
 *   ci.input     $this->input
 *   ci.out       output buffer (echo / print(my_json_encode()) / exit)
 *   ci.fv        $this->form_validation (one instance per request, created on first use)
 *   ci.callbacks form-validation "callback_" rules registered by the controller
 *   ci.session   $this->session (API clients carry no session cookie, so it starts empty)
 */
const env = require('../config/env');
const { acquire } = require('../config/database');
const { configItem, lang } = require('../config/app');
const { parsePhpGlobals, cleanupFiles } = require('../utils/phpRequest');
const { Input } = require('../utils/input');
const { Output } = require('../utils/output');
const { FormValidation } = require('../utils/formValidation');
const adminModel = require('../model/admin.model');

async function ciContext(req, res, next) {
  try {
    const { get, post, files } = await parsePhpGlobals(req);
    const { conn, db } = await acquire();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      conn.release();
      cleanupFiles(files);
    };
    res.on('finish', release);
    res.on('close', release);

    const path = req.originalUrl.split('?')[0];
    const segments = path.split('/').filter((s) => s !== '');
    let fv = null;
    let adminInfo;

    const ci = {
      req,
      res,
      db,
      GET: get,
      POST: post,
      FILES: files,
      requestUri: req.originalUrl,
      // The api module's config/language.php has a trailing space after "?>", printed before any output.
      out: new Output(res, ' '),
      session: new Map(),
      callbacks: {},
      config: configItem,
      /** lang($key) — includes form_validation lines once validation has run in this request. */
      lang: (key) => lang(key, ci.formValidationLangLoaded === true),
      /** $this->uri->segment(n) (1-based, null when missing) */
      segment: (n) => (segments[n - 1] === undefined ? null : segments[n - 1]),
      /** base_url(): scheme + Host header + "/" (or APP_BASE_URL) */
      baseUrl: () => env.baseUrl || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host || ''}/`,
      /** $this->admin_info (tbl_admin row admin_id = 1), loaded once per request on demand. */
      adminInfo: async () => {
        if (adminInfo === undefined) adminInfo = await adminModel.getAdminInfo(db);
        return adminInfo;
      },
      get fv() {
        if (!fv) fv = new FormValidation(ci);
        return fv;
      },
      /** exit / die */
      exit: (message) => ci.out.exit(message),
    };
    ci.input = new Input(ci);
    req.ci = ci;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = ciContext;
