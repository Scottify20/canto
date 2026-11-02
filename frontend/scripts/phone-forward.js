// WSL2 only: runs scripts/phone-forward.ps1 in an elevated Windows PowerShell (UAC prompt appears on Windows).
const { spawnSync } = require('node:child_process');

if (process.platform !== 'linux' || !process.env.WSL_DISTRO_NAME) {
  console.log('Only needed on WSL2. On Windows, run scripts/phone-forward.ps1 in an Administrator PowerShell.');
  process.exit(0);
}

const wslPath = spawnSync('wslpath', ['-w', require('node:path').join(__dirname, 'phone-forward.ps1')], { encoding: 'utf8' });
const script = wslPath.stdout.trim();
const inner = `& '${script}'; Read-Host 'Press Enter to close'`;
const command =
  `Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',"${inner.replace(/"/g, '`"')}"`;

console.log('Approve the Windows administrator prompt (UAC) to set up phone port forwarding...');
const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'inherit' });
process.exit(r.status ?? 1);
