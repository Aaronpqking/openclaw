#!/usr/bin/env bash
set -euo pipefail

tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
