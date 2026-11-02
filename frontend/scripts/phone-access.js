console.log(`Phone access from WSL2

1. Keep this server running. In an Administrator PowerShell on Windows, run:

   $wslIp = ((wsl.exe hostname -I).Trim() -split '\\s+')[0]
   netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=4300
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=4300 connectaddress=$wslIp connectport=4300
   New-NetFirewallRule -DisplayName "Canto Phone UI (4300)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4300 -Profile Private

   If the delete command says no matching rule was found, continue.
   If the firewall rule already exists, you can skip that command.

2. In Windows, run ipconfig and find the IPv4 address for your Wi-Fi adapter.
3. On your phone, connected to the same Wi-Fi, open:
   http://<Windows-Wi-Fi-IPv4-address>:4300

The Angular Network URL below is a WSL address and may not be reachable from your phone.
`);
