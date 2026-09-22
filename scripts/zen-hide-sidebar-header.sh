#!/usr/bin/env bash
# ==============================================================================
# Arcable: Zen Browser Sidebar Header Removal Script
# ==============================================================================
# Automates Method 2 for Zen Browser:
#   1. Enables 'toolkit.legacyUserProfileCustomizations.stylesheets' in user.js
#   2. Injects CSS rules into chrome/userChrome.css to hide the native extension
#      sidebar header (#zen-sidebar-web-header and #sidebar-header).
# ==============================================================================

set -e

# Terminal colors
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "\n${BOLD}${BLUE}🌌 Arcable — Zen Browser Sidebar Setup${NC}"
echo -e "Hiding native extension sidebar header for a seamless workspace...\n"

# 1. Detect candidate Zen Browser root directories
CANDIDATE_ZEN_DIRS=()

# macOS
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$(uname -s)" == "Darwin" ]]; then
  CANDIDATE_ZEN_DIRS+=(
    "$HOME/Library/Application Support/zen"
  )
fi

# Linux & Flatpak
if [[ "$OSTYPE" == "linux"* ]] || [[ "$(uname -s)" == "Linux" ]]; then
  CANDIDATE_ZEN_DIRS+=(
    "$HOME/.zen"
    "$HOME/.var/app/app.zen_browser.zen/.zen"
    "${XDG_CONFIG_HOME:-$HOME/.config}/zen"
  )
fi

# Windows (Git Bash / MSYS / MINGW / Cygwin)
if [[ -n "$APPDATA" ]]; then
  CANDIDATE_ZEN_DIRS+=(
    "$APPDATA/zen"
  )
fi

# WSL (Windows Subsystem for Linux) check for Windows profiles
if [[ -d "/mnt/c/Users" ]]; then
  for user_dir in /mnt/c/Users/*; do
    if [[ -d "$user_dir/AppData/Roaming/zen" ]]; then
      CANDIDATE_ZEN_DIRS+=("$user_dir/AppData/Roaming/zen")
    fi
  done
fi

# 2. Filter existing Zen directories
EXISTING_ZEN_DIRS=()
for zdir in "${CANDIDATE_ZEN_DIRS[@]}"; do
  if [[ -d "$zdir" ]]; then
    EXISTING_ZEN_DIRS+=("$zdir")
  fi
done

if [[ ${#EXISTING_ZEN_DIRS[@]} -eq 0 ]]; then
  echo -e "${RED}❌ Could not find Zen Browser data directory.${NC}"
  echo "Expected locations:"
  echo "  • macOS:   ~/Library/Application Support/zen"
  echo "  • Linux:   ~/.zen or ~/.var/app/app.zen_browser.zen/.zen"
  echo "  • Windows: %APPDATA%\\zen"
  echo -e "\nPlease make sure Zen Browser is installed and has been launched at least once.\n"
  exit 1
fi

# 3. Discover all profile directories across detected Zen directories
PROFILE_DIRS=()

for zdir in "${EXISTING_ZEN_DIRS[@]}"; do
  # Check profiles.ini
  if [[ -f "$zdir/profiles.ini" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Match Path=...
      if [[ "$line" =~ ^[[:space:]]*Path=(.*)$ ]]; then
        rel_path="${BASH_REMATCH[1]}"
        # Trim carriage returns if on Windows / CRLF
        rel_path="${rel_path%$'\r'}"
        if [[ "$rel_path" = /* ]] || [[ "$rel_path" =~ ^[A-Za-z]: ]]; then
          candidate_profile="$rel_path"
        else
          candidate_profile="$zdir/$rel_path"
        fi
        if [[ -d "$candidate_profile" ]]; then
          PROFILE_DIRS+=("$candidate_profile")
        fi
      fi
    done < "$zdir/profiles.ini"
  fi

  # Also scan Profiles subdirectory directly
  if [[ -d "$zdir/Profiles" ]]; then
    for p in "$zdir/Profiles"/*; do
      if [[ -d "$p" ]]; then
        PROFILE_DIRS+=("$p")
      fi
    done
  fi
done

# Deduplicate profiles
UNIQUE_PROFILES=()
for p in "${PROFILE_DIRS[@]}"; do
  already_added=false
  for up in "${UNIQUE_PROFILES[@]}"; do
    if [[ "$up" == "$p" ]]; then
      already_added=true
      break
    fi
  done
  if [[ "$already_added" == false ]]; then
    UNIQUE_PROFILES+=("$p")
  fi
done

if [[ ${#UNIQUE_PROFILES[@]} -eq 0 ]]; then
  echo -e "${RED}❌ Found Zen Browser directories but no profile folders were found.${NC}"
  exit 1
fi

echo -e "${CYAN}Found ${#UNIQUE_PROFILES[@]} Zen profile(s):${NC}"
for p in "${UNIQUE_PROFILES[@]}"; do
  echo "  • $(basename "$p")"
done
echo ""

CSS_SNIPPET="/* === Arcable: Hide Zen Extension Sidebar Header === */
#zen-sidebar-web-header,
#sidebar-header {
  display: none !important;
}
/* ================================================= */"

PROFILES_MODIFIED=0

for p in "${UNIQUE_PROFILES[@]}"; do
  pname="$(basename "$p")"
  echo -e "${BOLD}Configuring profile:${NC} ${YELLOW}$pname${NC}"

  # Step A: Enable legacy stylesheets in user.js
  USER_JS="$p/user.js"
  touch "$USER_JS"
  if grep -q 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);' "$USER_JS" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} toolkit.legacyUserProfileCustomizations.stylesheets already enabled in user.js"
  else
    echo 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);' >> "$USER_JS"
    echo -e "  ${GREEN}✓${NC} Enabled toolkit.legacyUserProfileCustomizations.stylesheets in user.js"
  fi

  # Step B: Ensure chrome/userChrome.css has the hide header rule
  CHROME_DIR="$p/chrome"
  mkdir -p "$CHROME_DIR"
  USER_CHROME_CSS="$CHROME_DIR/userChrome.css"

  if [[ -f "$USER_CHROME_CSS" ]]; then
    if grep -q "zen-sidebar-web-header" "$USER_CHROME_CSS" 2>/dev/null || grep -q "Arcable: Hide Zen Extension Sidebar Header" "$USER_CHROME_CSS" 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} userChrome.css already contains rule hiding sidebar header"
    else
      echo -e "\n$CSS_SNIPPET" >> "$USER_CHROME_CSS"
      echo -e "  ${GREEN}✓${NC} Appended hide sidebar header rule to userChrome.css"
    fi
  else
    printf "%s\n" "$CSS_SNIPPET" > "$USER_CHROME_CSS"
    echo -e "  ${GREEN}✓${NC} Created userChrome.css with hide sidebar header rule"
  fi

  PROFILES_MODIFIED=$((PROFILES_MODIFIED + 1))
done

echo -e "\n${BOLD}${GREEN}✨ Success! Successfully configured $PROFILES_MODIFIED Zen profile(s).${NC}"
echo -e "${BOLD}${YELLOW}👉 Please restart Zen Browser${NC} to apply the changes.\n"
