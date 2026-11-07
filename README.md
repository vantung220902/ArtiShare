# ArtiShare

A Chrome extension that invites saved lists of email addresses to claude.ai artifacts in bulk, so you can share an artifact privately with many people without inviting each one by hand or making it public.

> **Status:** reading who has access works against claude.ai. Sending an invite uses the same request as the Share menu ([docs/claude-share-api.md](docs/claude-share-api.md)), but it hasn't been tried against a live artifact yet. Try it on a throwaway artifact first.

## What it does

- Keeps named **email lists**. You can paste them, import them from a CSV/TXT file, or load them from a shared config file.
- Saves **jobs**: a set of artifacts plus lists, extra addresses, and an access level.
- **Preview first.** For each artifact it reads who already has access and shows who will be invited, who is skipped because they already have access, and who goes over claude.ai's 50-outside-people cap. Nothing is sent until you confirm.
- **Runs in the background**, one invite at a time with a pause between them. It retries rate limits and stops on repeated failures. You can Stop and Resume, and a run interrupted by a browser restart can also be resumed.
- **Exports a CSV report** of every invite.

It works inside your own signed-in claude.ai session. It never asks for a password, never removes anyone, and never lowers anyone's access.

## Install (once, no terminal needed)

You install it once. After that it's part of Chrome and starts with Chrome every time, with no server to run and nothing to `cd` into. You don't need Node, only Chrome (or another Chromium browser).

1. Get `artishare-<version>-chrome.zip` from the team's shared drive.
2. Unzip it into a folder you'll keep, for example `~/Applications/ArtiShare`. Chrome loads the extension from this folder every time, so **don't leave it in Downloads** or delete it.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick that folder.
5. Pin **ArtiShare** in the toolbar. Clicking it opens the side panel.

The card on `chrome://extensions` should show the ID `eeihicglfclmofckclcpjleekpddjflg`. It's the same on every machine and for every folder.

**To update:** replace the folder's contents with the new zip's, then click the reload icon ↻ on the extension's card. Your lists, jobs and settings are kept. The side panel shows the installed version at the bottom.

### Publishing a new version (maintainer)

1. Bump `version` in `package.json`.
2. Run `npm run release`. It runs the typecheck and tests, builds, and writes `.output/artishare-<version>-chrome.zip`.
3. Upload that zip to the shared drive and tell the team to update.

```bash
npm install
```

```bash
npm run release
```

The manifest's `key` (in `wxt.config.ts`) pins the extension ID. Without it, Chrome derives the ID from the folder path, so unzipping an update somewhere else would look like a new extension and lose saved data. Don't remove or change the key.

A Chrome Web Store listing would give one-click install and automatic updates. Registering as a developer there costs $5 once.

## Use it

1. **Set up lists and jobs**: in the side panel, click **Lists & config** (or right-click the toolbar icon, then **Options**).
   - *Defaults*: the default access level, the pause between invites, and your organization's email domains (for example `nimblehq.co`). Addresses on those domains don't count toward the 50-outside-people cap.
   - *Email lists*: paste addresses in any shape (one per line, comma-separated, `Name <a@b.com>`, or a CSV export), or use **Import CSV/TXT**. Invalid addresses are flagged and duplicates are dropped.
   - *Jobs*: combine artifacts, lists, extra addresses, and an access level.
2. **Run**: open claude.ai and sign in, then open the side panel. Pick a job, or fill the form in by hand; **+ Current tab** adds the artifact you're looking at. Click **Preview**, check the numbers, then **Send**.
3. **Report**: **Export CSV** at any time, then **New run** when you're done.

Running the same job again is safe: anyone who already has access is skipped.

## Config file

Share one file across the team: export it from the options page, commit it or put it in a shared drive, and have others import it. YAML and JSON are both accepted. Importing replaces everything stored in the extension.

```yaml
version: 1
defaults:
  access: view            # view | comment | edit  ("Can view" | "Commenter" | "Can edit")
  delayMs: 800            # pause between invites, 0–60000
  orgDomains: [nimblehq.co]
lists:
  acme-clients:
    - alice@acme.com
    - bob@acme.com
  nimble-qa:
    - qa1@nimblehq.co
jobs:
  - name: Acme Q4 review
    artifacts:
      - https://claude.ai/artifact/XXXXXXXXXXXXXXXXXXXXXX
      - https://claude.ai/code/artifact/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    lists: [acme-clients, nimble-qa]
    emails: [carol@acme.com]   # extras for this job only
    access: comment            # optional; falls back to defaults.access
```

The importer reports unknown lists, invalid addresses, links that aren't artifacts, and duplicate job names, each with its location in the file.

## Limits to know

These come from claude.ai's own sharing rules ([help article](https://support.claude.com/en/articles/9547008)):

- Each artifact can have **at most 50 people outside your organization**, and pending invitations count toward that. The preview shows how many each artifact will have after the run, and skips anyone over the cap.
- claude.ai also has a **daily invitation limit** per account. When a run hits it, the run stops and keeps the rest pending; **Resume** the next day.
- Invitations to outside addresses expire after 30 days if they aren't accepted. Running the job again renews expired ones.
- Artifacts that connect to other websites can't be shared by email.
- On Enterprise plans, an admin must turn on **Email invitations outside your organization** (Organization settings → Artifacts).
- Email sharing is in beta, and claude.ai has no public sharing API. The extension uses the same requests as the Share menu, so a claude.ai change can break it. The preview step catches that before anything is sent.

## Development

Only needed to change the extension. Using it doesn't need any of this.

```bash
npm run dev        # opens Chrome with the extension and reloads on change
npm run dev:fake   # same, but with an in-memory fake claude.ai: nothing is sent
npm test           # unit tests (Vitest)
npm run typecheck
npm run build:fake # fake build in .output/chrome-mv3-fake
```

The dev server listens on port **47613** (set in `wxt.config.ts`, instead of WXT's default 3000). If that port is busy, WXT moves to the next free one. The built extension uses no port; it only talks to claude.ai over HTTPS.

Fake mode behavior: an artifact whose ID contains `Forbidden` rejects invites, an address starting with `fail` is rejected, and one starting with `slow` is rate-limited once before it succeeds.

```
src/
  core/         framework-free logic, unit-tested: email parsing, artifact links, config schema,
                planner (dedupe and the 50-person cap), runner (queue, retry, stop), CSV report
  claude/       ShareClient interface, the claude.ai client, the fake client, and in-page fetch
  lib/          chrome.storage access and the side panel ↔ background message types
  entrypoints/  background worker (runs invites), options page, side panel
  ui/           shared React components and styles
tests/          Vitest specs for src/core
```

Requests to claude.ai run inside a claude.ai tab (`chrome.scripting.executeScript` in the extension's isolated world), so they use your existing session while the page's own scripts can't see or change them. If no claude.ai tab is open, the extension opens one in the background. The endpoints, ids and error reasons are written up in [docs/claude-share-api.md](docs/claude-share-api.md).
