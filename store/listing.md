# Chrome Web Store listing

Copy for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). The fields are in dashboard order. Images are in [`images/`](images/) and the icon source is [`icon.svg`](icon.svg).

The homepage, support and privacy URLs point at the GitHub Pages site built from [`docs/`](../docs/), not at github.com. The store's URL check timed out on github.com repo pages.

## Package

Upload `.output/artishare-<version>-chrome-store.zip`. To build it, run `npm run release:store`. Each upload needs a higher `version` in `package.json` than the last one.

## Store listing tab

**Summary.** The store takes this from the manifest `description` in `wxt.config.ts`, which can be at most 132 characters:

> Invite saved lists of email addresses to claude.ai artifacts in bulk.

**Description:**

```text
ArtiShare invites whole groups of people to your claude.ai artifacts in a few clicks.

Save the email addresses you share with often as lists, each with its own permission: Can view, Commenter or Can edit. Then paste one or more artifact links, tick the lists, and ArtiShare sends the invitations. You don't add people one by one in the Share menu, and you don't have to make the artifact public.

How it works
• Open claude.ai, sign in, and click the ArtiShare toolbar icon. The popup shows which account you're signed in as, and has two tabs: Share and Lists.
• Lists: give a list a name, add email addresses and pick a permission. You can also choose which lists are ticked by default when you share.
• Share: artifacts are a list of rows, each with a × to remove it (and Undo). Paste links, or click "Current tab"; the artifact you're on is added for you and marked "This tab". Tick the lists to share with, or make a new list right there.
• Preview: for each artifact, see who will be invited and who already has access. Nothing is sent yet.
• Send: confirm, and the invitations go out one at a time while you follow each one. You can stop and resume. Closing the popup doesn't stop the run, and your draft is kept.
• Side panel: an icon in the header moves ArtiShare from the popup into the browser's side panel, which stays open while you work in the page and follows the tab you're on. The "Use popup instead" icon opens the popup straight away and closes the side panel (in other windows too); if Chrome can't open the popup, the side panel stays open and says to click the toolbar icon. The toolbar icon remembers your choice, and your work comes with you.
• Manage access: on an artifact's tab, click the people icon in the header to see everyone who's invited and whether they've accepted, change their permission or remove their invitation. Each person shows which of your saved lists they're in, and "Save to a list" saves the people who aren't in any list to a new or an existing list, with checkboxes to choose who. Their access to the artifact doesn't change.

Good to know
• Your own address is skipped, and so is anyone who already has an invitation.
• If someone is in two lists, they get the higher of the two permissions.
• Rate limits are handled. The run waits and retries when claude.ai asks it to slow down, and stops after repeated failures. You can resume a stopped run.
• claude.ai's own sharing limits apply. For example, an artifact can have at most 50 people from outside your organization, and each account has a daily invitation limit.

Privacy
Your lists stay in your browser's local storage. ArtiShare talks only to claude.ai, from your own signed-in tab. It has no analytics or tracking.

Email sharing on claude.ai is in beta and has no public API. ArtiShare uses the same requests as the Share menu, so a change on claude.ai's side can break it.

ArtiShare is an independent tool. It isn't made, endorsed or supported by Anthropic.
```

**Category:** Productivity → Workflow & Planning

**Language:** English

**Graphic assets:**

| Field              | File                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Store icon         | [`public/icon/128.png`](../public/icon/128.png)                                                                                                                                                                                                                                                                                            |
| Screenshots        | [`images/screenshot-1-share.png`](images/screenshot-1-share.png), [`images/screenshot-2-preview.png`](images/screenshot-2-preview.png), [`images/screenshot-3-done.png`](images/screenshot-3-done.png), [`images/screenshot-4-manage.png`](images/screenshot-4-manage.png), [`images/screenshot-5-save.png`](images/screenshot-5-save.png) |
| Small promo tile   | [`images/promo-tile-440x280.png`](images/promo-tile-440x280.png)                                                                                                                                                                                                                                                                           |
| Marquee promo tile | Leave empty. It's optional.                                                                                                                                                                                                                                                                                                                |

**Homepage URL:** https://vantung220902.github.io/ArtiShare/

**Support URL:** https://vantung220902.github.io/ArtiShare/#support

## Privacy tab

**Single purpose:**

```text
ArtiShare does one thing: it invites saved lists of email addresses to the user's claude.ai artifacts in bulk, and lets the user manage the invitations already sent to an artifact (change a person's permission or remove their invitation), from a toolbar popup or, if the user chooses, a side panel.
```

**Permission justifications:**

| Permission                 | Justification                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                  | Saves the user's lists (name, email addresses and permission), the current run's progress, and the signed-in account email used to verify a resumed run.                                                               |
| `scripting`                | Runs ArtiShare's requests inside the user's open claude.ai tab, so they use the user's own claude.ai session, just as the Share menu does. It's used only on claude.ai tabs.                                           |
| `sidePanel`                | Lets the user move ArtiShare from the toolbar popup into the browser's side panel, which stays open next to claude.ai, and back. It opens only when the user clicks the toolbar icon or the "Open in side panel" icon. |
| Host `https://claude.ai/*` | Needed to run those requests in claude.ai tabs, and to read the address of the current claude.ai tab for the "Current tab" button and the "Manage access" view. The extension doesn't access any other site.           |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage.** Tick these:

- **Personally identifiable information.** These are the email addresses in the user's lists, and the user's own claude.ai email address, which is used to skip it and verify a resumed run.
- **Website content.** This is the list of who already has access to each artifact, read from claude.ai before inviting and in the Manage access view.

Leave the other categories unticked. Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://vantung220902.github.io/ArtiShare/privacy.html

## Distribution tab

**Visibility:**

- **Private.** Only the people you choose can find and install it. You can limit it to your Google Workspace domain only if the developer account belongs to that domain.
- **Unlisted.** Anyone with the link can install it, but it doesn't show up in search. This suits a team tool that relies on a beta claude.ai feature.
- **Public.** Anyone can find it.

**Regions:** All regions.

## Test instructions tab

```text
ArtiShare needs a claude.ai account with at least one published artifact.

1. Sign in at https://claude.ai and open one of your artifacts (claude.ai/artifact/...).
2. Click the ArtiShare toolbar icon. The popup opens and shows the signed-in account.
3. In Lists, click "New list" and create a list containing an email address you control, with "Can view".
4. In Share, click "Current tab" to add the artifact, tick the list and click Preview.
5. Click "Send 1 invitation" and confirm. The address receives a claude.ai invitation email.
6. Click "Start a new share", then the people icon ("Manage access") in the header. The invited address is listed as Pending.
7. Change its permission to "Can edit", then click Remove and confirm. The invitation is removed from the artifact.
8. Optional: click the "Open in side panel" icon in the header. ArtiShare opens in the side panel; "Use popup instead" opens the popup and closes the side panel.
```
