// Error pages for Morbo

"use strict";

var morbo = require("morbo");

// Icons from raphael.js

function error_icon() {
  return morbo.$svg({ "class": "icon error", "viewBox": "0 0 32 32" },
      morbo.$path({ d: "M16,4.938c-7.732,0-14,4.701-14,10.5c0,1.981,0.741,3.833,2.016,5.414L2,25.272l5.613-1.44c2.339,1.316,5.237,2.106,8.387,2.106c7.732,0,14-4.701,14-10.5S23.732,4.938,16,4.938zM16.868,21.375h-1.969v-1.889h1.969V21.375zM16.772,18.094h-1.777l-0.176-8.083h2.113L16.772,18.094z" }));
}

morbo.serve_error_page = function (transaction, code, log) {
  var msg = morbo.STATUS_CODES[code] || "(unknown error code)";
  if (log) {
    transaction.log_error = "{0}: {1} ({2})".fmt(code, msg, log);
  }
  transaction.serve_html(morbo.html_page({ title: "Error {0}".fmt(code) },
      morbo.$$stylesheet("/morbo.css"),
      morbo.$p({ "class": "error-message" },
        error_icon() + "Error {0}: {1}".fmt(code, msg))));
};
