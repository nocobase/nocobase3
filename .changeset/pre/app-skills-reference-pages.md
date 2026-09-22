---
"@nocobase/app-skills": patch
---

Point the application development Skill at `client/pages/reference/` before it designs UI of its own. Every current template ships worked screens and one page per shadcn/ui primitive there, unrouted and kept to be read, so the Skill names which page to open for a list, a record editor or a settings screen, and says to copy the structure without importing or routing the source. An application generated before that directory existed does not have it, and the guidance says so rather than sending the reader after a missing path.
