#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  One-Time Setup — Google Apps Script CLI (clasp)
#
#  This script automates the setup so you never need to
#  copy-paste code into the Apps Script editor again.
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAS_DIR="$SCRIPT_DIR/google-apps-script"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║    🚀  Biweekly Report — clasp Setup                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Check/Install clasp ──
if ! command -v clasp &> /dev/null && ! npx -y @google/clasp --version &> /dev/null; then
  echo "📦  Installing @google/clasp globally..."
  npm install -g @google/clasp
fi
echo "✅  clasp is available"

# ── Step 2: Login ──
echo ""
echo "🔐  Opening browser for Google login..."
echo "    (Sign in with your blueprint.org account)"
echo ""
npx -y @google/clasp login

# ── Step 3: Enable Apps Script API ──
echo ""
echo "⚠️   IMPORTANT: You must enable the Apps Script API."
echo "    Opening: https://script.google.com/home/usersettings"
echo ""
echo "    → Toggle 'Google Apps Script API' to ON"
echo "    → Then come back here and press Enter."
echo ""
open "https://script.google.com/home/usersettings" 2>/dev/null || echo "    Open the URL above in your browser."
read -p "    Press Enter when the API is enabled... "

# ── Step 4: Create or Clone project ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Do you have an existing Apps Script project?"
echo ""
echo "    1) YES — I already have a script project (I'll paste the Script ID)"
echo "    2) NO  — Create a new project for me"
echo ""
read -p "  Enter 1 or 2: " CHOICE

if [ "$CHOICE" = "1" ]; then
  echo ""
  echo "  To find your Script ID:"
  echo "    → Open your Apps Script project"
  echo "    → Go to Project Settings (gear icon)"
  echo "    → Copy the 'Script ID'"
  echo ""
  read -p "  Paste your Script ID: " SCRIPT_ID
  
  # Create .clasp.json pointing to the google-apps-script directory
  cat > "$GAS_DIR/.clasp.json" << EOF
{
  "scriptId": "$SCRIPT_ID",
  "rootDir": "."
}
EOF
  echo ""
  echo "✅  Linked to existing project: $SCRIPT_ID"
  
else
  echo ""
  echo "📝  Creating new Apps Script webapp project..."
  cd "$GAS_DIR"
  npx -y @google/clasp create --type webapp --title "Biweekly Comment Generator" --rootDir .
  echo ""
  echo "✅  New project created!"
fi

# ── Step 5: Push the code ──
echo ""
echo "📤  Pushing Code.gs and Index.html to Apps Script..."
cd "$GAS_DIR"
npx -y @google/clasp push

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✅  SETUP COMPLETE!"
echo ""
echo "  Your code is now live in Google Apps Script."
echo "  Open the project with:  npm run open"
echo ""
echo "  From now on, whenever you edit Code.gs or Index.html:"
echo "    npm run push     — Upload code to Apps Script"
echo "    npm run deploy   — Push + create a new deployment"
echo "    npm run open     — Open the project in browser"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
