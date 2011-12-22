// Cf. http://tools.ietf.org/html/rfc3986
// reserved    = gen-delims / sub-delims
// gen-delims  = ":" / "/" / "?" / "#" / "[" / "]" / "@"
// sub-delims  = "!" / "$" / "&" / "'" / "(" / ")"
//             / "*" / "+" / "," / ";" / "="
// unreserved  = ALPHA / DIGIT / "-" / "." / "_" / "~"
// URI         = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
// hier-part   = "//" authority path-abempty
//             / path-absolute
//             / path-rootless
//             / path-empty
// scheme      = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
// authority   = [ userinfo "@" ] host [ ":" port ]
// userinfo    = *( unreserved / pct-encoded / sub-delims / ":" )
// host        = IP-literal / IPv4address / reg-name
// IP-literal = "[" ( IPv6address / IPvFuture  ) "]"
// IPvFuture  = "v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )
// IPv6address =                            6( h16 ":" ) ls32
//             /                       "::" 5( h16 ":" ) ls32
//             / [               h16 ] "::" 4( h16 ":" ) ls32
//             / [ *1( h16 ":" ) h16 ] "::" 3( h16 ":" ) ls32
//             / [ *2( h16 ":" ) h16 ] "::" 2( h16 ":" ) ls32
//             / [ *3( h16 ":" ) h16 ] "::"    h16 ":"   ls32
//             / [ *4( h16 ":" ) h16 ] "::"              ls32
//             / [ *5( h16 ":" ) h16 ] "::"              h16
//             / [ *6( h16 ":" ) h16 ] "::"
// ls32        = ( h16 ":" h16 ) / IPv4address
//             ; least-significant 32 bits of address
// h16         = 1*4HEXDIG
//             ; 16 bits of address represented in hexadecimal
// IPv4address = dec-octet "." dec-octet "." dec-octet "." dec-octet
// dec-octet   = DIGIT                 ; 0-9
//             / %x31-39 DIGIT         ; 10-99
//             / "1" 2DIGIT            ; 100-199
//             / "2" %x30-34 DIGIT     ; 200-249
//             / "25" %x30-35          ; 250-255
// reg-name    = *( unreserved / pct-encoded / sub-delims )
// port        = *DIGIT
// path        = path-abempty    ; begins with "/" or is empty
//             / path-absolute   ; begins with "/" but not "//"
//             / path-noscheme   ; begins with a non-colon segment
//             / path-rootless   ; begins with a segment
//             / path-empty      ; zero characters
// path-abempty  = *( "/" segment )
// path-absolute = "/" [ segment-nz *( "/" segment ) ]
// path-noscheme = segment-nz-nc *( "/" segment )
// path-rootless = segment-nz *( "/" segment )
// path-empty    = 0<pchar>
// segment       = *pchar
// segment-nz    = 1*pchar
// segment-nz-nc = 1*( unreserved / pct-encoded / sub-delims / "@" )
//               ; non-zero-length segment without any colon ":"
// pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
// query       = *( pchar / "/" / "?" )
// fragment    = *( pchar / "/" / "?" )


function parse_uri(uri)
{
  var u = { raw: uri }, m;
  // Scheme
  if (m = uri.match(/^([a-zA-Z](?:[a-zA-Z0-9+.-]*)):)/)) {
    uri = uri.substr(m[0].length);
    u.scheme = m[1];
    // Authority
    if (m = uri.match(/^\/\//)) {
    }
  }
  return u;
}

function split_uri(uri)
{
  var m = uri.match(/^(?:([a-zA-Z](?:[a-zA-Z0-9+.-]*)):(?:\/\/([^\/]*))?)?([^#?]*)(?:\?([^#]*))?(?:#(.*))?$/);
  var u = {};
  ["scheme", "authority", "path", "query", "fragment"].forEach(function(k, i) {
      if (m && m[i + 1]) u[k] = m[i + 1];
    });
  return u;
}

function absolute_uri(base, ref)
{
  var r = split_uri(ref);
  if (r.scheme) {
    r.path = remove_dot_segments(r.path);
  } else {
    var b = split_uri(base);
    r.scheme = b.scheme;
    if (r.authority) {
      r.path = remove_dot_segments(r.path);
    } else {
      r.authority = b.authority;
      if (!r.path) {
        r.path = b.path
        if (!r.query) r.query = b.query;
      } else {
        if (r.path.substr(0, 1) === "/") {
          r.path = remove_dot_segments(r.path);
        } else {
          r.path = b.authority && !b.path ? "/" + r.path :
            remove_dot_segments(b.path.replace(/\/[^\/]*$/, "/") + r.path);
        }
      }
    }
  }
  return (r.scheme ? r.scheme + ":" : "") +
    (r.authority ? "//" + r.authority : "") +
    r.path +
    (r.query ? "?" + r.query : "") +
    (r.fragment ? "#" + r.fragment : "");
}

function remove_dot_segments(path)
{
  for (var input = path, output = "", m; input;) {
    if (m = input.match(/^\.\.?\//)) {
      input = input.substr(m[0].length);
    } else if (m = input.match(/^\/\.\/|\/\.$/)) {
      input = "/" + input.substr(m[0].length);
    } else if (m = input.match(/^\/\.\.\/|\/\.\.$/)) {
      input = "/" + input.substr(m[0].length);
      output = output.replace(/\/?[^\/]*$/, "");
    } else if (input === "." || input === "..") {
      input = "";
    } else {
      m = input.match(/^\/?[^\/]*/);
      input = input.substr(m[0].length);
      output += m[0];
    }
    // console.log("  \"" + input + "\", \"" + output + "\"");
  }
  return output;
}

var uris = [ "ftp://ftp.is.co.za/rfc/rfc1808.txt",
  "http://www.ietf.org/rfc/rfc2396.txt",
  "ldap://[2001:db8::7]/c=GB?objectClass?one",
  "mailto:John.Doe@example.com",
  "news:comp.infosystems.www.servers.unix",
  "tel:+1-816-555-1212",
  "telnet://192.0.2.16:80/",
  "urn:oasis:names:specification:docbook:dtd:xml:4.1.2",

  "foo://example.com:8042/over/there?name=ferret#nose",
  "urn:example:animal:ferret:nose",
  "../lib/test.xml",

  "http://localhost:8910/run.html", "lib/push-button.xml",
  "/lib/push-button.xml",
];

uris.forEach(function(uri) {
  var u = split_uri(uri);
  console.log(uri, ":", u);
});

[
  ["http://localhost:8910/run.html?app=test/button.xml&debug=1", "lib/push-button.xml"],
  ["http://localhost:8910", "lib/push-button.xml"],
  ["http://localhost:8910/tests/button.xml", "#button"],
  ["http://localhost:8910/tests/button.xml", "../lib/button.xml"],
  ["http://localhost:8910/tests/button.xml", "/lib/button.xml"],
].forEach(function(pair) {
    console.log(pair[0], pair[1], absolute_uri(pair[0], pair[1]));
  });

/*
uris.forEach(function(uri) {
  var u = parse_uri(uri);
  console.log(uri);
  ["scheme", "userinfo", "host", "port", "path", "query", "fragment"]
    .forEach(function(k) {
      if (u.hasOwnProperty(k)) console.log("  " + k + ": " + u[k]);
    });
});
*/
