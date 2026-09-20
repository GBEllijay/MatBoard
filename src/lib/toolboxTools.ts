/** Owner’s Toolbox tools (not media folders). Home + Coming soon share this list. */

export const TOOLBOX_TOOLS = [
  { id: 'tournament', to: '/tournament', label: 'Mock Tournament' },
  { id: 'techniques', to: '/techniques', label: 'Daily Techniques' },
] as const;

export type ToolboxToolId = (typeof TOOLBOX_TOOLS)[number]['id'];
