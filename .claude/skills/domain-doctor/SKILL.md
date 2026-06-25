---
name: domain-doctor
description: End-to-end health check (and one-command fix) for a Railway custom domain — DNS → cert → edge route → app. Use when a custom domain (e.g. play.funstackstudios.com) shows a 404 "Application not found", a Railway fallback page, a cert/SSL warning, or you just want to confirm a domain is wired correctly after a DNS change. Diagnoses the classic "DNS + cert are green but the edge still serves fallback" trap and fixes it without touching DNS.
---

# domain-doctor — is this custom domain actually live?

A custom domain on Railway only works when **four independent layers** all agree:
the **DNS** records at the registrar, the **certificate**, the **edge route**
binding the hostname to a service, and the **app** itself. Any one can be green
while another is broken — so "it doesn't work" is never enough; you check each hop.

This skill runs that check and prints a pass/fail table, then fixes the one
failure DNS dashboards can't show you: an **unbound edge route**.

## Do this

1. **Run the check** from the repo root (needs `RAILWAY_TOKEN` for the cert/edge hops;
   DNS hops work without it):
   ```bash
   node scripts/domain-doctor.mjs <domain> --health /health
   # e.g. node scripts/domain-doctor.mjs play.funstackstudios.com --project game-engine --health /health
   ```
   It walks six hops and exits non-zero if any fail:
   | # | Hop | Green means |
   |---|-----|-------------|
   | 1 | **DNS CNAME** | the hostname resolves to a Railway edge target (checked via DNS-over-HTTPS — `dig` isn't installed here) |
   | 2 | **DNS TXT verify** | the `_railway-verify.<host>` ownership record is present (only needed until the cert is VALID) |
   | 3 | **Railway cert** | `certificateStatus == VALID` (Railway GraphQL) |
   | 4 | **Railway DNS** | every `dnsRecords` entry is `PROPAGATED` |
   | 5 | **Edge serving** | HTTPS `200` **and no `x-railway-fallback` header** |
   | 6 | **App health** | the app actually answers on `--health <path>` |

2. **Read the failing hop — it tells you who to fix:**
   - **CNAME / TXT red** → the fix is at the **registrar** (Squarespace/Cloudflare/etc).
     Add exactly what Railway asks: a `CNAME` for the host → the `bm1…up.railway.app`
     target, and the `_railway-verify.<host>` `TXT`. DNS is the user's to change — give
     them the precise record and wait for propagation (re-run to confirm).
   - **Cert red, DNS green** → Railway hasn't issued yet; it follows TXT/CNAME
     verification. Wait a few minutes and re-run.
   - **Edge red while cert + DNS are green** → the trap below. Go to step 3.

3. **The fallback trap → `--fix`.** The nastiest case: DNS is propagated, the cert is
   VALID, Railway's API says the domain is fine — yet the edge returns
   `x-railway-fallback: true` and a `404 {"status":"error","message":"Application not found"}`.
   This means Railway's **edge router never bound the hostname to the service**.
   Waiting does **not** clear it (the binding is stuck, not propagating). The forcing
   function is a **redeploy of the bound service**, which makes the edge re-read its
   route table — **without changing the edge target, so no DNS change is needed**:
   ```bash
   node scripts/domain-doctor.mjs <domain> --fix
   ```
   This finds the service the domain is registered on, redeploys its latest deployment,
   and tells you to re-run in ~2 min. Re-run the plain check until all six hops are green.

4. **Confirm and report.** Re-run without `--fix`; when it prints
   *"All hops green — <domain> is live end to end"* (exit 0), show the user the table.
   State plainly which layer was broken and what fixed it (almost always either a missing
   registrar record, or an unbound edge cleared by a redeploy).

## Why each hop is separate (don't skip the ladder)
- A correct CNAME with **no cert** = TLS error, not a 404.
- A valid cert with an **unbound edge** = a clean `200` from the *fallback* app, not yours
  (the `x-railway-fallback` header is the only tell — the status code lies).
- A bound edge with a **dead app** = `502`/`503`, not fallback.
  Checking the app's **native** `*.up.railway.app` URL isolates "app is down" from
  "domain isn't wired": if the native URL is healthy but the custom domain serves
  fallback, the problem is purely the edge binding (step 3), never your code.

## Notes
- **Never re-add the domain via the API to "fix" routing** — each re-add can mint a *new*
  edge target, forcing the user to redo their DNS. Prefer the `--fix` redeploy, which keeps
  the existing target.
- DNS changes belong to the user/registrar — surface the exact record and let them apply it;
  everything else (cert wait, edge redeploy, verification) this skill does for you.
- `RAILWAY_TOKEN` must be an account/workspace token (it discovers project → service →
  custom-domain status). Pass `--project <name>` to skip the workspace scan on big accounts.
- This is the hub's own front door: `play.funstackstudios.com` → the `hub` service of the
  `game-engine` Railway project. See `docs/HOSTING.md` for how that connects to everything else.
