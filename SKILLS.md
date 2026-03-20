# Skills

This repo includes project-local skills for both:
- Claude (project skills live under `.claude/skills/**/SKILL.md`)
- Codex CLI (project skills live under `.codex/skills/**/SKILL.md`)

## Conventions used here
- One workflow per skill (small and reusable).
- YAML frontmatter includes `name` and `description` only (portable across tools).
- Skill directory name matches the `name` field (e.g. `rpc-env-setup/`).
- Steps are concrete and command-oriented; examples use this repo's CLI.
- No secrets in examples; env vars are referenced by name.

## Current skills
- `linkdrop-agent-cli`: run `linkdrop-agent.js` (`send`/`claim`) and interpret JSON output.
- `rpc-env-setup`: set RPC env vars and sanity-check connectivity for the CLI.

## Keeping skills in sync
The `.claude/skills/` and `.codex/skills/` trees are intentionally kept identical.
If you edit one, edit the matching file in the other tree.
