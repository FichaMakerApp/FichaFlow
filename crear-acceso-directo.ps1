# FichaFlow — crea un acceso directo en el escritorio que abre la app en su
# propia ventana (sin pestañas, sin barra de direcciones — se ve y se siente
# como un programa aparte, no como una pestaña de navegador), con el ícono
# de la app, sin pasar por el programa asociado a .html por defecto en
# Windows (que en algunas computadoras es Adobe Reader).
# Se puede correr las veces que haga falta — vuelve a crear el mismo acceso.

$root = $PSScriptRoot
$indexPath = Join-Path $root "index.html"
$iconPath = Join-Path $root "assets\app-icon.ico"

if (-not (Test-Path $indexPath)) {
  Write-Host "No se encontro index.html junto a este script. Asegurate de correrlo desde la carpeta de FichaFlow."
  exit
}

# Chrome y Edge soportan "--app=" (ventana sin barra de direcciones ni
# pestañas). Firefox no tiene un equivalente confiable, así que si es el
# único instalado se abre como pestaña normal.
$chromiumPaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$firefoxPaths = @(
  "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
  "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
)
$browser = $chromiumPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
$isChromium = $true
$isEdge = $false
if (-not $browser) {
  $browser = $firefoxPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
  $isChromium = $false
} else {
  $isEdge = $browser -like "*msedge.exe"
}

if (-not $browser) {
  Write-Host "No se encontro Chrome, Edge ni Firefox instalado en esta computadora."
  Write-Host "Abri index.html manualmente: clic derecho sobre el archivo > Abrir con > tu navegador."
  exit
}

# If the browser has more than one profile (personal + work Google/Microsoft
# accounts, etc.), a plain launch with no profile pinned can land on
# whichever one Chrome/Edge feels like using that time — sometimes an
# empty "Default" profile instead of the one actually used day to day.
# Each profile has its own separate localStorage, so a save made under one
# profile is invisible from another: exactly what "guardé y al reabrir no
# hay nada" looks like. Pinning --profile-directory to the real, currently
# active profile makes every launch land on the same storage every time.
$profileDir = $null
if ($isChromium) {
  $localStatePath = if ($isEdge) {
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Local State"
  } else {
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Local State"
  }
  if (Test-Path $localStatePath) {
    try {
      $localState = Get-Content $localStatePath -Raw | ConvertFrom-Json
      $profileDir = $localState.profile.last_used
    } catch {
      $profileDir = $null
    }
  }
}

$fileUrl = "file:///" + ($indexPath -replace '\\', '/')

$WshShell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "FichaFlow.lnk"
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browser
if ($isChromium) {
  $profileArg = if ($profileDir) { ' --profile-directory="' + $profileDir + '"' } else { "" }
  $shortcut.Arguments = '--app="' + $fileUrl + '" --window-size=1400,900' + $profileArg
} else {
  $shortcut.Arguments = '"' + $indexPath + '"'
}
if (Test-Path $iconPath) { $shortcut.IconLocation = $iconPath }
$shortcut.WorkingDirectory = $root
$shortcut.Description = "Abrir FichaFlow"
$shortcut.Save()

Write-Host "Listo. Se creo un acceso directo 'FichaFlow' en tu escritorio."
if ($isChromium) {
  $profileMsg = if ($profileDir) { " (perfil: $profileDir)" } else { " (no se detecto un perfil especifico, usara el que Chrome/Edge abra por defecto)" }
  Write-Host "Se abre en su propia ventana (sin pestañas ni barra de direcciones), con: $browser$profileMsg"
} else {
  Write-Host "Se abre como pestaña normal (Firefox no soporta ventana sin navegador), con: $browser"
}
