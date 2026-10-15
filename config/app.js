const phpConfig = require('./php-config.json');
const langFile = require('./lang.json');
const { phpDate } = require('../utils/php');

// md5('ALIFTRADINGAPP') — static key accepted by Api_Controller in place of a user token.
const API_KEY = 'f5a4b752c74c15d8f4307a3cd5258e4e';

/**
 * $this->config->item($key). Missing keys return null (CI returns NULL).
 * 'config.date.time' / 'config.date' were evaluated with date() on every request.
 */
function configItem(key) {
  if (key === 'config.date.time') return phpDate('Y-m-d H:i:s');
  if (key === 'config.date') return phpDate('Y-m-d');
  return Object.prototype.hasOwnProperty.call(phpConfig, key) ? phpConfig[key] : null;
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * CI lang() helper: the line, or boolean false when the key does not exist. withFormValidation = the
 * form_validation language file has been loaded in this request (it is merged over the english lines).
 */
function lang(key, withFormValidation = false) {
  if (withFormValidation && has(langFile.form_validation, key)) return langFile.form_validation[key];
  return has(langFile.english, key) ? langFile.english[key] : false;
}

module.exports = { API_KEY, configItem, lang, formValidationLang: langFile.form_validation };
