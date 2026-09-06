import type { TabsLayoutNode } from '../schema/layoutSchema';
import { sharedEdgesBorderClass, useModulePanelEdges } from '../ModulePanelContext';
import { ModuleSlot } from './ModuleSlot';
import {
  decodeTabDragPayload,
  encodeTabDragPayload,
  LAYOUT_TAB_DRAG_TYPE,
} from './layoutContext';
import { LAYOUT_MODULE_DRAG_TYPE } from '../LayoutModuleContext';

type Props = {
  node: TabsLayoutNode;
  path: number[];
  mode: 'live' | 'preview';
  device: import('../schema/layoutSchema').DeviceClass;
  onTabSelect?: (path: number[], tabId: string) => void;
  onTabMove?: (fromPath: number[], tabId: string, toPath: number[]) => void;
  editable?: boolean;
  highlighted?: boolean;
  onDropTarget?: (path: number[], e: React.DragEvent) => void;
};

export function TabGroupPane({
  node,
  path,
  onTabSelect,
  onTabMove,
  editable = false,
  highlighted = false,
  onDropTarget,
}: Props) {
  const activeTab = node.tabs.find((t) => t.id === node.activeTabId) ?? node.tabs[0];
  const panelEdges = useModulePanelEdges();
  const panelBorder = sharedEdgesBorderClass(panelEdges);

  const handleDragStart = (tabId: string) => (e: React.DragEvent) => {
    if (!editable) return;
    e.dataTransfer.setData(LAYOUT_TAB_DRAG_TYPE, encodeTabDragPayload({ tabId, fromPath: path }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();

    const tabPayload = e.dataTransfer.getData(LAYOUT_TAB_DRAG_TYPE);
    if (tabPayload && onTabMove) {
      const parsed = decodeTabDragPayload(tabPayload);
      if (parsed) {
        onTabMove(parsed.fromPath, parsed.tabId, path);
        return;
      }
    }

    const moduleId = e.dataTransfer.getData(LAYOUT_MODULE_DRAG_TYPE);
    if (moduleId && onDropTarget) {
      onDropTarget(path, e);
    }
  };

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-900 ${panelBorder} ${
        highlighted ? 'ring-2 ring-inset ring-sky-500' : ''
      }`}
      onDragOver={
        editable
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
          : undefined
      }
      onDrop={editable ? handleDrop : undefined}
    >
      <div
        className="flex w-full shrink-0 border-b border-slate-700 bg-slate-900/95"
        role="tablist"
      >
        {node.tabs.map((tab) => {
          const active = tab.id === node.activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              draggable={editable}
              onDragStart={handleDragStart(tab.id)}
              className={`flex min-h-9 min-w-0 flex-1 items-center justify-center border-b-2 px-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              } ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onTabSelect?.(path, tab.id);
              }}
            >
              <span className="truncate">{tab.title}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
        {activeTab && (
          <ModuleSlot key={activeTab.id} moduleId={activeTab.moduleId} />
        )}
      </div>
    </div>
  );
}
