# ArtiShare privacy policy

_Last updated: 8 November 2026_

ArtiShare is a Chrome extension that invites saved lists of email addresses to claude.ai artifacts. This page says what data it handles and where that data goes.

## What ArtiShare stores

ArtiShare stores two things in Chrome's local extension storage (`chrome.storage.local`) on your own computer:

- **Your lists.** Each list has a name, the email addresses you typed into it, and the permission to give (view, comment or edit).
- **The latest invitation run.** This holds the artifacts you shared, plus each invite's email address, permission and result, so you can resume a run that stopped.

This data isn't synced to your Google account and isn't sent to the developer. If you remove the extension, Chrome deletes it.

## What ArtiShare sends, and to whom

ArtiShare talks only to **claude.ai**. It doesn't contact any other server.

It sends its requests from inside your open claude.ai tab, signed in as you, just like the Share menu does. It uses those requests to:

- read your claude.ai account (your email address and the organizations you belong to), and your last active organization, so it knows where your artifacts are;
- read who already has access to the artifacts you pick;
- send an invitation to each email address you choose to share with.

Your account details are used only while the extension is open, and they aren't saved. The email addresses you invite go to claude.ai, which emails the invitations. From there, claude.ai's own [privacy policy](https://www.anthropic.com/legal/privacy) applies.

## What ArtiShare doesn't do

- It has no analytics, tracking or advertising.
- It doesn't sell or share your data with anyone.
- It doesn't use your data for anything except sending the invitations you ask for.
- It doesn't load or run code from anywhere outside the extension.

## Not affiliated with Anthropic

ArtiShare is an independent tool. It isn't made, endorsed or supported by Anthropic, the company behind Claude and claude.ai.

## Contact

If you have a question about this policy, open an issue at [github.com/vantung220902/ArtiShare/issues](https://github.com/vantung220902/ArtiShare/issues).
