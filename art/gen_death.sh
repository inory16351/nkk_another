#!/usr/bin/env bash
run(){ cd /c/Project/nkk_another/art/$1/death && bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_side.png - < prompt_death.txt > log_death.txt 2>&1; ls -la death.png; }
export -f run
printf '%s\n' lancer archer mage priest h_spear h_xbow h_boss c_scout c_knight | xargs -P 3 -I{} bash -c 'run {}'
