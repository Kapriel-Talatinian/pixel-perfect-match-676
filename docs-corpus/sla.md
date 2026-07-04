# Service Level Agreement — Shop

## Checkout availability
Checkout availability target is **99.9%** monthly. On-call must be notified
within 60 seconds of a P1 alert. The alert threshold is error_rate > 0.20 for
one minute.

## Cost of downtime
The cost of checkout downtime is **€150 per minute**. This figure feeds the
incident € counter and the SLA-impact line of every post-mortem. It is read
from this document, not hardcoded in the agent.

## Response-time targets
- P1 (checkout down): detect < 60s, decision < 2 min, remediation started < 5 min.
- p95 latency target: < 500 ms. Sustained p95 > 2s is a P2.

## Error budget
0.1% monthly (about 43 minutes). A single 4-minute config-regression incident
consumes roughly 9% of the monthly budget.

## Approval policy
Any production-changing action (revert, patch, redeploy) requires explicit human
approval, obtained by phone for P1 incidents so a human stays accountable.
