# RB-01 — Configuration regression

## 1. Symptoms
Checkout or another core route starts returning 5xx within 30–90 seconds of a
deploy. Error rate jumps sharply (0.2 and above). Latency p95 spikes because
requests hang on a dependency that no longer answers. Health endpoint reports
`degraded`.

## 2. Detection
Correlate the error-rate spike with the most recent commit. A configuration
regression almost always follows a commit that changed an environment value,
a service URL, a port, or a feature flag in `settings.py` / config. The logs
show `ConnectionError`, `Max retries exceeded`, or `Name or service not known`
pointing at a host or port with no listener.

## 3. Standard remediation
Config regressions: revert the offending commit; do not hotfix under incident.
A `git revert --no-edit <sha>` followed by a push to `main` is safe, auditable,
and lets CI/CD redeploy the last-known-good configuration. Verify error_rate
returns below 0.01 within 90 seconds of redeploy before closing the incident.

## 4. Verification
Poll the service health endpoint until it reports `ok`. Confirm error_rate is
back to baseline (< 0.01) and p95 latency has recovered. Place one synthetic
checkout to confirm the dependency is reachable again.

## 5. Escalation
If revert does not restore service, or if the offending commit cannot be
identified with confidence, escalate to the on-call platform engineer with the
full evidence bundle (metrics window, logs, git diff). Do not attempt a manual
config edit under incident — it is not auditable and often makes things worse.
