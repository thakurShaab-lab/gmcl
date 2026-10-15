/**
 * Public methods every API controller inherits from apps/core/MY_Controller.php. CodeIgniter routes them like
 * any other method, e.g. /api/cart/fetch_spamwords. All of them read tbl_spam_words; the ones that take an
 * argument get none from the URL, so PHP 5.6 warns "Missing argument 1" and then runs them with NULL.
 */
const { sql } = require('drizzle-orm');

const FILE = 'core/MY_Controller.php';
const PATH = 'apps/core/MY_Controller.php';

/** MY_Controller::fetch_spamwords() — the rows are not part of any response. */
function fetchSpamwordsQuery(ci) {
  return ci.db.execute(sql`SELECT \`words\`
FROM \`tbl_spam_words\`
WHERE \`status\` = '1'`);
}

async function fetchSpamwords(req) {
  await fetchSpamwordsQuery(req.ci);
}

function withMissingArgument(name, line) {
  return async (req) => {
    req.ci.out.missingArguments(`MY_Controller::${name}`, 1, FILE, line, PATH);
    await fetchSpamwordsQuery(req.ci);
  };
}

const filterSpamwords = withMissingArgument('filter_spamwords', 58);
const hasSpamwords = withMissingArgument('has_spamwords', 74);
const checkSpamwords = withMissingArgument('check_spamwords', 81);

/** Registers the inherited routes on a controller router (after its constructor middleware). */
function registerInheritedRoutes(router, ciRoute, ...middleware) {
  ciRoute(router, 'fetch_spamwords', ...middleware, fetchSpamwords);
  ciRoute(router, 'filter_spamwords', ...middleware, filterSpamwords);
  ciRoute(router, 'has_spamwords', ...middleware, hasSpamwords);
  ciRoute(router, 'check_spamwords', ...middleware, checkSpamwords);
}

module.exports = { fetchSpamwords, filterSpamwords, hasSpamwords, checkSpamwords, registerInheritedRoutes };
