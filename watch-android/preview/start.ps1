$ErrorActionPreference='Stop'
$python=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if(!(Test-Path $python)){throw 'Pythonを用意してから preview/server.py を実行してください。'}
$server=Join-Path $PSScriptRoot 'server.py'
$alive=$false
try{$alive=(Invoke-WebRequest 'http://127.0.0.1:8766/' -TimeoutSec 2).StatusCode -eq 200}catch{}
if(!$alive){Start-Process -FilePath $python -ArgumentList @('"'+$server+'"') -WindowStyle Hidden;Start-Sleep -Milliseconds 700}
Start-Process 'http://127.0.0.1:8766/'
