/**
 * Port of CodeIgniter 3.0.0 CI_Form_validation + apps/libraries/MY_Form_validation.php.
 *
 * Behaviour that leaks into API responses and is kept on purpose:
 *  - set_rules() is ignored unless the request method is POST, and run() returns false (with no errors)
 *    when $_POST is empty.
 *  - Prepping rules (trim, ...) write the processed value back into $_POST.
 *  - Messages: field custom error -> set_message() -> lang "form_validation_<rule>" -> lang "<rule>".
 *  - Labels come from lang() and may be boolean false, which prints as "".
 *
 * Callback rules ("callback_x") call ci.callbacks.x(value, param), which may be async.
 */
const fs = require('fs');
const { formValidationLang, configItem } = require('../config/app');
const { str, isNumeric, num, strtotime, time, trim, ltrim, rtrim, md5, sha1, intval, strtolower, strtoupper, ucfirst, ucwords, htmlspecialchars } = require('./php');
const { stripTags } = require('./phpJson');
const { countRecord } = require('../model/common.model');

// PHP 7.4 FILTER_VALIDATE_EMAIL
const EMAIL_RE = new RegExp(
  '^(?!(?:(?:\\x22?\\x5C[\\x00-\\x7E]\\x22?)|(?:\\x22?[^\\x5C\\x22]\\x22?)){255,})(?!(?:(?:\\x22?\\x5C[\\x00-\\x7E]\\x22?)|(?:\\x22?[^\\x5C\\x22]\\x22?)){65,}@)(?:(?:[\\x21\\x23-\\x27\\x2A\\x2B\\x2D\\x2F-\\x39\\x3D\\x3F\\x5E-\\x7E]+)|(?:\\x22(?:[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x21\\x23-\\x5B\\x5D-\\x7F]|(?:\\x5C[\\x00-\\x7F]))*\\x22))(?:\\.(?:(?:[\\x21\\x23-\\x27\\x2A\\x2B\\x2D\\x2F-\\x39\\x3D\\x3F\\x5E-\\x7E]+)|(?:\\x22(?:[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x21\\x23-\\x5B\\x5D-\\x7F]|(?:\\x5C[\\x00-\\x7F]))*\\x22)))*@(?:(?:(?!.*[^.]{64,})(?:(?:(?:xn--)?[a-z0-9]+(?:-+[a-z0-9]+)*\\.){1,126}){1,}(?:(?:[a-z][a-z0-9]*)|(?:(?:xn--)[a-z0-9]+))(?:-+[a-z0-9]+)*)|(?:\\[(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){7})|(?:(?!(?:.*[a-f0-9][:\\]]){7,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?)))|(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){5}:)|(?:(?!(?:.*[a-f0-9]:){5,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3}:)?)))?(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))(?:\\.(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))){3}))\\]))$',
  'i',
);
const validEmail = (s) => {
  s = str(s);
  return Buffer.byteLength(s) <= 320 && EMAIL_RE.test(s);
};

const mbLen = (s) => [...str(s)].length;

/** Native PHP functions usable as rules (CI calls function_exists($rule)). */
const NATIVE = {
  trim: (v, p) => (p === false ? trim(v) : trim(v, p)),
  ltrim: (v, p) => (p === false ? ltrim(v) : ltrim(v, p)),
  rtrim: (v, p) => (p === false ? rtrim(v) : rtrim(v, p)),
  strip_tags: (v) => stripTags(str(v)),
  htmlspecialchars: (v) => htmlspecialchars(v),
  md5: (v) => md5(v),
  sha1: (v) => sha1(v),
  intval: (v) => intval(v),
  strtolower: (v) => strtolower(v),
  strtoupper: (v) => strtoupper(v),
  ucfirst: (v) => ucfirst(v),
  ucwords: (v) => ucwords(v),
  urldecode: (v) => decodeURIComponent(str(v).replace(/\+/g, ' ')),
  is_numeric: (v) => isNumeric(v),
};

function sprintfLegacy(line, ...args) {
  let i = 0;
  return line.replace(/%%|%s/g, (m) => (m === '%%' ? '%' : str(args[i++])));
}

class FormValidation {
  constructor(ci) {
    this.ci = ci;
    this.fieldData = new Map();
    this.errorArray = new Map();
    this.errorMessages = {};
    this.errorPrefix = '<p>';
    this.errorSuffix = '</p>';
  }

  setErrorDelimiters(prefix = '<p>', suffix = '</p>') {
    this.errorPrefix = prefix;
    this.errorSuffix = suffix;
    return this;
  }

  setMessage(rule, message = '') {
    if (typeof rule === 'object') Object.assign(this.errorMessages, rule);
    else this.errorMessages[rule] = message;
    return this;
  }

  /** set_rules($field, $label, $rules) — also accepts an array of {field,label,rules}. */
  setRules(field, label = '', rules = [], errors = {}) {
    if (this.ci.input.method() !== 'post') return this;
    if (Array.isArray(field)) {
      for (const row of field) {
        if (!row || row.field === undefined || row.rules === undefined) continue;
        this.setRules(row.field, row.label !== undefined ? row.label : row.field, row.rules, row.errors || {});
      }
      return this;
    }
    if (typeof field !== 'string' || field === '') return this;
    if (!Array.isArray(rules)) {
      if (typeof rules !== 'string') return this;
      rules = rules.split('|');
    }
    label = label === '' ? field : label;
    const keys = [];
    const isArray = /\[(.*?)\]/.test(field);
    if (isArray) {
      keys.push(field.slice(0, field.indexOf('[')));
      for (const m of field.matchAll(/\[(.*?)\]/g)) if (m[1] !== '') keys.push(m[1]);
    }
    this.fieldData.set(field, { field, label, rules, errors, isArray, keys, postdata: null, error: '' });
    return this;
  }

  /** Message lookup used by _execute(). */
  line(rule) {
    if (Object.prototype.hasOwnProperty.call(formValidationLang, `form_validation_${rule}`)) return formValidationLang[`form_validation_${rule}`];
    if (Object.prototype.hasOwnProperty.call(formValidationLang, rule)) return formValidationLang[rule];
    return false;
  }

  translateFieldname(label) {
    const m = typeof label === 'string' && label.match(/^lang:(\S+)/);
    if (m) {
      const t = this.line(m[1]);
      return t === false ? m[1] : t;
    }
    return label;
  }

  buildErrorMsg(line, field = '', param = '') {
    line = str(line);
    if (line.includes('%s')) return sprintfLegacy(line, field, param);
    return line.split('{field}').join(str(field)).split('{param}').join(str(param));
  }

  reduceArray(array, keys, i = 0) {
    if (array !== null && typeof array === 'object' && keys[i] !== undefined) {
      return array[keys[i]] !== undefined && array[keys[i]] !== null ? this.reduceArray(array[keys[i]], keys, i + 1) : null;
    }
    return array === '' ? null : array;
  }

  /** run(): MY_Form_validation adds a dummy POST item for file-only forms. */
  async run() {
    const POST = this.ci.POST;
    const files = this.ci.FILES;
    const dummy = Object.keys(POST).length === 0 && Object.keys(files).length > 0;
    if (dummy) POST.DUMMY_ITEM = '';
    try {
      return await this.runParent(POST);
    } finally {
      if (dummy) delete POST.DUMMY_ITEM;
    }
  }

  async runParent(data) {
    if (Object.keys(data).length === 0) return false;
    if (this.fieldData.size === 0) return false;
    // $this->CI->lang->load('form_validation'): its lines are available to lang() from now on.
    this.ci.formValidationLangLoaded = true;
    for (const [field, row] of this.fieldData) {
      if (row.isArray) row.postdata = this.reduceArray(data, row.keys);
      else if (data[field] !== undefined && data[field] !== null && data[field] !== '') row.postdata = data[field];
    }
    for (const row of this.fieldData.values()) {
      if (!row.rules || row.rules.length === 0) continue;
      await this.execute(row, row.rules, row.postdata);
    }
    const total = this.errorArray.size;
    this.resetPostArray();
    return total === 0;
  }

  resetPostArray() {
    const POST = this.ci.POST;
    for (const row of this.fieldData.values()) {
      if (row.postdata === null) continue;
      if (!row.isArray) {
        if (POST[row.field] !== undefined && POST[row.field] !== null) POST[row.field] = row.postdata;
      } else {
        let ref = POST;
        const keys = row.keys;
        for (let i = 0; i < keys.length - 1; i++) {
          if (ref[keys[i]] === null || typeof ref[keys[i]] !== 'object') ref[keys[i]] = {};
          ref = ref[keys[i]];
        }
        ref[keys[keys.length - 1]] = Array.isArray(row.postdata) ? [...row.postdata] : row.postdata;
      }
    }
  }

  saveError(row, message) {
    row.error = message;
    if (!this.errorArray.has(row.field)) this.errorArray.set(row.field, message);
  }

  /** MY_Form_validation::_execute(): file fields are validated against $_FILES[field]. */
  async execute(row, rules, postdata, cycles = 0) {
    const file = this.ci.FILES[row.field];
    if (file !== undefined) return this.executeFile(row, [...rules], file);
    return this.executeParent(row, rules, postdata, cycles);
  }

  async executeParent(row, rules, postdata, cycles) {
    if (postdata !== null && typeof postdata === 'object') {
      for (const [key, val] of Object.entries(postdata)) await this.executeParent(row, rules, val, key);
      return;
    }
    let callback = false;
    if (!rules.includes('required') && (postdata === null || postdata === '')) {
      const cb = rules.find((r) => typeof r === 'string' && r.startsWith('callback_'));
      if (cb) {
        callback = true;
        rules = [cb];
      } else return;
    }
    if ((postdata === null || postdata === '') && !callback) {
      if (rules.includes('isset') || rules.includes('required')) {
        const type = rules.includes('required') ? 'required' : 'isset';
        let line;
        if (row.errors[type] !== undefined) line = row.errors[type];
        else if (this.errorMessages[type] !== undefined) line = this.errorMessages[type];
        else if ((line = this.line(type)) === false) line = 'The field was not set';
        this.saveError(row, this.buildErrorMsg(line, this.translateFieldname(row.label)));
      }
      return;
    }

    for (let rule of rules) {
      let inArray = false;
      if (row.isArray && Array.isArray(row.postdata)) {
        if (row.postdata[cycles] === undefined) continue;
        postdata = row.postdata[cycles];
        inArray = true;
      } else {
        postdata = row.postdata !== null && typeof row.postdata === 'object' ? null : row.postdata;
      }
      const isCallback = typeof rule === 'string' && rule.startsWith('callback_');
      if (isCallback) rule = rule.slice(9);
      let param = false;
      const pm = rule.match(/^(.*?)\[(.*)\]/s);
      if (pm) {
        rule = pm[1];
        param = pm[2];
      }
      const assign = (result) => {
        const value = typeof result === 'boolean' ? postdata : result;
        if (inArray) row.postdata[cycles] = value;
        else row.postdata = value;
      };
      let result;
      if (isCallback) {
        const fn = this.ci.callbacks && this.ci.callbacks[rule];
        result = fn ? await fn(postdata, param) : false;
        assign(result);
        if (!rules.includes('required') && result !== false) continue;
      } else if (typeof this[`rule_${rule}`] !== 'function') {
        if (NATIVE[rule]) {
          result = NATIVE[rule](postdata, param);
          assign(result);
        } else result = false;
      } else {
        result = await this[`rule_${rule}`](postdata, param);
        assign(result);
      }
      if (result === false) {
        let line;
        if (row.errors[rule] !== undefined) line = row.errors[rule];
        else if (this.errorMessages[rule] === undefined) {
          if ((line = this.line(rule)) === false) line = `${formValidationLang.form_validation_error_message_not_set}(${rule})`;
        } else line = this.errorMessages[rule];
        if (param !== false && this.fieldData.has(param)) param = this.translateFieldname(this.fieldData.get(param).label);
        this.saveError(row, this.buildErrorMsg(line, this.translateFieldname(row.label), param === false ? '' : param));
        return;
      }
    }
  }

  /** File branch of MY_Form_validation::_execute(). */
  async executeFile(row, rules, file) {
    const requiredAt = rules.indexOf('required');
    if (requiredAt !== -1) rules[requiredAt] = 'file_required';
    if (file.error !== 0) {
      if (file.error !== 4) {
        this.errorArray.set(row.field, this.fileUploadErrorMessage(row.label, file.error));
        return false;
      }
      if (rules.includes('file_required')) {
        this.errorArray.set(row.field, this.fileUploadErrorMessage(row.label, file.error));
        row.error = this.errorArray.get(row.field);
        return false;
      }
    }
    if (!rules.includes('file_required') && file.size == 0) { // eslint-disable-line eqeqeq
      const cb = rules.join(' ').match(/(callback_\w+)/);
      if (cb) rules = [cb[1]];
      else return undefined;
    }
    for (let rule of rules) {
      const isCallback = rule.startsWith('callback_');
      if (isCallback) rule = rule.slice(9);
      let param = false;
      const pm = rule.match(/^(.*?)\[(.*?)\]/);
      if (pm) {
        rule = pm[1];
        param = pm[2];
      }
      let result;
      if (isCallback) {
        const fn = this.ci.callbacks && this.ci.callbacks[rule];
        if (!fn) continue;
        result = await fn(file, param);
        row.postdata = typeof result === 'boolean' ? file : result;
        if (!rules.includes('file_required') && result !== false) return undefined;
      } else if (typeof this[`rule_${rule}`] !== 'function') {
        if (NATIVE[rule]) {
          result = NATIVE[rule](file);
          row.postdata = typeof result === 'boolean' ? file : result;
        }
        continue;
      } else {
        result = await this[`rule_${rule}`](file, param);
        row.postdata = typeof result === 'boolean' ? file : result;
      }
      if (result === false) {
        let line;
        if (this.errorMessages[rule] === undefined) {
          if ((line = this.line(rule)) === false) line = 'Unable to access an error message corresponding to your field name.';
        } else line = this.errorMessages[rule];
        if (param !== false && this.fieldData.has(param)) param = this.fieldData.get(param).label;
        const message = sprintfLegacy(str(line), this.translateFieldname(row.label), param === false ? '' : param);
        row.error = message;
        this.errorArray.set(row.field, message);
        return undefined;
      }
    }
    return undefined;
  }

  fileUploadErrorMessage(field, code) {
    const L = formValidationLang;
    switch (code) {
      case 1: return L.error_max_filesize_phpini;
      case 2: return L.error_max_filesize_form;
      case 3: return L.error_partial_upload;
      case 4: return sprintfLegacy(L.file_required, this.translateFieldname(field));
      case 6: return L.error_temp_dir;
      case 7: return L.error_disk_write;
      case 8: return L.error_stopped;
      default: return L.error_unexpected + code;
    }
  }

  /* ------------------------------------------------------------ outputs */

  /** form_error() / $this->form_validation->error($field) */
  error(field, prefix = '', suffix = '') {
    const row = this.fieldData.get(field);
    if (!row || !row.error) return '';
    return (prefix === '' ? this.errorPrefix : prefix) + row.error + (suffix === '' ? this.errorSuffix : suffix);
  }

  /** validation_errors() / error_string() */
  errorString(prefix = '', suffix = '') {
    if (this.errorArray.size === 0) return '';
    prefix = prefix === '' ? this.errorPrefix : prefix;
    suffix = suffix === '' ? this.errorSuffix : suffix;
    let out = '';
    for (const val of this.errorArray.values()) if (val !== '') out += `${prefix}${val}${suffix}\n`;
    return out;
  }

  /** error_array() / web_service_validation_errors_list(): field => message, in insertion order. */
  errorList() {
    return this.errorArray;
  }

  /** @array_values(web_service_validation_errors_list())[0] — the first error message or null. */
  firstError() {
    const first = this.errorArray.values().next();
    return first.done ? null : first.value;
  }

  /* -------------------------------------------------------------- rules */

  rule_required(s) {
    return Array.isArray(s) ? s.length > 0 : trim(s) !== '';
  }
  rule_regex_match(s, regex) {
    const m = String(regex).match(/^(.)(.*)\1([a-z]*)$/s);
    return m ? new RegExp(m[2], m[3].replace(/[^gimsuy]/g, '')).test(str(s)) : false;
  }
  rule_matches(s, field) {
    const row = this.fieldData.get(field);
    return row && row.postdata !== null ? s === row.postdata : false;
  }
  rule_differs(s, field) {
    const row = this.fieldData.get(field);
    return !(row && row.postdata === s);
  }
  async rule_is_unique(s, field) {
    const [table, column] = String(field).split('.');
    return (await countRecord(this.ci.db, table, { [column]: s })) === 0;
  }
  rule_min_length(s, val) {
    return isNumeric(val) ? num(val) <= mbLen(s) : false;
  }
  rule_max_length(s, val) {
    return isNumeric(val) ? num(val) >= mbLen(s) : false;
  }
  rule_exact_length(s, val) {
    return isNumeric(val) ? mbLen(s) === intval(val) : false;
  }
  rule_valid_url(s) {
    return /^(http|https|ftp):\/\/([A-Z0-9][A-Z0-9_-]*(?:\.[A-Z0-9][A-Z0-9_-]*)+):?(\d+)?\/?/i.test(str(s));
  }
  rule_valid_email(s) {
    return validEmail(s);
  }
  rule_valid_emails(s) {
    s = str(s);
    if (!s.includes(',')) return validEmail(trim(s));
    return s.split(',').every((e) => trim(e) !== '' && validEmail(trim(e)));
  }
  rule_alpha(s) {
    return /^([a-zA-Z ])+$/.test(str(s));
  }
  rule_alpha_numeric(s) {
    return /^[a-zA-Z0-9]+$/.test(str(s));
  }
  rule_alpha_numeric_spaces(s) {
    return /^[A-Z0-9 ]+$/i.test(str(s));
  }
  rule_alpha_dash(s) {
    return /^[a-z0-9_-]+$/i.test(str(s));
  }
  rule_alpha_extra(s) {
    this.setMessage('alpha_extra', 'The %s field may only contain alpha-numeric characters, spaces, periods, underscores, and dashes.');
    return /^([.\s\-a-z0-9_-])+$/i.test(str(s));
  }
  rule_numeric(s) {
    return /^[-+]?[0-9]*\.?[0-9]+$/.test(str(s));
  }
  rule_integer(s) {
    return /^[-+]?[0-9]+$/.test(str(s));
  }
  rule_decimal(s) {
    return /^[+]?[0-9]+\.[0-9]+$/.test(str(s));
  }
  rule_greater_than(s, min) {
    return isNumeric(s) ? num(s) > num(min) : false;
  }
  rule_greater_than_equal_to(s, min) {
    return isNumeric(s) ? num(s) >= num(min) : false;
  }
  rule_less_than(s, max) {
    return isNumeric(s) ? num(s) < num(max) : false;
  }
  rule_less_than_equal_to(s, max) {
    return isNumeric(s) ? num(s) <= num(max) : false;
  }
  rule_in_list(v, list) {
    return String(list).split(',').includes(v);
  }
  rule_is_natural(s) {
    return /^[0-9]+$/.test(str(s));
  }
  rule_is_natural_no_zero(s) {
    return num(s) !== 0 && /^[0-9]+$/.test(str(s));
  }
  rule_is_valid_amount(s) {
    return /^[0-9]*(\.)?[0-9]+$/.test(str(s));
  }
  rule_notnumeric(s) {
    return /^([a-zA-Z ])+$/.test(str(s));
  }
  rule_required_stripped(s) {
    const v = trim(trim(stripTags(str(s))).replace(/(&nbsp;)+/g, ''));
    return v !== '';
  }
  rule_valid_text(s, s1) {
    if (s == s1) { // eslint-disable-line eqeqeq
      this.setMessage('valid_text', 'The %s field must contain some other value(instead of the given text).');
      return false;
    }
    return true;
  }
  rule_exclude_text(s, s2) {
    return trim(strtolower(s)) !== trim(strtolower(s2));
  }
  rule_one_of(s, options) {
    if (!options) return false;
    if (!String(options).split(',').includes(s)) {
      this.setMessage('one_of', '%s must contain one of the available selections.');
      return false;
    }
    return true;
  }
  rule_matches_pattern(s, pattern) {
    if (new RegExp(`^${pattern}$`).test(str(s))) return true;
    this.setMessage('matches_pattern', 'The %s field does not match the required pattern.');
    return false;
  }
  rule_valid_password(s) {
    s = str(s);
    const min = configItem('auth.password_min_length');
    if (Buffer.byteLength(s) < num(min)) {
      this.setMessage('valid_password', `%s should  be at least ${min} character in length.`);
      return false;
    }
    if (num(configItem('auth.password_force_numbers')) && !/[0-9]/.test(s)) {
      this.setMessage('valid_password', '%s must contain at least 1 number.');
      return false;
    }
    if (num(configItem('auth.password_force_symbols')) && !/[!@#$%^&*()._]/.test(s)) {
      this.setMessage('valid_password', '%s must contain at least 1 punctuation mark.');
      return false;
    }
    if (num(configItem('auth.password_force_mixed_case'))) {
      if (!/[A-Z]/.test(s)) {
        this.setMessage('valid_password', '%s must contain at least 1 uppercase characters.');
        return false;
      }
      if (!/[a-z]/.test(s)) {
        this.setMessage('valid_password', '%s must contain at least 1 lowercase characters.');
        return false;
      }
    }
    return true;
  }
  rule_valid_past_date(d) {
    if (d === '0000-00-00' || d === '0000-00-00 00:00:00') return false;
    return time() - num(strtotime(d)) > 0;
  }
  rule_valid_future_date(d) {
    if (d === '0000-00-00' || d === '0000-00-00 00:00:00') return false;
    return time() - num(strtotime(d)) < 0;
  }

  /* file rules (receive the $_FILES entry) */
  rule_file_required(file) {
    if (file.size === 0) {
      this.setMessage('file_required', 'Uploading a file for %s is required');
      return false;
    }
    return true;
  }
  rule_file_size_max(file, maxSize) {
    if (Math.ceil(num(file.size) / 1024) > num(maxSize)) {
      this.setMessage('file_size_max', `File is too big. (max allowed is ${maxSize} KB)`);
      return false;
    }
    return true;
  }
  rule_file_allowed_type(file, type) {
    if (str(file.name) === '') return undefined;
    let exts = String(type).split(',');
    if (exts.length > 1) {
      for (const v of exts) if (this.rule_file_allowed_type(file, v) === true) return true;
    }
    const groups = {
      image: ['jpg', 'jpeg', 'gif', 'png'],
      document: ['doc', 'docx', 'pdf'],
      pdf: ['pdf'],
      media: ['mpg', 'mpeg', 'flv', 'mp4', 'mpg', 'mpeg4', '3GP'],
      compressed: ['zip'],
      audio: ['mp3'],
      excel_document: ['xls'],
    };
    if (groups[exts[0]]) exts = groups[exts[0]];
    const dot = file.name.lastIndexOf('.');
    const ext = strtolower(dot === -1 ? '' : file.name.slice(dot + 1));
    const fail = () => {
      this.setMessage('file_allowed_type', `File should be ${exts.join(' | ')}`);
      return false;
    };
    if (!exts.includes(ext)) return fail();
    return fileSignature(type, file.tmp_name) ? true : fail();
  }
  rule_check_dimension(file, dimen) {
    const size = imageSize(file.tmp_name);
    const [w, h] = String(dimen).split('x');
    if (!size || size.width > num(w) || size.height > num(h)) {
      if (!size) return true;
      this.setMessage('check_dimension', `File dimension  is too big. (max allowed dimension is ${dimen} )`);
      return false;
    }
    return true;
  }
}

/** MY_Form_validation::file_validation(): magic-byte check. */
function fileSignature(type, path) {
  let header;
  try {
    const fd = fs.openSync(path, 'r');
    header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
  } catch (e) {
    return false;
  }
  const starts = (hex) => header.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  const sig = {
    image: ['ffd8', '89504e470d0a1a0a', '474946'],
    media: ['3026b2758e66cf11', '494433', '0000001866747970', '464c5601'],
    document: ['7b5c7274', '504b030414000600', '25504446', 'd0cf11e0a1b11ae1'],
    pdf: ['25504446'],
    compressed: ['504b0304'],
    excel_document: ['d0cf11e0a1b11ae1'],
  }[type];
  return sig ? sig.some(starts) : false;
}

/** Minimal getimagesize() for JPEG/PNG/GIF. */
function imageSize(path) {
  try {
    const b = fs.readFileSync(path);
    if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b.subarray(0, 3).toString() === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

module.exports = { FormValidation, validEmail };
