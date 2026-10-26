#!/usr/bin/env bash
# Codex 로 탑뷰 그림 생성: bash gen.sh [이름...]  (없으면 전부, 동시에 실행)
# 옛 옆모습 그림은 side/ (탑뷰를 그릴 때 디자인 참조로 씀)
cd "$(dirname "$0")"
refs(){ case $1 in
  player) echo "-i side/player.png -i ref_hero.png";;
  e_cat) echo "-i side/e_cat.png -i ref_cats.png";;
  e_hawk) echo "-i side/e_hawk.png";;
  boss) echo "-i side/boss.png -i ref_cats.png";;
  *) echo "-i side/player.png -i ref_cats.png";;
esac; }
names=${*:-"player e_cat e_hawk boss islands"}
for n in $names; do
  bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" $(refs $n) - < prompt_$n.txt > log_$n.txt 2>&1 &
done
wait; ls -la *.png
