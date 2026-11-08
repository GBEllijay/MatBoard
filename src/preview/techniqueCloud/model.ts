/**
 * Isolated technique-cloud preview.
 * A preview copy is a new object. It does not write the student file.
 */
import { parseProgressPacket } from '../../lib/progress/format.ts';
import type { JournalEntry, StudentProgressReport } from '../../lib/progress/types.ts';
import { readWorkingGraph } from '../../lib/workingTechniques.ts';

export const CLOUD_PATH = '/preview/technique-cloud';
export const LIBRARY_PATH = '/preview/video-library';
export const CLOUD_NOTE =
  'Preview only. A sample is labelled sample. A preview copy is read from this phone and is not written back.';

export type CloudVideo = { id: string; title: string };
export type CloudCard = { id: string; date: string; title: string; classOrigin: string };

export type CloudTechnique = {
  id: string;
  title: string;
  notes: string;
  classOrigin: string;
  videos: CloudVideo[];
  journalCards: CloudCard[];
};

export type CloudPreview = {
  source: 'empty' | 'sample' | 'preview-copy';
  techniques: CloudTechnique[];
  note: string;
};

export function emptyCloud(): CloudPreview {
  return { source: 'empty', techniques: [], note: 'No techniques in this preview.' };
}

export function sampleCloud(): CloudPreview {
  const card: CloudCard = {
    id: 'sample-card',
    date: '2026-01-15',
    title: 'Sample class card',
    classOrigin: '2026-01-15 · Sample class',
  };
  return {
    source: 'sample',
    note: 'Sample only. These are not your techniques.',
    techniques: [
      {
        id: 'sample-hip-bump',
        title: 'Hip bump sweep (sample)',
        notes: 'Sample note. Not a learned mark.',
        classOrigin: card.classOrigin,
        videos: [{ id: 'sample-clip', title: 'Sample clip' }],
        journalCards: [card],
      },
    ],
  };
}

function classOriginOf(entry: JournalEntry): string {
  const line = entry.body.split('\n').find((row) => row.startsWith('Class:')) ?? '';
  const name = line.replace(/^Class:\s*/, '').trim();
  return name ? `${entry.date} · ${name}` : entry.date;
}

function cardTitle(entry: JournalEntry): string {
  const line = entry.body.split('\n').map((row) => row.trim()).find(Boolean) ?? '';
  return line.slice(0, 80) || entry.date;
}

/** New objects only. The report argument is not changed. */
export function copyFromReport(report: Pick<StudentProgressReport, 'working' | 'journal' | 'clips'>): CloudPreview {
  const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
  const journal = report.journal ?? [];
  const clips = report.clips ?? [];
  const techniques: CloudTechnique[] = graph.nodes.map((node) => {
    const cards = journal
      .filter((entry) => entry.techniqueRefs.some((ref) => ref.id === node.id || ref.name === node.title))
      .map((entry) => ({ id: entry.id, date: entry.date, title: cardTitle(entry), classOrigin: classOriginOf(entry) }));
    const cardIds = new Set(cards.map((card) => card.id));
    const videos = clips
      .filter(
        (clip) =>
          (clip.techniqueAnchor?.kind === 'working' && clip.techniqueAnchor.id === node.id) ||
          (clip.journalEntryId ? cardIds.has(clip.journalEntryId) : false),
      )
      .map((clip) => ({ id: clip.id, title: clip.description.trim() || clip.note.trim() || 'Video link' }));
    return {
      id: node.id,
      title: node.title,
      notes: node.notes,
      classOrigin: cards[0]?.classOrigin ?? '',
      videos,
      journalCards: cards,
    };
  });
  if (!techniques.length) return { source: 'empty', techniques: [], note: 'The working list on this phone is empty.' };
  return { source: 'preview-copy', techniques, note: 'Preview copy. Nothing was written back to the phone.' };
}

export function previewCopyFromText(raw: string | null): CloudPreview {
  if (!raw) return { source: 'empty', techniques: [], note: 'No student file on this phone.' };
  const parsed = parseProgressPacket(raw);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') {
    return { source: 'empty', techniques: [], note: 'This preview left the student file unread.' };
  }
  return copyFromReport(parsed.value);
}

export function cardsForTechnique(preview: CloudPreview, techniqueId: string): CloudCard[] {
  return preview.techniques.find((item) => item.id === techniqueId)?.journalCards ?? [];
}

export function techniquesForCard(preview: CloudPreview, cardId: string): CloudTechnique[] {
  return preview.techniques.filter((item) => item.journalCards.some((card) => card.id === cardId));
}

export type MemoryClip = { id: string; title: string; source: 'film' | 'gallery' };

export function addMemoryClip(clips: readonly MemoryClip[], source: MemoryClip['source'], title: string): MemoryClip[] {
  return [...clips, { id: `clip-${clips.length + 1}`, title, source }];
}
