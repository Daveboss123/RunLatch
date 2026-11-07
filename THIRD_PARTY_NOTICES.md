# Third-party notices — development foundation

This is a dependency/tool and reuse record, **not legal or binary-distribution clearance**. The [release-hardening record](docs/release/RELEASE_STATUS.md), [exact lock inventory](docs/release/DEPENDENCY_INVENTORY.json), [npm notices](licenses/npm-transitive-NOTICES.txt) and [cached Linux Cargo notices](licenses/cargo-linux-transitive-NOTICES.txt) record coverage and unresolved cases. No public release has occurred. Do not imply direct-dependency listings audit every platform/bundled component.

| Component | Version / source | Terms checked / use |
| --- | --- | --- |
| near-sdk | 5.30.0; https://github.com/near/near-sdk-rs | MIT OR Apache-2.0; source contract/build/test dependency, crates.io checksum in Cargo.lock |
| cargo-near | 0.22.0 official Windows release | MIT OR Apache-2.0; local development tool only, ignored `.tools/` retains its packaged license files |
| Rust Gate | Original RunLatch source | MIT; no copied provider UI, external code, or asset in this module |
| near-sandbox | 0.4.0; https://github.com/near/near-sandbox-rs | MIT OR Apache-2.0; development-only Linux LOCAL node harness, separate manifest/lockfile |
| near-api | 0.8.7; https://github.com/near/near-api-rs | MIT OR Apache-2.0; development-only LOCAL RPC and in-memory test signing |
| serde_json | 1.0.154; https://github.com/serde-rs/json | MIT OR Apache-2.0; development harness JSON assertions/evidence |
| tokio | 1.54.1; https://github.com/tokio-rs/tokio | MIT; development-only asynchronous Sandbox harness |
| near-openapi-types | 0.8.0; https://github.com/near/near-openapi | MIT OR Apache-2.0; already-transitive test crate, direct LOCAL diagnostic signed-transaction wire encoding |
| reqwest | 0.12.28; https://github.com/seanmonstar/reqwest | MIT OR Apache-2.0; already-transitive test crate, direct loopback-only bounded/no-proxy/no-redirect RPC diagnostic |

SDK/tool MIT notice checked against the official source and packaged tool text:

```text
MIT License

Copyright (c) 2022 NEAR

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Local frontend additions — 7 November2026

| Component | Version / source | Purpose / license |
| --- | --- | --- |
| Next.js / React / React DOM |16.4.5 /19.3.1 /19.3.1; npm lockfile | One web root, server rendering and isolated browser controls; MIT |
| Tailwind / @tailwindcss/postcss / PostCSS |4.3.5 /4.3.5 /8.5.32 | Development CSS build; MIT |
| shadcn / cn |Historical installer4.23.0 / current utility0.5.2 | MIT. Unused one-time shadcn installer removed during release hardening; installed registry engine/skills/source retained. No full UI catalogue installed |
| TypeScript |5.9.3 | Development type checks; Apache-2.0 |
| ESLint / eslint-config-next |9.39.5 /16.4.5 | Development-only source lint; MIT |
| @types/node / @types/react / @types/react-dom |24.19.2 /19.3.0 /19.3.0 | Development-only declarations; MIT |
| @playwright/test |1.64.1 | Browser testing/screenshots only; Apache-2.0 |
| dithercn engine + skill |https://dithercn.dev/r/dithercn-skill.json, dither-core/export dependencies; installed7 November | Owned registry source in src/lib/dither and project skill/reference folders. MIT, copyright2026 Leo and Shadcn Labs; exact notice in [licenses/dithercn-MIT.txt](licenses/dithercn-MIT.txt). No catalogue example installed |
| Fontsource Space Grotesk variable / Inter variable / IBM Plex Mono |5.3.0 each | Font asset delivery only, dev dependencies. Fonts OFL-1.1; local Latin subset files and unmodified licenses. Human requested Roster's actual Space Grotesk/Inter pairing; this replaced only this session's now-unused DM Sans addition |
| @axe-core/playwright |4.14.0 | Development accessibility checks only; MPL-2.0; no runtime widget/telemetry |
| Simple Icons SVG geometry |7 November reviewed files: React, Next.js, Tailwind CSS, Rust | Small locally served static marks, no logo-library runtime dependency. Distribution CC0 notice in licenses/simple-icons-CC0.md; individual brand copyright/trademark conditions still apply |

Roster Finance is a live visual reference only. No Roster logos, screenshots, text or proprietary UI assets are incorporated into the RunLatch website. Original RunLatch latch SVG/CSS/preview code is MIT. Source installer-generated defaults are reviewed against the local palette and boundaries.

The full npm audit initially reported13 advisories (2 low/11 moderate). Removing the unused installer and overriding only typescript-estree's matcher to minimatch11.0.1 (BlueOak-1.0.0) produces **0 current advisories**; legacy minimatch3 retains ISC. The new regression test proves parent scoping and the actual glob API. Production-only audit was already0. No forced framework downgrade, global override or broad security claim. ESLint9.39.5's earlier unsupported-version notice is retained in history; no migration to10. This is not production-readiness or licensing clearance.

### Brand-reference source and limits

- React mark source: Create React App fixture SVG, MIT, copyright2013-present Facebook, Inc.; [source](https://github.com/facebook/create-react-app/blob/282c03f9525fdf8061ffa1ec50dce89296d916bd/test/fixtures/relative-paths/src/logo.svg), [MIT license](https://github.com/facebook/create-react-app/blob/main/LICENSE). Simple Icons supplies normalized static geometry; not modified locally.
- Rust mark: Rust Foundation artwork. Current [official art/trademark policy](https://foundation.rust-lang.org/policies/logo-policy-and-media-guide/) says CC-BY4.0; Simple Icons metadata lists CC-BY-SA4.0. Retain attribution to Rust Foundation and links to [CC-BY4.0](https://creativecommons.org/licenses/by/4.0/) and [CC-BY-SA4.0](https://creativecommons.org/licenses/by-sa/4.0/); asset unmodified locally. Refers only to actual Rust source in this project, not endorsement.
- Next.js: [current official brand-use rules](https://vercel.com/design/brands#next-js) permit accurate technology references, require preservation/attribution and prohibit false affiliations. Required trademark statement appears in the website footer and credits; not a Vercel deployment/customer claim.
- Tailwind CSS: [official brand rules](https://tailwindcss.com/brand) permit referential assets without affiliation/customer confusion. Preserve name/geometry; no Tailwind-branded RunLatch product or merchandise.
- NEAR brand-source URL returned404; no logo-license permission/legal clearance inferred from that failure or Simple Icons' distribution. Human subsequently explicitly requested real marks in this **local** reference prototype: NEAR uses unmodified reviewed Simple Icons near.svg, always with LOCAL contract scope/no endorsement. Current official brand-use availability remains a gate before public distribution. dithercn uses the actual ten-square inline logo from its MIT-licensed site, with the same notice already retained. No planned products appear as completed integrations.
- SVG download helper permits only bounded svg/title/single-path geometry and no script/event/URL/image payload. Four files total8094 bytes. No remote logo requests at runtime. “Built with” strip identifies actual tools, not partners, sponsors, provider integrations or public deployment.

UI critique guidance: Unslop by Damir Sokolovsky (@heydamir), CC-BY4.0. Guidance was read and credited; no third-party scene, template or story video copied. The animated latch and public heading/scroll implementation are original RunLatch source built on reviewed dithercn APIs.
