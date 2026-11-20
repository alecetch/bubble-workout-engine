#!/usr/bin/env bash
set -euo pipefail
started=$(date +%s)
export EXPO_PUBLIC_SMOKE_DIAGNOSTICS=true
cd mobile
# Release embeds JS and avoids all Expo development-launcher/Metro assumptions.
NODE_ENV=production npx expo prebuild --platform ios --no-install
(cd ios && pod _1.17.0_ install)
# This generated simulator project alone allows the local HTTP fixture API.
"${PLIST_BUDDY:-/usr/libexec/PlistBuddy}" -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" ios/200Days/Info.plist || \
  "${PLIST_BUDDY:-/usr/libexec/PlistBuddy}" -c "Set :NSAppTransportSecurity:NSAllowsArbitraryLoads true" ios/200Days/Info.plist
NODE_ENV=production xcodebuild -workspace ios/200Days.xcworkspace -scheme 200Days \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios-smoke-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO ARCHS=arm64 \
  2>&1 | tee ../artifacts/ios-smoke/build.log
test -f ios-smoke-build/Build/Products/Release-iphonesimulator/200Days.app/main.jsbundle
app=ios-smoke-build/Build/Products/Release-iphonesimulator/200Days.app
if ! entitlements=$(codesign -d --entitlements :- "$app" 2>&1); then
  echo "Simulator signing check failed: codesign could not read app entitlements." >&2
  exit 1
fi
printf '%s\n' "$entitlements" > ../artifacts/ios-smoke/entitlements.txt
if ! printf '%s\n' "$entitlements" | grep -Eq '<key>(keychain-access-groups|application-identifier)</key>'; then
  echo "Simulator signing check failed: the ad-hoc app has no Keychain/application entitlement. Saved-login smoke requires Keychain access." >&2
  exit 1
fi
echo "$(( $(date +%s) - started ))" > ../artifacts/ios-smoke/build-seconds
