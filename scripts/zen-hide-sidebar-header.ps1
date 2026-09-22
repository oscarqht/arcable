<#
==============================================================================
Arcable: Zen Browser Sidebar Header Removal Script (Windows PowerShell)
==============================================================================
Automates Method 2 for Zen Browser on Windows:
  1. Enables 'toolkit.legacyUserProfileCustomizations.stylesheets' in user.js
  2. Injects CSS rules into chrome/userChrome.css to hide the native extension
     sidebar header (#zen-sidebar-web-header and #sidebar-header).
==============================================================================
#>

$ErrorActionPreference = 'Stop'

# Banner
Write-Host ""
Write-Host "🌌 Arcable — Zen Browser Sidebar Setup" -ForegroundColor Cyan
Write-Host "Hiding native extension sidebar header for a seamless workspace..."
Write-Host ""

# 1. Detect candidate Zen Browser root directories
$candidateZenDirs = @()

if ($env:APPDATA) {
    $candidateZenDirs += (Join-Path $env:APPDATA "zen")
}

if ($env:USERPROFILE) {
    $candidateZenDirs += (Join-Path $env:USERPROFILE "AppData\Roaming\zen")
}

if ($env:LOCALAPPDATA) {
    $candidateZenDirs += (Join-Path $env:LOCALAPPDATA "zen")
}

# 2. Filter existing Zen directories
$existingZenDirs = @()
foreach ($zdir in $candidateZenDirs) {
    if ((Test-Path -LiteralPath $zdir -PathType Container) -and ($existingZenDirs -notcontains $zdir)) {
        $existingZenDirs += $zdir
    }
}

if ($existingZenDirs.Count -eq 0) {
    Write-Host "❌ Could not find Zen Browser data directory." -ForegroundColor Red
    Write-Host "Expected locations:"
    Write-Host "  • Windows: %APPDATA%\zen"
    Write-Host ""
    Write-Host "Please make sure Zen Browser is installed and has been launched at least once."
    Write-Host ""
    return
}

# 3. Discover all profile directories across detected Zen directories
$profileDirs = @()

foreach ($zdir in $existingZenDirs) {
    # Check profiles.ini
    $profilesIni = Join-Path $zdir "profiles.ini"
    if (Test-Path -LiteralPath $profilesIni -PathType Leaf) {
        $lines = Get-Content -LiteralPath $profilesIni
        foreach ($line in $lines) {
            $trimmed = $line.Trim()
            if ($trimmed -match '^Path=(.+)$') {
                $relPath = $matches[1].Trim()
                # Normalize slashes to Windows backslashes
                $relPath = $relPath -replace '/', '\'
                if ([System.IO.Path]::IsPathRooted($relPath)) {
                    $candidateProfile = $relPath
                } else {
                    $candidateProfile = Join-Path $zdir $relPath
                }
                if (Test-Path -LiteralPath $candidateProfile -PathType Container) {
                    $profileDirs += (Get-Item -LiteralPath $candidateProfile).FullName
                }
            }
        }
    }

    # Also scan Profiles subdirectory directly
    $profilesSubdir = Join-Path $zdir "Profiles"
    if (Test-Path -LiteralPath $profilesSubdir -PathType Container) {
        $subDirs = Get-ChildItem -LiteralPath $profilesSubdir -Directory -ErrorAction SilentlyContinue
        foreach ($sd in $subDirs) {
            $profileDirs += $sd.FullName
        }
    }
}

# Deduplicate profiles
$uniqueProfiles = @()
foreach ($p in $profileDirs) {
    if ($uniqueProfiles -notcontains $p) {
        $uniqueProfiles += $p
    }
}

if ($uniqueProfiles.Count -eq 0) {
    Write-Host "❌ Found Zen Browser directories but no profile folders were found." -ForegroundColor Red
    return
}

Write-Host "Found $($uniqueProfiles.Count) Zen profile(s):" -ForegroundColor Cyan
foreach ($p in $uniqueProfiles) {
    $pname = Split-Path -Leaf $p
    Write-Host "  • $pname"
}
Write-Host ""

$cssSnippet = @"
/* === Arcable: Hide Zen Extension Sidebar Header === */
#zen-sidebar-web-header,
#sidebar-header {
  display: none !important;
}
/* ================================================= */
"@

# UTF-8 without BOM helper
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$profilesModified = 0

foreach ($p in $uniqueProfiles) {
    $pname = Split-Path -Leaf $p
    Write-Host "Configuring profile: " -NoNewline
    Write-Host $pname -ForegroundColor Yellow

    # Step A: Enable legacy stylesheets in user.js
    $userJs = Join-Path $p "user.js"
    $prefLine = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'

    $hasPref = $false
    if (Test-Path -LiteralPath $userJs -PathType Leaf) {
        $userJsContent = [System.IO.File]::ReadAllText($userJs, [System.Text.Encoding]::UTF8)
        if ($userJsContent -like "*toolkit.legacyUserProfileCustomizations.stylesheets*") {
            $hasPref = $true
        }
    }

    if ($hasPref) {
        Write-Host "  ✓ toolkit.legacyUserProfileCustomizations.stylesheets already enabled in user.js" -ForegroundColor Green
    } else {
        if (Test-Path -LiteralPath $userJs -PathType Leaf) {
            $existing = [System.IO.File]::ReadAllText($userJs, [System.Text.Encoding]::UTF8)
            $toAppend = if ($existing.EndsWith("`n") -or [string]::IsNullOrEmpty($existing)) { $prefLine + "`r`n" } else { "`r`n" + $prefLine + "`r`n" }
            [System.IO.File]::AppendAllText($userJs, $toAppend, $utf8NoBom)
        } else {
            [System.IO.File]::WriteAllText($userJs, $prefLine + "`r`n", $utf8NoBom)
        }
        Write-Host "  ✓ Enabled toolkit.legacyUserProfileCustomizations.stylesheets in user.js" -ForegroundColor Green
    }

    # Step B: Ensure chrome/userChrome.css has the hide header rule
    $chromeDir = Join-Path $p "chrome"
    if (-not (Test-Path -LiteralPath $chromeDir -PathType Container)) {
        [System.IO.Directory]::CreateDirectory($chromeDir) | Out-Null
    }

    $userChromeCss = Join-Path $chromeDir "userChrome.css"

    if (Test-Path -LiteralPath $userChromeCss -PathType Leaf) {
        $cssContent = [System.IO.File]::ReadAllText($userChromeCss, [System.Text.Encoding]::UTF8)
        if ($cssContent -like "*zen-sidebar-web-header*" -or $cssContent -like "*Arcable: Hide Zen Extension Sidebar Header*") {
            Write-Host "  ✓ userChrome.css already contains rule hiding sidebar header" -ForegroundColor Green
        } else {
            $toAppend = if ($cssContent.EndsWith("`n") -or [string]::IsNullOrEmpty($cssContent)) { $cssSnippet + "`r`n" } else { "`r`n`r`n" + $cssSnippet + "`r`n" }
            [System.IO.File]::AppendAllText($userChromeCss, $toAppend, $utf8NoBom)
            Write-Host "  ✓ Appended hide sidebar header rule to userChrome.css" -ForegroundColor Green
        }
    } else {
        [System.IO.File]::WriteAllText($userChromeCss, $cssSnippet + "`r`n", $utf8NoBom)
        Write-Host "  ✓ Created userChrome.css with hide sidebar header rule" -ForegroundColor Green
    }

    $profilesModified++
}

Write-Host ""
Write-Host "✨ Success! Successfully configured $profilesModified Zen profile(s)." -ForegroundColor Green
Write-Host "👉 Please restart Zen Browser to apply the changes." -ForegroundColor Yellow
Write-Host ""
