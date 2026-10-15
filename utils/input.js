/** CodeIgniter 3.0.0 CI_Input equivalent over the request's $_GET/$_POST. */
const { xssClean } = require('./xssClean');

class Input {
  constructor(ci) {
    this.ci = ci;
  }

  /** _fetch_from_array(): supports "a[b]" notation; missing keys return null. */
  fetch(array, index, xss = false) {
    if (index === undefined || index === null) {
      const all = {};
      for (const k of Object.keys(array)) all[k] = this.fetch(array, k, xss);
      return all;
    }
    let value;
    if (Object.prototype.hasOwnProperty.call(array, index) && array[index] !== null) {
      value = array[index];
    } else {
      const parts = String(index).match(/(?:^[^[]+)|\[[^\]]*\]/g) || [];
      if (parts.length <= 1) return null;
      value = array;
      for (const part of parts) {
        const key = part.replace(/^\[|\]$/g, '');
        if (key === '') break;
        if (value !== null && typeof value === 'object' && value[key] !== undefined && value[key] !== null) value = value[key];
        else return null;
      }
    }
    return xss === true ? xssClean(value, this.ci.requestUri) : value;
  }

  /** $this->input->post($index, $xss_clean) */
  post(index, xss) {
    return this.fetch(this.ci.POST, index, xss);
  }

  /** $this->input->get($index, $xss_clean) */
  get(index, xss) {
    return this.fetch(this.ci.GET, index, xss);
  }

  /** $this->input->get_post(): CodeIgniter 3.0.0 checks $_GET first, then $_POST. */
  getPost(index, xss) {
    const g = this.ci.GET[index];
    return g !== undefined && g !== null ? this.get(index, xss) : this.post(index, xss);
  }

  /** $this->input->server('HTTP_X') / ('REQUEST_METHOD') */
  server(name) {
    const req = this.ci.req;
    if (name === 'REQUEST_METHOD') return req.method;
    if (name === 'REMOTE_ADDR') return req.socket.remoteAddress;
    if (name === 'REQUEST_URI') return req.originalUrl;
    if (name === 'HTTP_HOST') return req.headers.host === undefined ? null : req.headers.host;
    if (name.startsWith('HTTP_')) {
      const v = req.headers[name.slice(5).toLowerCase().replace(/_/g, '-')];
      return v === undefined ? null : v;
    }
    return null;
  }

  /** $this->input->method(): lower-case request method */
  method() {
    return this.ci.req.method.toLowerCase();
  }

  /** $this->input->ip_address() (no proxy_ips configured) */
  ipAddress() {
    let ip = this.ci.req.socket.remoteAddress || '';
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip || '0.0.0.0';
  }
}

module.exports = { Input };
