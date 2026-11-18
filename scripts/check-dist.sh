#!/usr/bin/env bash
# 校验 dist/ 与 src/ 是否同步。
#
# 用法：
#   bash scripts/check-dist.sh            # 只检查，不一致时退出码 1（CI 用）
#   bash scripts/check-dist.sh --stage    # 不一致时自动重建并暂存（pre-commit 用）
#
# 之所以要检查：dist/ 随仓库提交，供 git 引用方直接使用，
# 一旦源码改动后忘记 build，引用方拿到的就是旧产物。
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="check"
if [[ "${1:-}" == "--stage" ]]; then
  MODE="stage"
fi

# 需要保持同步的路径：编译产物 + 由 src/styles.css 生成的样式模块
WATCHED=(dist src/styles.generated.ts)

echo "[check-dist] 重新构建..."
if ! pnpm run build >/dev/null; then
  echo "[check-dist] ❌ 构建失败，请先修好编译错误。" >&2
  exit 1
fi

# 包含未跟踪文件、已暂存与未暂存的改动
CHANGED="$(git status --porcelain -- "${WATCHED[@]}")"

if [[ -z "$CHANGED" ]]; then
  echo "[check-dist] ✅ dist/ 与 src/ 一致。"
  exit 0
fi

echo "[check-dist] ⚠️  dist/ 与 src/ 不一致，差异如下："
echo "$CHANGED" | sed 's/^/    /'

if [[ "$MODE" == "stage" ]]; then
  git add -A -- "${WATCHED[@]}"
  echo "[check-dist] 已重新构建并暂存上述文件，本次提交会一并带上。" >&2
  exit 0
fi

cat >&2 <<'MSG'
[check-dist] ❌ 构建产物与源码不同步。
    请执行 `pnpm build` 后把 dist/（以及 src/styles.generated.ts）一起提交。
MSG
exit 1
