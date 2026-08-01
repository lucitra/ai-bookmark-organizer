#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
validation_dir="$(mktemp -d)"

cleanup() {
  rm -rf "${validation_dir}"
}
trap cleanup EXIT

node --test "${project_dir}"/test/*.test.cjs
node "${project_dir}/scripts/validate-site.mjs"
npm --prefix "${project_dir}/companion" ci --ignore-scripts
npm --prefix "${project_dir}/companion" run check
npm --prefix "${project_dir}/companion" test

manifest_version="$(
  node -e "const fs=require('fs'); const value=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(value.version)" \
    "${project_dir}/manifest.json"
)"
companion_version="$(
  node -e "const value=require(process.argv[1]); process.stdout.write(value.version)" \
    "${project_dir}/companion/package.json"
)"
test "${manifest_version}" = "${companion_version}"
(
  cd "${project_dir}/companion"
  npm pack --dry-run --json
) > "${validation_dir}/companion-pack.json"
node -e '
  const fs = require("fs")
  const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[0]
  const names = new Set(result.files.map((file) => file.path))
  const required = ["README.md", "LICENSE", "package.json", "bin/lucitra-bookmarks.mjs"]
  for (const path of required) {
    if (!names.has(path)) throw new Error(`Companion package is missing ${path}`)
  }
  for (const path of names) {
    if (path.startsWith("test/") || path === "package-lock.json") {
      throw new Error(`Companion package contains development file ${path}`)
    }
  }
' "${validation_dir}/companion-pack.json"

"${project_dir}/scripts/build-release.sh" > /dev/null
archive_path="${project_dir}/dist/ai-bookmark-organizer-${manifest_version}.zip"

cp "${archive_path}" "${validation_dir}/first.zip"
"${project_dir}/scripts/build-release.sh" > /dev/null
cmp "${validation_dir}/first.zip" "${archive_path}"

unzip -tq "${archive_path}" > /dev/null
LC_ALL=C sort "${project_dir}/release-files.txt" > "${validation_dir}/expected.txt"
unzip -Z1 "${archive_path}" | LC_ALL=C sort > "${validation_dir}/actual.txt"
diff -u "${validation_dir}/expected.txt" "${validation_dir}/actual.txt"

printf 'Validated reproducible release: %s\n' "${archive_path}"
