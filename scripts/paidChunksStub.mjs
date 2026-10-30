/**
 * esbuild plugin for the node regression runners. Vite builds `virtual:paid-chunks`.
 * These tests never load a paid screen, so an empty file list is enough.
 */
export const paidChunksStub = {
  name: 'paid-chunks-stub',
  setup(build) {
    build.onResolve({ filter: /^virtual:paid-chunks$/ }, () => ({ path: 'paid-chunks', namespace: 'paid-chunks-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'paid-chunks-stub' }, () => ({
      contents: 'export const PAID_CHUNK_FILES = {};',
      loader: 'js',
    }));
  },
};
