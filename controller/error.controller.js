/** Fallbacks reproducing CodeIgniter's 404_override ('pages/error_404') for /api URLs. */

/**
 * Unknown method on an existing API controller: CodeIgniter ran api/pages/error_404 (after the
 * Api_Controller auth check), which outputs nothing.
 */
async function apiMethodNotFound(req, res) {} // eslint-disable-line no-unused-vars

/**
 * Unknown controller under /api: the website module's 404 view was rendered, whose entire body is the
 * text "UnderConstruction" (HTTP 200, no API prefix or CORS headers).
 */
async function underConstruction(req, res) {
  const { ci } = req;
  ci.out.body = '';
  ci.cors = false;
  ci.out.exited = true;
  ci.out.echo('UnderConstruction');
}

module.exports = { apiMethodNotFound, underConstruction };
