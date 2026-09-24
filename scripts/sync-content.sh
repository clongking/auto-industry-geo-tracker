#!/usr/bin/env bash
# 把 Agent Store 中的报告同步进 content/（含链接改写）。
# 用法：scripts/sync-content.sh [--source <docs 目录>] [--date YYYY-MM-DD]
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/sync-content.mjs "$@"
