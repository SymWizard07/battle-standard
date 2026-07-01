import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type SharedPanelEdges = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

const NO_SHARED_EDGES: SharedPanelEdges = {
  top: false,
  right: false,
  bottom: false,
  left: false,
};

const ModulePanelContext = createContext<SharedPanelEdges>(NO_SHARED_EDGES);

export function sharedEdgesInSplit(
  direction: 'row' | 'col',
  index: number,
  count: number,
): SharedPanelEdges {
  const edges = { ...NO_SHARED_EDGES };
  if (direction === 'col') {
    if (index > 0) edges.top = true;
    if (index < count - 1) edges.bottom = true;
  } else {
    if (index > 0) edges.left = true;
    if (index < count - 1) edges.right = true;
  }
  return edges;
}

export function mergeSharedEdges(
  parent: SharedPanelEdges,
  local: SharedPanelEdges,
): SharedPanelEdges {
  return {
    top: parent.top || local.top,
    right: parent.right || local.right,
    bottom: parent.bottom || local.bottom,
    left: parent.left || local.left,
  };
}

export function ModulePanelProvider({
  edges,
  children,
}: {
  edges: SharedPanelEdges;
  children: ReactNode;
}) {
  const parent = useContext(ModulePanelContext);
  const merged = useMemo(() => mergeSharedEdges(parent, edges), [parent, edges]);
  return <ModulePanelContext.Provider value={merged}>{children}</ModulePanelContext.Provider>;
}

export function useModulePanelEdges(): SharedPanelEdges {
  return useContext(ModulePanelContext);
}

export function sharedEdgesBorderClass(edges: SharedPanelEdges): string {
  const sides: string[] = [];
  if (edges.top) sides.push('border-t');
  if (edges.right) sides.push('border-r');
  if (edges.bottom) sides.push('border-b');
  if (edges.left) sides.push('border-l');
  if (sides.length === 0) return '';
  return `${sides.join(' ')} border-slate-700`;
}
