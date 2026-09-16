---
'@nocobase/app-plugin-hub': patch
---

Keep a dialog's actions and its step indicator in view while its content scrolls

`DialogContent` made the whole popup one scroll container, so a dialog tall enough to overflow moved its own footer below the fold. Deploying an application was the worst case: the configuration step stacks a source picker, a notice, and two editors, and the primary action could only be reached by scrolling past all of it.

The popup is now a column that does not scroll. A header, an optional subheader, and a footer stay put, and a single body between them is what moves. `AppDialog` gained `footer` and `subheader` for this, and the deploy wizard puts its step indicator and configuration-source picker in the subheader — controls a reader needs in order to act on the body scroll out of reach exactly when the content is long enough to need them.

The configuration editor's height is capped against the viewport as well as in pixels, so on a short screen it shrinks rather than spending the whole body on itself.

One behavioural note: the create-application dialog's submit button now sits outside the `<form>` it belongs to, and is reassociated with it by `form` id, so both clicking it and pressing Enter in a field still submit.
