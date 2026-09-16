---
'@nocobase/app-plugin-mail': patch
---

Simplify the mail detail reading layout by removing the separate sticky title bar and nested message cards, hiding the conversation count for single messages, and avoiding duplicate sender addresses.

Vertically align message timestamps and actions, display saved notes and to-do markers in message details, and format list and detail dates using the current interface language.

Allow completing a to-do directly from the message detail checkbox, clarify the to-do menu actions, and simplify notes to an icon and their content.

Add an edit button to the note bar that opens the same note editor as the message menu.

Add a compact label picker to the message toolbar between the star and more actions so labels can be assigned or removed without leaving the reading view, keeping the picker open for multiple selections. Show only assigned labels in the message body.
