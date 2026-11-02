# Run in an Administrator PowerShell (npm run phone:forward does this for you from WSL).
# Forwards Windows LAN ports 4300 (phone UI) and 8010 (API) to the WSL2 VM.
$ErrorActionPreference = 'Stop'

$wslIp = ((wsl.exe hostname -I) -join ' ').Trim() -split '\s+' |
  Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1
if (-not $wslIp) { throw 'Could not determine the WSL IP. Is WSL running?' }

foreach ($port in 4300, 8010) {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port | Out-Null
  netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port
  if (-not (Get-NetFirewallRule -DisplayName "Canto port $port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Canto port $port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private | Out-Null
  }
}

# The Hyper-V firewall can block inbound traffic to the WSL VM even when Windows Firewall allows it.
try {
  Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
} catch {
  Write-Host "Hyper-V firewall setting skipped: $($_.Exception.Message)"
}

Write-Host "`nForwarding to WSL ${wslIp}:"
netsh interface portproxy show v4tov4
$lan = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty IPAddress
if ($lan) { Write-Host "Phone URLs: UI http://${lan}:4300  API http://${lan}:8010" }
Write-Host 'Re-run after restarting WSL (its IP changes).'
