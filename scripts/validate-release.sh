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

"${project_dir}/scripts/build-release.sh" > /dev/null

manifest_version="$(
  node -e "const fs=require('fs'); const value=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(value.version)" \
    "${project_dir}/manifest.json"
)"
archive_path="${project_dir}/dist/ai-bookmark-organizer-${manifest_version}.zip"

cp "${archive_path}" "${validation_dir}/first.zip"
"${project_dir}/scripts/build-release.sh" > /dev/null
cmp "${validation_dir}/first.zip" "${archive_path}"

unzip -tq "${archive_path}" > /dev/null
LC_ALL=C sort "${project_dir}/release-files.txt" > "${validation_dir}/expected.txt"
unzip -Z1 "${archive_path}" | LC_ALL=C sort > "${validation_dir}/actual.txt"
diff -u "${validation_dir}/expected.txt" "${validation_dir}/actual.txt"

printf 'Validated reproducible release: %s\n' "${archive_path}"
