#!/usr/bin/env bash
# =============================================================================
# Create the `asv-finance` deploy user on the VPS and install the deploy SSH key.
# Run as root (or with sudo) on the server:  85.208.51.93
#
#   sudo bash create-deploy-user.sh
#
# This creates the user, sets up SSH key access, and (optionally) grants sudo.
# The PRIVATE key is NOT here and never leaves the developer's machine — only the
# PUBLIC key below is installed.
# =============================================================================
set -euo pipefail

USERNAME="asv-finance"

# Public half of the deploy keypair (private key held locally by the developer).
PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICAufe1yjpk8Del+zgi65eXaG3nC890lNKbKp1l2fD6w asv-finance-deploy@asvsmallfinance.com"

# 1. Create the user with a home dir and bash shell (no-op if it already exists).
if id "$USERNAME" &>/dev/null; then
  echo "User $USERNAME already exists — continuing."
else
  adduser --disabled-password --gecos "ASV Finance Deploy" "$USERNAME"
  echo "Created user $USERNAME."
fi

# 2. Install the SSH public key.
HOME_DIR="/home/$USERNAME"
install -d -m 700 -o "$USERNAME" -g "$USERNAME" "$HOME_DIR/.ssh"
touch "$HOME_DIR/.ssh/authorized_keys"
# Add the key only if not already present.
grep -qF "$PUBKEY" "$HOME_DIR/.ssh/authorized_keys" || echo "$PUBKEY" >> "$HOME_DIR/.ssh/authorized_keys"
chmod 600 "$HOME_DIR/.ssh/authorized_keys"
chown -R "$USERNAME:$USERNAME" "$HOME_DIR/.ssh"
echo "Installed deploy public key."

# 3. Grant sudo. This account is LOGIN-ONLY: all real work (git, npm, pm2, psql,
#    nginx) is run via `sudo` as root, using root's existing nvm/node/pm2 — the
#    same way the server's other apps run. So we enable PASSWORDLESS sudo, which
#    lets automated deploys run without an interactive password prompt.
usermod -aG sudo "$USERNAME"
SUDOERS="/etc/sudoers.d/90-$USERNAME"
echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > "$SUDOERS"
chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS"   # validate; aborts (set -e) if malformed
echo "Granted passwordless sudo to $USERNAME."

# 4. App directory under /var/www (root-owned; git/build run as root via sudo).
install -d -o root -g root "/var/www/asv_finance_webapp" || true

echo
echo "Done. Test from the developer machine:"
echo "  ssh -i ~/.ssh/asv_finance_deploy $USERNAME@85.208.51.93 'sudo whoami'   # -> root"
