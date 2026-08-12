# Contract documents for toolshop

Vendor the service's **published** schema here and pin it — do not write one by
hand from the responses you happen to have seen. The point of a contract test is
to compare the running service against what its owners promised; a schema
derived from observed traffic can only ever agree with itself.

Set `capabilities.contracts.spec` in the profile to the file you land here,
then `npm run target:doctor` will confirm the framework can read it.

Every API response the shared client returns is validated against this document
as it passes through, so the setup calls inside UI tests are contract checks for
free (§05).
