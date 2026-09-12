// ECharts 5 does not attach declaration conditions to these subpath exports, so
// TypeScript's NodeNext resolver sees the JavaScript entrypoints without their
// adjacent declarations. The browser-source typecheck still validates the original
// package declarations through Bundler resolution; these aliases keep the full-stack
// package emit typed when client/dev imports the canonical Registry source.
declare module 'echarts/core' {
  export * from 'echarts/types/dist/core';
}

declare module 'echarts/charts' {
  export * from 'echarts/types/dist/charts';
}

declare module 'echarts/components' {
  export * from 'echarts/types/dist/components';
}

declare module 'echarts/renderers' {
  export * from 'echarts/types/dist/renderers';
}

declare module 'echarts-for-react/lib/core' {
  import type { ComponentType } from 'react';
  import type { EChartsReactProps } from 'echarts-for-react/lib/types';

  const ReactEChartsCore: ComponentType<EChartsReactProps>;
  export default ReactEChartsCore;
}
