import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FILM_EMPTY_ERROR,
  FILM_PHONE_FULL_ERROR,
  FILM_TITLE_ERROR,
  FILM_TYPE_ERROR,
  commitStudentFilm,
  loadFilms,
  searchStudentFilms,
  studentFilmFileName,
  studentFilmLabel,
  writeFilms,
  type StudentFilm,
} from './studentFilm.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

test('a filmed move is named with the date and technique, like a training video', () => {
  const name = studentFilmFileName({
    date: '2026-10-17',
    technique: 'Armbar from guard',
    clipNumber: 2,
    mime: 'video/mp4',
    originalName: 'clip.mp4',
  });
  assert.match(name, /^2026-10-17 Armbar from guard - clip 2\.mp4$/);
  const film = {
    date: '2026-10-17',
    technique: 'Armbar from guard',
  };
  assert.equal(studentFilmLabel(film), '2026-10-17 Armbar from guard');
});

test('film a move rejects an empty file, a non-video, a missing title, and a full phone', async () => {
  const films: StudentFilm[] = [];
  const blob = new Blob(['video'], { type: 'video/mp4' });
  const empty = await commitStudentFilm(
    { file: { name: 'a.mp4', type: 'video/mp4', size: 0, blob }, technique: 'Armbar', date: '2026-10-17', where: 'phone', provider: '', films },
    {},
  );
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error, FILM_EMPTY_ERROR);

  const photo = await commitStudentFilm(
    { file: { name: 'a.jpg', type: 'image/jpeg', size: 10, blob }, technique: 'Armbar', date: '2026-10-17', where: 'phone', provider: '', films },
    {},
  );
  assert.equal(photo.ok, false);
  if (!photo.ok) assert.equal(photo.error, FILM_TYPE_ERROR);

  const untitled = await commitStudentFilm(
    { file: { name: 'a.mp4', type: 'video/mp4', size: 10, blob }, technique: '  ', date: '2026-10-17', where: 'phone', provider: '', films },
    { putBlob: async () => undefined },
  );
  assert.equal(untitled.ok, false);
  if (!untitled.ok) assert.equal(untitled.error, FILM_TITLE_ERROR);

  const full = await commitStudentFilm(
    { file: { name: 'a.mp4', type: 'video/mp4', size: 10, blob }, technique: 'Armbar', date: '2026-10-17', where: 'phone', provider: '', films },
    { canStore: async () => false, putBlob: async () => undefined },
  );
  assert.equal(full.ok, false);
  if (!full.ok) assert.equal(full.error, FILM_PHONE_FULL_ERROR);
});

test('phone save stores the blob and drive save does not keep a local copy when upload works', async () => {
  const stored = new Map<string, Blob>();
  const blob = new Blob(['video-bytes'], { type: 'video/webm' });
  const phone = await commitStudentFilm(
    {
      file: { name: 'coach.webm', type: 'video/webm', size: blob.size, blob },
      technique: 'Knee slice',
      date: '2026-10-17',
      where: 'phone',
      provider: '',
      films: [],
      now: 10,
    },
    { canStore: async () => true, putBlob: async (id, body) => void stored.set(id, body) },
  );
  assert.equal(phone.ok, true);
  if (!phone.ok) return;
  assert.equal(stored.has(phone.film.id), true);
  assert.match(phone.film.fileName, /Knee slice/);
  const found = searchStudentFilms([phone.film], 'knee');
  assert.equal(found.length, 1);

  let uploaded = 0;
  const drive = await commitStudentFilm(
    {
      file: { name: 'coach.webm', type: 'video/webm', size: blob.size, blob },
      technique: 'Knee slice',
      date: '2026-10-17',
      where: 'academy',
      provider: 'googleDrive',
      films: [phone.film],
    },
    {
      putBlob: async () => {
        throw new Error('phone store should not run');
      },
      upload: async () => {
        uploaded += 1;
        return { driveFileId: 'drive-file-1' };
      },
    },
  );
  assert.equal(uploaded, 1);
  assert.equal(drive.ok && drive.film.driveFileId, 'drive-file-1');
  assert.equal(drive.ok && drive.film.where, 'academy');

  const failed = await commitStudentFilm(
    {
      file: { name: 'coach.webm', type: 'video/webm', size: blob.size, blob },
      technique: 'Knee slice',
      date: '2026-10-17',
      where: 'personal',
      provider: 'oneDrive',
      films: [],
    },
    { upload: async () => ({ error: 'OneDrive did not save that video.' }) },
  );
  assert.equal(failed.ok, false);

  const storage = memory();
  if (phone.ok) writeFilms(storage, [phone.film]);
  assert.equal(loadFilms(storage)[0]?.technique, 'Knee slice');
});

test('the link form stays, and Film a move uses a camera input plus a gallery input', () => {
  const page = readFileSync(new URL('../pages/student/VideoLibraryPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /aria-label="Video link"/);
  assert.match(page, /Add video/);
  assert.match(page, /aria-label="Technique or drill"/);
  assert.match(page, /id="student-film-record"/);
  assert.match(page, /capture="environment"/);
  assert.match(page, /accept="video\/\*"/);
  assert.match(page, /id="student-film-library"/);
  assert.match(page, /Pick from gallery/);
  assert.match(page, /Film a move/);
  const library = page.split('id="student-film-library"')[1] ?? '';
  assert.doesNotMatch(library.slice(0, 180), /capture=/);
});
