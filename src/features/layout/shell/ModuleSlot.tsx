import type { ComponentType, ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import type { ModuleId } from '../schema/layoutSchema';
import { MODULE_LABELS } from '../schema/layoutSchema';
import { renderModule } from '../moduleRegistry';

type Props = {
  moduleId: ModuleId;
  children?: ReactNode;
};

type State = { error: Error | null };

export class ModuleSlot extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Module "${this.props.moduleId}" failed:`, error, info);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.moduleId !== this.props.moduleId) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { moduleId, children } = this.props;
    const { error } = this.state;

    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-red-950/20 p-4 text-center">
          <p className="text-sm font-medium text-red-300">
            Failed to load {MODULE_LABELS[moduleId]}
          </p>
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-slate-300"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }

    if (children) return children;

    const Module: ComponentType = renderModule(moduleId);
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <Module />
      </div>
    );
  }
}
