# Chrome Web Store listing

Copy for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). The fields are in dashboard order. Images are in [`images/`](images/) and the icon source is [`icon.svg`](icon.svg).

## Package

Upload `.output/artishare-<version>-chrome-store.zip`. To build it, run `npm run release:store`. Each upload needs a higher `version` in `package.json` than the last one.

## Store listing tab

**Summary.** The store takes this from the manifest `description` in `wxt.config.ts`, which can be at most 132 characters:

> Invite saved lists of email addresses to claude.ai artifacts in bulk.

**Description:**

```text
ArtiShare invites whole groups of people to your claude.ai artifacts in a few clicks.

Save the email addresses you share with often as lists, each with its own permission: can view, can comment or can edit. Then paste one or more artifact links, tick the lists, and ArtiShare sends the invitations. You don't add people one by one in the Share menu, and you don't have to make the artifact public.

How it works
• Open claude.ai, sign in, and click the ArtiShare icon to open the side panel.
• Lists: give a list a name, add email addresses and pick a permission.
• Share: add artifact links, or the claude.ai tab you're on, and tick the lists to share with.
• Preview: see who will be invited and who already has an invitation. Nothing is sent yet.
• Send: the invitations go out one at a time, and you can follow each one.

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

| Field              | File                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Store icon         | [`public/icon/128.png`](../public/icon/128.png)                                                                                                                                                        |
| Screenshots        | [`images/screenshot-1-share.png`](images/screenshot-1-share.png), [`images/screenshot-2-preview.png`](images/screenshot-2-preview.png), [`images/screenshot-3-done.png`](images/screenshot-3-done.png) |
| Small promo tile   | [`images/promo-tile-440x280.png`](images/promo-tile-440x280.png)                                                                                                                                       |
| Marquee promo tile | Leave empty. It's optional.                                                                                                                                                                            |

**Homepage URL:** https://github.com/vantung220902/ArtiShare

**Support URL:** https://github.com/vantung220902/ArtiShare/issues

## Privacy tab

**Single purpose:**

```text
ArtiShare does one thing: it invites saved lists of email addresses to the user's claude.ai artifacts in bulk, from a side panel.
```

**Permission justifications:**

| Permission                 | Justification                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                  | Saves the user's lists (name, email addresses and permission) and the progress of the current invitation run on the device, so the lists are there next time and a stopped run can be resumed. |
| `sidePanel`                | The whole interface is a side panel that opens next to claude.ai when the user clicks the toolbar icon.                                                                                        |
| `scripting`                | Runs ArtiShare's requests inside the user's open claude.ai tab, so they use the user's own claude.ai session, just as the Share menu does. It's used only on claude.ai tabs.                   |
| Host `https://claude.ai/*` | Needed to run those requests in claude.ai tabs, and to read the address of the current claude.ai tab for the "Current tab" button. The extension doesn't access any other site.                |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage.** Tick these:

- **Personally identifiable information.** These are the email addresses in the user's lists, and the user's own claude.ai email address, which is read to skip it.
- **Website content.** This is the list of who already has access to each artifact, read from claude.ai before inviting.

Leave the other categories unticked. Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/vantung220902/ArtiShare/blob/develop/PRIVACY.md

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
2. Click the ArtiShare toolbar icon. The side panel opens and shows the signed-in account.
3. In Lists, create a list containing an email address you control, with "Can view".
4. In Share, click "Current tab" to add the artifact, tick the list and click Preview.
5. Click Send and confirm. The address receives a claude.ai invitation email.
```
