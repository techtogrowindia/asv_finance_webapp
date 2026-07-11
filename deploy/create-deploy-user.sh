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

# 3. Grant sudo (you asked to give sudo access).
usermod -aG sudo "$USERNAME"
echo "Added $USERNAME to the sudo group."

# 4. OPTIONAL — passwordless sudo so automated deploys don't need a password.
#    Leave commented if you prefer to type the password. Uncomment to enable:
# echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$USERNAME"
# chmod 440 "/etc/sudoers.d/90-$USERNAME"
# echo "Enabled passwordless sudo for $USERNAME."

# 5. Give the user a home for the app under /var/www (matches the house layout).
install -d -o "$USERNAME" -g "$USERNAME" "/var/www/asv_finance_webapp" || true

echo
echo "Done. Test from the developer machine:"
echo "  ssh -i ~/.ssh/asv_finance_deploy $USERNAME@85.208.51.93"
