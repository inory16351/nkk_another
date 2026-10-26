#!/usr/bin/env bash
cd "$(dirname "$0")"
for n in full_side full_front full_back; do
  bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_knight.png -i ref_knight_parts.png - < prompt_$n.txt > log_$n.txt 2>&1 &
done
wait
ls -la full_*.png
