#!/usr/bin/env bash
# 캐릭터별 부위 시트 (Codex 사용 한도 확인 후 실행)
run(){ cd /c/Project/nkk_another/art/$1/sheet && [ -f parts.png ] && { echo "skip $1"; return; }; bash /c/Project/NKK_PROJECT/Tools/codex.sh exec --skip-git-repo-check --ephemeral -s workspace-write -C "$PWD" -i ref_full.png - < prompt_parts.txt > log_parts.txt 2>&1; ls -la parts.png 2>/dev/null || tail -2 log_parts.txt; }
export -f run
printf '%s\n' ${@:-knight lancer archer mage priest h_spear h_xbow h_boss c_scout c_knight} | xargs -P 3 -I{} bash -c 'run {}'
