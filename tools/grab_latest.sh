#!/usr/bin/env bash
# 브라우저가 방금 받은 .tmp 를 크기 확인 후 옮김: grab_latest.sh <크기> <대상>
sleep 3
f=$(ls -t ~/Downloads/*.tmp 2>/dev/null | head -1)
[ -z "$f" ] && { echo "없음"; exit 1; }
s=$(stat -c %s "$f"); [ "$s" != "$1" ] && { echo "크기 다름 $s != $1"; exit 1; }
mkdir -p "$(dirname "$2")"; mv "$f" "$2"; echo "옮김 -> $2"
