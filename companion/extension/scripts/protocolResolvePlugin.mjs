import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function getProtocolRoot(extensionRoot) {
  const local = join(extensionRoot, 'protocol');
  if (existsSync(local)) return local;
  return join(extensionRoot, '..', 'protocol');
}

/** Resolve ../../protocol/* imports for monorepo or flat AMO source layout. */
export function protocolResolvePlugin(protocolRoot) {
  return {
    name: 'protocol-root',
    setup(build) {
      build.onResolve({ filter: /\.\.\/\.\.\/protocol\// }, (args) => {
        let rel = args.path.split('protocol/')[1];
        if (rel.endsWith('.js')) rel = rel.slice(0, -3) + '.ts';
        return { path: join(protocolRoot, rel) };
      });
    },
  };
}
