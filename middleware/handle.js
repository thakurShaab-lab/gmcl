/**
 * Glue between Express and the CodeIgniter-style request context (req.ci).
 *
 * PHP sent the response when the script ended, either normally or via exit/die. Here a controller (or
 * middleware) finishing normally, or throwing PhpExit through ci.exit(), sends the buffered output.
 */
const { PhpExit } = require('../utils/output');

/** Wraps an async (ci) => {} step that may exit; continues to the next handler otherwise. */
function ciMiddleware(fn) {
  return async (req, res, next) => {
    try {
      await fn(req.ci, req, res);
      next();
    } catch (err) {
      if (err instanceof PhpExit) req.ci.out.send({ cors: req.ci.cors !== false });
      else next(err);
    }
  };
}

/** Wraps an async controller (req, res) => {} and sends the PHP output buffer when it completes. */
function handle(controller) {
  return async (req, res, next) => {
    try {
      await controller(req, res);
    } catch (err) {
      if (!(err instanceof PhpExit)) {
        next(err);
        return;
      }
    }
    req.ci.out.send({ cors: req.ci.cors !== false });
  };
}

module.exports = { ciMiddleware, handle };
