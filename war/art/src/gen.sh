#!/usr/bin/env bash
# Codex 그림 생성: bash gen.sh [이름...]  (없으면 1차 전부, 동시에)
# 2차(poses·death)는 body 시트가 나온 뒤: bash gen.sh rat_poses rat_death cat_poses cat_death
cd "$(dirname "$0")"
node make_prompts.js > /dev/null
refs(){ case $1 in
  rat_body) echo "-i ref_rat.png";;
  cat_body) echo "-i ref_cats.png";;
  rat_poses|rat_death) echo "-i rat_body.png";;
  cat_poses|cat_death) echo "-i cat_body.png";;
  *) echo "-i ref_rat.png -i ref_cats.png";;
esac; }
names=${*:-"rat_body cat_body weapons props terrain"}
for n in $names; do
  bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" $(refs $n) - < prompt_$n.txt > log_$n.txt 2>&1 &
done
wait; ls -la *.png
