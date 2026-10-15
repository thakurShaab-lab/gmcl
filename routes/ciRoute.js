/**
 * CodeIgniter routing: /api/<controller>/<method>[/extra/segments] maps to <method> for any HTTP verb
 * (PHP never restricted methods), and /api/<controller> maps to index().
 */
const { handle } = require('../middleware/handle');

/** Registers a controller method. `name` may be an array of aliases ('' = the controller root). */
function ciRoute(router, name, ...handlers) {
  const names = Array.isArray(name) ? name : [name];
  const paths = names.flatMap((n) => (n === '' ? ['/'] : [`/${n}`, `/${n}/*`]));
  const controller = handlers.pop();
  router.all(paths, ...handlers, handle(controller));
}

module.exports = { ciRoute };
