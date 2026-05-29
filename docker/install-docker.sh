#!/usr/bin/env bash
set -euo pipefail

echo "=== Step 1: Prerequisites ==="
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg

echo "=== Step 2: Docker GPG key ==="
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "=== Step 3: Docker repo ==="
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "=== Step 4: Install Docker ==="
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Step 5: Add user to docker group ==="
sudo usermod -aG docker declan

echo ""
echo "=== Done! ==="
docker --version
docker compose version
echo ""
echo "IMPORTANT: log out and log back in for docker group to take effect."
