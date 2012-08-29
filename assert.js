// Browser-based asssert for testing
// Ad-hoc port of the Node.js module, original license follows:

(function (assert) {
  "use strict";

  assert.AssertionError = function (options) {
    this.name = 'AssertionError';
    this.message = options.message;
    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = options.operator;
    var stackStartFunction = options.stackStartFunction || fail;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, stackStartFunction);
    }
  };

  function replacer(key, value) {
    if (value === undefined) {
      return '' + value;
    }
    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
      return value.toString();
    }
    if (typeof value === 'function' || value instanceof RegExp) {
      return value.toString();
    }
    return value;
  }

  function truncate(s, n) {
    if (typeof s == 'string') {
      return s.length < n ? s : s.slice(0, n);
    } else {
      return s;
    }
  }

  assert.AssertionError.prototype.toString = function() {
    if (this.message) {
      return [this.name + ':', this.message].join(' ');
    } else {
      return [
        this.name + ':',
        truncate(JSON.stringify(this.actual, replacer), 128),
        this.operator,
        truncate(JSON.stringify(this.expected, replacer), 128)
      ].join(' ');
    }
  };

  assert.fail = function (actual, expected, message, operator,
    stackStartFunction) {
    throw new assert.AssertionError({
      message: message,
      actual: actual,
      expected: expected,
      operator: operator,
      stackStartFunction: stackStartFunction
    });
  };

  assert.ok = function (value, message) {
    if (!value) {
      fail(value, true, message, "==", assert.ok);
    }
  };

  assert.strictEqual = function strictEqual(actual, expected, message) {
    if (actual !== expected) {
      assert.fail(actual, expected, message, "===", assert.strictEqual);
    }
  };

  var pSlice = Array.prototype.slice;

  function isUndefinedOrNull(value) {
    return value === null || value === undefined;
  }

  function isArguments(object) {
    return Object.prototype.toString.call(object) == "[object Arguments]";
  }

  function objEquiv(a, b) {
    if (isUndefinedOrNull(a) || isUndefinedOrNull(b)) {
      return false;
    }
    if (a.prototype !== b.prototype) {
      return false;
    }
    if (isArguments(a)) {
      if (!isArguments(b)) {
        return false;
      }
      a = pSlice.call(a);
      b = pSlice.call(b);
      return _deepEqual(a, b);
    }
    try {
      var ka = Object.keys(a);
      var kb = Object.keys(b);
      var key;
      var i;
    } catch (e) {
      //happens when one is a string literal and the other isn't
      return false;
    }
    if (ka.length != kb.length) {
      return false;
    }
    ka.sort();
    kb.sort();
    for (i = ka.length - 1; i >= 0; i--) {
      if (ka[i] != kb[i]) {
        return false;
      }
    }
    for (i = ka.length - 1; i >= 0; i--) {
      key = ka[i];
      if (!_deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  function _deepEqual(actual, expected) {
    if (actual === expected) {
      return true;
    } else if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();
    } else if (actual instanceof RegExp && expected instanceof RegExp) {
      return actual.source === expected.source &&
        actual.global === expected.global &&
        actual.multiline === expected.multiline &&
        actual.lastIndex === expected.lastIndex &&
        actual.ignoreCase === expected.ignoreCase;
    } else if (typeof actual != "object" && typeof expected != "object") {
      return actual == expected;
    } else {
      return objEquiv(actual, expected);
    }
  }

  assert.deepEqual = function (actual, expected, message) {
    if (!_deepEqual(actual, expected)) {
      assert.fail(actual, expected, message, "deepEqual", assert.deepEqual);
    }
  };



}(window.assert = {}));
