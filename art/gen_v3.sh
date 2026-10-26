#!/usr/bin/env bash
X=/c/Project/NKK_PROJECT/Tools/codex.sh
( cd /c/Project/nkk_another/art/knight/death && bash $X exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_side.png - < prompt_death.txt > log_death.txt 2>&1 ) &
( cd /c/Project/nkk_another/art/field && bash $X exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_side.png - < prompt_field.txt > log_field.txt 2>&1 ) &
wait
ls -la /c/Project/nkk_another/art/knight/death/*.png /c/Project/nkk_another/art/field/*.png
