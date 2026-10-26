#!/usr/bin/env bash
run(){ cd /c/Project/nkk_another/art/$1/death && [ -f death.png ] && return; bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_side.png - < prompt_death.txt > log_death.txt 2>&1; ls -la death.png 2>/dev/null || tail -2 log_death.txt; }
export -f run
printf '%s\n' h_xbow h_boss c_scout c_knight | xargs -P 2 -I{} bash -c 'run {}'
