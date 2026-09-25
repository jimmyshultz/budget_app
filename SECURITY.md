# Security policy

Budget handles bank data, so security reports are taken seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
**Security → Report a vulnerability** on this repository. You'll get a reply within a week.

Include what you found, how to reproduce it, and what an attacker could do with it. Please
**don't include real bank data, Plaid keys or access tokens** in the report, even your own.

## Supported versions

Only the latest release gets security fixes.

## How the app is designed

Knowing the intended boundaries helps decide whether something is a vulnerability.

- **Everything runs on your computer.** There is no Budget server or account. Your data is a
  SQLite file in your user folder, and the only outside service that receives your data is Plaid,
  using keys you supply from your own Plaid account.
- **Update check:** the desktop app makes an anonymous request to `api.github.com` at launch and
  once a day to see whether a newer release exists. It sends no data and downloads nothing; if
  there's a new version it offers to open the release page. Turn it off in the app menu
  (**Budget → Check for Updates Automatically**).
- **The local server** listens on `127.0.0.1` only and rejects requests whose `Host` isn't
  localhost (DNS-rebinding protection). In the desktop app it runs on a random port and every
  request must carry a per-launch token held in an HTTP-only cookie by the app's window.
- **Secrets:** Plaid access tokens are encrypted in the database with AES-256-GCM. The desktop app
  keeps its Plaid keys and the encryption key in the OS keychain via Electron `safeStorage`; from
  source, the key is in the macOS login Keychain or `.env.local`.
- **The desktop window** is sandboxed with context isolation, no Node integration, a strict content
  security policy and no permission grants, and it can't navigate away from the app. Bank logins
  happen in your regular browser through Plaid Hosted Link.
- **Read-only:** the app only uses Plaid's read-only products. Nothing in it can move money.

## Out of scope

- Anyone who can already run code as your user account, or read your files, can read your data.
  Use full-disk encryption (FileVault) and a login password.
- The macOS app isn't signed with an Apple Developer ID yet. Verify you downloaded it from this
  repository's Releases page.
- Plaid's own services and Plaid Link.
