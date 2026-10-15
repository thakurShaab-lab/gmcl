// Body of CodeIgniter show_error() (apps/views/errors/html/error_general.php); sent with HTTP 500.
const TEMPLATE = "<!DOCTYPE html>\r\n<html lang=\"en\">\r\n<head>\r\n<meta charset=\"utf-8\">\r\n<title>{title}</title>\r\n<style type=\"text/css\">\r\n\r\n::selection { background-color: #E13300; color: white; }\r\n::-moz-selection { background-color: #E13300; color: white; }\r\n\r\nbody {\r\n\tbackground-color: #fff;\r\n\tmargin: 40px;\r\n\tfont: 13px/20px normal Helvetica, Arial, sans-serif;\r\n\tcolor: #4F5155;\r\n}\r\n\r\na {\r\n\tcolor: #003399;\r\n\tbackground-color: transparent;\r\n\tfont-weight: normal;\r\n}\r\n\r\nh1 {\r\n\tcolor: #444;\r\n\tbackground-color: transparent;\r\n\tborder-bottom: 1px solid #D0D0D0;\r\n\tfont-size: 19px;\r\n\tfont-weight: normal;\r\n\tmargin: 0 0 14px 0;\r\n\tpadding: 14px 15px 10px 15px;\r\n}\r\n\r\ncode {\r\n\tfont-family: Consolas, Monaco, Courier New, Courier, monospace;\r\n\tfont-size: 12px;\r\n\tbackground-color: #f9f9f9;\r\n\tborder: 1px solid #D0D0D0;\r\n\tcolor: #002166;\r\n\tdisplay: block;\r\n\tmargin: 14px 0 14px 0;\r\n\tpadding: 12px 10px 12px 10px;\r\n}\r\n\r\n#container {\r\n\tmargin: 10px;\r\n\tborder: 1px solid #D0D0D0;\r\n\tbox-shadow: 0 0 8px #D0D0D0;\r\n}\r\n\r\np {\r\n\tmargin: 12px 15px 12px 15px;\r\n}\r\n</style>\r\n</head>\r\n<body>\r\n\t<div id=\"container\">\r\n\t\t<h1>{heading}</h1>\r\n\t\t{message}\t</div>\r\n</body>\r\n</html>";

/**
 * heading: <h1> text; messages: one string or an array (CI wraps each in <p>); title: 'Error' or 'Database Error'.
 */
module.exports = (heading, messages, title = 'Error') => {
  const body = (Array.isArray(messages) ? messages : [messages]).map((m) => `<p>${m}</p>`).join('');
  return TEMPLATE.replace('{title}', () => title).replace('{heading}', () => heading).replace('{message}', () => body);
};
