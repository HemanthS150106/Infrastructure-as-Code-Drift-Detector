# Interview notes

## 30-second pitch

"Terraform tells you what your infrastructure *should* be. Over time reality drifts, because someone clicks in the console during an incident. Most drift tools just list the differences. Mine classifies each difference by risk and only lets the harmless ones be auto-fixed. A changed tag can be reverted with one approval. A security group opened to the internet on SSH is flagged critical, explained, and escalated, and the API itself refuses to remediate it. Every action is audit-logged."

## What's different from a basic drift checker

1. **Risk-weighted triage:** each finding has a level, a score and a plain-English justification.
2. **A gate that can't be bypassed from the UI.** It is enforced in the API (`403`) and the attempt is logged.
3. **Fail-safe:** a field the system doesn't understand is escalated, never auto-fixed.
4. **Pluggable classifiers:** a new resource type is one file; the registry validates that every verdict carries a justification.

## Likely questions and honest answers

**Is this connected to real AWS?**
No. The cloud side is a mock provider behind a small interface (`listResources`, `applyFix`, `reset`). I did that so the demo is deterministic and needs no credentials. Swapping in a real provider means implementing those methods; the diff and risk engines don't change. I haven't built the real provider.

**Doesn't `terraform plan` already detect drift?**
It can (`-refresh-only`), but it reports raw differences per workspace. It doesn't tell you which ones are dangerous, doesn't rank them, and doesn't decide what is safe to revert. This project is the triage and policy layer on top of that signal.

**Why field-level diffing?**
Because risk depends on *which* attribute changed. `tags.Env` and `ingress` are completely different events, and a whole-resource hash can't tell them apart or produce a readable finding.

**Why can only LOW be remediated? Why not MEDIUM?**
MEDIUM covers things like an instance resize that may have been an intentional emergency scale-up. Reverting automatically could cause an outage. The principle is that anything ambiguous goes to a human. It's one set (`AUTO_REMEDIABLE`) so the policy is easy to change.

**How do you classify something you've never seen?**
The generic classifier treats only tags/description as LOW; everything else becomes MEDIUM and is escalated. Unknown never means safe.

**Where does the safety actually live?**
In `assertRemediable`, called by the API endpoint. Hiding the button in the React app is only UX. I demonstrate it by calling the endpoint with `curl` on a CRITICAL finding and getting a 403.

**What happens when two people approve the same fix at once?**
There's a small race: the status check happens before the transaction opens and there's no row lock, so both could pass. The fix is idempotent so the real effect is a duplicate audit row, but the correct fix is `SELECT ... FOR UPDATE` inside the transaction. I've documented it as a known limitation.

**How would you make this production-ready?**
Real provider with pagination/rate limits/multi-account; read state from a remote backend; normalise to the real provider schema and ignore computed attributes; remediate by opening a Terraform PR or running `apply` rather than mutating the cloud directly; real authn/authz and separation of duties; scheduled scans and alerting. (Full list in `docs/ARCHITECTURE.md`.)

**Hardest part?**
Deciding the risk boundaries. Too strict and nothing is ever auto-fixed, so no time is saved; too loose and you're back to blind auto-remediation. I leaned conservative: only demonstrably harmless metadata is LOW.

## Things *not* to claim

- Don't say it works with real AWS or runs `terraform apply`. It doesn't.
- Don't quote performance or "% of drift auto-fixed" numbers. Nothing here measures that.
- If asked about Docker: the compose setup was written but not run in my authoring environment. Run `docker compose up --build` yourself before any demo.
