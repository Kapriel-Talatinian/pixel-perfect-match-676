# RB-02 — Data schema mismatch

## 1. Symptoms
A route that reads a data file or model returns 500 with a `KeyError`,
`AttributeError`, or serialization failure. The service was healthy before the
deploy; no dependency is down. Only routes that touch a specific field fail.

## 2. Detection
The logs show a missing key or renamed field (e.g. `KeyError: 'price_eur'`).
The most recent commit changed a data file, a JSON schema, or a model field
name without updating the code that reads it, or vice versa.

## 3. Standard remediation
Schema mismatches: revert the commit that renamed the field. Do not patch the
readers under incident — a rename usually touches several call sites and a
partial patch leaves latent 500s. Revert restores the matching pair (data +
code) atomically.

## 4. Verification
Confirm the failing route returns 200 and the field is present in the response.
Error_rate back below 0.01.

## 5. Escalation
If the rename was intentional and must ship, escalate to the owning team to
land a coordinated change (data + all readers) behind a flag, out of incident.
