# ArtiShare

**Share a claude.ai artifact with a whole group of people in a few clicks.**

ArtiShare is a Chrome extension. You save groups of email addresses as **lists** once. After that you can invite a list (or several) to one or more artifacts at once, without adding each person through the Share menu and without making the artifact public.

<p align="center">
  <img src="docs/images/share.png" width="250" alt="Share tab: pick artifacts and lists">
  &nbsp;
  <img src="docs/images/preview.png" width="250" alt="Preview: who will be invited and who already has access">
  &nbsp;
  <img src="docs/images/done.png" width="250" alt="Finished run: every invite sent">
</p>

## Contents

- [How it works](#how-it-works)
- [Install](#install)
- [Use it](#use-it)
- [Good to know](#good-to-know)
- [Limits](#limits)
- [For maintainers](#for-maintainers)

## How it works

```mermaid
flowchart TD
    A([Open claude.ai and sign in]) --> B[Click the ArtiShare icon<br/>to open the side panel]
    B --> C{Do you have<br/>a list yet?}
    C -- No --> D[<b>Lists</b> tab<br/>name, addresses, permission]
    D --> E
    C -- Yes --> E[<b>Share</b> tab<br/>add artifact links]
    E --> F[Tick the lists to share with]
    F --> G[<b>Preview</b><br/>who already has access?]
    G --> H{Numbers<br/>look right?}
    H -- No, go back --> E
    H -- Yes --> I[<b>Send</b> and confirm]
    I --> J[Invites go out<br/>one at a time]
    J --> K{How did<br/>it end?}
    K -- Done --> L([New share])
    K -- Stopped --> M[<b>Resume</b> later]
    M --> J
```

ArtiShare works inside your own signed-in claude.ai session. It never asks for your password or removes anyone. It leaves the email invitations shown in preview unchanged.

## Install

You install it once. After that it starts with Chrome like any other extension. You only need Chrome (or another Chromium browser): no terminal, no Node, no server.

1. Get `artishare-<version>-chrome.zip` from the team's shared drive.
2. Unzip it into a folder you'll keep, for example `~/Applications/ArtiShare`. Chrome loads the extension from this folder every time, so **don't leave it in Downloads** and don't delete it.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick that folder.
5. Pin **ArtiShare** in the toolbar. Clicking the icon opens the side panel.

The extension's card should show the ID `eeihicglfclmofckclcpjleekpddjflg`. It's the same on every machine, whichever folder you use.

**To update:** replace the folder's contents with the new zip's, then click the reload icon ↻ on the extension's card. Your lists and settings are kept. The installed version is shown at the bottom of the side panel.

## Use it

Open claude.ai and sign in, then click the ArtiShare icon. The side panel has two tabs: **Lists** and **Share**.

### 1. Make a list

In the **Lists** tab, click **New list**:

- **Name** it, for example _Design team_.
- **Paste the addresses** in any shape: one per line, comma-separated, `Name <a@b.com>`, or cells copied from a spreadsheet. The counter shows how many are valid. Duplicates are dropped and invalid addresses are flagged.
- **Pick the permission** everyone on this list gets: _Can view_, _Commenter_ or _Can edit_.

Click **Save list**. To change a list later, click it to open it, edit, and **Save**.

### 2. Choose the lists that are ticked by default

At the top of the **Lists** tab, **Ticked by default when sharing** decides which lists are already ticked when you open the Share tab:

- **All lists**, or
- **Only these**, then tick the lists you share with most.

You can still tick or untick any list each time you share.

### 3. Pick artifacts and lists

In the **Share** tab:

- **Artifacts:** if the current tab is an artifact, its link is already filled in. Add more links (one per line), or open another artifact and click **+ Current tab**.
- **Share with:** tick the lists to invite. Need a new group? Click **+ New list** to make one without leaving the tab.

Click **Preview**. The button shows how many people and artifacts are involved.

### 4. Check the preview

Preview only **reads** who already has access to each artifact. Nothing is sent yet.

For each artifact you see:

- **To invite:** the people who will get an invitation, with their permission.
- **Already have access:** people who are skipped, and their access stays as it is.

On Claude Team and Enterprise plans, people added directly as organization members are not in the invitation list ArtiShare reads. Preview may show them under **To invite**. Check their access in Claude's Share menu before sending; inviting them may change that direct access. This does not apply to personal Pro, Max, or Ultra plans.

If something looks wrong, click **Back** and change it. When it's right, click **Send** and confirm.

### 5. Watch it run

Invites go out one at a time from the background, with a short pause between them, so you can close the side panel or keep working. Each address moves from _Pending_ to _Invited_ (or _Failed_ / _Skipped_, with the reason).

- **Stop** pauses the run. **Resume** continues where it left off.
- If the browser restarts mid-run, the run is kept and can be resumed.
- When it's done, click **New share** to start again.

## Good to know

- **Runs recheck email invitations before sending.** Addresses already in Claude's invitation list are skipped. On Team and Enterprise plans, check direct organization-member access in Claude separately.
- **Two lists, one person.** If someone is in two ticked lists, they get the higher of the two permissions.
- **Your own address is skipped**, since you own the artifact.
- **Rate limits are handled.** The run backs off and retries when claude.ai asks it to slow down, and it stops after repeated failures instead of hammering the server.

## Limits

These come from claude.ai's own sharing rules ([help article](https://support.claude.com/en/articles/9547008)):

| Limit                                                                                                                          | What ArtiShare does                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **At most 50 people outside your organization per artifact.** Pending invitations count toward it.                             | When an artifact reaches it, the rest of that artifact's invites are skipped and the run moves on to the next artifact. |
| **A daily invitation limit per account.**                                                                                      | The run stops and keeps the rest pending. **Resume** the next day.                                                      |
| **Outside invitations expire after 30 days** if they aren't accepted.                                                          | Sharing again renews expired invitations.                                                                               |
| **Artifacts that connect to other websites** can't be shared by email.                                                         | Nothing it can work around: share those another way.                                                                    |
| **Enterprise plans:** an admin must turn on _Email invitations outside your organization_ (Organization settings → Artifacts). | Ask your admin to turn it on first.                                                                                     |

Email sharing on claude.ai is in beta and has no public API. ArtiShare uses the same requests as the Share menu, so a change on claude.ai's side can break it. Preview checks the read endpoint; it cannot prove that a later invitation request will succeed.

## For maintainers

You only need this section to change or publish the extension.

### Publish a new version

There are two builds. They differ only in the manifest's `key`.

| Build                    | Command                 | Output                                         | `key` |
| ------------------------ | ----------------------- | ---------------------------------------------- | ----- |
| Zip for the shared drive | `npm run release`       | `.output/artishare-<version>-chrome.zip`       | Yes   |
| Chrome Web Store         | `npm run release:store` | `.output/artishare-<version>-chrome-store.zip` | No    |

Both scripts first run `npm run check`, which covers the typecheck, lint, format check and tests.

**Zip for the shared drive**

1. Bump `version` in `package.json`.
2. Run the release script.
3. Upload the zip to the shared drive and tell the team to update.

```bash
npm install
```

```bash
npm run release
```

The manifest's `key` in `wxt.config.ts` pins the extension ID. Without it, Chrome derives the ID from the folder path, so unzipping an update into a different folder would look like a new extension and lose everyone's saved lists. Don't remove or change the key.

**Chrome Web Store**

1. Bump `version` in `package.json`. The store refuses an upload that isn't a higher version than the last one.
2. Run the store release script.
3. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), open ArtiShare. Upload the zip on the **Package** tab, then submit it for review.

```bash
npm run release:store
```

The store rejects a manifest with `key` and gives the extension its own ID, so `release:store` sets `ARTISHARE_STORE=true`, which leaves the key out of the build. Because the IDs differ, lists saved in the shared-drive version don't carry over to the store version. The listing text, privacy answers and images are in [store/listing.md](store/listing.md). The privacy policy is [PRIVACY.md](PRIVACY.md).

**Icons.** The PNGs in `public/icon/` are rendered from [store/icon.svg](store/icon.svg). WXT adds them to the manifest on its own. To change the icon, edit the SVG, then render the PNGs again with [librsvg](https://gitlab.gnome.org/GNOME/librsvg) and ImageMagick:

```bash
for s in 16 32 48; do rsvg-convert -w $s -h $s store/icon.svg -o public/icon/$s.png; done
```

```bash
rsvg-convert -w 96 -h 96 store/icon.svg | magick - -background none -gravity center -extent 128x128 public/icon/128.png
```

The 128 px icon has 16 px of transparent padding, as the store asks.

### Develop

```bash
npm run dev        # opens Chrome with the extension and reloads on change
npm run dev:fake   # same, with an in-memory fake claude.ai: nothing is sent
npm test           # unit tests (Vitest)
npm run typecheck
npm run lint       # Oxlint, type-aware (config in .oxlintrc.json)
npm run format     # Prettier, rewrites files in place (format:check only checks)
npm run build:fake # fake build in .output/chrome-mv3-fake
```

Linting uses [Oxlint](https://oxc.rs/docs/guide/usage/linter) rather than ESLint, because typescript-eslint doesn't support TypeScript 7 yet. Its type-aware rules run on `oxlint-tsgolint`, which is built on TypeScript 7.

The dev server listens on port **47613** (set in `wxt.config.ts`). If that port is busy, WXT moves to the next free one. The built extension uses no port; it only talks to claude.ai over HTTPS.

**Fake mode** lets you click through the whole flow safely. The screenshots in this README come from it. Its fake claude.ai behaves like this:

- an artifact whose ID contains `Forbidden` rejects every invite
- an address starting with `fail` is rejected
- an address starting with `slow` is rate-limited once, then succeeds

### Project layout

```
src/
  core/         framework-free logic, unit-tested: email parsing, artifact links, saved lists
                (schema and upgrade from 0.1.0), planner (who to invite), runner (queue, retry, stop)
  claude/       ShareClient interface, the claude.ai client, the fake client, and in-page fetch
  lib/          chrome.storage access and the side panel ↔ background message types
  entrypoints/  background worker (runs invites) and the side panel
  ui/           shared React components and styles
tests/          Vitest specs for src/core
docs/           claude.ai sharing API notes and README screenshots
```

### How it talks to claude.ai

Requests run inside a claude.ai tab (`chrome.scripting.executeScript` in the extension's isolated world). They use your existing session, and the page's own scripts can't see or change them. If no claude.ai tab is open, the extension opens one in the background. The endpoints, IDs and error reasons are written up in [docs/claude-share-api.md](docs/claude-share-api.md).
