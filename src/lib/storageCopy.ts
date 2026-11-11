/**
 * Storage wording that follows what this license really has.
 * With Advantage Cloud: photos and videos uploaded there are stored in Advantage Cloud.
 * Without it: they stay on this device, or in the gym's own Google Drive or OneDrive folder.
 * Copy only. Nothing here opens a door or picks where a file goes.
 */

/** /coach-unlimited Connect with note when the license has Advantage Cloud. */
export const CLOUD_CONNECT_NOTE =
  "This gym has Advantage Cloud. Photos and videos you upload to Advantage Cloud are stored there for the gym. A Google Drive or OneDrive folder is optional. It stays in the gym's own account, and Advantage does not manage that account.";

/** /coach-unlimited Connect with body when the license has Advantage Cloud. */
export const CLOUD_CONNECT_BODY =
  'Optional with Advantage Cloud. Choose a folder the gym already owns if you also want lesson plans, photos, and videos in Google Drive or OneDrive. Adding a photo still includes Google Photos and the phone gallery.';

export function connectAccountNote(cloudOn: boolean, deviceNote: string): string {
  return cloudOn ? CLOUD_CONNECT_NOTE : deviceNote;
}

export function connectWithBody(cloudOn: boolean, deviceBody: string): string {
  return cloudOn ? CLOUD_CONNECT_BODY : deviceBody;
}

/** Daily Training Videos connect button when Advantage Cloud is on. */
export const TRAINING_DRIVE_CONNECT_LABEL_CLOUD = 'Connect Google Drive (optional)';

/** Daily Training Videos connect sheet helper when Advantage Cloud is on. */
export const TRAINING_DRIVE_CONNECT_HINT_CLOUD =
  'Optional with Advantage Cloud. Sign in, then pick the gym folder to also copy this day into Google Drive. Clips you upload to Advantage Cloud are already shared with the gym owner and instructors.';

/** Daily Training Videos handoff when Advantage Cloud is on and no Drive folder is connected. */
export const TRAINING_CLOUD_LEAD =
  'This gym has Advantage Cloud. Under “Where new files from this page go,” pick Advantage Cloud to store clips there for the gym owner and instructors. Google Drive is optional.';
export const TRAINING_CLOUD_ACTION = 'With Advantage Cloud picked, a clip you add uploads to Advantage Cloud.';
export const TRAINING_CLOUD_WARNING =
  'Clips kept on This phone stay on this device and are not shared until you upload them to Advantage Cloud or connect Google Drive and save this day.';

/** Slideshow line when this license has Advantage Cloud but this screen plays from the phone. */
export const PLAYING_FROM_PHONE_CLOUD =
  'The slideshow on this device is playing from this phone. Files uploaded to Advantage Cloud are stored in Advantage Cloud for the gym.';

/** /pro academy pathway when no Drive folder is connected but Advantage Cloud is on. */
export const ACADEMY_NO_FOLDER_CLOUD =
  'This pathway is for a Google Drive or OneDrive folder, and none is connected. With Advantage Cloud you do not need one: give students a free Student license and their files reach the gym in Advantage Cloud.';

export function academyNoFolderCopy(cloudOn: boolean, deviceCopy: string): string {
  return cloudOn ? ACADEMY_NO_FOLDER_CLOUD : deviceCopy;
}

/** One line under the Student license box on the Advantage Cloud panel. */
export const CLOUD_STUDENT_LICENSE_HINT =
  "Only for Send to student. Paste that student's ID from Show my student ID on their phone, the same ID used for Link to student on the roster card. Leave it blank otherwise.";

/** Student Roster, shown only when Advantage Cloud roster sharing is on. */
export const ROSTER_CLOUD_HINT =
  'Send to Advantage Cloud puts a copy of this roster in the gym’s Advantage Cloud. Your private coach notes are saved separately: only you and the gym owner can read them, and they never join the shared roster. Get gym roster adds gym students to this device and fills blanks. It does not delete anyone here.';
