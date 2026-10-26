#!/usr/bin/env bash
cd "$(dirname "$0")"
for n in tiles_sheet backdrop battle_bg fg_branch; do
  bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_knight.png - < prompt_$n.txt > log_$n.txt 2>&1 &
done
wait; ls -la *.png
