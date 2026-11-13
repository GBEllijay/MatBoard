/**
 * Advantage FAQ entries. To add one, append an object to FAQ_ENTRIES.
 * Keep `id` stable so a #hash still opens that question.
 *
 * Describe only behavior that is on main. Do not add prices, IBJJF hour
 * tables, or features that exist only on an unmerged pull request.
 */

import { ACADEMY_FREE_NOTE } from './academyPathway.ts';
import { FREE_INSTRUCTOR_SEATS, FREE_STUDENT_LICENSES } from './proBundleMath.ts';
import { PERSONAL_GRAPH_PREVIEW_BANNER } from './personalGraphPreview.ts';
import { TECHNIQUE_TREE_PREVIEW_BANNER } from './techniqueTreePreview.ts';

export const FAQ_PATH = '/faq';
export const STUDENT_FAQ_PATH = '/student/faq';
export const FAQ_ALL = 'All';

export type FaqLink = {
  label: string;
  to: string;
};

export type FaqEntry = {
  id: string;
  category: string;
  question: string;
  paragraphs: readonly string[];
  steps?: readonly string[];
  links?: readonly FaqLink[];
  /** Extra search words. Not shown on the page. */
  keywords?: string;
};

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    id: 'start-with-your-belt',
    category: 'Starting out',
    question: 'I already have a belt. Where do I start?',
    paragraphs: [
      'Start with the belt you wear today. You do not need a complete history first.',
      'Open My profile and add your name and gym if you want them on reports. Training start date is optional. Then open My rank and set the belt you wear now. Leave older belts blank until you want them.',
      'Years you trained before Advantage are still real. The app only keeps what you choose to write down.',
    ],
    links: [
      { label: 'My profile', to: '/student/profile' },
      { label: 'My rank', to: '/student/rank' },
      { label: 'Open the sample demo', to: '/student?student=1' },
    ],
    keywords: 'higher belt late welcome white blue purple brown black',
  },
  {
    id: 'promotion-history-optional',
    category: 'Starting out',
    question: 'Do I have to complete my promotion history?',
    paragraphs: [
      'No. History is optional. A belt or stripe can stay on No date. If you are not sure of the day, leave it blank. Do not invent a date to make the list look finished.',
      'When you do know a day, check your own records. Look at a photo you already have, a calendar, a certificate, or a note from your coach. You read those yourself. Advantage does not look through your photo library or Google Photos.',
      'On My rank, Add date saves a calendar day. Photo attaches a picture you choose. Photos stay on this phone.',
    ],
    links: [{ label: 'My rank', to: '/student/rank' }],
    keywords: 'stripes promotion date optional uncertain certificate',
  },
  {
    id: 'partial-date',
    category: 'Starting out',
    question: 'What if I only know the year?',
    paragraphs: [
      'The date box saves a full calendar day, or it stays empty. There is no setting for “around 2019.”',
      'Leave the date blank and add the day later if you find it. An empty date is an honest record.',
    ],
    keywords: 'month approximate unsure date',
  },
  {
    id: 'simple-routine',
    category: 'Starting out',
    question: 'What is a simple way to use this?',
    paragraphs: [
      'After class, open Today’s page and save a card, even if the time is untimed. Once a week, open Backup & Print and download the JSON. When you learn a promotion date from your own records, add that one date on My rank and leave the uncertain ones blank.',
      'Install Advantage from the browser menu if you want a home-screen icon. The notes still live in that browser until you save a JSON backup.',
    ],
    links: [
      { label: "Today's page", to: '/student/journal' },
      { label: 'Backup & Print', to: '/student/backup' },
      { label: 'My rank', to: '/student/rank' },
    ],
    keywords: 'routine tips tricks best way install home screen',
  },
  {
    id: 'log-a-class',
    category: 'Journal and mat time',
    question: 'How do I log a class?',
    paragraphs: [
      'Open Training & Journal, then Today’s page. Set the date, name the class if you want, and write partners, drills, rolls, and notes. Techniques drilled is optional. Mat time is optional too.',
      'Save entry keeps the card on this device. Journal cards is where you search what you saved.',
    ],
    links: [
      { label: "Today's page", to: '/student/journal' },
      { label: 'Journal cards', to: '/student/cards' },
      { label: 'Calendar', to: '/student/calendar' },
    ],
    keywords: 'journal training notes class partners drills rolls',
  },
  {
    id: 'mat-hours',
    category: 'Journal and mat time',
    question: 'What do mat hours mean?',
    paragraphs: [
      'Mat hours are minutes you logged in the journal. The profile label says “Mat hours · from your journal.” Untimed cards add nothing. The same day and the same session update one line, so logging twice does not double the time.',
      'A low total is not your lifetime on the mat. It means the log is new. There is no bank, and no switch, for estimated hours from before you used the app. My report card can show a separate planning estimate by belt. That estimate is not added to these hours.',
      'Mat time stays in your journal. Coaches don’t see it.',
    ],
    steps: [
      'On My profile, tap the mat hours total to log time.',
      'On the calendar, Mark trained adds an untimed card. Add time, or Log more time, opens the log.',
    ],
    links: [
      { label: 'My profile', to: '/student/profile' },
      { label: 'My report card', to: '/student/report' },
      { label: 'Calendar', to: '/student/calendar' },
    ],
    keywords: 'hours lifetime experience untimed pre-app bank toggle',
  },
  {
    id: 'backdate',
    category: 'Journal and mat time',
    question: 'Can I write an old class?',
    paragraphs: [
      'Yes. Change the date on Today’s page, or open that day on the calendar and use Start a card for this day. You can also edit the date on a saved card.',
      'The quick log on the profile does not take a future date.',
    ],
    links: [
      { label: "Today's page", to: '/student/journal' },
      { label: 'Calendar', to: '/student/calendar' },
    ],
    keywords: 'backdate past class missed day',
  },
  {
    id: 'fundamentals',
    category: 'Fundamentals',
    question: 'What is Fundamentals?',
    paragraphs: [
      'Open Rank & Progress, then Fundamentals. Each move has a level: Not started, Introduced, Drilling, Live with resistance, Hitting in rolls, or Can teach it. Kids see simpler words for the same scale.',
      'You can filter the list, add a move of your own, and use Restore starter list if you want the original list back. It is saved with your Student Edition file on this device.',
    ],
    links: [{ label: 'Fundamentals', to: '/student/fundamentals' }],
    keywords: 'checklist levels proficiency',
  },
  {
    id: 'belt-progress',
    category: 'Fundamentals',
    question: 'What is Belt progress?',
    paragraphs: [
      'Belt progress is practical benchmarks and personal goals for the belt you are on. It is separate from Fundamentals, and separate from the dates on My rank.',
      'Advantage does not set requirements or include a benchmark list. Each belt, kids belts included, starts with three editable prompts for practical benchmarks and three for personal goals. Black belt and up start with one blank practical benchmark to fill in instead of the three prompts. They are seeds, not requirements: rename them to what your instructor actually said, add more with Add another, and delete what does not fit.',
      'You can leave goals blank.',
    ],
    links: [{ label: 'Belt progress', to: '/student/rubric' }],
    keywords: 'rubric benchmarks goals',
  },
  {
    id: 'no-shared-index',
    category: 'Fundamentals',
    question: 'Is there a technique graph that follows me from belt to belt?',
    paragraphs: [
      'Open Training & Journal, then Techniques I’m working on. The list and the tree are the same techniques, saved in your Student Edition file on this device. A step points at a technique that is already on the list. It does not make a second copy.',
      'On a journal card, Techniques drilled can add or link a name to that list. Fundamentals stay a smaller checklist. Adding a name does not mark it learned.',
      'Export tree makes a file you send yourself. Import tree shows a preview first. Nothing is added until you press Accept import. If a parent approval is on, the import waits.',
      'That list is yours. A shared index of every belt is not available. There is no place to enter a guessed total of time from before you used the app.',
      'The Instructor Technique Tree remains the coach tool on the coach’s phone.',
      `A page that says “${PERSONAL_GRAPH_PREVIEW_BANNER}” is an illustration. It is not your saved list.`,
      `A page that says “${TECHNIQUE_TREE_PREVIEW_BANNER}” is a separate draft. It is not your working list and not the live coach Technique Tree.`,
    ],
    links: [
      { label: "Techniques I'm working on", to: '/student/working' },
      { label: 'Fundamentals', to: '/student/fundamentals' },
      { label: 'Journal', to: '/student/journal' },
    ],
    keywords: 'working techniques graph preview 3d index curriculum',
  },
  {
    id: 'photos',
    category: 'Profile and photos',
    question: 'How do profile and belt photos work?',
    paragraphs: [
      'On My profile, use Take photo or Choose photo. On My rank, use Photo on the belt or stripe you are editing. You pick the file. Advantage does not scan your camera roll for promotion pictures.',
      'Profile photos stay on this phone. Nothing is uploaded unless you export a report or a backup with that switch on. A file you make for your coach can include rank photos when the file has room.',
    ],
    links: [
      { label: 'My profile', to: '/student/profile' },
      { label: 'My rank', to: '/student/rank' },
      { label: 'Make a file for my coach', to: '/student/share' },
    ],
    keywords: 'camera library picture portrait',
  },
  {
    id: 'backup-phone',
    category: 'Backups',
    question: 'How do I back up, and how do I move to another phone?',
    paragraphs: [
      'Open Backup & Print or Connections. Download student packet (.advantage) is the file that can restore this phone. It holds the journal, self-assessment, ranks, index cards, and a spreadsheet. After you choose that file, pick Merge with this phone or Replace this phone. Merge keeps notes that exist only on this phone. Replace removes the journal on this phone and uses the file. An older JSON backup still restores the same way.',
      'A spreadsheet or a PDF is for reading or printing. Those files do not restore the journal. The spreadsheet is also inside the packet.',
      'The journal lives on this device. Another phone, or a cleared browser, does not have it until you restore a packet. Clear all Student Edition data affects only Student Edition on this device. Back up first. Unlock codes and drive connections stay.',
      'You can connect Google Drive or OneDrive and copy the packet into that folder when you export. That copy happens because you exported. The app does not sync the journal on its own. Google Photos is not a backup folder in this build.',
    ],
    links: [
      { label: 'Backup & Print', to: '/student/backup' },
      { label: 'Connections', to: '/student/connections' },
    ],
    keywords: 'json csv pdf packet advantage restore import google drive onedrive local storage',
  },
  {
    id: 'backup-vs-restore-vs-cloud',
    category: 'Backups',
    question: 'What is the difference between a backup, Restore a purchase, and Cloud?',
    paragraphs: [
      'They are three different tools.',
      'A student packet is your journal, self-assessment, rank, index cards, and the related notes in that file. An older JSON backup is the same idea in the previous file.',
      'Restore a purchase uses the email from checkout. Advantage emails a one-time code. Confirm puts the purchase on this device. It does not bring journal entries back. The code expires and works once. If it does not arrive in a few minutes, check your spam or junk folder.',
      'A Google Drive or OneDrive folder is a place you connect. The academy folder is one your coach shared. You sign in with your own account. Advantage Cloud, when a gym has it, is hosted sharing for that gym’s cloud tools. It is not a hosted copy of your personal journal. If Cloud sharing pauses, the screen can show the days left to download the gym folder. The journal on the phone is separate.',
      'Buying an edition does not upload the journal. Work you type in the Student Edition demo on this phone can be saved into Student Edition when the purchase opens that edition and the real file is empty. Student, Media, Instructor, and Pro include Student Edition. White does not, so that demo stays on this phone and is not opened.',
      'If Student Edition already has a file, choose Keep the file on this phone or Use the demo copy. The purchase does not replace the file unless you choose the demo copy. The sample seed on the demo screen is not kept. Video files and photos from the demo are not copied. The example technique cloud is not part of this save.',
    ],
    links: [
      { label: 'Restore a purchase', to: '/restore' },
      { label: 'Connections', to: '/student/connections' },
      { label: 'Open the sample demo', to: '/student?student=1' },
    ],
    keywords: 'entitlement license sync cloud drive purchase',
  },
  {
    id: 'which-edition',
    category: 'Purchases and access',
    question: 'Which edition opens which tools?',
    paragraphs: [
      'A higher edition opens the editions under it. White does not open the journal. Student Edition does not open the instructor tools.',
      'White opens the scoreboard and round timer. Student Edition opens the journal, rank, fundamentals, calendar, competitor pages, and backups, and it also opens White. Media opens Media Console — Gallery, Class Schedule, Pro Shop, and Events — and also opens Student and White, when Media is open on this browser. Instructor opens the coach tools, including Daily Lesson Plan, Daily Training Videos, Technique Tree, and Student Roster, and it also opens Media, Student, and White. Pro opens the gym owner console and the editions under it.',
      `Pro includes ${FREE_INSTRUCTOR_SEATS} free instructor seats and ${FREE_STUDENT_LICENSES} free Student Edition licenses.`,
      'Prices and alpha notes stay on the edition pages. This FAQ does not copy them.',
    ],
    links: [
      { label: 'Advantage White', to: '/buy' },
      { label: 'Student Edition', to: '/editions/student' },
      { label: 'Media Edition', to: '/media' },
      { label: 'Instructor Edition', to: '/editions/instructor' },
      { label: 'Advantage Pro', to: '/editions/pro' },
      { label: 'Restore a purchase', to: '/restore' },
    ],
    keywords: 'tier access buy white student media instructor coach pro price',
  },
  {
    id: 'keep-the-journal',
    category: 'Purchases and access',
    question: 'Will my journal last from white belt to instructor?',
    paragraphs: [
      'You can keep the same Student Edition file while your belt changes. Rank, journal, and fundamentals stay in that file on the device, and in the student packet you save. Keep a backup when you change phones.',
      'Advantage does not promise a fixed number of years of support, and it does not promise that every future version will migrate every file. The backup file you keep is the copy you control.',
    ],
    links: [{ label: 'Backup & Print', to: '/student/backup' }],
    keywords: 'longevity lifetime white belt instructor migration support',
  },
  {
    id: 'academy-connect',
    category: 'Academy',
    question: 'How does a student connect to an academy?',
    paragraphs: [
      `Open Coach & Academy, then Connect to my academy. Scan the gym QR or paste the invite link, then sign in to Google Drive or OneDrive. The coach has to share the folder so you can add files. ${ACADEMY_FREE_NOTE}`,
      'This folder is not Advantage Cloud, and connecting it does not upload your whole journal by itself.',
      'From the same menu you can make a file for your coach, or import a coach plan or feedback file. You send the file yourself.',
    ],
    links: [
      { label: 'Connect to my academy', to: '/student/academy' },
      { label: 'Coach & Academy', to: '/student/coach' },
      { label: 'Make a file for my coach', to: '/student/share' },
    ],
    keywords: 'qr invite drive onedrive academy folder',
  },
  {
    id: 'invites-and-licenses',
    category: 'Academy',
    question: 'How do instructor invites and free Student licenses work?',
    paragraphs: [
      'On Pro, the owner can generate an instructor invite. The role picks which menus open. The app does not email that invite, and it does not copy a student’s journal onto the new phone.',
      'A student claims a free Student license with an email on this phone. That opens Student Edition here. If the gym uses Advantage Cloud, that license can open that student’s own academy inbox. It does not open coach lesson files, private coach notes, or other students.',
      'A paid Advantage Cloud add-on opens the gym’s Advantage Cloud files for an accepted instructor seat. What that seat can read or upload follows its role. A seat that was not accepted, or a gym without that add-on, does not get those files.',
      'That Cloud folder is not your personal journal, and it is not the Google Drive or OneDrive folder from the academy QR. A free Student license can still open only that student’s own academy inbox when the gym has Cloud. These are the access rules in the app.',
    ],
    links: [
      { label: 'Advantage Pro', to: '/editions/pro' },
      { label: 'Connect to my academy', to: '/student/academy' },
    ],
    keywords: 'seat invite claim license cloud inbox',
  },
];

export function faqCategories(entries: readonly FaqEntry[] = FAQ_ENTRIES): string[] {
  const seen: string[] = [];
  for (const entry of entries) {
    if (!seen.includes(entry.category)) seen.push(entry.category);
  }
  return seen;
}

export function faqHaystack(entry: FaqEntry): string {
  return [
    entry.category,
    entry.question,
    ...entry.paragraphs,
    ...(entry.steps ?? []),
    ...(entry.links ?? []).flatMap((link) => [link.label, link.to]),
    entry.keywords ?? '',
  ]
    .join('\n')
    .toLowerCase();
}

/** Every word in the query must appear. Category All keeps every topic. */
export function filterFaq(entries: readonly FaqEntry[], query: string, category: string): FaqEntry[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (category !== FAQ_ALL && entry.category !== category) return false;
    if (tokens.length === 0) return true;
    const haystack = faqHaystack(entry);
    return tokens.every((token) => haystack.includes(token));
  });
}

/**
 * Public FAQ links into Student Edition open the labeled sample demo.
 * Purchase, restore, and edition pages stay on their own routes.
 */
export function faqHref(path: string, demo: boolean): string {
  if (!demo || !path.startsWith('/student')) return path;
  const hashAt = path.indexOf('#');
  const hash = hashAt >= 0 ? path.slice(hashAt) : '';
  const before = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const [pathname, search = ''] = before.split('?');
  const next = new URLSearchParams(search);
  next.set('student', '1');
  return `${pathname}?${next.toString()}${hash}`;
}
