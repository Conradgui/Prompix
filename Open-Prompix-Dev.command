#!/bin/zsh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

node ./scripts/launch-prompix.mjs --mode=dev
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Prompix 开发模式启动失败，按回车关闭窗口..."
  read
fi

exit $EXIT_CODE
