import type { ComponentType } from 'react';
import { SceneDeck } from '../scene-deck/SceneDeck';
import { TokenLibraryPanel } from '../token-library/TokenLibraryPanel';
import { ToolBar } from '../toolbar/ToolBar';
import { ToolOptionsBar } from '../toolbar/ToolOptionsBar';
import type { ModuleId } from './schema/layoutSchema';
import { useLayoutModuleContext } from './LayoutModuleContext';
import { CanvasModule } from './modules/CanvasModule';
import { ImportsModule } from './modules/ImportsModule';
import { InfoModule } from './modules/InfoModule';
import { InitiativeModule } from './modules/InitiativeModule';
import { SettingsModule } from './modules/SettingsModule';

function ScenesModule() {
  const { device } = useLayoutModuleContext();
  const compact = device !== 'desktop';
  return (
    <SceneDeck
      variant={compact ? 'inline' : 'module'}
      open={false}
      onClose={() => {}}
    />
  );
}

function TokensModule() {
  return (
    <TokenLibraryPanel variant="module" open={false} onClose={() => {}} />
  );
}

function ToolOptionsModule() {
  return (
    <div className="flex h-full min-h-0 items-stretch border-b border-slate-700 bg-slate-900/95 px-1 py-0.5">
      <ToolOptionsBar className="h-full w-full" />
    </div>
  );
}

function ToolbarModule() {
  return (
    <div className="shrink-0 border-t border-slate-700">
      <ToolBar />
    </div>
  );
}

function CanvasModuleWrapper() {
  return <CanvasModule />;
}

export const moduleRegistry: Record<ModuleId, ComponentType> = {
  scenes: ScenesModule,
  initiative: InitiativeModule,
  tokens: TokensModule,
  imports: ImportsModule,
  settings: SettingsModule,
  toolOptions: ToolOptionsModule,
  toolbar: ToolbarModule,
  canvas: CanvasModuleWrapper,
  info: InfoModule,
};

export function renderModule(moduleId: ModuleId): ComponentType {
  return moduleRegistry[moduleId] ?? UnknownModule;
}

function UnknownModule() {
  return (
    <div className="flex h-full items-center justify-center bg-red-950/30 p-4 text-sm text-red-300">
      Unknown module
    </div>
  );
}
