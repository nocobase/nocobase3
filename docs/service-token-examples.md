---
title: ServiceToken Examples
description: NocoBase V3 中使用 ServiceToken 注册和解析 class 实例、普通对象、函数、惰性单例、普通值和同类型多角色服务的简易示例
---

# ServiceToken 简易示例

`ServiceToken<T>` 标识一项可由容器注册和解析的能力。服务既可以是 class 实例，也可以是普通对象、函数或其他类型的值。

下面的示例共用一个容器：

```ts
import {
  createServiceToken,
  ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

const container = new ServiceContainer();
```

## Class 实例

服务可以是一个 class 实例：

```ts
class HeartbeatService {
  public ping(): string {
    return 'pong';
  }
}

const heartbeatServiceToken: ServiceToken<HeartbeatService> =
  createServiceToken<HeartbeatService>('@nocobase/example-runtime/heartbeat');

container.instance(heartbeatServiceToken, new HeartbeatService());

const heartbeat = container.resolve(heartbeatServiceToken);
heartbeat.ping();
```

Token 标识服务能力，`HeartbeatService` 是当前注册的实现。

## Interface 和普通对象

公共契约可以是 interface，服务实现可以是一个普通对象：

```ts
interface Clock {
  now(): Date;
}

const clockToken: ServiceToken<Clock> = createServiceToken<Clock>(
  '@nocobase/example-runtime/clock',
);

container.instance(clockToken, {
  now: (): Date => new Date(),
});

const clock = container.resolve(clockToken);
const currentTime = clock.now();
```

`Clock` 编译后不存在，因此需要使用运行时存在的 `clockToken` 标识这项能力。

## 函数

函数本身也可以是一项服务：

```ts
type GenerateId = () => string;

const generateIdToken: ServiceToken<GenerateId> =
  createServiceToken<GenerateId>('@nocobase/example-runtime/generate-id');

container.instance(generateIdToken, (): string => crypto.randomUUID());

const generateId = container.resolve(generateIdToken);
const id = generateId();
```

Token 表示“生成 ID”这个角色，注册的函数是该角色的当前实现。

## 惰性单例

使用 `singleton()` 可以在第一次解析时才创建服务：

```ts
interface FeatureFlags {
  isEnabled(name: string): boolean;
}

const featureFlagsToken: ServiceToken<FeatureFlags> =
  createServiceToken<FeatureFlags>('@nocobase/example-runtime/feature-flags');

container.singleton(featureFlagsToken, () => ({
  isEnabled(name: string): boolean {
    return name === 'new-dashboard';
  },
}));

const featureFlags = container.resolve(featureFlagsToken);
const enabled = featureFlags.isEnabled('new-dashboard');
```

同一个 Token 被多次解析时，容器返回第一次创建的实例。

## 带依赖的惰性单例

单例工厂可以通过 `resolver` 解析其他服务：

```ts
interface GreetingService {
  greet(name: string): string;
}

const greetingServiceToken: ServiceToken<GreetingService> =
  createServiceToken<GreetingService>('@nocobase/example-runtime/greeting');

container.singleton(greetingServiceToken, (resolver) => {
  const clock = resolver.resolve(clockToken);

  return {
    greet(name: string): string {
      return `Hello ${name}. The current time is ${clock.now().toISOString()}.`;
    },
  };
});

const greeting = container.resolve(greetingServiceToken);
greeting.greet('Alice');
```

依赖应在单例工厂中通过 `resolver` 解析，不要从模块级可变变量获取。

## 普通值

服务也可以是字符串、数字等普通值：

```ts
const deploymentIdToken: ServiceToken<string> = createServiceToken<string>(
  '@nocobase/example-runtime/deployment-id',
);

container.instance(deploymentIdToken, 'deployment-001');

const deploymentId = container.resolve(deploymentIdToken);
```

不要因此把 Application 的每个配置项都注册为服务。Provider 通常应直接从 `this.app.config` 读取自己拥有的配置；普通值 Token 适合确实需要被多个消费者按依赖解析的共享值。

## 同一类型的多个角色

同一种服务类型可以使用不同 Token 表示不同业务角色：

```ts
interface FileStorage {
  write(path: string, content: Uint8Array): Promise<void>;
}

const publicFileStorageToken: ServiceToken<FileStorage> =
  createServiceToken<FileStorage>(
    '@nocobase/example-runtime/public-file-storage',
  );
const privateFileStorageToken: ServiceToken<FileStorage> =
  createServiceToken<FileStorage>(
    '@nocobase/example-runtime/private-file-storage',
  );

const publicContents = new Map<string, Uint8Array>();
const privateContents = new Map<string, Uint8Array>();

container.instance(publicFileStorageToken, {
  async write(path: string, content: Uint8Array): Promise<void> {
    publicContents.set(path, content);
  },
});
container.instance(privateFileStorageToken, {
  async write(path: string, content: Uint8Array): Promise<void> {
    privateContents.set(path, content);
  },
});

const publicFiles = container.resolve(publicFileStorageToken);
const privateFiles = container.resolve(privateFileStorageToken);
```

两个服务具有相同的 `FileStorage` 类型，但 Token 明确区分了公共文件和私有文件两个角色。

## 在 Provider 中注册

实际应用通常由 Provider 在 `register()` 中注册服务：

```ts
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

interface RuntimeProviderApplication {
  readonly container: ServiceContainer;
}

export default class RuntimeProvider extends ServiceProvider<RuntimeProviderApplication> {
  public readonly name: string = '@nocobase/example-runtime';

  public override register(): void {
    this.app.container.instance(clockToken, {
      now: (): Date => new Date(),
    });

    this.app.container.instance(generateIdToken, (): string =>
      crypto.randomUUID(),
    );
  }
}
```

其他 Provider、Route 或服务工厂只需解析对应 Token：

```ts
const clock = app.container.resolve(clockToken);
const generateId = app.container.resolve(generateIdToken);
```

## 测试替换

测试可以使用同一个 Token 注册简单的替代实现：

```ts
const testContainer = new ServiceContainer();

testContainer.instance(clockToken, {
  now: (): Date => new Date('2026-08-28T00:00:00.000Z'),
});
testContainer.instance(generateIdToken, (): string => 'test-id');

testContainer.resolve(clockToken).now();
testContainer.resolve(generateIdToken)();
```

替代值只需满足 Token 绑定的类型，不需要继承生产环境中的实现 class。

## 导入已有 Token

Token 使用对象引用作为身份。消费方必须导入能力所有者导出的原始 Token，不能创建一个同名 Token：

```ts
// Correct: import the token owned by the service package.
import { clockToken } from '@nocobase/example-runtime';

const clock = container.resolve(clockToken);
```

下面的代码虽然使用相同名称，但创建了另一个 Token，无法解析原有绑定：

```ts
// Incorrect: this is a different token object.
const anotherClockToken: ServiceToken<Clock> = createServiceToken<Clock>(
  '@nocobase/example-runtime/clock',
);

container.resolve(anotherClockToken);
```

## 选择注册方式

| 场景                         | 注册方式                       |
| ---------------------------- | ------------------------------ |
| 已经创建好的实例、对象或函数 | `container.instance()`         |
| 希望第一次使用时才创建       | `container.singleton()`        |
| 解析已注册的服务             | `container.resolve()`          |
| 关闭时避免创建未使用的单例   | `container.resolveIfCreated()` |

无论服务采用哪种实现形式，都应由能力所有者定义并导出一个稳定的 `ServiceToken<T>`，消费方导入并解析同一个 Token。
