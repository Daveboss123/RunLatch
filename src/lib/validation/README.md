# Offline research-output validator v1

This is working local business logic, not a payment Gate or an on-chain attestation. It has no npm dependencies, HTTP requests, model calls, or filesystem access. The separate CLI reads a bounded regular JSON file locally.

## Inputs and results

`validateResearchArtifact(bytesOrNull)` takes exact artifact bytes, snapshots them before its first await, hashes bounded bytes, decodes strict UTF-8, and checks JSON structure. Passing input has topic and sources only; each source has id/url/title/summary only.

- 20–50 distinct source IDs and normalized HTTPS URL identities.
- Nonempty, size-bounded text/IDs; credential-bearing/non-HTTPS/control/whitespace URL syntax rejected.
- URL normalization removes fragments and uses the standard URL serializer; path/query semantics are preserved. No URL is fetched or declared reachable/factually accurate.
- At most 1 MiB input and 64 reported issues. Over-limit input is refused without content hashing; unavailable artifact is an ERROR, not success. Missing hashes are explicitly null.
- Malformed/incomplete/duplicate/disallowed input produces VALIDATION_FAILED with stable reasons and bounded generic paths/messages, not raw private input values.
- Reports are immutable, LOCAL_VALIDATOR, UNATTESTED, and grants_payment_authority=false. No wallet/contract/payment state is modified.

## Evidence format

Artifact hash is SHA-256 of exact bounded input bytes, not parsed/reformatted JSON. Criteria and evidence use SHA-256 of:

```text
UTF-8(domain + "\n" + canonical-json(payload))
```

Domains: runlatch.validation-spec.v1 and runlatch.validation-evidence.v1. Canonical JSON sorts object keys, preserves array order, and permits only JSON primitives and safe integer metadata. Evidence covers every report field except evidence_hash itself. There is no runtime timestamp in deterministic evidence; an observer can record time separately.

`researchCriteriaHash()` returns the exact v1 specification hash for capsule creation. `verifyValidationReport(unknownReport, optionalExpectedArtifactBytes)` checks shape, constants, criteria/hash and optional exact artifact binding. **Integrity, not a signature:** someone can generate a conforming report/hash. This does not prove honest checker execution or independent truth/privacy. Owner attestation is now a separate contract method; public wallet/UI integration and evidence remain unfinished.

Quote/policy hashes remain the contract's typed Borsh format; do not substitute this validation JSON format for those domains. Changing any validation rule/encoding requires version/cohort review, not relabelling prior reports.

## Offline commands (Node 24.20+ already installed)

```powershell
node --test tests/validation/research.test.ts
node scripts/validation/check-report.ts fixtures/research/valid-demo.json
node scripts/validation/check-report.ts fixtures/research/invalid-demo.json
```

Expected: tests pass; valid fixture returns LOCAL/UNATTESTED PASS and exit0; incomplete fixture returns FAIL/TOO_FEW_SOURCES and exit1. Input/read/usage failure exits2 and does not claim validation or payment success. No install step is required. Node executes supported stripped TypeScript; this run is not a TypeScript compiler/typecheck or a browser integration test.

Observed controlled-fixture result:

- 20 checked records; artifact4058 bytes.
- Criteria SHA-256: b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b.
- Exact saved fixture artifact SHA-256: 1b49ed4ea42d06dfc059a00629bd3970b5628ee970ea85dbe3d45bd66e25ba97.
- Evidence SHA-256: 9c21514ff16d95f96d59a9f06b3040b6456436f8e128d3bb5a6da6f80c295606.

These are local demo hashes observed from actual output, not transaction references or factual research evidence. Reformatting/changing the artifact changes its hash.

## Bounded owner review preparation

`attestation.ts` accepts serialized report JSON plus capsule ID, expected policy hash and validation-spec hash. It privately parses bounded JSON, verifies report integrity, and produces an immutable summary for owner review. It includes no signer/RPC call and does not submit anything. Payload remains UNATTESTED, requires_owner_signature=true and grants_payment_authority=false. Full issue text, prompts and artifacts are excluded.

Run `npm.cmd run prepare:sandbox-reports` to generate three harmless valid/incomplete/missing-output summary fixtures under ignored `.local/validation/sandbox-reports.json` before the Sandbox outcome tests. Real capsule/policy binding is read from the isolated contract during those tests; no placeholder binding is submitted. Contract records establish owner attestation only, never on-chain research validation.
