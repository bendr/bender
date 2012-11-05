"use strict";

var util = require("util");
var port = 6379;

exports.init = function(morbo, args, k) {
  args.forEach(function(arg) {
    var m;
    if (m = arg.match(/^redis=(\d+)/)) {
      port = parseInt(m[1], 10);
    }
  });
  var redis = require("redis").createClient(port);
  morbo.TRANSACTION.redis = redis;
  morbo.TRANSACTION.rwrap = function(f) {
    return function(err) {
      if (err) {
        this.serve_error(500, "Redis error: " + err);
      } else {
        f.apply(this, Array.prototype.slice.call(arguments, 1));
      }
    }.bind(this);
  };
  redis.on("error", function(err) {
    util.log("Redis error: " + err);
    process.exit(1);
  });
  redis.on("ready", function() {
    util.log("redis ready ({0})".fmt(redis.port));
    k();
  });
};
