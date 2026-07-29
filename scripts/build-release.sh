#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${project_dir}/dist"
release_files_path="${project_dir}/release-files.txt"
staging_dir="$(mktemp -d)"

cleanup() {
  rm -rf "${staging_dir}"
}
trap cleanup EXIT

node "${project_dir}/scripts/validate-extension.mjs"

manifest_version="$(
  node -e "const fs=require('fs'); const value=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(value.version)" \
    "${project_dir}/manifest.json"
)"
versioned_archive="${output_dir}/ai-bookmark-organizer-${manifest_version}.zip"
latest_archive="${output_dir}/ai-bookmark-organizer.zip"
checksums_path="${output_dir}/SHA256SUMS.txt"

release_files=()
while IFS= read -r relative_path; do
  if [[ -n "${relative_path}" ]]; then
    release_files+=("${relative_path}")
  fi
done < "${release_files_path}"

for relative_path in "${release_files[@]}"; do
  destination="${staging_dir}/${relative_path}"
  mkdir -p "$(dirname "${destination}")"
  cp "${project_dir}/${relative_path}" "${destination}"
  touch -t 198001010000 "${destination}"
done

mkdir -p "${output_dir}"
rm -f "${versioned_archive}" "${latest_archive}" "${checksums_path}"

(
  cd "${staging_dir}"
  TZ=UTC zip -X -q "${versioned_archive}" "${release_files[@]}"
)

cp "${versioned_archive}" "${latest_archive}"

(
  cd "${output_dir}"
  shasum -a 256 \
    "$(basename "${versioned_archive}")" \
    "$(basename "${latest_archive}")" \
    > "$(basename "${checksums_path}")"
)

printf '%s\n' "${versioned_archive}"
