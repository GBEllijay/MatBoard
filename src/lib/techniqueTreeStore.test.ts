import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TREE_NAME,
  MAX_TREE_DEPTH,
  MAX_TREE_NODES,
  NOTES_MAX,
  TECHNIQUE_TREE_STORAGE_KEY,
  TITLE_MAX,
  addChild,
  canAddChild,
  countNodes,
  descendantCount,
  emptyTree,
  loadTechniqueTree,
  removeNode,
  renameTree,
  saveTechniqueTree,
  setRoot,
  toggleCollapsed,
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
  const doc = loadTechniqueTree();
  assert.equal(doc.version, 1);
  assert.equal(doc.name, DEFAULT_TREE_NAME);
  assert.equal(doc.root, null);
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
  assert.equal(JSON.parse(localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY) ?? '').version, 1);

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

test('clearing the tree removes the base and saves the empty doc', () => {
  storage.clear();
  const saved = saveTechniqueTree(setRoot(emptyTree(), 'Back', ''));
  assert.equal(saved.doc.root?.title, 'Back');
  const cleared = saveTechniqueTree(emptyTree());
  assert.equal(cleared.doc.root, null);
  assert.equal(loadTechniqueTree().root, null);
  assert.equal(loadTechniqueTree().name, DEFAULT_TREE_NAME);
});
