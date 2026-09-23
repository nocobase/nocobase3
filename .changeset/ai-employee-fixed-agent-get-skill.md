---
'@nocobase/app-plugin-ai-employee': patch
---

Let a fixed agent read the Skills it is given

`createAgent({ skills })` activated the tools those Skills name but never gave the model the Skills themselves: a fixed agent had no `getSkill`, and `getSkill` had no Skills to return, so a Skill's procedure never reached the model. A fixed agent given Skills now gets `getSkill`, bound to exactly those Skills, and its system prompt lists them the way an employee's does, so the model loads a Skill's content when a request matches it.
