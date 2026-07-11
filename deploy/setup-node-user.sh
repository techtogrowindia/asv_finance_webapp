#!/usr/bin/env bash
# =============================================================================
# Install a self-contained Node toolchain for the `asv-finance` deploy user.
#
# The server's npm/pm2 belong to ROOT's nvm (/root/.nvm) and are not reachable
# by other users. This gives asv-finance its OWN nvm + Node v20.20.2 (matching
# the server) + pm2 — isolated from root and the other apps.
#
# Run AS the asv-finance user (after create-deploy-user.sh):
#   sudo -iu asv-finance bash /var/www/asv_finance_webapp/deploy/setup-node-user.sh
# =============================================================================
set -euo pipefail

NODE_VERSION="20.20.2"
export NVM_DIR="$HOME/.nvm"

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

echo "Installing Node v$NODE_VERSION..."
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use default

echo "Installing pm2..."
npm install -g pm2

echo
node --version
npm --version
pm2 --version
echo
echo "Node toolchain ready for user $USER."
echo
echo "To run pm2 on server boot (needs sudo — copy/run the command it prints):"
echo "  pm2 startup systemd -u $USER --hp $HOME"
echo
echo "Non-interactive SSH deploys must load nvm first, e.g.:"
echo "  ssh asvfinance 'export NVM_DIR=~/.nvm; . \$NVM_DIR/nvm.sh; node -v'"
