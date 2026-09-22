import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TREE_NAME,
  MAX_TREE_DEPTH,
  MAX_TREE_NODES,
  MAX_TREES,
  NOTES_MAX,
  TECHNIQUE_TREE_STORAGE_KEY,
  TITLE_MAX,
  activeTree,
  addChild,
  addTree,
  canAddChild,
  countNodes,
  deleteTree,
  descendantCount,
  emptyTree,
  loadTechniqueArchive,
  loadTechniqueTree,
  removeNode,
  renameTree,
  saveTechniqueArchive,
  saveTechniqueTree,
  selectTree,
  setRoot,
  toggleCollapsed,
  updateActive,
  updateNode,
} from './techniqueTreeStore.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

test('a fresh tree is empty and does not write storage', () => {
  storage.clear();
  const archive = loadTechniqueArchive();
  assert.equal(archive.version, 2);
  assert.equal(archive.trees.length, 1);
  assert.equal(activeTree(archive).name, DEFAULT_TREE_NAME);
  assert.equal(activeTree(archive).root, null);
  assert.equal(localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY), null);
  assert.equal(TECHNIQUE_TREE_STORAGE_KEY, 'matboard.coach.techniqueTree.v1');
});

test('set root, branch, and defense round-trip on this device', () => {
  storage.clear();
  let doc = setRoot(emptyTree(), 'Closed guard', 'Knees on the biceps');
  const branch = addChild(doc, doc.root!.id, 'branch');
  doc = updateNode(branch.doc, branch.id!, { title: 'Triangle', notes: 'Angle off' });
  const defense = addChild(doc, doc.root!.id, 'defense');
  doc = updateNode(defense.doc, defense.id!, { title: 'Posture up' });
  const armbar = addChild(doc, branch.id!, 'branch');
  doc = updateNode(armbar.doc, armbar.id!, { title: 'Armbar' });
  const saved = saveTechniqueTree(doc);
  assert.equal(saved.saved, true);

  const loaded = loadTechniqueTree();
  assert.equal(loaded.name, 'Technique Tree');
  assert.equal(loaded.root?.kind, 'root');
  assert.equal(loaded.root?.title, 'Closed guard');
  assert.equal(loaded.root?.notes, 'Knees on the biceps');
  assert.equal(loaded.root?.slotId.length, doc.root!.slotId.length);
  assert.notEqual(loaded.root?.id, loaded.root?.slotId);
  assert.equal(loaded.root?.children.length, 2);
  assert.equal(loaded.root?.children[0].kind, 'branch');
  assert.equal(loaded.root?.children[0].title, 'Triangle');
  assert.equal(loaded.root?.children[0].notes, 'Angle off');
  assert.equal(loaded.root?.children[0].children[0].title, 'Armbar');
  assert.equal(loaded.root?.children[1].kind, 'defense');
  assert.equal(loaded.root?.children[1].title, 'Posture up');
  assert.equal(loaded.root?.id, doc.root?.id);
  assert.equal(loaded.root?.slotId, doc.root?.slotId);
});

test('collapse hides the flag and a new child opens the parent', () => {
  storage.clear();
  let doc = setRoot(emptyTree(), 'Mount', '');
  const first = addChild(doc, doc.root!.id, 'branch');
  doc = updateNode(first.doc, first.id!, { title: 'Armbar' });
  doc = toggleCollapsed(doc, doc.root!.id);
  assert.equal(doc.root?.collapsed, true);
  const next = addChild(doc, doc.root!.id, 'defense');
  assert.equal(next.doc.root?.collapsed, false);
  assert.equal(next.doc.root?.children[1].kind, 'defense');
  assert.equal(descendantCount(next.doc.root!), 2);
});

test('delete removes a leaf immediately and a parent drops its children', () => {
  let doc = setRoot(emptyTree(), 'Side control', '');
  const attack = addChild(doc, doc.root!.id, 'branch');
  doc = attack.doc;
  const counter = addChild(doc, attack.id!, 'defense');
  doc = updateNode(counter.doc, counter.id!, { title: 'Frame and shrimp' });
  const kept = addChild(doc, doc.root!.id, 'branch');
  doc = updateNode(kept.doc, kept.id!, { title: 'Knee on belly' });
  doc = removeNode(doc, counter.id!);
  assert.equal(doc.root?.children[0].children.length, 0);
  assert.equal(doc.root?.children[1].title, 'Knee on belly');
  doc = removeNode(doc, attack.id!);
  assert.equal(doc.root?.children.length, 1);
  assert.equal(doc.root?.children[0].title, 'Knee on belly');
  doc = removeNode(doc, doc.root!.id);
  assert.equal(doc.root, null);
});

test('depth and node caps stop new children', () => {
  let doc = setRoot(emptyTree(), 'Base', '');
  let parentId = doc.root!.id;
  for (let depth = 0; depth < MAX_TREE_DEPTH; depth += 1) {
    const added = addChild(doc, parentId, 'branch');
    assert.ok(added.id);
    doc = added.doc;
    parentId = added.id!;
  }
  assert.equal(canAddChild(doc, parentId), false);
  assert.equal(addChild(doc, parentId, 'defense').id, null);
  assert.equal(countNodes(doc.root), MAX_TREE_DEPTH + 1);

  doc = setRoot(emptyTree(), 'Wide', '');
  for (let i = 0; i < MAX_TREE_NODES - 1; i += 1) {
    const added = addChild(doc, doc.root!.id, i % 2 === 0 ? 'branch' : 'defense');
    assert.ok(added.id);
    doc = added.doc;
  }
  assert.equal(countNodes(doc.root), MAX_TREE_NODES);
  assert.equal(canAddChild(doc, doc.root!.id), false);
  assert.equal(addChild(doc, doc.root!.id, 'branch').doc, doc);
});

test('titles and notes clamp, and a blank name stays Technique Tree', () => {
  const doc = setRoot(emptyTree(), 'T'.repeat(TITLE_MAX + 20), 'N'.repeat(NOTES_MAX + 20));
  assert.equal(doc.root?.title.length, TITLE_MAX);
  assert.equal(doc.root?.notes.length, NOTES_MAX);
  assert.equal(renameTree(doc, '   ').name, DEFAULT_TREE_NAME);
  assert.equal(renameTree(doc, 'Gi attacks').name, 'Gi attacks');
});

test('corrupt storage repairs into one tree document', () => {
  storage.clear();
  localStorage.setItem(TECHNIQUE_TREE_STORAGE_KEY, '{');
  assert.equal(loadTechniqueTree().root, null);
  assert.equal(JSON.parse(localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY) ?? '').version, 2);

  localStorage.setItem(
    TECHNIQUE_TREE_STORAGE_KEY,
    JSON.stringify({
      name: '  No-gi  ',
      root: {
        title: 'Half guard',
        kind: 'nope',
        collapsed: true,
        children: [
          {
            id: 'same',
            slotId: 'slot-a',
            kind: 'defense',
            title: 'Knee shield',
            notes: 'Long',
            collapsed: true,
            children: [],
          },
          { id: 'same', kind: 'attack', title: 'Dogfight', children: [{ title: 'Come up' }] },
        ],
      },
    }),
  );
  const loaded = loadTechniqueTree();
  assert.equal(loaded.name, 'No-gi');
  assert.equal(loaded.root?.kind, 'root');
  assert.equal(loaded.root?.collapsed, true);
  assert.equal(loaded.root?.children[0].kind, 'defense');
  assert.equal(loaded.root?.children[0].collapsed, false);
  assert.equal(loaded.root?.children[0].id, 'same');
  assert.notEqual(loaded.root?.children[1].id, 'same');
  assert.equal(loaded.root?.children[1].kind, 'branch');
  assert.equal(loaded.root?.children[1].children[0].title, 'Come up');
  assert.ok(loaded.root?.children[1].slotId);
  const again = loadTechniqueTree();
  assert.equal(again.root?.children[1].id, loaded.root?.children[1].id);
});

test('adding a tree keeps the first one, and only delete removes it', () => {
  storage.clear();
  let archive = saveTechniqueArchive({
    version: 2,
    activeId: 'keep',
    trees: [
      {
        id: 'keep',
        name: 'Closed guard',
        root: setRoot(emptyTree(), 'Closed guard', 'Knees on the biceps').root,
      },
    ],
  }).archive;
  const added = addTree(archive);
  assert.equal(added.status, 'added');
  archive = saveTechniqueArchive(added.archive).archive;
  assert.equal(archive.trees.length, 2);
  assert.equal(archive.trees[0].root?.title, 'Closed guard');
  assert.equal(archive.trees[0].root?.notes, 'Knees on the biceps');
  assert.equal(activeTree(archive).root, null);
  assert.notEqual(activeTree(archive).id, 'keep');

  archive = saveTechniqueArchive(
    updateActive(archive, setRoot(activeTree(archive), 'Mount', 'Heavy')),
  ).archive;
  archive = selectTree(archive, 'keep');
  assert.equal(activeTree(archive).root?.title, 'Closed guard');
  const reloaded = loadTechniqueArchive();
  assert.equal(reloaded.trees.length, 2);
  assert.equal(reloaded.trees.find((tree) => tree.id === 'keep')?.root?.title, 'Closed guard');
  assert.equal(reloaded.trees.find((tree) => tree.root?.title === 'Mount')?.root?.notes, 'Heavy');

  const removed = deleteTree(reloaded, 'keep');
  assert.equal(removed.trees.some((tree) => tree.id === 'keep'), false);
  assert.equal(removed.trees.some((tree) => tree.root?.title === 'Mount'), true);
  assert.equal(addTree({ ...reloaded, trees: reloaded.trees }).archive.trees.some((tree) => tree.id === 'keep'), true);
});

test('a saved version 1 tree migrates and stays when another tree is added', () => {
  storage.clear();
  localStorage.setItem(
    TECHNIQUE_TREE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      name: 'Gi',
      root: {
        id: 'base',
        slotId: 'slot-base',
        kind: 'root',
        title: 'Closed guard',
        notes: '',
        collapsed: false,
        children: [],
      },
    }),
  );
  const migrated = loadTechniqueArchive();
  assert.equal(migrated.version, 2);
  assert.equal(migrated.trees.length, 1);
  assert.equal(activeTree(migrated).name, 'Gi');
  assert.equal(activeTree(migrated).root?.title, 'Closed guard');
  assert.equal(activeTree(migrated).root?.slotId, 'slot-base');
  const added = addTree(migrated);
  assert.equal(added.status, 'added');
  const saved = saveTechniqueArchive(added.archive).archive;
  const again = loadTechniqueArchive();
  assert.equal(again.trees.length, 2);
  assert.equal(again.trees.find((tree) => tree.name === 'Gi')?.root?.slotId, 'slot-base');
  assert.equal(saved.trees.length, 2);
});

test('the tree cap refuses another tree and leaves the saved ones alone', () => {
  let current = setRoot(emptyTree('Tree 1'), 'Tree 1', '');
  let archive = { version: 2 as const, activeId: current.id, trees: [current] };
  for (let n = 2; n <= MAX_TREES; n += 1) {
    const added = addTree(archive);
    assert.equal(added.status, 'added');
    archive = updateActive(added.archive, setRoot(activeTree(added.archive), `Tree ${n}`, ''));
  }
  assert.equal(archive.trees.length, MAX_TREES);
  const blocked = addTree(archive);
  assert.equal(blocked.status, 'full');
  assert.equal(blocked.archive, archive);
  assert.equal(blocked.archive.trees[0].root?.title, 'Tree 1');
  assert.equal(blocked.archive.trees[MAX_TREES - 1].root?.title, `Tree ${MAX_TREES}`);
  const open = addTree(updateActive(archive, { ...activeTree(archive), root: null }));
  assert.equal(open.status, 'open');
  assert.equal(open.archive.trees.length, MAX_TREES);
});
