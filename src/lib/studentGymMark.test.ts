import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_GYM_LOGO_MAX_CHARS } from './coachGymFit.ts';
import { StorageQuotaError } from './storageQuota.ts';
import {
  STUDENT_LOGO_MAX_EDGE,
  acceptGymLogoUpdate,
  chooseStudentLogo,
  GYM_LOGO_PROMPT,
  gymLogoPromptDue,
  ignoreGymLogoUpdate,
  readStudentGymLogo,
  receiveGymLogo,
  saveStudentGymLogoFile,
  studentLogoChoice,
  writeStudentGymLogo,
} from './studentGymMark.ts';
import { TEST_LOGO, TEST_LOGO_2, testMemory } from './testPackets.ts';

const OWN = 'data:image/png;base64,T1dOT1dOT1dO';

test('a connected student with no override starts on the gym logo, no prompt', () => {
  const storage = testMemory();
  assert.equal(receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage), 'started');
  assert.equal(readStudentGymLogo(storage), TEST_LOGO);
  assert.equal(gymLogoPromptDue(storage), false);
  assert.equal(GYM_LOGO_PROMPT, 'Your gym updated its logo. Update?');
});

test('a newer gym logo shows the prompt; an older one is ignored (latest wins)', () => {
  const storage = testMemory();
  receiveGymLogo({ logoVersion: 5, dataUrl: TEST_LOGO }, storage);
  assert.equal(receiveGymLogo({ logoVersion: 4, dataUrl: TEST_LOGO_2 }, storage), 'ignored');
  assert.equal(receiveGymLogo({ logoVersion: 6, dataUrl: TEST_LOGO_2 }, storage), 'prompt');
  assert.equal(gymLogoPromptDue(storage), true);
  // The logo is not swapped until the student says Update.
  assert.equal(readStudentGymLogo(storage), TEST_LOGO);
});

test('ignore keeps the current logo and does not nag until a newer version', () => {
  const storage = testMemory();
  receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage);
  receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage);
  ignoreGymLogoUpdate(storage);
  assert.equal(gymLogoPromptDue(storage), false);
  assert.equal(readStudentGymLogo(storage), TEST_LOGO);
  assert.equal(receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage), 'ignored');
  assert.equal(gymLogoPromptDue(storage), false);
  receiveGymLogo({ logoVersion: 3, dataUrl: TEST_LOGO_2 }, storage);
  assert.equal(gymLogoPromptDue(storage), true);
});

test('accept shows the newest gym logo', () => {
  const storage = testMemory();
  receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage);
  receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage);
  assert.equal(acceptGymLogoUpdate(storage), true);
  assert.equal(readStudentGymLogo(storage), TEST_LOGO_2);
  assert.equal(gymLogoPromptDue(storage), false);
});

test('student override wins and persists across a gym update', () => {
  const storage = testMemory();
  writeStudentGymLogo(OWN, storage);
  chooseStudentLogo('own', storage);
  // A student with their own logo is never switched; they only get the prompt.
  assert.equal(receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage), 'prompt');
  assert.equal(readStudentGymLogo(storage), OWN);
  ignoreGymLogoUpdate(storage);
  receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage);
  assert.equal(readStudentGymLogo(storage), OWN);
  assert.equal(studentLogoChoice(storage), 'own');
  // The Advantage default is also a choice that sticks.
  chooseStudentLogo('default', storage);
  receiveGymLogo({ logoVersion: 3, dataUrl: TEST_LOGO }, storage);
  assert.equal(readStudentGymLogo(storage), null);
});

test('revert to the gym logo picks the newest one the phone has', () => {
  const storage = testMemory();
  writeStudentGymLogo(OWN, storage);
  chooseStudentLogo('own', storage);
  receiveGymLogo({ logoVersion: 7, dataUrl: TEST_LOGO_2 }, storage);
  chooseStudentLogo('gym', storage);
  assert.equal(readStudentGymLogo(storage), TEST_LOGO_2);
  assert.equal(gymLogoPromptDue(storage), false);
});

function installLogoCanvas(
  bitmap: { width: number; height: number },
  encode: (mime: string, quality: number) => Blob | null,
) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const sizes: Array<{ width: number; height: number }> = [];
  const mimes: string[] = [];
  const qualities: number[] = [];
  globalThis.createImageBitmap = (async () => ({
    width: bitmap.width,
    height: bitmap.height,
    close() {},
  })) as typeof createImageBitmap;
  globalThis.document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: '',
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'low' as ImageSmoothingQuality,
            fillRect() {},
            drawImage() {},
          };
        },
        toBlob(callback: (blob: Blob | null) => void, mime: string, quality: number) {
          sizes.push({ width: canvas.width, height: canvas.height });
          mimes.push(mime);
          qualities.push(quality);
          callback(encode(mime, quality));
        },
      };
      return canvas;
    },
  } as unknown as Document;
  return {
    sizes,
    mimes,
    qualities,
    restore() {
      globalThis.createImageBitmap = previousBitmap;
      if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = previousDocument;
    },
  };
}

test('the student gym logo cap stays 512px and 350,000 characters', () => {
  assert.equal(STUDENT_LOGO_MAX_EDGE, 512);
  assert.equal(COACH_GYM_LOGO_MAX_CHARS, 350_000);
});

test('a small PNG logo is kept and a camera photo is scaled to the logo edge', async () => {
  const small = installLogoCanvas({ width: 64, height: 64 }, () => {
    throw new Error('a small logo is not re-encoded');
  });
  try {
    const bytes = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]);
    const crest = new File([bytes], 'crest.png', { type: 'image/png' });
    const saved = await saveStudentGymLogoFile(crest, testMemory());
    assert.match(saved, /^data:image\/png;base64,/);
    assert.equal(Buffer.from(saved.slice('data:image/png;base64,'.length), 'base64').equals(Buffer.from(bytes)), true);
    assert.equal(small.mimes.length, 0);
  } finally {
    small.restore();
  }

  const wide = installLogoCanvas({ width: 4032, height: 3024 }, (mime) =>
    mime === 'image/jpeg' ? new Blob([new Uint8Array(12_000)], { type: 'image/jpeg' }) : null,
  );
  try {
    const phone = new File([new Uint8Array(3_200_000)], 'IMG_4032.JPG', { type: 'image/jpeg' });
    const saved = await saveStudentGymLogoFile(phone, testMemory());
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.ok(saved.length <= COACH_GYM_LOGO_MAX_CHARS);
    assert.deepEqual(wide.sizes[0], { width: 512, height: 384 });
    assert.equal(wide.qualities[0], 0.86);
  } finally {
    wide.restore();
  }
});

test('a logo that is still too big is compressed again before it is refused', async () => {
  const encoder = installLogoCanvas({ width: 4000, height: 3000 }, (mime, quality) => {
    if (mime !== 'image/jpeg') return null;
    return new Blob([new Uint8Array(quality <= 0.62 ? 800 : 300_000)], { type: 'image/jpeg' });
  });
  try {
    const phone = new File([new Uint8Array(4_000_000)], 'banner.jpg', { type: 'image/jpeg' });
    const saved = await saveStudentGymLogoFile(phone, testMemory());
    assert.ok(saved.length <= COACH_GYM_LOGO_MAX_CHARS);
    assert.equal(encoder.qualities.includes(0.86), true);
    assert.equal(encoder.qualities.at(-1), 0.62);
    assert.deepEqual(encoder.sizes.at(-1), { width: 384, height: 288 });
  } finally {
    encoder.restore();
  }
});

test('an unreadable logo and a full quota leave the saved logo in place', async () => {
  const storage = testMemory();
  writeStudentGymLogo(OWN, storage);
  chooseStudentLogo('own', storage);
  const previousBitmap = globalThis.createImageBitmap;
  const previousImage = globalThis.Image;
  const previousCreate = globalThis.URL.createObjectURL;
  const previousRevoke = globalThis.URL.revokeObjectURL;
  globalThis.createImageBitmap = (async () => {
    throw new Error('decode failed');
  }) as typeof createImageBitmap;
  class DeadImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      this.onerror?.();
    }
  }
  globalThis.Image = DeadImage as unknown as typeof Image;
  globalThis.URL.createObjectURL = (() => 'blob:broken') as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  try {
    const broken = new File([Uint8Array.from([1, 2, 3])], 'mark.jpg', { type: 'image/jpeg' });
    await assert.rejects(() => saveStudentGymLogoFile(broken, storage), /undecodable/);
    assert.equal(readStudentGymLogo(storage), OWN);
    assert.equal(studentLogoChoice(storage), 'own');
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    if (previousImage) globalThis.Image = previousImage;
    else delete (globalThis as { Image?: typeof Image }).Image;
    globalThis.URL.createObjectURL = previousCreate;
    globalThis.URL.revokeObjectURL = previousRevoke;
  }

  const full = testMemory();
  writeStudentGymLogo(OWN, full);
  chooseStudentLogo('own', full);
  const encoder = installLogoCanvas({ width: 800, height: 800 }, (mime) =>
    mime === 'image/jpeg' ? new Blob([new Uint8Array(500)], { type: 'image/jpeg' }) : null,
  );
  const blocked = {
    getItem: full.getItem,
    setItem: (key: string, value: string) => {
      if (value.length > OWN.length) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      full.setItem(key, value);
    },
    removeItem: full.removeItem,
  };
  try {
    const phone = new File([new Uint8Array(900_000)], 'logo.jpg', { type: 'image/jpeg' });
    await assert.rejects(() => saveStudentGymLogoFile(phone, blocked), (error) => error instanceof StorageQuotaError);
    assert.equal(readStudentGymLogo(full), OWN);
    assert.equal(studentLogoChoice(full), 'own');
  } finally {
    encoder.restore();
  }
});
