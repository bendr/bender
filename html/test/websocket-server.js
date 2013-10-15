// Simple Websocket server for the websocket test

var flexo = require("../flexo.js");

var lights = [5, 6, 9].map(function (pin) { return { pin: pin, vol: 0 } });

var tcp = require("net");
var crypto = require("crypto");
var server = tcp.createServer(function (c) {
  c.__pending_handshake = true;
  c.on("end", function () {
    // c.__pending_handshake = true;
  });
  c.on("data", function (data) {
    console.log(data);
    if (c.__pending_handshake) {
      handshake(c, data);
    } else {
      read_frame(c, data);
    }
  });
});
server.listen(6455, function () {
  console.log("WebSocket server bound");
});

// Read a frame from the client
function read_frame(c, data) {
  console.log("Frame:", data);
  var fin = (data[0] & 0x80) === 0x80;
  var opcode = data[0] & 0xf;
  var masked = (data[1] & 0x80) === 0x80;
  var length = data[1] & 0x7f;
  // TODO length > 126
  var masking_key = masked ? data.slice(2, 6) : null;
  var app_data = data.slice(masked ? 6 : 2, data.length);
  for (var i = 0, n = app_data.length; i < n; ++i) {
    app_data[i] = (app_data[i] ^ masking_key[i % 4]) & 0xff;
  }
  if (opcode === 1) {
    app_data = app_data.toString();
  }
  console.log(app_data);
  if (opcode === 1) {
    var msg = app_data.split(".");
    var pin = parseInt(msg[0], 10);
    lights.forEach(function (light) {
      if (light.pin === pin) {
        light.vol = parseInt(msg[1], 10);
        send_frame(c, "%0.%1".fmt(light.vol === 0 ? "off" : "on", pin));
      }
    });
    console.log(lights);
  }
}

function send_frame(c, data) {
  var frame = new Buffer("  " + data);  // 2 bytes for header + data
  var n = frame.length - 2;
  frame[0] = 0x81;                      // FIN is set; opcode is 1
  frame[1] = n;                         // masked bit set + length
  console.log("Send:", data);
  console.log("Send:", frame);
  c.write(frame);
}

// Parse the HTTP request from the server and if correct sends back a 101
// response with the accept token, clearing the handshake flag of the connection
// in the process
function handshake(c, data) {
  delete c.__pending_handshake;
  var req = parse_get_request(data.toString());
  if (req) {
    // check for host header
    // check for upgrade header
    // check for connection header
    // check for origin header
    // check for sec-websocket-version header
    var hash = crypto.createHash("sha1");
    hash.update(req["sec-websocket-key"] +
      "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    var response = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: upgrade",
      "Sec-WebSocket-Accept: " + hash.digest("base64")
    ].join("\r\n") + "\r\n\r\n";
    console.log(response);
    c.write(response);
  }
}

// Parse the get request for the initial handshake
function parse_get_request(reqstr) {
  var m = reqstr.match(/^GET ([^ ]+) HTTP\/(\d+)\.(\d+)\r\n/);
  if (m) {
    var major = parseInt(m[2], 10);
    var minor = parseInt(m[3], 10);
    if (major === 0 || (major === 1 && minor === 0)) {
      // reject HTTP versions before 1.1
      return;
    }
    var request = { "request-uri": m[1] };
    reqstr.substr(m[0].length).split("\r\n").forEach(function (line) {
      if (m = line.match(/^([^:]+):\s*(.+)$/)) {
        request[m[1].toLowerCase()] = m[2];
      }
    });
    return request;
  }
}
