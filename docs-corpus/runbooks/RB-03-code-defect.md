# RB-03 — Code defect (logic bug)

## 1. Symptoms
No dependency is down and no config changed, but responses are wrong: incorrect
totals, off-by-one quantities, or a 500 on a specific edge case (e.g. quantity
zero). Error rate may stay low while correctness is broken.

## 2. Detection
A recent commit changed business logic (pricing, tax, inventory math). Unit
tests, if present, would have caught it. The logs may show an exception only on
the edge case; otherwise the defect is silent and detected by wrong output.

## 3. Standard remediation
If a clean revert is available and safe, revert. If the change must stay (it
carried other fixes), a code defect is the one case where a forward patch is
acceptable — but only with a regression test added and CI green before deploy.
This is the "patch" action, and it always requires human approval.

## 4. Verification
Run the new regression test in CI. Confirm the edge case now returns the
correct result. Error_rate and correctness both back to baseline.

## 5. Escalation
Low confidence on the root cause ⇒ escalate rather than guess. A wrong patch to
business logic can cost more than the downtime.
