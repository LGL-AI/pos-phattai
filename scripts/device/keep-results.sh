#!/usr/bin/env bash
# Screenshots + results of a device run as a DRAFT release (not public), newest 4 kept.
set -uo pipefail
dir=$1; job=$2
[ -d "$dir" ] || exit 0
tag="device-test-${GITHUB_RUN_ID}-${job}"
files=$(ls "$dir"/*.png "$dir"/*.xml "$dir"/results.json "$dir"/*.log "$dir"/logcat.txt 2>/dev/null)
[ -n "$files" ] || exit 0
gh release create "$tag" --draft --title "Device test $job (run $GITHUB_RUN_ID)" \
  --notes "Android emulator screenshots for review. Draft only; replaced automatically." $files > /dev/null && echo "kept as draft $tag"
gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100" --jq '[.[] | select(.draft and (.tag_name | startswith("device-test-")))] | sort_by(.created_at) | reverse | .[4:] | .[].id' |
  while read -r id; do gh api -X DELETE "repos/$GITHUB_REPOSITORY/releases/$id" > /dev/null && echo "removed old draft $id"; done
exit 0
