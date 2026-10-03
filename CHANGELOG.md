# Changelog

Notable changes to btc-replay. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For this service, "breaking" means any of: a response field a consumer reads
disappears or changes meaning, a required setting is added, or the journal
schema changes in a way that needs a rebuild.

## [Unreleased]

## [1.0.0] - 2026-10-03

First public release, derived from
[ltc-replay](https://github.com/SwapzyCC/ltc-replay) 1.0.0 and its unreleased
changes (TLS endpoints, the `deploy/nginx/` reference configs, and the
`docker-compose.yml` fix that lets `.env` override the node URLs).

### Changed from ltc-replay

- Addresses use Bitcoin's network parameters: P2PKH `1…`, P2SH `3…`, native
  SegWit and Taproot `bc1…`.
- Defaults are scaled for 10-minute blocks: `TX_INDEX_BLOCKS=5000` and
  `WATCH_RESCAN_MAX_BLOCKS=500` (both about five weeks and three and a half
  days, as before), catch-up writes at most 500 blocks per pass, and the
  hashblock stream proxy timeout is 24 hours.
- Ports follow Bitcoin Core: RPC 8332, P2P 8333.

[unreleased]: https://github.com/SwapzyCC/btc-replay/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/SwapzyCC/btc-replay/releases/tag/v1.0.0
