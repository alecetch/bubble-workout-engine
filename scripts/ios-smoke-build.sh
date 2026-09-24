#!/usr/bin/env bash
set -euo pipefail
started=$(date +%s)
cd mobile
# Release embeds JS and avoids all Expo development-launcher/Metro assumptions.
NODE_ENV=production npx expo prebuild --platform ios --no-install
(cd ios && pod _1.17.0_ install)
# This generated simulator project alone allows the local HTTP fixture API.
/usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" ios/Forma/Info.plist || \
  /usr/libexec/PlistBuddy -c "Set :NSAppTransportSecurity:NSAllowsArbitraryLoads true" ios/Forma/Info.plist
NODE_ENV=production xcodebuild -workspace ios/Forma.xcworkspace -scheme Forma \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios-smoke-build CODE_SIGNING_ALLOWED=NO ARCHS=arm64 \
  2>&1 | tee ../artifacts/ios-smoke/build.log
test -f ios-smoke-build/Build/Products/Release-iphonesimulator/Forma.app/main.jsbundle
echo "$(( $(date +%s) - started ))" > ../artifacts/ios-smoke/build-seconds
