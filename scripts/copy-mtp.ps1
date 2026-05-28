param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$DestinationPath
)

$ErrorActionPreference = "Stop"

function Get-MtpFolderByPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $shell = New-Object -ComObject Shell.Application
  $root = $shell.Namespace(17) # This PC
  if (-not $root) {
    throw "Unable to open This PC namespace."
  }

  $segments = $Path -split "[\\/]" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
  $currentFolder = $root
  $currentItem = $null

  foreach ($segment in $segments) {
    $found = $null
    foreach ($item in $currentFolder.Items()) {
      if ($item.Name -eq $segment) {
        $found = $item
        break
      }
    }
    if (-not $found) {
      throw "MTP segment not found: $segment (path: $Path)"
    }

    $currentItem = $found
    $nextFolder = $found.GetFolder
    if (-not $nextFolder) {
      throw "MTP segment is not a folder: $segment"
    }
    $currentFolder = $nextFolder
  }

  return $currentFolder
}

if (-not (Test-Path -LiteralPath $DestinationPath)) {
  New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
}

$resolvedDestination = (Resolve-Path -LiteralPath $DestinationPath).Path
$shell = New-Object -ComObject Shell.Application
$destFolder = $shell.Namespace($resolvedDestination)
if (-not $destFolder) {
  throw "Unable to open destination folder: $resolvedDestination"
}

$sourceFolder = Get-MtpFolderByPath -Path $SourcePath
$items = @($sourceFolder.Items())
if ($items.Count -eq 0) {
  Write-Host "No items found under MTP path: $SourcePath"
  exit 0
}

foreach ($item in $items) {
  Write-Host "Copying: $($item.Name)"
  # 16 = No UI
  $destFolder.CopyHere($item, 16)
}

# CopyHere is asynchronous for MTP; wait briefly before returning.
Start-Sleep -Seconds 5
Write-Host "MTP copy request submitted for $($items.Count) item(s)."
