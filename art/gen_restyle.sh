#!/usr/bin/env bash
X=/c/Project/NKK_PROJECT/Tools/codex.sh
run(){ id=$1; d=/c/Project/nkk_another/art/$id
  cd $d && rm -f full_side.png && bash $X exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_pose.png -i ref_style2.png -i ref_design_old.png - < prompt_full_side.txt > log_full_side.txt 2>&1 || return
  [ -f full_side.png ] || { echo "FAIL full $id"; return; }
  cp full_side.png sheet/ref_full.png && cd sheet && rm -f parts.png && bash $X exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_full.png - < prompt_parts.txt > log_parts.txt 2>&1
  cd $d && cp full_side.png death/ref_side.png && cd death && rm -f death.png && bash $X exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_side.png - < prompt_death.txt > log_death.txt 2>&1
  ls -la $d/full_side.png $d/sheet/parts.png $d/death/death.png
}
export -f run; export X
printf '%s\n' archer c_scout c_knight | xargs -P 3 -I{} bash -c 'run {}'
