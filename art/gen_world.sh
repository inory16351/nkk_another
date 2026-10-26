#!/usr/bin/env bash
X=/c/Project/NKK_PROJECT/Tools/codex.sh
run(){ d=$(dirname $1); n=$(basename $1); cd /c/Project/nkk_another/art/$d && bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_field.png -i ref_knight.png - < prompt_$n.txt > log_$n.txt 2>&1; ls -la $n.png; }
export -f run
printf '%s\n' stages/stage1 stages/stage2 stages/stage3 stages/stage4 stages/stage5 base/base_bg base/buildings base/worldmap | xargs -P 3 -I{} bash -c 'run {}'
