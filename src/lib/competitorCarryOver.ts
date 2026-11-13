/**
 * Blank fields on a linked Competitor Roster card can be filled from the
 * Student Roster card. A value the competitor already has stays. Notes,
 * results, weigh-ins, and game plans are not fields of this patch.
 */
import { clipCompetitorPhoto } from './competitorPhoto.ts';
import type { Student, StudentDraft } from './rosterStore.ts';

const STYLE_LABEL = { gi: 'Gi', nogi: 'No-Gi', both: 'Gi & No-Gi' } as const;

export type CarryStyle = 'gi' | 'nogi' | 'both' | '';

export type CarryRecord = {
  trainingStyle?: CarryStyle | string;
  snapshot?: { trainingStyle?: CarryStyle | string };
};

function textBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

function keptDate(value: string): string {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function styleLabel(record: CarryRecord): string {
  const style = record.trainingStyle || record.snapshot?.trainingStyle || '';
  if (style === 'gi' || style === 'nogi' || style === 'both') return STYLE_LABEL[style];
  return '';
}

/** Photo shown for a linked competitor. The student card wins when photos are allowed. */
export function followedCompetitorPhoto(
  competitor: Pick<Student, 'photo' | 'noPhotos'>,
  source: Pick<Student, 'photo' | 'noPhotos'> | null | undefined,
): string {
  if (competitor.noPhotos) return '';
  if (!source) return competitor.photo;
  if (source.noPhotos) return '';
  return source.photo || competitor.photo;
}

/**
 * Fields to copy onto the competitor card. Undefined when every requested
 * field already has a value, or the student card has nothing to give.
 */
export function blankCompetitorPatch(
  competitor: Pick<
    Student,
    'name' | 'belt' | 'stripes' | 'division' | 'gym' | 'lastPromotion' | 'lastPromotionDetail' | 'photo' | 'noPhotos'
  >,
  student: Pick<
    Student,
    'name' | 'belt' | 'stripes' | 'division' | 'gym' | 'lastPromotion' | 'lastPromotionDetail' | 'photo' | 'noPhotos'
  >,
  record: CarryRecord = {},
): Partial<StudentDraft> | null {
  const patch: Partial<StudentDraft> = {};
  if (textBlank(competitor.name) && !textBlank(student.name)) patch.name = student.name;
  if (textBlank(competitor.belt) && !textBlank(student.belt)) patch.belt = student.belt;
  if (
    competitor.stripes === undefined &&
    typeof student.stripes === 'number' &&
    Number.isInteger(student.stripes) &&
    student.stripes >= 0 &&
    student.stripes <= 11
  ) {
    patch.stripes = student.stripes;
  }
  if (textBlank(competitor.division)) {
    const division = styleLabel(record) || student.division;
    if (!textBlank(division)) patch.division = division;
  }
  if (textBlank(competitor.gym) && !textBlank(student.gym)) patch.gym = student.gym;
  const promotion = keptDate(student.lastPromotion);
  if (textBlank(competitor.lastPromotion) && promotion) patch.lastPromotion = promotion;
  if (textBlank(competitor.lastPromotionDetail) && !textBlank(student.lastPromotionDetail)) {
    patch.lastPromotionDetail = student.lastPromotionDetail;
  }
  const photoAllowed = !competitor.noPhotos && !student.noPhotos;
  if (photoAllowed && textBlank(competitor.photo)) {
    const photo = clipCompetitorPhoto(student.photo);
    if (photo) patch.photo = photo;
  }
  return Object.keys(patch).length ? patch : null;
}
