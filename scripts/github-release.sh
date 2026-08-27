#!/usr/bin/env bash

set -euo pipefail

ACTION=${1:-}
TAG=${2:-}
CHANNEL=${3:-}

if [[ -z "$ACTION" || -z "$CHANNEL" ]]; then
  echo "Usage: bash scripts/github-release.sh <action> <tag> <beta|stable> [arguments]" >&2
  exit 2
fi
if [[ "$CHANNEL" != "beta" && "$CHANNEL" != "stable" ]]; then
  echo "Unsupported release channel: $CHANNEL" >&2
  exit 2
fi

restore_release() {
  local release_tag=$1
  local release_channel=$2
  local manifest_file=$3
  local expected_prerelease=false
  if [[ "$release_channel" == "beta" ]]; then
    expected_prerelease=true
  fi

  if ! [[ "$release_tag" =~ ^release(-beta)?/[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$ ]]; then
    echo "Invalid release tag: $release_tag" >&2
    return 1
  fi
  if [[ "$release_channel" == "beta" && "$release_tag" != release-beta/* ]]; then
    echo "Release tag $release_tag is not a beta tag" >&2
    return 1
  fi
  if [[ "$release_channel" == "stable" && "$release_tag" != release/* ]]; then
    echo "Release tag $release_tag is not a stable tag" >&2
    return 1
  fi

  git fetch origin "+refs/tags/${release_tag}:refs/tags/${release_tag}"
  local tag_manifest
  tag_manifest=$(mktemp)
  git for-each-ref --format='%(contents)' "refs/tags/$release_tag" > "$tag_manifest"
  node scripts/release-manifest.mjs validate \
    --manifest "$tag_manifest" \
    --channel "$release_channel" \
    --tag "$release_tag"

  if gh release view "$release_tag" \
    --json isDraft,isPrerelease,tagName \
    > /tmp/github-release.json 2>/dev/null; then
    if [[ $(jq -r '.isPrerelease' /tmp/github-release.json) != "$expected_prerelease" ]]; then
      echo "Release $release_tag has the wrong prerelease state" >&2
      rm -f "$tag_manifest"
      return 1
    fi
    local asset_manifest
    asset_manifest=$(mktemp)
    local canonical_tag_manifest
    local canonical_asset_manifest
    canonical_tag_manifest=$(mktemp)
    canonical_asset_manifest=$(mktemp)
    gh release download "$release_tag" \
      --pattern release-manifest.json \
      --output "$asset_manifest" \
      --clobber
    jq -S . "$tag_manifest" > "$canonical_tag_manifest"
    jq -S . "$asset_manifest" > "$canonical_asset_manifest"
    if ! cmp -s "$canonical_tag_manifest" "$canonical_asset_manifest"; then
      echo "Release manifest asset does not match the immutable tag manifest" >&2
      rm -f "$tag_manifest" "$asset_manifest" "$canonical_tag_manifest" "$canonical_asset_manifest"
      return 1
    fi
    rm -f "$asset_manifest" "$canonical_tag_manifest" "$canonical_asset_manifest"
  fi

  cp "$tag_manifest" "$manifest_file"
  rm -f "$tag_manifest"
  node scripts/release-manifest.mjs validate \
    --manifest "$manifest_file" \
    --channel "$release_channel" \
    --tag "$release_tag"

  local tag_sha
  local manifest_sha
  tag_sha=$(git rev-parse "refs/tags/${release_tag}^{commit}")
  manifest_sha=$(jq -r '.sourceSha' "$manifest_file")
  if [[ "$tag_sha" != "$manifest_sha" ]]; then
    echo "Release manifest source $manifest_sha does not match tag $tag_sha" >&2
    return 1
  fi
}

case "$ACTION" in
  draft)
    NOTES_FILE=${4:-/tmp/release-notes.md}
    MANIFEST_FILE=${5:-/tmp/release-manifest.json}
    TITLE_PREFIX="Stable release"
    PRERELEASE=false
    if [[ "$CHANNEL" == "beta" ]]; then
      TITLE_PREFIX="Beta release"
      PRERELEASE=true
    fi

    if gh release view "$TAG" --json isDraft,isPrerelease,tagName > /tmp/github-release.json 2>/dev/null; then
      IS_DRAFT=$(jq -r '.isDraft' /tmp/github-release.json)
      IS_PRERELEASE=$(jq -r '.isPrerelease' /tmp/github-release.json)
      if [[ "$IS_DRAFT" != "true" ]]; then
        echo "Release $TAG is already public; refusing to reuse it" >&2
        exit 1
      fi
      if [[ "$IS_PRERELEASE" != "$PRERELEASE" ]]; then
        echo "Release $TAG has the wrong prerelease state" >&2
        exit 1
      fi
      gh release edit "$TAG" \
        --title "$TITLE_PREFIX ${TAG##*/}" \
        --notes-file "$NOTES_FILE"
      gh release upload "$TAG" \
        "$MANIFEST_FILE#Release manifest" \
        --clobber
      echo "Updated draft release $TAG"
    else
      CREATE_ARGS=(
        "$TAG"
        --verify-tag
        --draft
        --title "$TITLE_PREFIX ${TAG##*/}"
        --notes-file "$NOTES_FILE"
      )
      if [[ "$CHANNEL" == "beta" ]]; then
        CREATE_ARGS+=(--prerelease)
      fi
      gh release create "${CREATE_ARGS[@]}" \
        "$MANIFEST_FILE#Release manifest"
      echo "Created draft release $TAG"
    fi
    ;;
  publish)
    DIST_TAG=${4:-}
    if [[ -z "$DIST_TAG" ]]; then
      echo "publish requires the npm dist-tag" >&2
      exit 2
    fi
    if [[ "$CHANNEL" == "beta" ]]; then
      gh release edit "$TAG" --draft=false --prerelease --latest=false
    elif [[ "$DIST_TAG" == "latest" ]]; then
      gh release edit "$TAG" --draft=false --prerelease=false --latest
    else
      gh release edit "$TAG" --draft=false --prerelease=false --latest=false
    fi
    echo "Published GitHub Release $TAG"
    ;;
  restore)
    MANIFEST_FILE=${4:-/tmp/release-manifest.json}
    restore_release "$TAG" "$CHANNEL" "$MANIFEST_FILE"
    ;;
  find-run)
    RUN_ID=${4:-}
    if [[ -z "$RUN_ID" ]]; then
      echo "find-run requires a workflow run ID" >&2
      exit 2
    fi
    PREFIX=release/
    if [[ "$CHANNEL" == "beta" ]]; then
      PREFIX=release-beta/
    fi
    git fetch --tags --force
    MATCHES=()
    while IFS= read -r CANDIDATE; do
      [[ -n "$CANDIDATE" ]] || continue
      CONTENT=$(git for-each-ref --format='%(contents)' "refs/tags/$CANDIDATE")
      if jq -e --arg run_id "$RUN_ID" '.originRunId == $run_id' <<< "$CONTENT" >/dev/null 2>&1; then
        MATCHES+=("$CANDIDATE")
      fi
    done < <(git tag -l "${PREFIX}*")
    mapfile -t RELEASE_MATCHES < <(
      gh api --paginate "repos/${GITHUB_REPOSITORY}/releases?per_page=100" \
        --jq ".[] | select((.body // \"\") | contains(\"<!-- nocobase-release-run-id:${RUN_ID} -->\")) | .tag_name" \
        | awk -v prefix="$PREFIX" 'index($0, prefix) == 1'
    )
    for CANDIDATE in "${RELEASE_MATCHES[@]}"; do
      [[ " ${MATCHES[*]} " == *" $CANDIDATE "* ]] || MATCHES+=("$CANDIDATE")
    done
    if [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple releases belong to workflow run $RUN_ID: ${MATCHES[*]}" >&2
      exit 1
    fi
    if [[ ${#MATCHES[@]} -eq 1 ]]; then
      printf '%s\n' "${MATCHES[0]}"
    fi
    ;;
  find-draft)
    PREFIX=release/
    if [[ "$CHANNEL" == "beta" ]]; then
      PREFIX=release-beta/
    fi
    git fetch --tags --force
    MATCHES=()
    while IFS= read -r CANDIDATE; do
      [[ -n "$CANDIDATE" ]] || continue
      CONTENT=$(git for-each-ref --format='%(contents)' "refs/tags/$CANDIDATE")
      if ! jq -e \
        --arg channel "$CHANNEL" \
        --arg tag "$CANDIDATE" \
        '.schemaVersion == 1 and .channel == $channel and .tag == $tag' \
        <<< "$CONTENT" >/dev/null 2>&1; then
        continue
      fi
      if RELEASE_JSON=$(gh release view "$CANDIDATE" --json isDraft 2>/dev/null); then
        [[ $(jq -r '.isDraft' <<< "$RELEASE_JSON") == "true" ]] || continue
      fi
      MATCHES+=("$CANDIDATE")
    done < <(git tag -l "${PREFIX}*")
    if [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple pending $CHANNEL Draft Releases exist: ${MATCHES[*]}" >&2
      echo "Rerun with the release_tag input set explicitly" >&2
      exit 1
    fi
    if [[ ${#MATCHES[@]} -eq 1 ]]; then
      printf '%s\n' "${MATCHES[0]}"
    fi
    ;;
  find-unmerged)
    TARGET_BRANCH=${4:-}
    if [[ -z "$TARGET_BRANCH" ]]; then
      echo "find-unmerged requires a target branch" >&2
      exit 2
    fi
    PREFIX=release/
    if [[ "$CHANNEL" == "beta" ]]; then
      PREFIX=release-beta/
    fi
    git fetch origin "$TARGET_BRANCH" --tags --force
    MATCHES=()
    while IFS= read -r CANDIDATE; do
      [[ -n "$CANDIDATE" ]] || continue
      CONTENT=$(git for-each-ref --format='%(contents)' "refs/tags/$CANDIDATE")
      if ! jq -e \
        --arg channel "$CHANNEL" \
        --arg tag "$CANDIDATE" \
        --arg branch "$TARGET_BRANCH" \
        '.schemaVersion == 1 and .channel == $channel and .tag == $tag and .targetBranch == $branch' \
        <<< "$CONTENT" >/dev/null 2>&1; then
        continue
      fi
      if ! RELEASE_JSON=$(gh release view "$CANDIDATE" --json isDraft 2>/dev/null) || \
        [[ $(jq -r '.isDraft' <<< "$RELEASE_JSON") == "true" ]]; then
        continue
      fi
      SOURCE_SHA=$(jq -r '.sourceSha' <<< "$CONTENT")
      if ! git merge-base --is-ancestor "$SOURCE_SHA" "origin/$TARGET_BRANCH"; then
        MATCHES+=("$CANDIDATE")
      fi
    done < <(git tag -l "${PREFIX}*")
    if [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple published $CHANNEL releases are not merged into $TARGET_BRANCH: ${MATCHES[*]}" >&2
      echo "Rerun with the release_tag input set explicitly" >&2
      exit 1
    fi
    if [[ ${#MATCHES[@]} -eq 1 ]]; then
      printf '%s\n' "${MATCHES[0]}"
    fi
    ;;
  *)
    echo "Unsupported GitHub Release action: $ACTION" >&2
    exit 2
    ;;
esac
