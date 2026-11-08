/**
 * Fictional example for the ancestry-scope preview.
 * Instructor ancestry is who taught whom. It is not an employment chart
 * and it is not a claim about any real person.
 * Nothing here is written to a profile, roster, or license.
 */

export const AS_OF = '2026-11-08';

export const EXAMPLE_NOTE =
  'Example only. Nothing here is saved. These people are fictional. This is not a record from this phone.';

export const ACADEMY_NAME = 'Northshore Academy';

export const ACADEMY_SCOPE_LABEL =
  'Northshore Academy · while the competitor was attached to a professor affiliated here. Not a personal lifetime total.';

export const MEDALS_ARE_NOT_WINS =
  'Medals, match wins and losses, and organization ranking points are separate. A medal is not a win.';

export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

export type Person = {
  id: string;
  name: string;
  belt: Belt;
};

/**
 * Mat hours live only on a Student Edition profile.
 * A person with no row here has no linked profile. That is not zero hours.
 */
export type StudentProfile = {
  personId: string;
  matHours: number;
};

/** Teaching hours are recorded on the Instructor side, not on the Student profile. */
export type TeachingRecord = {
  personId: string;
  teachingHours: number;
};

/** One instructor-to-instructor step. The learner is below the teacher. */
export type AncestryEdge = {
  id: string;
  teacherId: string;
  learnerId: string;
  from: string;
  to: string | null;
  /** How the teacher connects to the learner, when that type is known. */
  relation?: string;
};

/** A student's head instructor. Separate trees when there is more than one. */
export type Attachment = {
  id: string;
  professorId: string;
  studentId: string;
  from: string;
  to: string | null;
};

/** Black-belt professor's years at this academy. Not a teaching-ancestry edge. */
export type Affiliation = {
  professorId: string;
  from: string;
  to: string | null;
};

export type Promotion = {
  id: string;
  issuerId: string;
  studentId: string;
  kind: 'belt' | 'stripe';
  label: string;
  date: string;
  /** Set only when the issuer was affiliated here on this date. */
  academyId: 'northshore' | null;
};

/** Someone the student trained with who is not a head instructor. */
export type TrainedWith = {
  id: string;
  studentId: string;
  personId: string;
  from: string;
  to: string | null;
  note: string;
};

export type MatchResult = 'win' | 'loss' | 'draw';

export type CompetitionResult = {
  id: string;
  studentId: string;
  tournament: string;
  date: string;
  division: string;
  /** Open class is its own result, not a note on the division result. */
  classKind: 'division' | 'open';
  medal: 'gold' | 'silver' | 'bronze' | null;
  matches: readonly { id: string; result: MatchResult }[];
  /** Null when the organizer did not publish points for this result. */
  rankingPoints: number | null;
};

export type Fixture = {
  people: readonly Person[];
  ancestry: readonly AncestryEdge[];
  attachments: readonly Attachment[];
  affiliations: readonly Affiliation[];
  promotions: readonly Promotion[];
  trainedWith: readonly TrainedWith[];
  results: readonly CompetitionResult[];
  studentProfiles: readonly StudentProfile[];
  teaching: readonly TeachingRecord[];
  teamAwards: readonly TeamAward[];
};

/** An award to the academy in a team division. Not a student's medal. */
export type TeamAward = {
  id: string;
  tournament: string;
  date: string;
  category: string;
  place: 1 | 2 | 3;
};

export type LineageTree = {
  headId: string;
  from: string;
  to: string | null;
  /** Student, then head instructor, then that line upward. */
  ids: readonly string[];
  cycle: boolean;
};

const PEOPLE: readonly Person[] = [
  { id: 'ivo', name: 'Professor Ivo Serra', belt: 'black' },
  { id: 'nia', name: 'Professor Nia Calder', belt: 'black' },
  { id: 'soren', name: 'Professor Soren Hale', belt: 'black' },
  { id: 'ellis', name: 'Professor Ellis Ward', belt: 'black' },
  { id: 'jonah', name: 'Professor Jonah Peck', belt: 'black' },
  { id: 'adele', name: 'Professor Adele Voss', belt: 'black' },
  { id: 'lila', name: 'Professor Lila Quinn', belt: 'black' },
  { id: 'mira', name: 'Mira Chen', belt: 'purple' },
  { id: 'theo', name: 'Theo Lang', belt: 'blue' },
  { id: 'sam', name: 'Sam Ortiz', belt: 'white' },
  { id: 'noa', name: 'Noa Kim', belt: 'brown' },
  { id: 'ren', name: 'Coach Ren Park', belt: 'brown' },
  { id: 'rae', name: 'Rae Pell', belt: 'blue' },
  { id: 'you', name: 'You', belt: 'black' },
  { id: 'fabio', name: 'Professor Fabio Acosta', belt: 'black' },
  { id: 'carlos', name: 'Master Carlos Gracie Junior', belt: 'black' },
  { id: 'helio', name: 'Helio Gracie', belt: 'black' },
  { id: 'carlos-sr', name: 'Carlos Gracie Senior', belt: 'black' },
];

const STUDENT_PROFILES: readonly StudentProfile[] = [
  { personId: 'ellis', matHours: 4180 },
  { personId: 'adele', matHours: 5100 },
  { personId: 'mira', matHours: 640 },
  { personId: 'theo', matHours: 210 },
  { personId: 'sam', matHours: 36 },
  { personId: 'noa', matHours: 880 },
  { personId: 'you', matHours: 240 },
];

const TEACHING: readonly TeachingRecord[] = [
  { personId: 'ellis', teachingHours: 860 },
  { personId: 'adele', teachingHours: 1400 },
  { personId: 'jonah', teachingHours: 700 },
  { personId: 'lila', teachingHours: 500 },
  { personId: 'you', teachingHours: 180 },
];

const ANCESTRY: readonly AncestryEdge[] = [
  { id: 'edge-ivo-nia', teacherId: 'ivo', learnerId: 'nia', from: '1994-01-01', to: '1998-06-01' },
  { id: 'edge-ivo-adele', teacherId: 'ivo', learnerId: 'adele', from: '1999-01-01', to: '2004-11-01' },
  { id: 'edge-nia-ellis', teacherId: 'nia', learnerId: 'ellis', from: '2008-01-01', to: '2014-05-20' },
  { id: 'edge-nia-jonah', teacherId: 'nia', learnerId: 'jonah', from: '2006-01-01', to: '2011-08-12' },
  { id: 'edge-soren-lila', teacherId: 'soren', learnerId: 'lila', from: '1996-01-01', to: '2002-04-01' },
  {
    id: 'edge-sr-helio',
    teacherId: 'carlos-sr',
    learnerId: 'helio',
    from: '',
    to: null,
    relation: 'Teaching. Helio learned from him. Not a black belt promotion.',
  },
  {
    id: 'edge-helio-carlos',
    teacherId: 'helio',
    learnerId: 'carlos',
    from: '',
    to: null,
    relation: 'Awarded Carlos Gracie Junior his black belt. A promotion, not a claim he was the only teacher.',
  },
  {
    id: 'edge-carlos-fabio',
    teacherId: 'carlos',
    learnerId: 'fabio',
    from: '',
    to: null,
    relation: 'Founded his gym under him. You confirmed this. Not a black belt promotion.',
  },
  {
    id: 'edge-fabio-you',
    teacherId: 'fabio',
    learnerId: 'you',
    from: '',
    to: null,
    relation: 'Your professor. You confirmed this.',
  },
];

const ATTACHMENTS: readonly Attachment[] = [
  { id: 'att-ellis-mira', professorId: 'ellis', studentId: 'mira', from: '2019-01-08', to: null },
  { id: 'att-jonah-mira', professorId: 'jonah', studentId: 'mira', from: '2016-04-01', to: '2018-11-30' },
  { id: 'att-adele-theo', professorId: 'adele', studentId: 'theo', from: '2021-09-01', to: null },
  { id: 'att-ellis-sam', professorId: 'ellis', studentId: 'sam', from: '2025-02-01', to: null },
  { id: 'att-lila-noa', professorId: 'lila', studentId: 'noa', from: '2009-03-01', to: '2012-12-31' },
];

const AFFILIATIONS: readonly Affiliation[] = [
  { professorId: 'ellis', from: '2016-03-01', to: null },
  { professorId: 'adele', from: '2008-01-15', to: null },
  { professorId: 'jonah', from: '2012-02-01', to: '2019-06-30' },
  { professorId: 'lila', from: '2005-08-01', to: '2012-12-31' },
];

const PROMOTIONS: readonly Promotion[] = [
  { id: 'promo-mira-blue', issuerId: 'ellis', studentId: 'mira', kind: 'belt', label: 'Blue belt', date: '2021-05-02', academyId: 'northshore' },
  { id: 'promo-mira-purple', issuerId: 'ellis', studentId: 'mira', kind: 'belt', label: 'Purple belt', date: '2024-08-18', academyId: 'northshore' },
  { id: 'promo-sam-stripe', issuerId: 'ellis', studentId: 'sam', kind: 'stripe', label: 'White belt stripe', date: '2025-11-01', academyId: 'northshore' },
  { id: 'promo-theo-blue', issuerId: 'adele', studentId: 'theo', kind: 'belt', label: 'Blue belt', date: '2024-03-12', academyId: 'northshore' },
  { id: 'promo-mira-stripe', issuerId: 'jonah', studentId: 'mira', kind: 'stripe', label: 'White belt stripe', date: '2017-09-01', academyId: 'northshore' },
  { id: 'promo-noa-blue', issuerId: 'lila', studentId: 'noa', kind: 'belt', label: 'Blue belt', date: '2010-06-01', academyId: 'northshore' },
  { id: 'promo-noa-purple', issuerId: 'lila', studentId: 'noa', kind: 'belt', label: 'Purple belt', date: '2012-04-01', academyId: 'northshore' },
  { id: 'promo-rae-blue', issuerId: 'jonah', studentId: 'rae', kind: 'belt', label: 'Blue belt', date: '2009-02-01', academyId: null },
];

const TRAINED_WITH: readonly TrainedWith[] = [
  {
    id: 'with-mira-ren',
    studentId: 'mira',
    personId: 'ren',
    from: '2023-01-10',
    to: '2024-06-01',
    note: 'Open mat. Not a head instructor.',
  },
];

const RESULTS: readonly CompetitionResult[] = [
  {
    id: 'res-mira-city-middle',
    studentId: 'mira',
    tournament: 'City Open 2024',
    date: '2024-06-15',
    division: 'Middleweight',
    classKind: 'division',
    medal: 'silver',
    matches: [{ id: 'match-mira-city-1', result: 'loss' }],
    rankingPoints: null,
  },
  {
    id: 'res-mira-city-open',
    studentId: 'mira',
    tournament: 'City Open 2024',
    date: '2024-06-15',
    division: 'Open class',
    classKind: 'open',
    medal: 'bronze',
    matches: [{ id: 'match-mira-open-1', result: 'win' }],
    rankingPoints: null,
  },
  {
    id: 'res-theo-harbor',
    studentId: 'theo',
    tournament: 'Harbor Invitational 2025',
    date: '2025-04-20',
    division: 'Lightweight',
    classKind: 'division',
    medal: 'gold',
    matches: [],
    rankingPoints: null,
  },
  {
    id: 'res-mira-south',
    studentId: 'mira',
    tournament: 'South Regional 2017',
    date: '2017-10-08',
    division: 'Featherweight',
    classKind: 'division',
    medal: 'gold',
    matches: [
      { id: 'match-mira-south-1', result: 'win' },
      { id: 'match-mira-south-2', result: 'win' },
    ],
    rankingPoints: 9,
  },
  {
    id: 'res-sam-dual',
    studentId: 'sam',
    tournament: 'Riverside Dual 2025',
    date: '2025-10-04',
    division: 'Light feather',
    classKind: 'division',
    medal: null,
    matches: [{ id: 'match-sam-dual-1', result: 'win' }],
    rankingPoints: 3,
  },
  {
    id: 'res-noa-winter',
    studentId: 'noa',
    tournament: 'Winter Classic 2024',
    date: '2024-01-20',
    division: 'Middleweight',
    classKind: 'division',
    medal: 'gold',
    matches: [
      { id: 'match-noa-winter-1', result: 'win' },
      { id: 'match-noa-winter-2', result: 'win' },
    ],
    rankingPoints: 6,
  },
];

export function exampleFixture(): Fixture {
  return {
    people: PEOPLE,
    ancestry: ANCESTRY,
    attachments: ATTACHMENTS,
    affiliations: AFFILIATIONS,
    promotions: PROMOTIONS,
    trainedWith: TRAINED_WITH,
    results: RESULTS,
    studentProfiles: STUDENT_PROFILES,
    teaching: TEACHING,
    teamAwards: TEAM_AWARDS,
  };
}

const TEAM_AWARDS: readonly TeamAward[] = [
  { id: 'award-harbor-kids', tournament: 'Harbor Invitational 2025', date: '2025-04-20', category: 'Kids team', place: 1 },
  { id: 'award-harbor-kids', tournament: 'Harbor Invitational 2025', date: '2025-04-20', category: 'Kids team', place: 1 },
  { id: 'award-city-adults', tournament: 'City Open 2024', date: '2024-06-15', category: 'Adults team', place: 2 },
];

export type TeamAwardRollup = {
  first: number;
  second: number;
  third: number;
  total: number;
  events: TeamAward[];
};

/** Unique award ids. A repeated import does not add another place. */
export function teamAwardRollup(awards: readonly TeamAward[]): TeamAwardRollup {
  const events: TeamAward[] = [];
  const seen = new Set<string>();
  for (const award of awards) {
    if (seen.has(award.id)) continue;
    seen.add(award.id);
    events.push(award);
  }
  return {
    first: events.filter((row) => row.place === 1).length,
    second: events.filter((row) => row.place === 2).length,
    third: events.filter((row) => row.place === 3).length,
    total: events.length,
    events,
  };
}

export type PersonalMatHours = { linked: true; hours: number; source: 'student-edition' } | { linked: false };

/** Mat hours from this person's own Student Edition profile. Missing is not zero. */
export function personalMatHours(fixture: Fixture, personId: string): PersonalMatHours {
  const profile = fixture.studentProfiles.find((row) => row.personId === personId);
  if (!profile) return { linked: false };
  return { linked: true, hours: profile.matHours, source: 'student-edition' };
}

/** Instructor-side teaching hours. This never reads a Student profile. */
export function teachingHours(fixture: Fixture, personId: string): number | null {
  const row = fixture.teaching.find((item) => item.personId === personId);
  return row ? row.teachingHours : null;
}

export type HourRollup = {
  hours: number;
  linkedIds: string[];
  missingIds: string[];
};

/** Unique people. Linked profiles are added. A missing profile is listed, not stored as 0. */
export function linkedMatHourRollup(fixture: Fixture, ids: readonly string[]): HourRollup {
  const linkedIds: string[] = [];
  const missingIds: string[] = [];
  let hours = 0;
  for (const id of [...new Set(ids)]) {
    const source = personalMatHours(fixture, id);
    if (source.linked) {
      linkedIds.push(id);
      hours += source.hours;
    } else missingIds.push(id);
  }
  return { hours, linkedIds, missingIds };
}

export function formatHours(hours: number): string {
  return hours.toLocaleString('en-US');
}

export function person(fixture: Fixture, id: string): Person {
  const found = fixture.people.find((row) => row.id === id);
  if (!found) throw new Error(`Unknown person ${id}`);
  return found;
}

export function beltLabel(belt: Belt): string {
  if (belt === 'black') return 'Black belt';
  return `${belt.charAt(0).toUpperCase()}${belt.slice(1)} belt`;
}

export function spanLabel(from: string, to: string | null): string {
  const year = (iso: string) => iso.slice(0, 4);
  return to ? `${year(from)}–${year(to)}` : `${year(from)}–present`;
}

export function covers(from: string, to: string | null, date: string): boolean {
  return from <= date && (to === null || date <= to);
}

export function findCycle(edges: readonly { teacherId: string; learnerId: string }[]): string[] | null {
  const up = new Map<string, string[]>();
  for (const edge of edges) {
    const list = up.get(edge.learnerId) ?? [];
    list.push(edge.teacherId);
    up.set(edge.learnerId, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const walk = (id: string): string[] | null => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return stack.slice(start).concat(id);
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const teacherId of up.get(id) ?? []) {
      const found = walk(teacherId);
      if (found) return found;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.teacherId);
    ids.add(edge.learnerId);
  }
  for (const id of ids) {
    const found = walk(id);
    if (found) return found;
  }
  return null;
}

/** Professor, then each primary teacher above. Stops if the line loops. */
export function ancestorsOf(fixture: Fixture, professorId: string): { ids: string[]; cycle: boolean } {
  const ids = [professorId];
  const seen = new Set(ids);
  let current = professorId;
  while (true) {
    const edge = fixture.ancestry.find((row) => row.learnerId === current);
    if (!edge) return { ids, cycle: false };
    if (seen.has(edge.teacherId)) return { ids: [...ids, edge.teacherId], cycle: true };
    seen.add(edge.teacherId);
    ids.push(edge.teacherId);
    current = edge.teacherId;
  }
}

export function headTrees(fixture: Fixture, studentId: string): LineageTree[] {
  return fixture.attachments
    .filter((row) => row.studentId === studentId)
    .map((row) => {
      const above = ancestorsOf(fixture, row.professorId);
      return {
        headId: row.professorId,
        from: row.from,
        to: row.to,
        ids: [studentId, ...above.ids],
        cycle: above.cycle,
      };
    });
}

export function trainedWith(fixture: Fixture, studentId: string): readonly TrainedWith[] {
  return fixture.trainedWith.filter((row) => row.studentId === studentId);
}

export function professorIds(fixture: Fixture): string[] {
  return fixture.affiliations.map((row) => row.professorId);
}

export function splitProfessors(fixture: Fixture, asOf = AS_OF): { active: string[]; past: string[]; unique: string[] } {
  const active: string[] = [];
  const past: string[] = [];
  for (const row of fixture.affiliations) {
    const ongoing = row.to === null || row.to >= asOf;
    if (ongoing) active.push(row.professorId);
    else past.push(row.professorId);
  }
  return { active, past, unique: [...new Set([...active, ...past])] };
}

export function attachedStudentIds(fixture: Fixture, professorId: string): string[] {
  return [...new Set(fixture.attachments.filter((row) => row.professorId === professorId).map((row) => row.studentId))];
}

export function academyStudentIds(fixture: Fixture): string[] {
  return [...new Set(fixture.attachments.map((row) => row.studentId))];
}

/** Sum of each professor's student list. Counts a shared student again. */
export function naiveAttachedStudentCount(fixture: Fixture): number {
  return professorIds(fixture).reduce((sum, id) => sum + attachedStudentIds(fixture, id).length, 0);
}

export function issuedPromotions(fixture: Fixture, issuerId: string, scope: 'academy' | 'lifetime'): Promotion[] {
  return fixture.promotions.filter((row) => {
    if (row.issuerId !== issuerId) return false;
    if (scope === 'academy') return row.academyId === 'northshore';
    return true;
  });
}

export function earnedPromotions(fixture: Fixture, studentId: string): Promotion[] {
  return fixture.promotions.filter((row) => row.studentId === studentId);
}

export function academyPromotions(fixture: Fixture): Promotion[] {
  const seen = new Set<string>();
  const rows: Promotion[] = [];
  for (const row of fixture.promotions) {
    if (row.academyId !== 'northshore' || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

export function countKinds(rows: readonly Promotion[]): { belts: number; stripes: number } {
  return {
    belts: rows.filter((row) => row.kind === 'belt').length,
    stripes: rows.filter((row) => row.kind === 'stripe').length,
  };
}

export const FEATURED_INSTRUCTOR_ID = 'you';

export const OWNER_LINE =
  'You → Professor Fabio Acosta → Master Carlos Gracie Junior → Helio Gracie → Carlos Gracie Senior';

export type InstructorSummary = {
  professorId: string;
  status: 'active' | 'past';
  personalMatHours: PersonalMatHours;
  teachingHours: number | null;
  attachedStudentIds: string[];
  attachedStudentMatHours: HourRollup;
  issuedHere: { belts: number; stripes: number };
  issuedLifetime: { belts: number; stripes: number };
};

export function instructorSummary(fixture: Fixture, professorId: string, asOf = AS_OF): InstructorSummary {
  const split = splitProfessors(fixture, asOf);
  const students = attachedStudentIds(fixture, professorId);
  return {
    professorId,
    status: split.active.includes(professorId) ? 'active' : 'past',
    personalMatHours: personalMatHours(fixture, professorId),
    teachingHours: teachingHours(fixture, professorId),
    attachedStudentIds: students,
    attachedStudentMatHours: linkedMatHourRollup(fixture, students),
    issuedHere: countKinds(issuedPromotions(fixture, professorId, 'academy')),
    issuedLifetime: countKinds(issuedPromotions(fixture, professorId, 'lifetime')),
  };
}

export function sharedAncestorIds(fixture: Fixture): string[] {
  const counts = new Map<string, number>();
  for (const professorId of professorIds(fixture)) {
    for (const id of ancestorsOf(fixture, professorId).ids) {
      if (id === professorId) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
}

export type PlacedNode = {
  id: string;
  name: string;
  depth: number;
  x: number;
  y: number;
  shared: boolean;
};

export type PlacedEdge = {
  teacherId: string;
  learnerId: string;
  label: string;
};

/** One node per person. Shared ancestors are not drawn again on each branch. */
export function placeAncestry(fixture: Fixture): { nodes: PlacedNode[]; edges: PlacedEdge[]; width: number; height: number } {
  const shared = new Set(sharedAncestorIds(fixture));
  const depthOf = new Map<string, number>();
  const chainIds = new Set<string>();
  for (const professorId of professorIds(fixture)) {
    const chain = ancestorsOf(fixture, professorId).ids;
    chain.forEach((id, index) => {
      chainIds.add(id);
      const depth = chain.length - 1 - index;
      depthOf.set(id, Math.max(depthOf.get(id) ?? 0, depth));
    });
  }
  const children = new Map<string, string[]>();
  const edges: PlacedEdge[] = [];
  for (const edge of fixture.ancestry) {
    if (!chainIds.has(edge.teacherId) || !chainIds.has(edge.learnerId)) continue;
    const list = children.get(edge.teacherId) ?? [];
    list.push(edge.learnerId);
    children.set(edge.teacherId, list);
    edges.push({ teacherId: edge.teacherId, learnerId: edge.learnerId, label: spanLabel(edge.from, edge.to) });
  }
  const index = new Map<string, number>();
  let cursor = 0;
  const place = (id: string) => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      if (!index.has(id)) {
        index.set(id, cursor);
        cursor += 1;
      }
      return;
    }
    for (const kid of kids) place(kid);
    const spots = kids.map((kid) => index.get(kid) ?? 0);
    index.set(id, (Math.min(...spots) + Math.max(...spots)) / 2);
  };
  const roots = [...chainIds].filter((id) => !fixture.ancestry.some((edge) => edge.learnerId === id));
  for (const root of roots) place(root);
  const column = 196;
  const row = 108;
  const nodes: PlacedNode[] = [...chainIds].map((id) => ({
    id,
    name: person(fixture, id).name.replace('Professor ', ''),
    depth: depthOf.get(id) ?? 0,
    x: 24 + (index.get(id) ?? 0) * column,
    y: 20 + (depthOf.get(id) ?? 0) * row,
    shared: shared.has(id),
  }));
  const maxX = Math.max(...nodes.map((node) => node.x), 0);
  const maxY = Math.max(...nodes.map((node) => node.y), 0);
  return { nodes, edges, width: maxX + 180, height: maxY + 78 };
}

export function resultInAcademyScope(fixture: Fixture, result: CompetitionResult): boolean {
  return fixture.attachments.some((attachment) => {
    if (attachment.studentId !== result.studentId) return false;
    if (!covers(attachment.from, attachment.to, result.date)) return false;
    const affiliation = fixture.affiliations.find((row) => row.professorId === attachment.professorId);
    return Boolean(affiliation && covers(affiliation.from, affiliation.to, result.date));
  });
}

/** Each head instructor who ever had the student sees that student's results. */
export function sharedRosterCopies(fixture: Fixture): { resultId: string; professorId: string }[] {
  const copies: { resultId: string; professorId: string }[] = [];
  for (const result of fixture.results) {
    for (const attachment of fixture.attachments) {
      if (attachment.studentId === result.studentId) {
        copies.push({ resultId: result.id, professorId: attachment.professorId });
      }
    }
  }
  return copies;
}

export type MedalCounts = { gold: number; silver: number; bronze: number };

export type MatchCounts = { wins: number; losses: number; draws: number };

export function medalCounts(results: readonly CompetitionResult[]): MedalCounts {
  return {
    gold: results.filter((row) => row.medal === 'gold').length,
    silver: results.filter((row) => row.medal === 'silver').length,
    bronze: results.filter((row) => row.medal === 'bronze').length,
  };
}

export function matchCounts(results: readonly CompetitionResult[]): MatchCounts {
  const counts: MatchCounts = { wins: 0, losses: 0, draws: 0 };
  for (const result of results) {
    for (const match of result.matches) {
      if (match.result === 'win') counts.wins += 1;
      else if (match.result === 'loss') counts.losses += 1;
      else counts.draws += 1;
    }
  }
  return counts;
}

export type CompetitorRollup = {
  studentId: string;
  name: string;
  medals: MedalCounts;
  matches: MatchCounts;
  rankingPoints: number;
  results: CompetitionResult[];
};

export type TournamentRollup = {
  tournament: string;
  results: CompetitionResult[];
};

export type AcademyCompetition = {
  scopeLabel: string;
  results: CompetitionResult[];
  medals: MedalCounts;
  matches: MatchCounts;
  rankingPoints: number;
  pointsOmitted: number;
  byCompetitor: CompetitorRollup[];
  byTournament: TournamentRollup[];
  outside: CompetitionResult[];
};

export function academyCompetition(fixture: Fixture): AcademyCompetition {
  const seen = new Set<string>();
  const results: CompetitionResult[] = [];
  const outside: CompetitionResult[] = [];
  for (const result of fixture.results) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    if (resultInAcademyScope(fixture, result)) results.push(result);
    else outside.push(result);
  }
  const byStudent = new Map<string, CompetitionResult[]>();
  const byEvent = new Map<string, CompetitionResult[]>();
  for (const result of results) {
    const students = byStudent.get(result.studentId) ?? [];
    students.push(result);
    byStudent.set(result.studentId, students);
    const events = byEvent.get(result.tournament) ?? [];
    events.push(result);
    byEvent.set(result.tournament, events);
  }
  return {
    scopeLabel: ACADEMY_SCOPE_LABEL,
    results,
    medals: medalCounts(results),
    matches: matchCounts(results),
    rankingPoints: results.reduce((sum, row) => sum + (row.rankingPoints ?? 0), 0),
    pointsOmitted: results.filter((row) => row.rankingPoints === null).length,
    byCompetitor: [...byStudent.entries()].map(([studentId, rows]) => ({
      studentId,
      name: person(fixture, studentId).name,
      medals: medalCounts(rows),
      matches: matchCounts(rows),
      rankingPoints: rows.reduce((sum, row) => sum + (row.rankingPoints ?? 0), 0),
      results: rows,
    })),
    byTournament: [...byEvent.entries()].map(([tournament, rows]) => ({ tournament, results: rows })),
    outside,
  };
}

export type AcademySummary = {
  activeProfessors: number;
  pastProfessors: number;
  uniqueProfessors: number;
  uniqueStudents: number;
  naiveStudentSum: number;
  studentMatHours: HourRollup;
  professorMatHours: HourRollup;
  promotionsHere: { belts: number; stripes: number };
  promotionsOutside: number;
  competition: AcademyCompetition;
  teamAwards: TeamAwardRollup;
};

export function academySummary(fixture: Fixture, asOf = AS_OF): AcademySummary {
  const split = splitProfessors(fixture, asOf);
  const students = academyStudentIds(fixture);
  const here = academyPromotions(fixture);
  const outside = fixture.promotions.filter((row) => row.academyId === null && professorIds(fixture).includes(row.issuerId));
  return {
    activeProfessors: split.active.length,
    pastProfessors: split.past.length,
    uniqueProfessors: split.unique.length,
    uniqueStudents: students.length,
    naiveStudentSum: naiveAttachedStudentCount(fixture),
    studentMatHours: linkedMatHourRollup(fixture, students),
    professorMatHours: linkedMatHourRollup(fixture, split.unique),
    promotionsHere: countKinds(here),
    promotionsOutside: outside.length,
    competition: academyCompetition(fixture),
    teamAwards: teamAwardRollup(fixture.teamAwards),
  };
}

export const PREVIEW_SURFACES = [
  {
    id: 'student-home',
    route: '/preview/ancestry-student',
    title: 'Student profile',
    live: 'Student Edition home, identity card',
  },
  {
    id: 'my-profile',
    route: '/preview/ancestry-student#my-profile',
    title: 'My profile',
    live: 'Student Edition My profile page',
  },
  {
    id: 'instructor',
    route: '/preview/ancestry-instructor',
    title: 'Instructor profile',
    live: 'Instructor Edition profile',
  },
  {
    id: 'academy',
    route: '/preview/ancestry-academy',
    title: 'Academy profile',
    live: 'Pro academy profile',
  },
] as const;
