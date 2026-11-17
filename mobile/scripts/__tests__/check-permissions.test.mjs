import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfig, checkApkPermissions } from '../check-permissions.mjs';

const fixture = () => ({
  android: {
    allowed: ['android.permission.INTERNET', 'android.permission.CAMERA'],
    blocked: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
    debugOnly: ['android.permission.SYSTEM_ALERT_WINDOW'],
    reasons: { 'android.permission.INTERNET': 'API access', 'android.permission.CAMERA': 'User-initiated progress photos' },
  },
  ios: { usageDescriptions: ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription'], forbidden: ['NSMicrophoneUsageDescription'] },
});
const config = () => ({ android: { blockedPermissions: fixture().android.blocked }, ios: { infoPlist: {
  NSCameraUsageDescription: '200 Days uses your camera for a progress photo.',
  NSPhotoLibraryUsageDescription: '200 Days uses the progress photo you choose.',
} } });
const apk = `package: fit.get200days.app
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.CAMERA'`;

test('clean introspected config passes', () => assert.deepEqual(checkConfig(config(), fixture()), []));
test('missing blocked audio permission fails', () => {
  const c = config(); c.android.blockedPermissions = c.android.blockedPermissions.filter(p => !p.endsWith('RECORD_AUDIO'));
  assert.match(checkConfig(c, fixture()).join('\n'), /RECORD_AUDIO/);
});
test('microphone usage description fails even when empty', () => {
  const c = config(); c.ios.infoPlist.NSMicrophoneUsageDescription = '';
  assert.match(checkConfig(c, fixture()).join('\n'), /NSMicrophoneUsageDescription/);
});
for (const value of ['', '   ', undefined, 'Allow $(PRODUCT_NAME) to access your camera', 'Allow camera access', 'Photos for $(PRODUCT_NAME)']) {
  test(`invalid camera purpose ${JSON.stringify(value)} fails`, () => {
    const c = config(); c.ios.infoPlist.NSCameraUsageDescription = value;
    assert.match(checkConfig(c, fixture()).join('\n'), /NSCameraUsageDescription/);
  });
}
test('APK matching the allowlist passes', () => assert.deepEqual(checkApkPermissions(apk, fixture()), []));
for (const permission of ['android.permission.READ_CONTACTS', 'android.permission.RECORD_AUDIO']) {
  test(`APK with ${permission} fails`, () => assert.match(checkApkPermissions(`${apk}\nuses-permission: name='${permission}'`, fixture()).join('\n'), new RegExp(permission)));
}
test('system overlay is allowed only in debug APKs', () => {
  const lines = `${apk}\nuses-permission: name='android.permission.SYSTEM_ALERT_WINDOW'`;
  assert.deepEqual(checkApkPermissions(lines, fixture(), { debug: true }), []);
  assert.match(checkApkPermissions(lines, fixture(), { debug: false }).join('\n'), /SYSTEM_ALERT_WINDOW/);
});
test('SDK-specific permission entries are also checked', () => {
  assert.match(checkApkPermissions(`${apk}\nuses-permission-sdk-23: name='android.permission.READ_CONTACTS'`, fixture()).join('\n'), /READ_CONTACTS/);
});
test('empty/unparseable APK output fails closed', () => assert.ok(checkApkPermissions('package: test', fixture()).length));
for (const mode of ['config', 'apk']) {
  const check = allowlist => mode === 'config' ? checkConfig(config(), allowlist) : checkApkPermissions(apk, allowlist);
  test(`${mode}: missing/blank allowed permission reason fails`, () => {
    const a = fixture(); delete a.android.reasons['android.permission.CAMERA']; assert.match(check(a).join('\n'), /CAMERA.*reason/);
    a.android.reasons['android.permission.CAMERA'] = ' '; assert.ok(check(a).length);
  });
  test(`${mode}: allowed and blocked overlap fails`, () => {
    const a = fixture(); a.android.blocked.push('android.permission.CAMERA'); assert.match(check(a).join('\n'), /CAMERA.*both/);
  });
}
