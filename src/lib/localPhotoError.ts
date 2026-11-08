import { quotaAddNote } from './storageQuota.ts';

/**
 * Words for a profile photo or student gym-logo pick that did not save.
 * A storage-full error stays the storage sentence. Size, decode, and other
 * failures stay distinct so a photo that can be shrunk is not described as
 * too large when the phone could not read it.
 */
export function localPhotoError(error: unknown, label: 'photo' | 'logo'): string {
  const quota = quotaAddNote(error);
  if (quota) return quota;
  const code = error instanceof Error ? error.message : '';
  if (code === 'not-image') {
    return label === 'logo'
      ? 'That file is not a logo photo. Choose a JPEG, PNG, or WebP, or take a new photo.'
      : 'That file is not a photo. Choose a JPEG, PNG, or WebP, or take a new photo.';
  }
  if (code === 'undecodable') {
    return `This phone could not read that ${label}. Take a new photo, or choose a JPEG or PNG.`;
  }
  if (code === 'too-large') {
    return `That ${label} is still too large to keep on this phone after shrinking it. Choose a different one.`;
  }
  if (code === 'unencoded') {
    return `This phone could not prepare that ${label}. Try again, or choose a JPEG.`;
  }
  return `That ${label} could not be saved on this phone. Try again.`;
}
