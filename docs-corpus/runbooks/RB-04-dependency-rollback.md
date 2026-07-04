# RB-04 — Dependency / package rollback

## 1. Symptoms
Errors appear after a dependency bump (lockfile change) rather than an app
code change. Import errors, changed API signatures, or runtime incompatibilities
show up in the logs immediately on boot or on first use of the dependency.

## 2. Detection
The most recent commit changed `package-lock.json`, `requirements.txt`, or an
equivalent lockfile. The stack trace originates inside the upgraded package.

## 3. Standard remediation
Revert the lockfile change to pin the last-known-good version. Dependency
rollbacks are safe reverts. Schedule the upgrade for a controlled window with
its own testing, not under incident.

## 4. Verification
Service boots clean, the affected route returns 200, error_rate at baseline.

## 5. Escalation
If the upgrade was a security patch that must ship, escalate to coordinate a
pinned, tested upgrade rather than staying on the vulnerable version.
