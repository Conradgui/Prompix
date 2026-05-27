#!/bin/zsh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

node ./scripts/stop-prompix.mjs
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Prompix 停止失败，按回车关闭窗口..."
  read
fi

exit $EXIT_CODE
