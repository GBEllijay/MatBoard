/**
 * Fictional example for the ancestry-scope preview.
 * Teaching ancestry is who taught whom. It is not an employment chart
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
  /** This person's own training hours. Not a total of anyone they teach. */
  ownMatHours: number;
  /** Hours this person spent teaching. Students stay at 0. */
  ownTeachingHours: number;
};

/** Primary-teacher step. The learner is below the teacher. */
export type AncestryEdge = {
  id: string;
  teacherId: string;
  learnerId: string;
  from: string;
  to: string | null;
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
  { id: 'ivo', name: 'Professor Ivo Serra', belt: 'black', ownMatHours: 9000, ownTeachingHours: 4000 },
  { id: 'nia', name: 'Professor Nia Calder', belt: 'black', ownMatHours: 7200, ownTeachingHours: 3100 },
  { id: 'soren', name: 'Professor Soren Hale', belt: 'black', ownMatHours: 6800, ownTeachingHours: 2500 },
  { id: 'ellis', name: 'Professor Ellis Ward', belt: 'black', ownMatHours: 4180, ownTeachingHours: 860 },
  { id: 'jonah', name: 'Professor Jonah Peck', belt: 'black', ownMatHours: 3900, ownTeachingHours: 700 },
  { id: 'adele', name: 'Professor Adele Voss', belt: 'black', ownMatHours: 5100, ownTeachingHours: 1400 },
  { id: 'lila', name: 'Professor Lila Quinn', belt: 'black', ownMatHours: 3600, ownTeachingHours: 500 },
  { id: 'mira', name: 'Mira Chen', belt: 'purple', ownMatHours: 640, ownTeachingHours: 0 },
  { id: 'theo', name: 'Theo Lang', belt: 'blue', ownMatHours: 210, ownTeachingHours: 0 },
  { id: 'sam', name: 'Sam Ortiz', belt: 'white', ownMatHours: 36, ownTeachingHours: 0 },
  { id: 'noa', name: 'Noa Kim', belt: 'brown', ownMatHours: 880, ownTeachingHours: 0 },
  { id: 'ren', name: 'Coach Ren Park', belt: 'brown', ownMatHours: 1200, ownTeachingHours: 80 },
  { id: 'rae', name: 'Rae Pell', belt: 'blue', ownMatHours: 400, ownTeachingHours: 0 },
];

const ANCESTRY: readonly AncestryEdge[] = [
  { id: 'edge-ivo-nia', teacherId: 'ivo', learnerId: 'nia', from: '1994-01-01', to: '1998-06-01' },
  { id: 'edge-ivo-adele', teacherId: 'ivo', learnerId: 'adele', from: '1999-01-01', to: '2004-11-01' },
  { id: 'edge-nia-ellis', teacherId: 'nia', learnerId: 'ellis', from: '2008-01-01', to: '2014-05-20' },
  { id: 'edge-nia-jonah', teacherId: 'nia', learnerId: 'jonah', from: '2006-01-01', to: '2011-08-12' },
  { id: 'edge-soren-lila', teacherId: 'soren', learnerId: 'lila', from: '1996-01-01', to: '2002-04-01' },
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
  };
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

export function ownMatHours(fixture: Fixture, ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + person(fixture, id).ownMatHours, 0);
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

export type InstructorSummary = {
  professorId: string;
  status: 'active' | 'past';
  ownMatHours: number;
  ownTeachingHours: number;
  attachedStudentIds: string[];
  attachedStudentMatHours: number;
  issuedHere: { belts: number; stripes: number };
  issuedLifetime: { belts: number; stripes: number };
};

export function instructorSummary(fixture: Fixture, professorId: string, asOf = AS_OF): InstructorSummary {
  const split = splitProfessors(fixture, asOf);
  const students = attachedStudentIds(fixture, professorId);
  const row = person(fixture, professorId);
  return {
    professorId,
    status: split.active.includes(professorId) ? 'active' : 'past',
    ownMatHours: row.ownMatHours,
    ownTeachingHours: row.ownTeachingHours,
    attachedStudentIds: students,
    attachedStudentMatHours: ownMatHours(fixture, students),
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
  studentMatHours: number;
  professorOwnMatHours: number;
  promotionsHere: { belts: number; stripes: number };
  promotionsOutside: number;
  competition: AcademyCompetition;
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
    studentMatHours: ownMatHours(fixture, students),
    professorOwnMatHours: ownMatHours(fixture, split.unique),
    promotionsHere: countKinds(here),
    promotionsOutside: outside.length,
    competition: academyCompetition(fixture),
  };
}

export const PREVIEW_SURFACES = [
  {
    id: 'student-home',
    route: '/preview/ancestry-student',
    title: 'Student home',
    live: 'Student Edition home, identity zone on the character sheet',
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
    title: 'Instructor',
    live: 'Instructor Edition profile',
  },
  {
    id: 'academy',
    route: '/preview/ancestry-academy',
    title: 'Academy',
    live: 'Pro gym character sheet, academy scope',
  },
] as const;
