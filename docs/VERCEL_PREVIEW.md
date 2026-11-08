# Vercel preview — delivery scope

**Actual delivery:** https://runlatch.vercel.app, deployment `dpl_GGSEzB1vdrvJTTX1U7DbMyRr7Pp8`, project `prj_3y6rgp3LL7HNAchVacKOSgURlyA0`, verified READY on source `a0d2c17e22528b681418ebff95bd47745070a945`. Homepage rendered in the in-app browser with zero observed console errors; same-origin Docs/testnet GETs returned200 and the excluded NEAR artwork404. No personal paths were present in those responses. This browser session is not proof of logged-out access.

The creation tool described a preview, but the subsequent API reports **target production** with `runlatch.vercel.app` and the team/branch aliases. No separate promotion or protection change was performed. The service selected **Node26.x**, not the proposed24.x; the existing >=24.20.0 engine permits it and the cloud build is READY. Project protection reports SSO enabled; no passwords/tokens were read or disclosed. These observed defaults supersede the intended first-delivery wording below, not the prototype's absent public NEAR state.

The human requested GitHub pushing and Vercel deployment on 8 November 2026, then explicitly asked to finish rather than keep the app behind unrelated testnet gates.

- Source: private `Daveboss123/RunLatch`, branch `main`.
- Destination: new `runlatch` project on the DAVE team, `team_nYeRt65eUjsMoUxjjSsq4roh`.
- Framework: existing Next.js 16.4.5 / React 19.3.1, npm lockfile and Node 24.x. No new dependency or signing service.
- First delivery: preview deployment, retaining Vercel's default deployment protection. No custom domain, production promotion, protection bypass or environment secrets.
- The browser is a labelled prototype with simulations, LOCAL imports, and an explicitly initiated read-only testnet review workspace. Hosting it does not prove a NEAR deployment or settlement.
- Private repository visibility stays unchanged. Local reports, tools, credentials, the CLI profile and human keys are not deployment source.

## Publication corrections

The rendered Docs commands now use checkout-relative Linux/WSL instructions instead of a personal machine path. The NEAR icon is retained in `assets/reference-marks/near.svg`, outside the served `public/` tree; the existing accurate NEAR text/link remains. Rust artwork retains attribution to the Rust Foundation and links to both recorded Creative Commons terms. Existing font notices remain served with their fonts. No legal-clearance or full asset audit is claimed.

The footer now distinguishes a hosted prototype from the still-absent public NEAR contract and identifies the source as private. No layout, motion, payment authority or simulated evidence was changed.

## Verification boundary

Before deployment, run the focused publication tests, typecheck/lint and the existing clean-web checkout runner. Preserve previous checkout evidence before the runner writes its new report. This verifies the current web artifact only; no need to rebuild unchanged Rust or rerun account/profile operations.

After project creation, record its returned ID/deployment ID, check the actual build state and rendered routes, and report protection or Git installation steps if Vercel requires human action. Never make the repository public to work around an access error or retry an uncertain project creation blindly.

The genuine testnet demo remains a separate unfinished execution step: human-controlled keys/signatures, exact approved accounts/actions, native transfer/private callback evidence, fixture check, explicit acceptance and selected report. No website release can manufacture these facts.
