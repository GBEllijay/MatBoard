import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudObjectKey, CUSTOM_SKIN_CLOUD_CAP } from './advantageCloudMedia.ts';
import {
  CUSTOM_SKIN_CAP,
  CUSTOM_SKIN_DELETE_FIRST,
  CUSTOM_SKIN_MAX_EDGE,
  chooseCustomSkinHome,
  cleanCustomSkinName,
  customSkinMime,
  customSkinNameFromFile,
  customSkinRecordId,
  customSkinValue,
  customSkinsAtCap,
  isCustomSkinId,
} from './customSkin.ts';

test('a custom skin is one id, capped at 10, and only jpg png or webp', () => {
  assert.equal(CUSTOM_SKIN_CAP, 10);
  assert.equal(CUSTOM_SKIN_CLOUD_CAP, CUSTOM_SKIN_CAP);
  assert.equal(CUSTOM_SKIN_MAX_EDGE, 1920);
  assert.equal(customSkinsAtCap(9), false);
  assert.equal(customSkinsAtCap(10), true);
  assert.equal(customSkinMime({ type: 'image/jpeg', name: 'a.jpg' }), 'image/jpeg');
  assert.equal(customSkinMime({ type: 'image/png', name: 'a.png' }), 'image/png');
  assert.equal(customSkinMime({ type: '', name: 'mat.webp' }), 'image/webp');
  assert.equal(customSkinMime({ type: 'image/gif', name: 'mat.gif' }), null);
  assert.equal(customSkinMime({ type: 'image/jpeg', name: 'a.jpg' }) !== null, true);
  const id = customSkinValue('skinabc12345');
  assert.equal(id, 'custom:skinabc12345');
  assert.equal(isCustomSkinId(id), true);
  assert.equal(customSkinRecordId(id), 'skinabc12345');
  assert.equal(isCustomSkinId('classic'), false);
  assert.equal(customSkinValue('nope'), null);
  assert.equal(customSkinNameFromFile('night_mat.JPG'), 'night mat');
  assert.equal(cleanCustomSkinName('   '), 'My skin');
  assert.equal(CUSTOM_SKIN_DELETE_FIRST, 'Delete one first');
});

test('Advantage Cloud is the home only when Plus Cloud is bound; a preview stays off Cloud', () => {
  assert.equal(
    chooseCustomSkinHome({ plusCloud: true, cloudBound: true, driveConnected: true, oneDriveConnected: true }),
    'advantage-cloud',
  );
  assert.equal(
    chooseCustomSkinHome({ plusCloud: true, cloudBound: false, driveConnected: false, oneDriveConnected: false }),
    'device',
  );
  assert.equal(
    chooseCustomSkinHome({ plusCloud: true, cloudBound: false, driveConnected: true, oneDriveConnected: false }),
    'google-drive',
  );
  assert.equal(
    chooseCustomSkinHome({ plusCloud: false, cloudBound: false, driveConnected: false, oneDriveConnected: true }),
    'onedrive',
  );
  assert.equal(
    chooseCustomSkinHome({ plusCloud: false, cloudBound: true, driveConnected: false, oneDriveConnected: false }),
    'device',
  );
  assert.equal(cloudObjectKey('lic-owner', 'skins/skinabc12345'), 'groups/lic-owner/skins/skinabc12345');
  assert.equal(cloudObjectKey('lic-owner', 'skins/skinabc12345.json'), 'groups/lic-owner/skins/skinabc12345.json');
  assert.equal(cloudObjectKey('lic-owner', 'skins/../secret'), null);
  assert.equal(cloudObjectKey('lic-owner', 'skins/Nope'), null);
});
