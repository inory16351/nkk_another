#!/usr/bin/env bash
cd /c/Project/nkk_another/art/ui && bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_style.png -i ref_knight.png - < prompt_ui.txt > log_ui.txt 2>&1; ls -la ui_kit.png || tail -3 log_ui.txt
