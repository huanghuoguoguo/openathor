#!/bin/sh
set -eu

repo="${OPENATHOR_REPO:-huanghuoguoguo/openathor}"
version="${OPENATHOR_VERSION:-latest}"
install_root="${OPENATHOR_HOME:-$HOME/.openathor}"
install_dir="$install_root/current"
bin_dir="${OPENATHOR_BIN_DIR:-$HOME/.local/bin}"

die() {
  printf '%s\n' "openathor install: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

need_cmd curl
need_cmd tar
need_cmd node
need_cmd mktemp

node_major="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
if [ "$node_major" -lt 22 ]; then
  die "Node.js >= 22 is required; current node is $(node --version)"
fi

if [ -n "${OPENATHOR_TARBALL_URL:-}" ]; then
  tarball_url="$OPENATHOR_TARBALL_URL"
elif [ "$version" = "latest" ]; then
  tarball_url="https://github.com/$repo/releases/latest/download/openathor.tar.gz"
else
  tarball_url="https://github.com/$repo/releases/download/$version/openathor.tar.gz"
fi
checksum_url="${OPENATHOR_CHECKSUM_URL:-$tarball_url.sha256}"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

printf '%s\n' "Downloading OpenAthor from $tarball_url"
curl -fsSL "$tarball_url" -o "$tmp_dir/openathor.tar.gz"

if curl -fsSL "$checksum_url" -o "$tmp_dir/openathor.tar.gz.sha256"; then
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$tmp_dir" && sha256sum -c openathor.tar.gz.sha256 >/dev/null)
    printf '%s\n' "Verified SHA256 checksum"
  elif command -v shasum >/dev/null 2>&1; then
    expected_checksum="$(awk '{print $1}' "$tmp_dir/openathor.tar.gz.sha256")"
    actual_checksum="$(shasum -a 256 "$tmp_dir/openathor.tar.gz" | awk '{print $1}')"
    [ "$expected_checksum" = "$actual_checksum" ] || die "SHA256 checksum mismatch"
    printf '%s\n' "Verified SHA256 checksum"
  else
    printf '%s\n' "Checksum file downloaded, but sha256sum/shasum is unavailable; skipping verification"
  fi
else
  printf '%s\n' "Checksum file not found at $checksum_url; skipping verification"
fi

tar -xzf "$tmp_dir/openathor.tar.gz" -C "$tmp_dir"

[ -f "$tmp_dir/openathor/dist/cli.js" ] || die "release bundle is missing dist/cli.js"
[ -d "$tmp_dir/openathor/node_modules" ] || die "release bundle is missing production dependencies"

case "$install_dir" in
  ""|"/"|"/."|"/..") die "refusing unsafe install directory: $install_dir" ;;
esac

mkdir -p "$install_root" "$bin_dir"
rm -rf "$install_dir"
mv "$tmp_dir/openathor" "$install_dir"

chmod +x "$install_dir/dist/cli.js" \
  "$install_dir/dist/fixture-check.js" \
  "$install_dir/dist/judge-smoke.js"

ln -sf "$install_dir/dist/cli.js" "$bin_dir/openathor"
ln -sf "$install_dir/dist/fixture-check.js" "$bin_dir/openathor-fixture-check"
ln -sf "$install_dir/dist/judge-smoke.js" "$bin_dir/openathor-judge-smoke"

printf '%s\n' "Installed OpenAthor to $install_dir"
printf '%s\n' "Linked commands to $bin_dir"
"$bin_dir/openathor" --version

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *)
    printf '%s\n' ""
    printf '%s\n' "Add this to your shell profile if commands are not found:"
    printf '%s\n' "  export PATH=\"$bin_dir:\$PATH\""
    ;;
esac
