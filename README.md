# ArtiShare

A Chrome extension that invites saved lists of email addresses to claude.ai artifacts in bulk, so you can share an artifact privately with many people without inviting each one by hand or making it public.

> **Status:** reading who has access works against claude.ai. Sending an invite uses the same request as the Share menu ([docs/claude-share-api.md](docs/claude-share-api.md)), but it hasn't been tried against a live artifact yet. Try it on a throwaway artifact first.

## What it does

- Keeps saved **lists**. Each list has a name, its email addresses, and the permission its people get (Can view, Commenter or Can edit).
- **Share** one or more artifacts with the lists you tick. You choose which lists are ticked by default: all of them, or only some. You can also create a new list right there.
- **Preview first.** For each artifact it reads who already has access and shows who will be invited and who is skipped because they already have access. Nothing is sent until you confirm.
- **Runs in the background**, one invite at a time with a short pause between them. It retries rate limits and stops on repeated failures. You can Stop and Resume, and a run interrupted by a browser restart can also be resumed.

It works inside your own signed-in claude.ai session. It never asks for a password, never removes anyone, and never lowers anyone's access.

## Install (once, no terminal needed)

You install it once. After that it's part of Chrome and starts with Chrome every time, with no server to run and nothing to `cd` into. You don't need Node, only Chrome (or another Chromium browser).

1. Get `artishare-<version>-chrome.zip` from the team's shared drive.
2. Unzip it into a folder you'll keep, for example `~/Applications/ArtiShare`. Chrome loads the extension from this folder every time, so **don't leave it in Downloads** or delete it.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick that folder.
5. Pin **ArtiShare** in the toolbar. Clicking it opens the side panel.

The card on `chrome://extensions` should show the ID `eeihicglfclmofckclcpjleekpddjflg`. It's the same on every machine and for every folder.

**To update:** replace the folder's contents with the new zip's, then click the reload icon ↻ on the extension's card. Your lists and settings are kept. The side panel shows the installed version at the bottom.

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

Open claude.ai and sign in, then click the toolbar icon to open the side panel. It has two tabs.

1. **Lists**: click **New list**, give it a name, paste the addresses, and pick a permission. Addresses can be in any shape: one per line, comma-separated, `Name <a@b.com>`, or text copied from a spreadsheet. Invalid addresses are flagged and duplicates are dropped. Under **Ticked by default when sharing**, choose *All lists* or *Only these* and tick the ones you share with most.
2. **Share**: the artifact in the current tab is filled in for you. Add more links (one per line) or click **+ Current tab**. Tick the lists to share with, or click **+ New list** to make one on the spot. Click **Preview**, check the numbers, then **Send**.

If someone is in two ticked lists, they get the higher of the two permissions. Sharing again is safe: anyone who already has access is skipped, and their access is left as it is.

## Limits to know

These come from claude.ai's own sharing rules ([help article](https://support.claude.com/en/articles/9547008)):

- Each artifact can have **at most 50 people outside your organization**, and pending invitations count toward that. claude.ai enforces this itself: when an artifact reaches it, the run skips the rest of that artifact's invites and moves on.
- claude.ai also has a **daily invitation limit** per account. When a run hits it, the run stops and keeps the rest pending; **Resume** the next day.
- Invitations to outside addresses expire after 30 days if they aren't accepted. Sharing again renews expired ones.
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
  core/         framework-free logic, unit-tested: email parsing, artifact links, saved lists
                (schema and upgrade from 0.1.0), planner (who to invite), runner (queue, retry, stop)
  claude/       ShareClient interface, the claude.ai client, the fake client, and in-page fetch
  lib/          chrome.storage access and the side panel ↔ background message types
  entrypoints/  background worker (runs invites) and the side panel
  ui/           shared React components and styles
tests/          Vitest specs for src/core
```

Requests to claude.ai run inside a claude.ai tab (`chrome.scripting.executeScript` in the extension's isolated world), so they use your existing session while the page's own scripts can't see or change them. If no claude.ai tab is open, the extension opens one in the background. The endpoints, ids and error reasons are written up in [docs/claude-share-api.md](docs/claude-share-api.md).
