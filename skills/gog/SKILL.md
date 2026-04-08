---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.
homepage: https://gogcli.sh
metadata:
  {
    "openclaw":
      {
        "emoji": "🎮",
        "requires": { "bins": ["gog"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "steipete/tap/gogcli",
              "bins": ["gog"],
              "label": "Install gog (brew)",
            },
          ],
      },
  }
---

# gog

Use `gog` for Gmail/Calendar/Drive/Contacts/Sheets/Docs. Requires OAuth setup.

Setup (once)

- `gog auth credentials /path/to/client_secret.json`
- `gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets`
- `gog auth list`

`invalid_grant` and gateway behavior

- Messages like **`invalid_grant: Token has been expired or revoked`** mean Google rejected the stored refresh token. Run a **full re-auth**; incremental fixes will not restore Gmail until `gog auth add` completes and `gog auth list --check` succeeds.
- OpenClaw surfaces this class of failure via Google Workspace readiness (`token_invalid_or_expired`). Treat it as **credentials on the host that runs `gog` for the gateway**, not as a generic “tool outage.”

Where tokens must live (critical)

- Tokens are written wherever **`gog auth add`** runs (that user, that machine, that `gog` data directory).
- If the **OpenClaw gateway** runs on another host (VM, Docker, remote Linux) than your laptop, re-authenticating **only on the Mac** does not fix **`invalid_grant`** on the gateway. Run the same remote step 1/2 flow **on the gateway host** (with its `GOG_ACCOUNT` / keyring / env), or you will keep seeing revoked-token errors remotely.

Remote OAuth troubleshooting (terminal)

1. **`zsh: bad pattern: ^[[200~gog`** (or similar): **Bracketed paste** leaked ANSI into the line. The command never ran. Fix: paste plain text, disable bracketed paste in Terminal/iTerm, or type the command; do not paste through layers that inject control sequences.
2. **`parse redirect url: invalid redirect URL`**: The **`--auth-url` value was not a real callback**. Do not pass the literal placeholder text `full redirect URL`. Step 2 must receive the **exact** URL from the browser address bar after consent (starts with `http://127.0.0.1:<port>/oauth2/callback?...`).
3. **`manual auth state mismatch; run remote step 1 again`**: Step 1 stores OAuth **`state=`** locally; step 2 must use the redirect from **that same** step 1 **immediately**. Trying a second authorization **`code=`** with the same **`state=`**, or reusing an old redirect after a failed step 2, breaks the flow. **Fix:** run **one fresh** step 1, complete consent **once**, copy **one** callback URL, run step 2 **once**. If step 2 errors, **start over at step 1** (new `state=`).

Single-cycle remote auth (repeat flags on both steps)

Use the **same** account, **`--services`**, and **`--force-consent`** (if used) on step 1 and step 2:

1. `gog auth add <account> --services gmail,drive,calendar --remote --step 1 --force-consent`
2. Open `auth_url` in the browser; finish consent **once**.
3. Copy the **full** callback from the address bar.
4. `gog auth add <account> --services gmail,drive,calendar --remote --step 2 --auth-url 'PASTE_FULL_CALLBACK_HERE'`
5. `gog auth list --check`
6. `gog auth status --account <account>`

Then probe: e.g. `gog gmail search 'newer_than:1d' --max 3 --account <account>`.

Headless macOS / gateway host auth repair

- Treat repeated browser re-auth loops on headless macOS as a Keychain failure mode.
- Switch gog to the file keyring: `gog auth keyring file`
- Ensure `GOG_KEYRING_PASSWORD` is present in the **gateway** environment before re-auth.
- If gog previously used macOS Keychain for this account, remove stale gog Keychain token entries before re-auth.
- Use the **single-cycle remote auth** steps above on the **host where the gateway runs `gog`**.
- Verify before claiming success: `gog auth list --check`
- Check account status: `gog auth status --account <account@example.com>`
- Never use `--no-input` for auth repair.
- Never describe auth as complete until `gog auth list --check` passes.
- If auth still fails, report exact stderr and `gog --version`.

Common commands

- Gmail search: `gog gmail search 'newer_than:7d' --max 10`
- Gmail messages search (per email, ignores threading): `gog gmail messages search "in:inbox from:ryanair.com" --max 20 --account you@example.com`
- Gmail send (plain): `gog gmail send --to a@b.com --subject "Hi" --body "Hello"`
- Gmail send (multi-line): `gog gmail send --to a@b.com --subject "Hi" --body-file ./message.txt`
- Gmail send (stdin): `gog gmail send --to a@b.com --subject "Hi" --body-file -`
- Gmail send (HTML): `gog gmail send --to a@b.com --subject "Hi" --body-html "<p>Hello</p>"`
- Gmail draft: `gog gmail drafts create --to a@b.com --subject "Hi" --body-file ./message.txt`
- Gmail send draft: `gog gmail drafts send <draftId>`
- Gmail reply: `gog gmail send --to a@b.com --subject "Re: Hi" --body "Reply" --reply-to-message-id <msgId>`
- Calendar list events: `gog calendar events <calendarId> --from <iso> --to <iso>`
- Calendar create event: `gog calendar create <calendarId> --summary "Title" --from <iso> --to <iso>`
- Calendar create with color: `gog calendar create <calendarId> --summary "Title" --from <iso> --to <iso> --event-color 7`
- Calendar update event: `gog calendar update <calendarId> <eventId> --summary "New Title" --event-color 4`
- Calendar show colors: `gog calendar colors`
- Drive search: `gog drive search "query" --max 10`
- Contacts: `gog contacts list --max 20`
- Sheets get: `gog sheets get <sheetId> "Tab!A1:D10" --json`
- Sheets update: `gog sheets update <sheetId> "Tab!A1:B2" --values-json '[["A","B"],["1","2"]]' --input USER_ENTERED`
- Sheets append: `gog sheets append <sheetId> "Tab!A:C" --values-json '[["x","y","z"]]' --insert INSERT_ROWS`
- Sheets clear: `gog sheets clear <sheetId> "Tab!A2:Z"`
- Sheets metadata: `gog sheets metadata <sheetId> --json`
- Docs export: `gog docs export <docId> --format txt --out /tmp/doc.txt`
- Docs cat: `gog docs cat <docId>`

Calendar Colors

- Use `gog calendar colors` to see all available event colors (IDs 1-11)
- Add colors to events with `--event-color <id>` flag
- Event color IDs (from `gog calendar colors` output):
  - 1: #a4bdfc
  - 2: #7ae7bf
  - 3: #dbadff
  - 4: #ff887c
  - 5: #fbd75b
  - 6: #ffb878
  - 7: #46d6db
  - 8: #e1e1e1
  - 9: #5484ed
  - 10: #51b749
  - 11: #dc2127

Email Formatting

- Prefer plain text. Use `--body-file` for multi-paragraph messages (or `--body-file -` for stdin).
- Same `--body-file` pattern works for drafts and replies.
- `--body` does not unescape `\n`. If you need inline newlines, use a heredoc or `$'Line 1\n\nLine 2'`.
- Use `--body-html` only when you need rich formatting.
- HTML tags: `<p>` for paragraphs, `<br>` for line breaks, `<strong>` for bold, `<em>` for italic, `<a href="url">` for links, `<ul>`/`<li>` for lists.
- Example (plain text via stdin):

  ```bash
  gog gmail send --to recipient@example.com \
    --subject "Meeting Follow-up" \
    --body-file - <<'EOF'
  Hi Name,

  Thanks for meeting today. Next steps:
  - Item one
  - Item two

  Best regards,
  Your Name
  EOF
  ```

- Example (HTML list):
  ```bash
  gog gmail send --to recipient@example.com \
    --subject "Meeting Follow-up" \
    --body-html "<p>Hi Name,</p><p>Thanks for meeting today. Here are the next steps:</p><ul><li>Item one</li><li>Item two</li></ul><p>Best regards,<br>Your Name</p>"
  ```

Notes

- Set `GOG_ACCOUNT=you@gmail.com` to avoid repeating `--account`.
- For scripting non-auth commands, prefer `--json`. Use `--no-input` only when you want setup/auth commands to fail instead of prompting.
- Sheets values can be passed via `--values-json` (recommended) or as inline rows.
- Docs supports export/cat/copy. In-place edits require a Docs API client (not in gog).
- Confirm before sending mail or creating events.
- `gog gmail search` returns one row per thread; use `gog gmail messages search` when you need every individual email returned separately.
