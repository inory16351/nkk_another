#!/usr/bin/env bash
# 브라우저가 받은 마지막 파일(.tmp 또는 지정 이름)을 프로젝트 경로로 옮김: grab_download.sh <크기(바이트)> <대상 경로>
size=$1; dst=$2
f=$(find ~/Downloads -maxdepth 1 -type f -size ${size}c -newer /c/Project/nkk_another/tools/serve.js | head -1)
[ -z "$f" ] && { echo "못 찾음 $size"; exit 1; }
mkdir -p "$(dirname "$dst")"; mv "$f" "$dst"; echo "옮김 $(basename "$f") -> $dst"
