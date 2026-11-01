/**
 * Big Shoulders Display maps "./*" to "./*.css" in its exports, so its weight files are
 * imported without the ".css" suffix. Side-effect CSS only; nothing is exported.
 */
declare module '@fontsource/big-shoulders-display/*';
