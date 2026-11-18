/**
 * Browser wiring for the automatic profile backup (see profileBackup.ts).
 * Kept apart so tests of the backup logic never load the entitlement store.
 */

import { entitlementSnapshot, subscribeEntitlement } from './entitlement.ts';
import { readCloudBearer } from './advantageCloudMedia.ts';
import { writeGymName, subscribeGymName } from './gymName.ts';
import { subscribeGymProfile } from './gymProfile.ts';
import { subscribeInstructorProfile } from './instructorProfile.ts';
import { initProfileBackup } from './profileBackup.ts';
import { notifyStudentJournal, studentDemoIsolated, studentDemoRequested, subscribeStudentJournal } from './studentDemo.ts';

function browserStore() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function startProfileBackup(): void {
  initProfileBackup(
    {
      store: browserStore(),
      claims: () => entitlementSnapshot().claims,
      token: () => readCloudBearer(),
      fetch: (input, init) => fetch(input, init),
      demo: () => studentDemoRequested() || studentDemoIsolated(),
      writeAcademyName: writeGymName,
      onApplied: () => notifyStudentJournal(),
    },
    (kick) => {
      subscribeEntitlement(kick);
      subscribeStudentJournal(kick);
      subscribeInstructorProfile(kick);
      subscribeGymName(kick);
      subscribeGymProfile(kick);
    },
  );
}
