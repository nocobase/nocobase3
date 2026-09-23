---
'@nocobase/app-plugin-ai-employee': patch
---

Keep an LLM key out of the transcript, and build the user's command for their environment

The Skill promised that a key never passes through the agent, which neither of its first two options could keep. A variable set before the session is in the agent's own environment, since an agent's shell starts from the user's profile, so a single debugging command prints it; and a key written into `config.yml` is read every time the agent edits that file. The promise is now what can be kept — the key stays out of the repository and out of the transcript — with the kinds of command that would print it named, a check that reports only set or missing, and option 2 offered only when the user accepts that the agent will see the key.

The Skill used to hand the user fixed shell commands, and they failed in common cases: a profile that does not exist yet, a profile that is a symbolic link, a key containing characters the command treated as syntax — and they assumed a shell and an operating system the user might not have. The Skill no longer ships commands. It tells the agent to work out the user's operating system, shell, which startup file that shell reads, and where the server takes its environment from, confirming with the user rather than assuming the agent's own environment; to prefer the environment's own mechanism for a persistent variable; and to build a command that creates its target, replaces an earlier entry, keeps everything else, writes through a symbolic link, inserts the key literally and prints nothing of it — verified with a fake value before it is handed over, or replaced by an editor instruction when it cannot be.

The Skill now explains two restarts that look like enough and are not: `pnpm dev` restarts on its own when `config.yml` or `.env` changes but keeps the environment it started with, and a variable set during the session never reaches a server the agent starts. It also stops saying `pnpm build` ships no `.env`: it writes an allowlisted `dist/.env`, which carries no LLM key.
