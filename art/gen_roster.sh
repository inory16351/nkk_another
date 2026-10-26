#!/usr/bin/env bash
cd /c/Project/nkk_another/art
run(){ cd /c/Project/nkk_another/art/$1 && bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_pose.png -i ref_design.png - < prompt_full_side.txt > log_full_side.txt 2>&1; ls -la full_side.png; }
export -f run
printf '%s\n' lancer archer mage priest h_spear h_xbow h_boss c_scout c_knight | xargs -P 5 -I{} bash -c 'run {}'
