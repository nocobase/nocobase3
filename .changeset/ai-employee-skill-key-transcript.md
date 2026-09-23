---
'@nocobase/app-plugin-ai-employee': patch
---

Keep an LLM key out of the transcript, and give the user commands that work

The Skill promised that a key never passes through the agent, which neither of its first two options could keep. A variable set before the session is in the agent's own environment, since an agent's shell starts from the user's profile, so a single debugging command prints it; and a key written into `config.yml` is read every time the agent edits that file. The promise is now what can be kept — the key stays out of the repository and out of the transcript — with the commands that would print it named, a check that prints nothing of the value, and option 2 offered only when the user accepts that the agent will see the key.

The commands the user runs were rewritten after they failed in two common cases: a profile that does not exist yet, the default for a new macOS account, and a profile that is a symbolic link, as dotfile managers leave it. The new ones create the file, write through a link rather than replacing it, keep every other line, replace an earlier line for the same variable, and insert the key literally whatever characters it contains. They also point bash on macOS at `~/.bash_profile`, give Windows a check to go with `setx`, and say that every command lands in the shell history.

The Skill now explains two restarts that look like enough and are not: `pnpm dev` restarts on its own when `config.yml` or `.env` changes but keeps the environment it started with, and a variable set during the session never reaches a server the agent starts. It also stops saying `pnpm build` ships no `.env`: it writes an allowlisted `dist/.env`, which carries no LLM key.
