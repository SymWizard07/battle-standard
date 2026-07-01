import type { ComponentType } from 'react';
import { APP_TITLE } from '../../hooks/useDocumentTitle';
import {
  DrawInfoIcon,
  FogInfoIcon,
  HostingInfoIcon,
  MeasureInfoIcon,
  PlayerViewInfoIcon,
  SceneEditInfoIcon,
  ScenesInfoIcon,
  TokensInfoIcon,
  ToolsInfoIcon,
} from './InfoSectionIcons';

type InfoSection = {
  id: string;
  title: string;
  body: string[];
  icon: ComponentType<{ className?: string }>;
};

export const INFO_INTRO =
  `${APP_TITLE} is a scene-deck tracker for D&D 5e: switch scenes, run combat on a grid, manage tokens, fog, and measurements. Your campaign saves locally in the browser; online play uses a room code so the GM and players stay in sync.`;

export const INFO_SECTIONS: InfoSection[] = [
  {
    id: 'scenes',
    title: 'Scenes & the scene deck',
    icon: ScenesInfoIcon,
    body: [
      'Each campaign has multiple scenes (maps). Use the scene deck on the left to switch between them.',
      'When you host a session and pick a scene, connected players follow you to that scene automatically.',
      'Scene thumbnails update as you play so you can spot the right map at a glance.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting & joining',
    icon: HostingInfoIcon,
    body: [
      'Set your display name on the home page before you create or join a campaign.',
      'In the Players tool (P), click Host to start a room. Share the room code — players join from the home page.',
      'The Online / Offline badge on the Players tool shows whether you are connected to peers.',
      'Campaign data lives in this browser. Sync shares the live scene state; players should use the same room code in their own campaign entry created by Join.',
    ],
  },
  {
    id: 'tools',
    title: 'Tools & hotkeys',
    icon: ToolsInfoIcon,
    body: [
      'Press a letter in brackets on the bottom toolbar to switch tools: Pan (H), Select (S), Scene (E), Fog (F), Measure (R), Draw (D), Players (P).',
      'Middle mouse button pans the map no matter which tool is active. Scroll or pinch to zoom.',
      'Undo and redo use Ctrl+Z and Ctrl+Y (Cmd on Mac).',
      'Open Settings with F2 or Ctrl+, (Cmd+, on Mac). Works even if the Scenes panel is not in your layout.',
    ],
  },
  {
    id: 'scene-edit',
    title: 'Scene edit — grid vs map',
    icon: SceneEditInfoIcon,
    body: [
      'The grid and your map image are separate. Moving the map does not move the grid.',
      'Grid → Edit: click an anchor on the map, then drag to set cell size. Use Auto size to fit a selected map image to the grid.',
      'Map → Edit: upload a background, then drag to move it or use corner handles to scale. Align to grid snaps the map corner to the grid.',
      'Hide grid only affects what you see — it does not change the grid used for tokens and measurements.',
    ],
  },
  {
    id: 'tokens',
    title: 'Tokens',
    icon: TokensInfoIcon,
    body: [
      'Drag tokens from the library onto the map. You can also paste an image from your clipboard while the map is focused.',
      'Select a token to open the context panel: rename, HP, status effects, visibility, and movement lock.',
      'Hidden tokens are still visible to the GM at reduced opacity. Use the visibility toggle when players should not see a token.',
      'Your name on the home page sets your player color for drawings and measurements.',
    ],
  },
  {
    id: 'fog',
    title: 'Fog of war',
    icon: FogInfoIcon,
    body: [
      'Only the GM can edit fog. Players see fog the GM has placed; they cannot paint it away.',
      'Hide adds fog; Reveal removes it. Stroke, rectangle, cone, and sphere shapes match the measure tools.',
      'Full fog covers the map until you reveal areas. Clear fog removes all fog data on the scene.',
      'Preview shows opaque player fog so you can check what players will see.',
    ],
  },
  {
    id: 'measurements',
    title: 'Measurements',
    icon: MeasureInfoIcon,
    body: [
      'Drag to place lines, cones, cubes, or spheres. Labels show distance or radius in feet (5 ft per grid square).',
      'VTT mode draws smooth shapes. 5e mode highlights the grid squares included by the rules — toggle with the VTT / 5e button.',
      'Without Pin, measurements fade away after you finish. Turn Pin on to keep them; pinned measures show a dismiss control.',
      'While measuring, tokens inside the area get a colored outline so you can see who is affected.',
    ],
  },
  {
    id: 'draw',
    title: 'Draw',
    icon: DrawInfoIcon,
    body: [
      'Draw freehand strokes, lines, shapes, and cones on the map. Pick a color with the swatch.',
      'Drag the outline slider left for thinner strokes or right for thicker; the default width is at the center. You can also use + / − keys while drawing.',
      'Erase removes drawn strokes under the brush. In Select, enable Select drawn shapes to move or delete them.',
    ],
  },
  {
    id: 'player-view',
    title: 'Player view (GM)',
    icon: PlayerViewInfoIcon,
    body: [
      'In the Players tool, Player view previews what players see — fog, hidden tokens, and restricted tools — without leaving the session.',
      'Switch back to GM view to resume full control.',
    ],
  },
];
