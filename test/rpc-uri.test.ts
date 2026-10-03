/**
 * The JSON-RPC endpoint URI: parsing, credential handling, and the two
 * guarantees that matter more than the parsing.
 *
 * A password reaches this code percent-encoded and must come out byte-exact —
 * Core's own rpcauth generator emits `$` and other characters that a naive
 * split on `:` and `@` would mangle into a 401 nobody can explain.
 *
 * And no error message, anywhere, may contain the password.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BtcRpcUriError,
  parseBtcRpcEndpoint,
  redactBtcRpcEndpoint,
  resolveBtcRpcAuth,
  rpcAuthHeader,
  rpcBaseUrl,
} from "../src/chain/rpc-uri.js";

/**
 * Shaped like a real Core rpcauth password: hex with a `$` in the middle,
 * which is exactly the character that has to survive percent-encoding.
 */
const SECRET = "5a2d8ce0$58363a8c/2dcf:a615@77535";
const ENCODED = encodeURIComponent(SECRET);

describe("parseBtcRpcEndpoint", () => {
  it("parses a bare http endpoint", () => {
    const ep = parseBtcRpcEndpoint("http://127.0.0.1:8332");
    assert.deepEqual(ep, {
      scheme: "http",
      host: "127.0.0.1",
      port: 8332,
      basePath: "",
    });
  });

  it("parses credentials and percent-decodes the password", () => {
    const ep = parseBtcRpcEndpoint(`https://bitcoinrpc:${ENCODED}@rpc.example.dev:8332`);
    assert.equal(ep.scheme, "https");
    assert.equal(ep.host, "rpc.example.dev");
    assert.equal(ep.port, 8332);
    assert.equal(ep.username, "bitcoinrpc");
    // The point of the whole exercise: byte-exact, delimiters included.
    assert.equal(ep.password, SECRET);
  });

  it("defaults the port from the scheme", () => {
    assert.equal(parseBtcRpcEndpoint("http://node.example").port, 80);
    assert.equal(parseBtcRpcEndpoint("https://node.example").port, 443);
  });

  it("keeps a path prefix and drops its trailing slash", () => {
    const ep = parseBtcRpcEndpoint("https://proxy.example/btc/rpc/");
    assert.equal(ep.basePath, "/btc/rpc");
    assert.equal(rpcBaseUrl(ep), "https://proxy.example:443/btc/rpc");
  });

  it("unbrackets an IPv6 host and re-brackets it for the URL", () => {
    const ep = parseBtcRpcEndpoint("http://[::1]:8332");
    assert.equal(ep.host, "::1");
    assert.equal(rpcBaseUrl(ep), "http://[::1]:8332");
  });
});

describe("parseBtcRpcEndpoint rejects", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["an empty value", "", /is empty/],
    // A scheme-less string is not unparseable: WHATWG reads "rpc.example.dev:"
    // as the scheme. The rejection is right, only the wording differs.
    ["a bare host", "rpc.example.dev:8332", /unsupported scheme/],
    ["a ZMQ scheme", "tls://rpc.example.dev:8332", /ZMQ endpoint forms/],
    ["another scheme", "ftp://rpc.example.dev:8332", /unsupported scheme/],
    ["a query string", "http://host:8332/?wallet=x", /query string or fragment/],
    ["a fragment", "http://host:8332/#x", /query string or fragment/],
    ["a /wallet/ prefix", "http://host:8332/wallet/main", /must not include a \/wallet\/ path/],
    ["an out-of-range port", "http://host:99999", /not a valid URI|out-of-range port/],
    ["a username with no password", "http://user@host:8332", /username but no password/],
    ["bad percent-encoding", "http://user:%zz@host:8332", /percent-encoding/],
  ];

  for (const [name, uri, expected] of cases) {
    it(`rejects ${name}`, () => {
      assert.throws(
        () => parseBtcRpcEndpoint(uri, "BTC_RPC_HOST"),
        (err: unknown) => {
          assert.ok(err instanceof BtcRpcUriError, `expected BtcRpcUriError, got ${String(err)}`);
          assert.match(err.message, expected);
          return true;
        },
      );
    });
  }
});

describe("credentials never reach a log or an error", () => {
  it("masks the password when rendering an endpoint", () => {
    const ep = parseBtcRpcEndpoint(`https://bitcoinrpc:${ENCODED}@rpc.example.dev:8332`);
    const shown = redactBtcRpcEndpoint(ep);
    assert.equal(shown, "https://bitcoinrpc:********@rpc.example.dev:8332");
    assert.ok(!shown.includes(SECRET));
  });

  it("strips credentials from the URL the HTTP client is given", () => {
    const ep = parseBtcRpcEndpoint(`https://bitcoinrpc:${ENCODED}@rpc.example.dev:8332`);
    const url = rpcBaseUrl(ep);
    assert.equal(url, "https://rpc.example.dev:8332");
    assert.ok(!url.includes(SECRET));
    assert.ok(!url.includes("bitcoinrpc"));
  });

  it("keeps the secret out of every rejection message", () => {
    const malformed = [
      `ftp://bitcoinrpc:${ENCODED}@rpc.example.dev:8332`,
      `tls://bitcoinrpc:${ENCODED}@rpc.example.dev:8332`,
      `http://bitcoinrpc:${ENCODED}@rpc.example.dev:8332/wallet/main`,
      `http://bitcoinrpc:${ENCODED}@rpc.example.dev:8332/?x=1`,
      `bitcoinrpc:${ENCODED}@rpc.example.dev:8332`,
    ];

    for (const uri of malformed) {
      try {
        parseBtcRpcEndpoint(uri, "BTC_RPC_HOST");
        assert.fail("expected a throw");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(!msg.includes(SECRET), `leaked the password: ${msg}`);
        assert.ok(!msg.includes(ENCODED), `leaked the encoded password: ${msg}`);
      }
    }
  });
});

describe("rpcAuthHeader", () => {
  it("encodes a password containing delimiters", () => {
    const header = rpcAuthHeader("bitcoinrpc", SECRET);
    assert.ok(header !== undefined);
    assert.ok(header.startsWith("Basic "));
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString();
    // Basic splits on the FIRST colon, so a password full of them is fine.
    assert.equal(decoded, `bitcoinrpc:${SECRET}`);
  });

  it("is undefined when there is nothing to send", () => {
    assert.equal(rpcAuthHeader("", ""), undefined);
  });
});

describe("resolveBtcRpcAuth", () => {
  const withCreds = parseBtcRpcEndpoint(`https://bitcoinrpc:${ENCODED}@rpc.example.dev:8332`);
  const without = parseBtcRpcEndpoint("http://127.0.0.1:8332");

  it("prefers the URI's credentials", () => {
    const auth = resolveBtcRpcAuth(withCreds, "", "");
    assert.deepEqual(auth, { username: "bitcoinrpc", password: SECRET });
  });

  it("falls back to the separate settings", () => {
    const auth = resolveBtcRpcAuth(without, "olduser", "oldpass");
    assert.deepEqual(auth, { username: "olduser", password: "oldpass" });
  });

  it("accepts settings that agree with the URI", () => {
    const auth = resolveBtcRpcAuth(withCreds, "bitcoinrpc", SECRET);
    assert.deepEqual(auth, { username: "bitcoinrpc", password: SECRET });
  });

  it("refuses to guess between two different passwords", () => {
    assert.throws(
      () => resolveBtcRpcAuth(withCreds, "bitcoinrpc", "a-different-password", "BTC_RPC_HOST"),
      (err: unknown) => {
        assert.ok(err instanceof BtcRpcUriError);
        assert.match(err.message, /disagree with the separate user\/password/);
        assert.ok(!err.message.includes(SECRET));
        return true;
      },
    );
  });

  it("returns empty strings when nothing supplies credentials", () => {
    assert.deepEqual(resolveBtcRpcAuth(without, "", ""), { username: "", password: "" });
  });
});
