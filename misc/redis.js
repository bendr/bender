var util = require("util");

var PORT = 6379;  // default Redis server port

exports.init = function(morbo, args, f)
{
  args.forEach(function(arg) {
      if (m = arg.match(/^redis=(\d+)/)) {
        PORT = parseInt(m[1], 10);
      }
    });
  var redis = require("redis").createClient(PORT);
  morbo.TRANSACTION.redis = redis;
  morbo.TRANSACTION.rwrap = function(f)
  {
    var transaction = this;
    return function(err) {
        if (err) {
          transaction.serve_error(500, "Redis error: " + err);
        } else {
          f.apply(transaction, [].slice.call(arguments, 1));
        }
      };
  };
  redis.on("error", function(err) {
      util.log("Redis error:", err);
      process.exit(1);
    });
  redis.on("ready", function() {
      util.log("redis ready ({0})".fmt(redis.port));
      f();
    });
};
