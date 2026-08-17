import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const {
    REACT_GRAB_DISABLED_ACTIONS,
    absolutizeSingleReactGrabCopyContent,
    appendReactGrabInputLine,
    configureReactGrabPicker,
    hideDisabledReactGrabToolbarActions,
  } = await server.ssrLoadModule(
    "/src/components/development/react-grab-picker-customization.ts"
  );

  assert.deepEqual([...REACT_GRAB_DISABLED_ACTIONS], ["comment", "edit"]);
  assert.equal(
    appendReactGrabInputLine("[default React Grab context]"),
    "[default React Grab context]\n"
  );
  assert.equal(
    appendReactGrabInputLine("[default React Grab context]\n"),
    "[default React Grab context]\n"
  );
  assert.equal(
    appendReactGrabInputLine("[default React Grab context]\r\n"),
    "[default React Grab context]\r\n"
  );

  const sourceRoot = "/workspace/portal-template-default";
  const elementContext = {
    element: {
      ownerDocument: { location: { origin: "http://localhost:5173" } },
    },
  };
  const defaultContent =
    "[<div /> in NocoBaseRuntimeStatus (at runtime-status.tsx) in PortalRuntimeGate (at portal-runtime-gate.tsx) in App (at App.tsx)]";
  const context = {
    ...elementContext,
    stackString: [
      "",
      "  in NocoBaseRuntimeStatus (at runtime-status.tsx)",
      "  in PortalRuntimeGate (at portal-runtime-gate.tsx)",
      "  in App (at App.tsx)",
    ].join("\n"),
    stack: [
      {
        functionName: "NocoBaseRuntimeStatus",
        fileName: "runtime-status.tsx",
        lineNumber: 501,
        columnNumber: 7,
      },
      {
        functionName: "PortalRuntimeGate",
        fileName: "portal-runtime-gate.tsx",
        lineNumber: 101,
        columnNumber: 9,
      },
      {
        functionName: "App",
        fileName: "App.tsx",
        lineNumber: 42,
        columnNumber: 5,
      },
    ],
    fiber: {
      _debugStack: {
        stack: [
          "Error: react-stack-top-frame",
          "    at NocoBaseRuntimeStatus (http://localhost:5173/x/admin/registry/nocobase-error-boundary/runtime-status.tsx?t=1:501:7)",
        ].join("\n"),
      },
      _debugOwner: {
        _debugStack: {
          stack: [
            "Error: react-stack-top-frame",
            "    at PortalRuntimeGate (http://localhost:5173/x/admin/src/components/app-shell/portal-runtime-gate.tsx?t=1:101:9)",
          ].join("\n"),
        },
        _debugOwner: {
          _debugStack: {
            stack: [
              "Error: react-stack-top-frame",
              "    at App (http://localhost:5173/x/admin/src/App.tsx?t=1:42:5)",
            ].join("\n"),
          },
        },
      },
    },
  };

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      defaultContent,
      context,
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in NocoBaseRuntimeStatus (at ${sourceRoot}/registry/nocobase-error-boundary/runtime-status.tsx:501:7) in PortalRuntimeGate (at ${sourceRoot}/src/components/app-shell/portal-runtime-gate.tsx:101:9) in App (at ${sourceRoot}/src/App.tsx:42:5)]`
  );

  const ambiguousContext = {
    ...elementContext,
    stackString: "\n  in Card (at index.tsx)",
    stack: [
      {
        functionName: "FirstCard",
        fileName: "index.tsx",
        lineNumber: 10,
        columnNumber: 2,
      },
      {
        functionName: "SecondCard",
        fileName: "index.tsx",
        lineNumber: 20,
        columnNumber: 4,
      },
    ],
    fiber: {
      _debugStack: {
        stack:
          "    at FirstCard (http://localhost:5173/x/admin/src/first/index.tsx:10:2)",
      },
      _debugOwner: {
        _debugStack: {
          stack:
            "    at SecondCard (http://localhost:5173/x/admin/src/second/index.tsx:20:4)",
        },
      },
    },
  };
  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<div /> in Card (at index.tsx)]",
      ambiguousContext,
      sourceRoot,
      "/x/admin/"
    ),
    "[<div /> in Card (at index.tsx)]"
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      defaultContent,
      { ...context, stack: [context.stack[0]] },
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in NocoBaseRuntimeStatus (at ${sourceRoot}/registry/nocobase-error-boundary/runtime-status.tsx:501:7) in PortalRuntimeGate (at ${sourceRoot}/src/components/app-shell/portal-runtime-gate.tsx) in App (at ${sourceRoot}/src/App.tsx)]`
  );

  const sharedFileFiber = {
    _debugStack: {
      stack:
        "    at Visible (http://localhost:5173/x/admin/src/shared.tsx:99:9)",
    },
  };
  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<div /> in Visible (at shared.tsx)]",
      {
        ...elementContext,
        fiber: sharedFileFiber,
        stackString: "\n  in Visible (at shared.tsx)",
        stack: [
          { fileName: "shared.tsx", lineNumber: 5, columnNumber: 1 },
          {
            functionName: "Visible",
            fileName: "shared.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in Visible (at ${sourceRoot}/src/shared.tsx:20:4)]`
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<div /> in A (at shared.tsx) in B (at shared.tsx)]",
      {
        ...elementContext,
        fiber: sharedFileFiber,
        stackString:
          "\n  in A (at shared.tsx)\n  in B (at shared.tsx)",
        stack: [
          {
            functionName: "A",
            fileName: "shared.tsx",
            lineNumber: 10,
            columnNumber: 1,
          },
          {
            functionName: "A",
            fileName: "shared.tsx",
            lineNumber: 20,
            columnNumber: 2,
          },
          {
            functionName: "B",
            fileName: "shared.tsx",
            lineNumber: 30,
            columnNumber: 3,
          },
        ],
      },
      sourceRoot,
      "/x/admin/"
    ),
    "[<div /> in A (at shared.tsx) in B (at shared.tsx)]"
  );

  const mixedAmbiguousContext = {
    ...elementContext,
    fiber: ambiguousContext.fiber,
    stackString:
      "\n  in SecondCard (at index.tsx)\n  in FirstCard (at index.tsx)",
    stack: [
      {
        functionName: "SecondCard",
        fileName: "index.tsx",
        lineNumber: 20,
        columnNumber: 4,
      },
      {
        functionName: "FirstCard",
        fileName:
          "http://localhost:5173/x/admin/src/first/index.tsx?t=1",
        lineNumber: 10,
        columnNumber: 2,
      },
    ],
  };
  const mixedAmbiguousContent =
    "[<div /> in SecondCard (at index.tsx) in FirstCard (at index.tsx)]";
  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      mixedAmbiguousContent,
      mixedAmbiguousContext,
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in SecondCard (at ${sourceRoot}/src/second/index.tsx:20:4) in FirstCard (at ${sourceRoot}/src/first/index.tsx:10:2)]`
  );

  const previewStackContent =
    "[<div>in App (at App.tsx)</div> in App (at App.tsx)]";
  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      previewStackContent,
      {
        ...context,
        stackString: "\n  in App (at App.tsx)",
        stack: [context.stack[2]],
      },
      sourceRoot,
      "/x/admin/"
    ),
    `[<div>in App (at App.tsx)</div> in App (at ${sourceRoot}/src/App.tsx:42:5)]`
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<button /> in ForwardRef(Button) (at button.tsx)]",
      {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at ForwardRef(Button) (http://localhost:5173/x/admin/src/button.tsx:12:3)",
          },
        },
        stackString: "\n  in ForwardRef(Button) (at button.tsx)",
        stack: [
          {
            functionName: "ForwardRef(Button)",
            fileName: "button.tsx",
            lineNumber: 12,
            columnNumber: 3,
          },
        ],
      },
      sourceRoot,
      "/x/admin/"
    ),
    `[<button /> in ForwardRef(Button) (at ${sourceRoot}/src/button.tsx:12:3)]`
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<div /> in Wrapper in App (at App.tsx)]",
      {
        ...context,
        stackString: "\n  in Wrapper\n  in App (at App.tsx)",
        stack: [context.stack[2]],
      },
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in Wrapper in App (at ${sourceRoot}/src/App.tsx:42:5)]`
  );

  const repeatedStackKeyContent =
    '[<div /> in App (at App.tsx) key: " in App (at App.tsx)"]';
  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      repeatedStackKeyContent,
      {
        ...context,
        stackString: "\n  in App (at App.tsx)",
        stack: [context.stack[2]],
      },
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in App (at ${sourceRoot}/src/App.tsx:42:5) key: " in App (at App.tsx)"]`
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<button /> in Button (at Button.tsx)]",
      {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2)",
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      sourceRoot,
      "/"
    ),
    "[<button /> in Button (at Button.tsx)]"
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<div /> in App (at App.tsx:42:5)]",
      {
        ...context,
        stackString: "\n  in App (at App.tsx:42:5)",
        stack: [
          {
            functionName: "App",
            fileName: "App.tsx",
            lineNumber: 42,
          },
        ],
      },
      sourceRoot,
      "/x/admin/"
    ),
    `[<div /> in App (at ${sourceRoot}/src/App.tsx:42:5)]`
  );

  const externalAndLocalButtonContent =
    "[<button /> in ExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]";
  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      externalAndLocalButtonContent,
      {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at ExternalButton (http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in ExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      sourceRoot,
      "/"
    ),
    `[<button /> in ExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`
  );

  assert.equal(
    absolutizeSingleReactGrabCopyContent(
      "[<button /> in ExternalButton (at Button.tsx)]",
      {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at ExternalButton (https://cdn.example/src/Button.tsx:10:2)",
          },
        },
        stackString: "\n  in ExternalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      sourceRoot,
      "/"
    ),
    "[<button /> in ExternalButton (at Button.tsx)]"
  );

  const untrustedSourceCases = [
    {
      content:
        "[<button /> in ExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "ExternalButton@http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "LocalButton@http://localhost:5173/src/Button.tsx:20:4",
            },
          },
        },
        stackString:
          "\n  in ExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in ExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in FancyExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in FancyExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "FancyExternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in FancyExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in ExternalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at ExternalButton (https://cdn.example/assets/shared-ui.js:10:2)",
          },
        },
        stackString: "\n  in ExternalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "/src/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in ExternalButton (at Button.tsx)]",
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: [
              "    at render (http://localhost:5173/@fs/Users/Apple/shared-ui/Button.tsx:10:2)",
              "    at Button (http://localhost:5173/src/Button.tsx:99:9)",
            ].join("\n"),
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in Button (at Button.tsx)]",
    },
    {
      content:
        "[<button /> in FancyExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in FancyExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "FancyExternalButton",
            fileName: "/src/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in FancyExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in FancyButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in ExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in ExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "/src/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in ExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in Child (at shared.tsx) in Parent (at shared.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Child (http://localhost:5173/src/shared.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Parent (http://localhost:5173/src/shared.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Child (at shared.tsx)\n  in Parent (at shared.tsx)",
        stack: [
          {
            functionName: "Child",
            fileName: "shared.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: `[<div /> in Child (at ${sourceRoot}/src/shared.tsx:10:2) in Parent (at ${sourceRoot}/src/shared.tsx)]`,
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at FancyButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx)",
        stack: [
          {
            functionName: "HiddenHelper",
            fileName: "Button.tsx",
            lineNumber: 5,
            columnNumber: 1,
          },
        ],
      },
      expected: `[<button /> in FancyButton (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: [
              "    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js:12100:20)",
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
            ].join("\n"),
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in FancyExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: [
              "    at async http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2",
              "    at LocalCaller (http://localhost:5173/src/Button.tsx:99:9)",
            ].join("\n"),
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in FancyExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "FancyExternalButton",
            fileName: "/src/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in FancyExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in FancyButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in FancyButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in FancyButton (at ${sourceRoot}/src/Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in Wrapper (at Wrapper.tsx) in Wrapper (at Wrapper.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Wrapper (http://localhost:5173/src/Wrapper.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Wrapper (http://localhost:5173/src/Wrapper.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Wrapper (at Wrapper.tsx)\n  in Wrapper (at Wrapper.tsx)",
        stack: [
          {
            functionName: "Wrapper",
            fileName: "Wrapper.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: `[<div /> in Wrapper (at ${sourceRoot}/src/Wrapper.tsx) in Wrapper (at ${sourceRoot}/src/Wrapper.tsx)]`,
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at HiddenHelper (http://localhost:5173/src/Button.tsx:5:1)",
            },
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx)",
        stack: [
          {
            functionName: "HiddenHelper",
            fileName: "Button.tsx",
            lineNumber: 5,
            columnNumber: 1,
          },
        ],
      },
      expected: "[<button /> in FancyButton (at Button.tsx)]",
    },
    {
      content:
        "[<button /> in ExternalButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString:
          "\n  in ExternalButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "/src/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in ExternalButton (at Button.tsx) in LocalButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:5:1)",
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx:20:4)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "Button.tsx",
            lineNumber: 5,
            columnNumber: 1,
          },
        ],
      },
      expected: `[<button /> in FancyButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/local/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "src/other/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/local/Button.tsx)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "../shared-ui/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content: "[<button /> in FancyButton (at /src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in FancyButton (at /src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: "[<button /> in FancyButton (at /src/Button.tsx:999:7)]",
    },
    {
      content: "[<button /> in FancyExternal (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalExternal (http://localhost:5173/@fs/Users/Apple/shared-ui/src/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at HiddenLocal (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in FancyExternal (at Button.tsx)",
        stack: [
          {
            functionName: "FancyExternal",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in FancyExternal (at Button.tsx)]",
    },
    {
      content: "[<button /> in FancyButton (at /src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
          _debugOwner: {},
        },
        stackString: "\n  in FancyButton (at /src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: "[<button /> in FancyButton (at /src/Button.tsx:999:7)]",
    },
    {
      content: "[<button /> in Button (at /src/Button.tsx#view:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx#view:20:4)",
          },
        },
        stackString: "\n  in Button (at /src/Button.tsx#view:20:4)",
        stack: [
          {
            functionName: "Button",
            fileName: "http://localhost:5173/src/Button.tsx#view",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Button (at https://cdn.example/src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString:
          "\n  in Button (at https://cdn.example/src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in Button (at https://cdn.example/src/Button.tsx:999:7)]",
    },
    {
      content: "[<button /> in ExternalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at ExternalButton (https://cdn.example/loader.js?target=http://localhost:5173/src/Button.tsx:10:2)",
          },
        },
        stackString: "\n  in ExternalButton (at Button.tsx)",
        stack: [
          {
            functionName: "ExternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in ExternalButton (at Button.tsx)]",
    },
    {
      content:
        "[<button /> in Button (at /src/Button.tsx?source=/generated:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx?source=/generated:20:4)",
          },
        },
        stackString:
          "\n  in Button (at /src/Button.tsx?source=/generated:20:4)",
        stack: [
          {
            functionName: "Button",
            fileName:
              "http://localhost:5173/src/Button.tsx?source=/generated",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Button (at /src/Button.tsx#route/sub:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx#route/sub:20:4)",
          },
        },
        stackString:
          "\n  in Button (at /src/Button.tsx#route/sub:20:4)",
        stack: [
          {
            functionName: "Button",
            fileName: "http://localhost:5173/src/Button.tsx#route/sub",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in FancyButton (at Button.tsx)]",
    },
    {
      content: "[<button /> in FancyExternal (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at ExternalSource (https://cdn.example/assets/shared-ui.js:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at HiddenLocal (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in FancyExternal (at Button.tsx)",
        stack: [
          {
            functionName: "FancyExternal",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in FancyExternal (at Button.tsx)]",
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at http://localhost:5173/src/Button.tsx:20:4",
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in Button (at /src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in Button (at /src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: "[<button /> in Button (at /src/Button.tsx:999:7)]",
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/one/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at http://localhost:5173/src/two/Button.tsx:20:4",
            },
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: "[<button /> in FancyButton (at Button.tsx)]",
    },
    {
      content: "[<button /> in ExternalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at http://localhost:5173/src/Button.tsx:20:4",
          },
        },
        stackString: "\n  in ExternalButton (at Button.tsx)",
        stack: [
          {
            functionName: "HiddenLocal",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "ExternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in ExternalButton (at Button.tsx)]",
    },
    {
      content:
        "[<div /> in FancyButton (at Button.tsx) in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString:
          "\n  in FancyButton (at Button.tsx)\n  in FancyButton (at Button.tsx)",
        stack: [],
      },
      expected:
        "[<div /> in FancyButton (at Button.tsx) in FancyButton (at Button.tsx)]",
    },
    {
      content: "[<button /> in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at http://localhost:5173/src/Button.tsx:30:6",
            },
          },
        },
        stackString: "\n  in FancyButton (at Button.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in FancyButton (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content:
        "[<div /> in Button (at Button.tsx) in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at http://localhost:5173/src/Button.tsx:20:4",
          },
        },
        stackString:
          "\n  in Button (at Button.tsx)\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<div /> in Button (at Button.tsx) in Button (at Button.tsx)]",
    },
    {
      content:
        "[<button /> in InternalButton (at Button.tsx:10:2) in FancyButton (at Button.tsx:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in InternalButton (at Button.tsx:10:2)\n  in FancyButton (at Button.tsx:20:4)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "FancyButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in InternalButton (at ${sourceRoot}/src/Button.tsx:10:2) in FancyButton (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in InternalButton (at https://cdn.example/src/Button.tsx) in FancyButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (http://localhost:5173/src/Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in InternalButton (at https://cdn.example/src/Button.tsx)\n  in FancyButton (at Button.tsx)",
        stack: [],
      },
      expected:
        "[<div /> in InternalButton (at https://cdn.example/src/Button.tsx) in FancyButton (at Button.tsx)]",
    },
    {
      content:
        "[<button /> in Button (at /src/Button.tsx:20:4) in Button (at /src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: [
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
              "    at Button (https://cdn.example/src/Button.tsx:999:7)",
            ].join("\n"),
          },
        },
        stackString:
          "\n  in Button (at /src/Button.tsx:20:4)\n  in Button (at /src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "Button",
            fileName: "http://localhost:5173/src/Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected:
        "[<button /> in Button (at /src/Button.tsx:20:4) in Button (at /src/Button.tsx:999:7)]",
    },
    {
      content:
        "[<button /> in Button (at /src/Button.tsx:20:4) in Button (at /src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Button.tsx:30:6)",
            },
          },
        },
        stackString:
          "\n  in Button (at /src/Button.tsx:20:4)\n  in Button (at /src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "Button",
            fileName: "http://localhost:5173/src/Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx) in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/assets/shared-ui.js:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in Button (at Button.tsx)]",
    },
    {
      content: "[<button /> in Button (at /src/Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at /src/Button.tsx:999:7)",
        stack: [
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/assets/shared-ui.js:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<button /> in Button (at Button.tsx)]",
    },
    {
      content:
        "[<button /> in Button (at /Other.tsx:10:2) in Button (at /src/Button.tsx:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/Other.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Button (at /Other.tsx:10:2)\n  in Button (at /src/Button.tsx:20:4)",
        stack: [
          {
            functionName: "Button",
            fileName: "https://cdn.example/Other.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "Button",
            fileName: "http://localhost:5173/src/Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at /Other.tsx:10:2) in Button (at ${sourceRoot}/src/Button.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in External (at Other.tsx) in Button (at /src/Button.tsx:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at External (https://cdn.example/Other.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in External (at Other.tsx)\n  in Button (at /src/Button.tsx:20:4)",
        stack: [
          {
            functionName: "External",
            fileName: "https://cdn.example/Other.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<div /> in External (at Other.tsx) in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content:
        "[<div /> in Button (at Other.tsx) in Button (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/Other.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Other.tsx:15:3)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in Button (at Other.tsx)\n  in Button (at Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Other.tsx",
            lineNumber: 15,
            columnNumber: 3,
          },
          {
            functionName: "Button",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<div /> in Button (at Other.tsx) in Button (at Button.tsx)]",
    },
    {
      content:
        "[<div /> in FancyButton (at Button.tsx) in LocalButton (at Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: "    at https://cdn.example/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at http://localhost:5173/src/Button.tsx:15:3",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalButton (http://localhost:5173/src/Button.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in FancyButton (at Button.tsx)\n  in LocalButton (at Button.tsx)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "Button.tsx",
            lineNumber: 15,
            columnNumber: 3,
          },
          {
            functionName: "LocalButton",
            fileName: "Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<div /> in FancyButton (at Button.tsx) in LocalButton (at Button.tsx)]",
    },
    {
      content: "[<button /> in Button (at My%20Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/My%20Button.tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at My%20Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName:
              "http://localhost:5173/src/My%20Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/My Button.tsx:20:4)]`,
    },
    {
      content: "[<button /> in Button (at Button..tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button..tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at Button..tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Button..tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button..tsx:20:4)]`,
    },
    {
      content: "[<button /> in Button (at Outside.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/%2e%2e/Outside.tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at Outside.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Outside.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: "[<button /> in Button (at Outside.tsx)]",
    },
    {
      content: "[<button /> in Button (at My(Button).tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/My(Button).tsx:20:4)",
          },
        },
        stackString: "\n  in Button (at My(Button).tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "My(Button).tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/My(Button).tsx:20:4)]`,
    },
    {
      content: "[<button /> in Button (at Button.tsx:999:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/Button.tsx:20:4)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at HiddenExternal (https://cdn.example/Other.tsx:10:2)",
            },
          },
        },
        stackString: "\n  in Button (at Button.tsx:999:7)",
        stack: [
          {
            functionName: "Button",
            fileName: "https://cdn.example/src/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content:
        "[<button /> in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: "    at https://cdn.example/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Button.tsx:15:3)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in FancyButton (at Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "http://localhost:5173/src/Button.tsx",
            lineNumber: 15,
            columnNumber: 3,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content:
        "[<button /> in Button (at src/My%20Button.tsx:20:4)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/My%20Button.tsx:20:4)",
          },
        },
        stackString:
          "\n  in Button (at src/My%20Button.tsx:20:4)",
        stack: [
          {
            functionName: "Button",
            fileName: "src/My%20Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/My Button.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Button (at other%2FButton.tsx:99:7)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/actual/Button.tsx:20:4)",
          },
        },
        stackString:
          "\n  in Button (at other%2FButton.tsx:99:7)",
        stack: [
          {
            functionName: "Button",
            fileName:
              "http://localhost:5173/src/actual/Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in Button (at other%2FButton.tsx:99:7)]",
    },
    {
      content:
        "[<button /> in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack: "    at https://cdn.example/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/a/Button.tsx:12:2)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at InternalButton (http://localhost:5173/src/b/Button.tsx:14:3)",
              },
              _debugOwner: {
                _debugStack: {
                  stack:
                    "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
                },
              },
            },
          },
        },
        stackString:
          "\n  in FancyButton (at Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "http://localhost:5173/src/a/Button.tsx",
            lineNumber: 12,
            columnNumber: 2,
          },
          {
            functionName: "InternalButton",
            fileName: "http://localhost:5173/src/b/Button.tsx",
            lineNumber: 14,
            columnNumber: 3,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content:
        "[<button /> in Widget (at Factory) (at Widget.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "Widget (at Factory)@http://localhost:5173/src/Widget.tsx:20:4",
          },
        },
        stackString:
          "\n  in Widget (at Factory) (at Widget.tsx)",
        stack: [
          {
            functionName: "Widget (at Factory)",
            fileName: "Widget.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Widget (at Factory) (at ${sourceRoot}/src/Widget.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Widget (at Factory) (at Widget.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (at Factory) (http://localhost:5173/src/Widget.tsx:20:4)",
          },
        },
        stackString:
          "\n  in Widget (at Factory) (at Widget.tsx)",
        stack: [
          {
            functionName: "Widget (at Factory)",
            fileName: "Widget.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Widget (at Factory) (at ${sourceRoot}/src/Widget.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Button (at file (at copy).tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (http://localhost:5173/src/file%20(at%20copy).tsx:20:4)",
          },
        },
        stackString:
          "\n  in Button (at file (at copy).tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "file (at copy).tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/file (at copy).tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Button (at file (copy).tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (/src/file (copy).tsx:20:4)",
          },
        },
        stackString:
          "\n  in Button (at file (copy).tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "/src/file (copy).tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at ${sourceRoot}/src/file (copy).tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Widget (at Factory) (at Widget.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "Widget (at Factory)@http://localhost:5173/src/Widget.tsx:20:4",
          },
        },
        stackString:
          "\n  in Widget (at Factory) (at Widget.tsx)",
        stack: [
          {
            functionName: "Widget (at Factory)",
            fileName: "Widget.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "Widget",
            fileName: "Factory) (at Widget.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Widget (at Factory) (at ${sourceRoot}/src/Widget.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/anonymous/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (https://cdn.example/named/Button.tsx:15:3)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in FancyButton (at Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName:
              "https://cdn.example/named/Button.tsx",
            lineNumber: 15,
            columnNumber: 3,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content:
        "[<button /> in InternalButton (at Button.tsx) in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/anonymous/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (https://cdn.example/named/Button.tsx:15:3)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in InternalButton (at Button.tsx)\n  in FancyButton (at Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName:
              "https://cdn.example/named/Button.tsx",
            lineNumber: 15,
            columnNumber: 3,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in InternalButton (at Button.tsx) in FancyButton (at Button.tsx) in LocalCard (at ${sourceRoot}/src/Card.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in InternalButton (at Button.tsx) in InternalButton (at Button.tsx) in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/anonymous/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/a/Button.tsx:12:2)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at InternalButton (http://localhost:5173/src/b/Button.tsx:14:3)",
              },
              _debugOwner: {
                _debugStack: {
                  stack:
                    "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
                },
              },
            },
          },
        },
        stackString:
          "\n  in InternalButton (at Button.tsx)\n  in InternalButton (at Button.tsx)\n  in FancyButton (at Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "http://localhost:5173/src/a/Button.tsx",
            lineNumber: 12,
            columnNumber: 2,
          },
          {
            functionName: "InternalButton",
            fileName: "http://localhost:5173/src/b/Button.tsx",
            lineNumber: 14,
            columnNumber: 3,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in InternalButton (at Button.tsx) in InternalButton (at Button.tsx) in FancyButton (at Button.tsx) in LocalCard (at ${sourceRoot}/src/Card.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Widget (at Factory) (at Widget.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalWidget (https://cdn.example/Widget.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "Widget@http://localhost:5173/src/Factory)%20(at%20Widget.tsx:30:5",
            },
          },
        },
        stackString:
          "\n  in Widget (at Factory) (at Widget.tsx)",
        stack: [
          {
            functionName: "Widget (at Factory)",
            fileName: "Widget.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected:
        "[<button /> in Widget (at Factory) (at Widget.tsx)]",
    },
    {
      content:
        "[<button /> in Widget (at Factory) (at Widget.tsx) in Widget (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalWidget (http://localhost:5173/src/Widget.tsx:20:4)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "Widget@https://cdn.example/Factory)%20(at%20Widget.tsx:30:5",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at Widget (http://localhost:5173/src/Local.tsx:40:8)",
              },
            },
          },
        },
        stackString:
          "\n  in Widget (at Factory) (at Widget.tsx)\n  in Widget (at Local.tsx)",
        stack: [
          {
            functionName: "Widget (at Factory)",
            fileName: "Widget.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "Widget",
            fileName: "Local.tsx",
            lineNumber: 40,
            columnNumber: 8,
          },
        ],
      },
      expected:
        "[<button /> in Widget (at Factory) (at Widget.tsx) in Widget (at Local.tsx)]",
    },
    {
      content:
        "[<button /> in Widget (at /src/dir (/Widget.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/dir (/Widget.tsx:20:4)",
          },
        },
        stackString:
          "\n  in Widget (at /src/dir (/Widget.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "/src/dir (/Widget.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Widget (at ${sourceRoot}/src/dir (/Widget.tsx:20:4)]`,
    },
    {
      content:
        "[<button /> in Widget (at /src/dir (/Widget.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/dir (/Widget.tsx:20:4)",
          },
        },
        stackString:
          "\n  in Widget (at /src/dir (/Widget.tsx)",
        stack: [
          {
            functionName: "Widget (/src/dir",
            fileName: "/Widget.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
        ],
      },
      expected: `[<button /> in Widget (at ${sourceRoot}/src/dir (/Widget.tsx)]`,
    },
    {
      content:
        "[<button /> in Button (at https://cdn.example/Button.tsx) in Button (at /src/Button.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "Button@http://localhost:5173/src/Button.tsx:20:4",
            },
          },
        },
        stackString:
          "\n  in Button (at https://cdn.example/Button.tsx)\n  in Button (at /src/Button.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "https://cdn.example/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "Button",
            fileName: "http://localhost:5173/src/Button.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in Button (at https://cdn.example/Button.tsx) in Button (at ${sourceRoot}/src/Button.tsx)]`,
    },
    {
      content:
        "[<button /> in InternalButton (at https://cdn.example/Button.tsx) in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/anonymous/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Button.tsx:12:2)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in InternalButton (at https://cdn.example/Button.tsx)\n  in FancyButton (at Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "https://cdn.example/Button.tsx",
            lineNumber: 999,
            columnNumber: 7,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in InternalButton (at https://cdn.example/Button.tsx) in FancyButton (at Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content:
        "[<button /> in InternalButton (at /src/Button.tsx) in FancyButton (at D:\\outside\\Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at C:\\outside\\Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Button.tsx:12:2)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in InternalButton (at /src/Button.tsx)\n  in FancyButton (at D:\\outside\\Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "InternalButton",
            fileName: "/src/Button.tsx",
            lineNumber: 12,
            columnNumber: 2,
          },
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in InternalButton (at /src/Button.tsx) in FancyButton (at D:\\outside\\Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content:
        "[<button /> in External (at file:///src/Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at webpack:///src/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in External (at file:///src/Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<button /> in External (at file:///src/Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content: "[<div /> in Widget (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/Fake.tsx) (https://cdn.example/Real.tsx:10:2)",
          },
        },
        stackString: "\n  in Widget (at Real.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "https://cdn.example/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Real.tsx)]",
    },
    {
      content:
        "[<button /> in External (at https://cdn.example/anonymous/Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at https://cdn.example/anonymous/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at HiddenLocal (http://localhost:5173/src/Button.tsx:12:2)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in External (at https://cdn.example/anonymous/Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<button /> in External (at https://cdn.example/anonymous/Button.tsx) in LocalCard (at ${sourceRoot}/src/Card.tsx:20:4)]`,
    },
    {
      content: "[<div /> in Widget (at Fake.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/Fake.tsx?t=1) (https://cdn.example/Real.tsx:10:2)",
          },
        },
        stackString: "\n  in Widget (at Fake.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "https://cdn.example/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Fake.tsx)]",
    },
    {
      content:
        "[<div /> in Widget (at src/Foo)%20(/Bar.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (http://localhost:5173/src/Foo)%20(/Bar.tsx:10:2)",
          },
        },
        stackString:
          "\n  in Widget (at src/Foo)%20(/Bar.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "src/Foo)%20(/Bar.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: `[<div /> in Widget (at ${sourceRoot}/src/Foo) (/Bar.tsx:10:2)]`,
    },
    {
      content:
        "[<div /> in External (at webpack:src/Button.tsx) in LocalCard (at Card.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at webpack://src/Button.tsx:10:2",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at LocalCard (http://localhost:5173/src/Card.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in External (at webpack:src/Button.tsx)\n  in LocalCard (at Card.tsx)",
        stack: [
          {
            functionName: "LocalCard",
            fileName: "Card.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<div /> in External (at webpack:src/Button.tsx) in LocalCard (at Card.tsx)]",
    },
    {
      content: "[<div /> in Widget (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "Widget@/src/Fake.tsx@https://cdn.example/Real.tsx:10:2",
          },
        },
        stackString: "\n  in Widget (at Real.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "https://cdn.example/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Real.tsx)]",
    },
    {
      content:
        "[<div /> in Widget (/src/Fake.tsx (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/Fake.tsx (https://cdn.example/Real.tsx:10:2)",
          },
        },
        stackString:
          "\n  in Widget (/src/Fake.tsx (at Real.tsx)",
        stack: [],
      },
      expected:
        "[<div /> in Widget (/src/Fake.tsx (at Real.tsx)]",
    },
    {
      content: "[<div /> in Widget (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/Fake.tsx) (https://cdn.example/Real.tsx:10:2)",
          },
        },
        stackString: "\n  in Widget (at Real.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName:
              "/src/Fake.tsx) (https://cdn.example/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Real.tsx)]",
    },
    {
      content:
        "[<div /> in Button (at https://cdn-b.example/pkg/Other.tsx) in Button (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn-a.example/pkg/Other.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Button (at https://cdn-b.example/pkg/Other.tsx)\n  in Button (at Local.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<div /> in Button (at https://cdn-b.example/pkg/Other.tsx) in Button (at Local.tsx)]",
    },
    {
      content:
        "[<div /> in Button (at https://cdn-a.example/pkg/Other.tsx) in Button (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn-a.example/pkg/Other.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Other.tsx:12:3)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
              },
            },
          },
        },
        stackString:
          "\n  in Button (at https://cdn-a.example/pkg/Other.tsx)\n  in Button (at Local.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<div /> in Button (at https://cdn-a.example/pkg/Other.tsx) in Button (at ${sourceRoot}/src/Local.tsx:20:4)]`,
    },
    {
      content: "[<div /> in Widget (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/Fake.tsx) (webpack:src/Real.tsx:10:2)",
          },
        },
        stackString: "\n  in Widget (at Real.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "webpack:src/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Real.tsx)]",
    },
    {
      content: "[<div /> in Widget (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "Widget@/src/Fake.tsx@webpack:src/Real.tsx:10:2",
          },
        },
        stackString: "\n  in Widget (at Real.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "webpack:src/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Real.tsx)]",
    },
    {
      content:
        "[<div /> in Button (at /pkg/Button.tsx) in Button (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/pkg%2FButton.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Button (at /pkg/Button.tsx)\n  in Button (at Local.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected:
        "[<div /> in Button (at /pkg/Button.tsx) in Button (at Local.tsx)]",
    },
    {
      content:
        "[<div /> in Button (at /pkg/My%20Button.tsx) in Button (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/pkg/My%20Button.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Button (at /pkg/My%20Button.tsx)\n  in Button (at Local.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<div /> in Button (at /pkg/My%20Button.tsx) in Button (at ${sourceRoot}/src/Local.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in Button (at /pkg%2FButton.tsx) in Button (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/pkg%2FButton.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Button (at /pkg%2FButton.tsx)\n  in Button (at Local.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<div /> in Button (at /pkg%2FButton.tsx) in Button (at ${sourceRoot}/src/Local.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in Button (at https://cdn.example/pkg/Button.tsx) in Button (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Button (https://cdn.example/pkg/%42utton.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in Button (at https://cdn.example/pkg/Button.tsx)\n  in Button (at Local.tsx)",
        stack: [
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<div /> in Button (at https://cdn.example/pkg/Button.tsx) in Button (at ${sourceRoot}/src/Local.tsx:20:4)]`,
    },
    {
      content: "[<div /> in FancyButton (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (https://cdn.example/Real.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at FancyButton (http://localhost:5173/src/Real.tsx:20:4)",
            },
          },
        },
        stackString: "\n  in FancyButton (at Real.tsx)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "https://cdn.example/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in FancyButton (at Real.tsx)]",
    },
    {
      content:
        "[<div /> in FancyButton (at https://cdn.example/Real.tsx) in InternalButton (at Local.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalButton (https://cdn.example/Real.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalButton (http://localhost:5173/src/Local.tsx:20:4)",
            },
          },
        },
        stackString:
          "\n  in FancyButton (at https://cdn.example/Real.tsx)\n  in InternalButton (at Local.tsx)",
        stack: [
          {
            functionName: "FancyButton",
            fileName: "https://cdn.example/Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "InternalButton",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
      },
      expected: `[<div /> in FancyButton (at https://cdn.example/Real.tsx) in InternalButton (at ${sourceRoot}/src/Local.tsx:20:4)]`,
    },
    {
      content:
        "[<div /> in AliasA (at https://cdn.example/Shared.tsx) in AliasA (at LocalA.tsx) in AliasB (at https://cdn.example/Shared.tsx) in AliasB (at LocalB.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalA (https://cdn.example/Shared.tsx:10:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalB (https://cdn.example/Shared.tsx:20:4)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at AliasA (http://localhost:5173/src/LocalA.tsx:30:6)",
              },
              _debugOwner: {
                _debugStack: {
                  stack:
                    "    at AliasB (http://localhost:5173/src/LocalB.tsx:40:8)",
                },
              },
            },
          },
        },
        stackString: [
          "",
          "  in AliasA (at https://cdn.example/Shared.tsx)",
          "  in AliasA (at LocalA.tsx)",
          "  in AliasB (at https://cdn.example/Shared.tsx)",
          "  in AliasB (at LocalB.tsx)",
        ].join("\n"),
        stack: [
          {
            functionName: "AliasA",
            fileName: "https://cdn.example/Shared.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "AliasA",
            fileName: "LocalA.tsx",
            lineNumber: 30,
            columnNumber: 6,
          },
          {
            functionName: "AliasB",
            fileName: "https://cdn.example/Shared.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "AliasB",
            fileName: "LocalB.tsx",
            lineNumber: 40,
            columnNumber: 8,
          },
        ],
      },
      expected:
        `[<div /> in AliasA (at https://cdn.example/Shared.tsx) in AliasA (at ${sourceRoot}/src/LocalA.tsx:30:6)` +
        ` in AliasB (at https://cdn.example/Shared.tsx) in AliasB (at ${sourceRoot}/src/LocalB.tsx:40:8)]`,
    },
    {
      content:
        "[<div /> in AliasA (at LocalA.tsx) in AliasB (at LocalB.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at InternalA (https://cdn.example/Shared.tsx:999:2)",
          },
          _debugOwner: {
            _debugStack: {
              stack:
                "    at InternalB (https://cdn.example/Shared.tsx:998:4)",
            },
            _debugOwner: {
              _debugStack: {
                stack:
                  "    at AliasA (http://localhost:5173/src/LocalA.tsx:30:6)",
              },
              _debugOwner: {
                _debugStack: {
                  stack:
                    "    at AliasB (http://localhost:5173/src/LocalB.tsx:40:8)",
                },
              },
            },
          },
        },
        stackString:
          "\n  in AliasA (at LocalA.tsx)\n  in AliasB (at LocalB.tsx)",
        stack: [
          {
            functionName: "AliasA",
            fileName: "https://cdn.example/Shared.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
          {
            functionName: "AliasB",
            fileName: "https://cdn.example/Shared.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
          {
            functionName: "AliasA",
            fileName: "LocalA.tsx",
            lineNumber: 30,
            columnNumber: 6,
          },
          {
            functionName: "AliasB",
            fileName: "LocalB.tsx",
            lineNumber: 40,
            columnNumber: 8,
          },
        ],
      },
      expected:
        "[<div /> in AliasA (at LocalA.tsx) in AliasB (at LocalB.tsx)]",
    },
    {
      content: "[<div /> in Widget (at Real.tsx)]",
      context: {
        ...elementContext,
        fiber: {
          _debugStack: {
            stack:
              "    at Widget (/src/Fake.tsx) (\\\\server\\share\\Real.tsx:10:2)",
          },
        },
        stackString: "\n  in Widget (at Real.tsx)",
        stack: [
          {
            functionName: "Widget",
            fileName: "\\\\server\\share\\Real.tsx",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
      expected: "[<div /> in Widget (at Real.tsx)]",
    },
  ];

  const adversarialDelimiterCount = 3000;
  const adversarialDebugLine =
    "    at Widget" +
    " (/x".repeat(adversarialDelimiterCount) +
    "/Real.tsx:10:2)";
  const adversarialCopyLine =
    "  in Widget" +
    " (at /x".repeat(adversarialDelimiterCount) +
    "/Real.tsx)";
  const adversarialStackString = `\n${adversarialCopyLine}`;
  const adversarialContent = `[<div /> ${adversarialCopyLine.trimStart()}]`;
  const adversarialStart = performance.now();
  const adversarialResult = absolutizeSingleReactGrabCopyContent(
    adversarialContent,
    {
      ...elementContext,
      fiber: { _debugStack: { stack: adversarialDebugLine } },
      stack: [],
      stackString: adversarialStackString,
    },
    sourceRoot,
    "/"
  );
  const adversarialDuration = performance.now() - adversarialStart;

  assert.equal(adversarialResult, adversarialContent);
  assert.ok(
    adversarialDuration < 1000,
    `adversarial stack parsing took ${adversarialDuration.toFixed(1)}ms`
  );

  const occurrenceGraphSize = 1200;
  let occurrenceFiber = null;
  for (let index = 0; index < occurrenceGraphSize; index += 1) {
    occurrenceFiber = {
      _debugOwner: occurrenceFiber,
      _debugStack: {
        stack:
          "    at Button (https://cdn.example/Button.tsx:10:2)",
      },
    };
  }
  const occurrenceCopyLine = "  in Button (at Button.tsx)";
  const occurrenceStackString = `\n${Array(occurrenceGraphSize)
    .fill(occurrenceCopyLine)
    .join("\n")}`;
  const occurrenceContent = `[<div />${occurrenceStackString.replace(
    /\r?\n\s+/g,
    " "
  )}]`;
  const occurrenceStart = performance.now();
  const occurrenceResult = absolutizeSingleReactGrabCopyContent(
    occurrenceContent,
    {
      ...elementContext,
      fiber: occurrenceFiber,
      stack: [],
      stackString: occurrenceStackString,
    },
    sourceRoot,
    "/"
  );
  const occurrenceDuration = performance.now() - occurrenceStart;

  assert.equal(occurrenceResult, occurrenceContent);
  assert.ok(
    occurrenceDuration < 1000,
    `occurrence graph matching took ${occurrenceDuration.toFixed(1)}ms`
  );

  const largeExplicitOccurrenceCount = 6000;
  const largeExplicitExternalLine =
    "  in Button (at https://cdn.example/Button.tsx)";
  const largeExplicitStackString = `\n${[
    ...Array(largeExplicitOccurrenceCount).fill(largeExplicitExternalLine),
    "  in Button (at Local.tsx)",
  ].join("\n")}`;
  const largeExplicitContent = `[<div />${largeExplicitStackString.replace(
    /\r?\n\s+/g,
    " "
  )}]`;
  let largeExplicitFiber = {
    _debugStack: {
      stack: "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
    },
  };
  for (let index = 0; index < largeExplicitOccurrenceCount; index += 1) {
    largeExplicitFiber = {
      _debugOwner: largeExplicitFiber,
      _debugStack: {
        stack:
          "    at Button (https://cdn.example/Button.tsx:10:2)",
      },
    };
  }
  const largeExplicitStart = performance.now();
  const largeExplicitResult = absolutizeSingleReactGrabCopyContent(
    largeExplicitContent,
    {
      ...elementContext,
      fiber: largeExplicitFiber,
      stack: [
        ...Array.from({ length: largeExplicitOccurrenceCount }, () => ({
          functionName: "Button",
          fileName: "https://cdn.example/Button.tsx",
          lineNumber: 10,
          columnNumber: 2,
        })),
        {
          functionName: "Button",
          fileName: "Local.tsx",
          lineNumber: 20,
          columnNumber: 4,
        },
      ],
      stackString: largeExplicitStackString,
    },
    sourceRoot,
    "/"
  );
  const largeExplicitDuration = performance.now() - largeExplicitStart;
  const largeExplicitExpectedTail =
    ` in Button (at ${sourceRoot}/src/Local.tsx:20:4)]`;

  assert.ok(
    largeExplicitDuration < 500 &&
      largeExplicitResult.endsWith(largeExplicitExpectedTail),
    `large explicit occurrence matching took ${largeExplicitDuration.toFixed(
      1
    )}ms and ended with ${JSON.stringify(largeExplicitResult.slice(-120))}`
  );

  const runOriginlessExplicitOccurrenceCase = (occurrenceCount) => {
    const externalLine = "  in Button (at /pkg/Button.tsx)";
    const stackString = `\n${[
      ...Array(occurrenceCount).fill(externalLine),
      "  in Button (at Local.tsx)",
    ].join("\n")}`;
    const content = `[<div />${stackString.replace(/\r?\n\s+/g, " ")}]`;
    let fiber = {
      _debugStack: {
        stack: "    at Button (http://localhost:5173/src/Local.tsx:20:4)",
      },
    };
    for (let index = 0; index < occurrenceCount; index += 1) {
      fiber = {
        _debugOwner: fiber,
        _debugStack: {
          stack:
            "    at Button (https://cdn.example/pkg/Button.tsx:10:2)",
        },
      };
    }

    return absolutizeSingleReactGrabCopyContent(
      content,
      {
        ...elementContext,
        fiber,
        stack: [
          ...Array.from({ length: occurrenceCount }, () => ({
            functionName: "Button",
            fileName: "https://cdn.example/pkg/Button.tsx",
            lineNumber: 10,
            columnNumber: 2,
          })),
          {
            functionName: "Button",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
        stackString,
      },
      sourceRoot,
      "/"
    );
  };
  const originlessExplicitExpectedTail =
    ` in Button (at ${sourceRoot}/src/Local.tsx:20:4)]`;

  const runAlternativeExplicitOccurrenceCase = (occurrenceCount) => {
    const componentNames = Array.from(
      { length: occurrenceCount },
      (_value, index) => (index % 2 === 0 ? "InternalA" : "InternalB")
    );
    const externalSource = "https://cdn.example/pkg/Shared.tsx";
    const stackString = `\n${[
      ...componentNames.map(
        (componentName) => `  in ${componentName} (at ${externalSource})`
      ),
      "  in Alias (at Local.tsx)",
    ].join("\n")}`;
    const content = `[<div />${stackString.replace(/\r?\n\s+/g, " ")}]`;
    let fiber = {
      _debugStack: {
        stack: "    at Alias (http://localhost:5173/src/Local.tsx:20:4)",
      },
    };
    for (let index = occurrenceCount - 1; index >= 0; index -= 1) {
      fiber = {
        _debugOwner: fiber,
        _debugStack: {
          stack: `    at ${componentNames[index]} (${externalSource}:10:2)`,
        },
      };
    }

    return absolutizeSingleReactGrabCopyContent(
      content,
      {
        ...elementContext,
        fiber,
        stack: [
          ...Array.from({ length: occurrenceCount }, () => ({
            functionName: "Alias",
            fileName: externalSource,
            lineNumber: 10,
            columnNumber: 2,
          })),
          {
            functionName: "Alias",
            fileName: "Local.tsx",
            lineNumber: 20,
            columnNumber: 4,
          },
        ],
        stackString,
      },
      sourceRoot,
      "/"
    );
  };
  const alternativeExplicitExpectedTail =
    ` in Alias (at ${sourceRoot}/src/Local.tsx:20:4)]`;

  for (const occurrenceCount of [128, 129]) {
    const result = runAlternativeExplicitOccurrenceCase(occurrenceCount);
    assert.ok(
      result.endsWith(alternativeExplicitExpectedTail),
      `${occurrenceCount} alternative explicit occurrences ended with ${JSON.stringify(
        result.slice(-120)
      )}`
    );
  }

  const distinctIdentityCount = 500;
  const distinctIdentityExternalLines = Array.from(
    { length: distinctIdentityCount },
    (_value, index) =>
      `  in External${index} (at https://cdn.example/pkg${index}/Button.tsx)`
  );
  const distinctIdentityStackString = `\n${[
    ...distinctIdentityExternalLines,
    "  in LocalButton (at Local.tsx)",
  ].join("\n")}`;
  const distinctIdentityContent = `[<div />${distinctIdentityStackString.replace(
    /\r?\n\s+/g,
    " "
  )}]`;
  let distinctIdentityFiber = {
    _debugStack: {
      stack:
        "    at LocalButton (http://localhost:5173/src/Local.tsx:20:4)",
    },
  };
  for (let index = distinctIdentityCount - 1; index >= 0; index -= 1) {
    distinctIdentityFiber = {
      _debugOwner: distinctIdentityFiber,
      _debugStack: {
        stack: `    at External${index} (https://cdn.example/pkg${index}/Button.tsx:10:2)`,
      },
    };
  }
  const distinctIdentityStart = performance.now();
  const distinctIdentityResult = absolutizeSingleReactGrabCopyContent(
    distinctIdentityContent,
    {
      ...elementContext,
      fiber: distinctIdentityFiber,
      stack: [
        ...Array.from({ length: distinctIdentityCount }, (_value, index) => ({
          functionName: `External${index}`,
          fileName: `https://cdn.example/pkg${index}/Button.tsx`,
          lineNumber: 10,
          columnNumber: 2,
        })),
        {
          functionName: "LocalButton",
          fileName: "Local.tsx",
          lineNumber: 20,
          columnNumber: 4,
        },
      ],
      stackString: distinctIdentityStackString,
    },
    sourceRoot,
    "/"
  );
  const distinctIdentityDuration = performance.now() - distinctIdentityStart;
  const distinctIdentityExpectedTail =
    ` in LocalButton (at ${sourceRoot}/src/Local.tsx:20:4)]`;

  assert.ok(
    distinctIdentityDuration < 500 &&
      distinctIdentityResult.endsWith(distinctIdentityExpectedTail),
    `distinct explicit identity matching took ${distinctIdentityDuration.toFixed(
      1
    )}ms and ended with ${JSON.stringify(distinctIdentityResult.slice(-120))}`
  );

  for (const occurrenceCount of [128, 129]) {
    const result = runOriginlessExplicitOccurrenceCase(occurrenceCount);
    assert.ok(
      result.endsWith(originlessExplicitExpectedTail),
      `${occurrenceCount} originless explicit occurrences ended with ${JSON.stringify(
        result.slice(-120)
      )}`
    );
  }

  const sparseAlternativeChainSize = 6000;
  const sparseAlternativeExternalSource =
    "https://cdn.example/pkg/Chain.tsx";
  const sparseAlternativeStackString = `\n${[
    ...Array.from(
      { length: sparseAlternativeChainSize },
      (_value, index) => `  in K${index} (at Chain.tsx)`
    ),
    `  in K${sparseAlternativeChainSize} (at Local.tsx)`,
  ].join("\n")}`;
  const sparseAlternativeContent = `[<div />${sparseAlternativeStackString.replace(
    /\r?\n\s+/g,
    " "
  )}]`;
  let sparseAlternativeFiber = {
    _debugStack: {
      stack: `    at K${sparseAlternativeChainSize} (http://localhost:5173/src/Local.tsx:20:4)`,
    },
  };
  for (
    let index = sparseAlternativeChainSize - 1;
    index >= 0;
    index -= 1
  ) {
    sparseAlternativeFiber = {
      _debugOwner: sparseAlternativeFiber,
      _debugStack: {
        stack: `    at K${index} (${sparseAlternativeExternalSource}:10:2)`,
      },
    };
  }
  const sparseAlternativeStart = performance.now();
  const sparseAlternativeResult = absolutizeSingleReactGrabCopyContent(
    sparseAlternativeContent,
    {
      ...elementContext,
      fiber: sparseAlternativeFiber,
      stack: [
        ...Array.from(
          { length: sparseAlternativeChainSize },
          (_value, index) => ({
            functionName: `K${index + 1}`,
            fileName: sparseAlternativeExternalSource,
            lineNumber: 10,
            columnNumber: 2,
          })
        ),
        {
          functionName: `K${sparseAlternativeChainSize}`,
          fileName: "Local.tsx",
          lineNumber: 20,
          columnNumber: 4,
        },
      ],
      stackString: sparseAlternativeStackString,
    },
    sourceRoot,
    "/"
  );
  const sparseAlternativeDuration =
    performance.now() - sparseAlternativeStart;

  assert.ok(
    sparseAlternativeDuration < 500 &&
      sparseAlternativeResult === sparseAlternativeContent,
    `sparse alternative chain matching took ${sparseAlternativeDuration.toFixed(
      1
    )}ms and ended with ${JSON.stringify(sparseAlternativeResult.slice(-120))}`
  );

  assert.deepEqual(
    untrustedSourceCases.map(({ content, context: sourceContext }) =>
      absolutizeSingleReactGrabCopyContent(
        content,
        sourceContext,
        sourceRoot,
        "/"
      )
    ),
    untrustedSourceCases.map(({ expected }) => expected)
  );

  const createStyle = (display = "", priority = "") => {
    let currentDisplay = display;
    let currentPriority = priority;

    return {
      getPropertyPriority(property) {
        assert.equal(property, "display");
        return currentPriority;
      },
      getPropertyValue(property) {
        assert.equal(property, "display");
        return currentDisplay;
      },
      removeProperty(property) {
        assert.equal(property, "display");
        currentDisplay = "";
        currentPriority = "";
      },
      setProperty(property, value, nextPriority = "") {
        assert.equal(property, "display");
        currentDisplay = value;
        currentPriority = nextPriority;
      },
    };
  };

  const commentWrapper = { style: createStyle("inline-flex") };
  const editWrapper = { style: createStyle() };
  const moreOptionsButton = { style: createStyle("inline-flex") };
  const toolbarRoot = {
    querySelectorAll(selector) {
      if (selector.includes('"comment"')) {
        return [{ parentElement: commentWrapper }];
      }
      if (selector.includes('"edit"')) {
        return [{ parentElement: editWrapper }];
      }
      if (selector === "[data-react-grab-more-options]") {
        return [moreOptionsButton];
      }
      return [];
    },
  };

  const restoreToolbarActions = hideDisabledReactGrabToolbarActions(toolbarRoot);
  assert.equal(commentWrapper.style.getPropertyValue("display"), "none");
  assert.equal(commentWrapper.style.getPropertyPriority("display"), "important");
  assert.equal(editWrapper.style.getPropertyValue("display"), "none");
  assert.equal(moreOptionsButton.style.getPropertyValue("display"), "none");
  assert.equal(
    moreOptionsButton.style.getPropertyPriority("display"),
    "important"
  );
  restoreToolbarActions();
  assert.equal(commentWrapper.style.getPropertyValue("display"), "inline-flex");
  assert.equal(editWrapper.style.getPropertyValue("display"), "");
  assert.equal(
    moreOptionsButton.style.getPropertyValue("display"),
    "inline-flex"
  );

  const activeCursorAttributes = new Set();
  let cursorStyle = null;
  let cursorStyleRemoved = false;
  const plainTextClipboardWrites = [];
  const previousDocument = globalThis.document;
  const previousMutationObserver = globalThis.MutationObserver;
  const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  );

  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, "style");
      return {
        textContent: "",
        remove() {
          cursorStyleRemoved = true;
        },
      };
    },
    documentElement: {
      removeAttribute(name) {
        activeCursorAttributes.delete(name);
      },
      toggleAttribute(name, force) {
        if (force) activeCursorAttributes.add(name);
        else activeCursorAttributes.delete(name);
      },
    },
    head: {
      append(style) {
        cursorStyle = style;
      },
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.MutationObserver = class {
    disconnect() {}
    observe() {}
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        async writeText(content) {
          plainTextClipboardWrites.push(content);
        },
      },
    },
  });

  try {
    let pickerPlugin = null;
    const unregisteredPlugins = [];
    const removePickerCustomizations = configureReactGrabPicker({
      isActive: () => false,
      registerPlugin(plugin) {
        pickerPlugin = plugin;
      },
      setToolbarState() {},
      unregisterPlugin(name) {
        unregisteredPlugins.push(name);
      },
    });

    assert.match(cursorStyle?.textContent ?? "", /cursor:\s*default\s*!important/);
    pickerPlugin.hooks.onStateChange({ isActive: true });
    assert.equal(activeCursorAttributes.size, 1);
    pickerPlugin.hooks.onStateChange({ isActive: false });
    assert.equal(activeCursorAttributes.size, 0);

    const copiedContent =
      '[<div class="font-semibold t...">AI 自由构建。</div> in SidebarFooter]\n';
    await pickerPlugin.hooks.onCopySuccess([], copiedContent);
    assert.deepEqual(plainTextClipboardWrites, [copiedContent]);
    assert.doesNotMatch(plainTextClipboardWrites[0], /<pre><code>/);

    removePickerCustomizations();
    assert.equal(cursorStyleRemoved, true);
    assert.equal(activeCursorAttributes.size, 0);
    assert.equal(
      unregisteredPlugins.at(-1),
      "nocobase-portal-copy-input-line"
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;

    if (previousMutationObserver === undefined) {
      delete globalThis.MutationObserver;
    } else {
      globalThis.MutationObserver = previousMutationObserver;
    }

    if (previousNavigatorDescriptor === undefined) {
      delete globalThis.navigator;
    } else {
      Object.defineProperty(
        globalThis,
        "navigator",
        previousNavigatorDescriptor
      );
    }
  }

  const appSource = await readFile(
    new URL("../src/App.tsx", import.meta.url),
    "utf8"
  );
  assert.match(appSource, /import\.meta\.env\.DEV/);
  assert.match(appSource, /react-grab-picker/);

  const pickerSource = await readFile(
    new URL(
      "../src/components/development/react-grab-picker.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(pickerSource, /import\("react-grab\/core"\)/);
  assert.match(pickerSource, /telemetry:\s*false/);
  assert.match(pickerSource, /configureReactGrabPicker/);
  assert.doesNotMatch(
    pickerSource,
    /toolbar:\s*\{|<Button|ChevronUp|freezeReactUpdates/
  );

  await assert.rejects(
    access(
      new URL(
        "../src/components/development/react-grab-picker-content.ts",
        import.meta.url
      )
    ),
    { code: "ENOENT" }
  );

  console.log("React Grab picker customization regression tests passed");
} finally {
  await server.close();
}
