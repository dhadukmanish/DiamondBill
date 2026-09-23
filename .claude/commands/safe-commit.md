---
description: Stage everything except .jetro, commit, and push
argument-hint: <commit message>
---

Commit and push the current work with the message: **$ARGUMENTS**

(If no message was given, stop and ask for one.)

1. `git status -sb` and `git diff --stat` — show the user what is about to be committed.
2. **Guard the credentials.** Confirm nothing under `.jetro/` is staged:
   ```
   git add -A
   git reset -q -- .jetro
   git diff --cached --name-only | grep -i jetro && echo "ABORT: jetro file staged"
   ```
   If anything matches, abort and tell the user. This repo is **public**; `.jetro/` holds real
   credentials. Also scan the staged diff for any other secret (`.env`, tokens, keys) and
   abort if you find one.
3. Commit with exactly the message given — do not reword it, do not add scope prefixes.
   End the commit message with the attribution line this session requires.
4. `git push`
5. Report the new commit hash and confirm the tree is clean and in sync with origin.

Never use `--no-verify`. If a hook fails, show the output and stop.
