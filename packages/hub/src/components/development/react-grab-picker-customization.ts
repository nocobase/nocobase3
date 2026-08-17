import type { ReactGrabAPI } from "react-grab";

declare const __PORTAL_DEV_SOURCE_ROOT__: string;

const PORTAL_COPY_PLUGIN = "nocobase-portal-copy-input-line";
const REACT_GRAB_HOST_SELECTOR = '[data-react-grab="true"]';
const V8_ANONYMOUS_DEBUG_SOURCE_LINE =
  /^\s*at (?:async\s+)?((?:[a-z][a-z\d+.-]*:|[\\/]|[A-Za-z]:[\\/]).+)\s*$/i;
const SOURCE_LIKE_PREFIX = /^(?:[a-z][a-z\d+.-]*:|[\\/]|[A-Za-z]:[\\/])/i;
const SOURCE_FILE_REFERENCE = /\.[cm]?[jt]sx?(?:[?#]|(?=[^A-Za-z\d]|$))/i;
const MAX_GROUPED_SOURCE_MATCHING_EDGES = 4096;
const MAX_SOURCE_LOCATION_CANDIDATES = 64;
const MAX_SOURCE_OCCURRENCES_PER_FILE = 128;
const MAX_SOURCE_STACK_LINE_LENGTH = 64 * 1024;
const URI_UNRESERVED_CHARACTER = /^[A-Za-z\d._~-]$/;

export const REACT_GRAB_DISABLED_ACTIONS = ["comment", "edit"] as const;

interface ReactGrabElementContextLike {
  element?: unknown;
  fiber: unknown;
  stack?: unknown;
  stackString?: unknown;
}

interface ReactGrabStackFrameLike {
  columnNumber?: unknown;
  fileName?: unknown;
  functionName?: unknown;
  lineNumber?: unknown;
}

interface PortalSourceLocation {
  columnNumber: number | null;
  lineNumber: number | null;
  relativePath: string;
}

interface DebugSourceLine {
  componentName: string | null;
  source: string;
}

interface ParsedSourceLocation {
  fileName: string;
  position: string | undefined;
  sourcePath: string;
}

interface SourceOccurrence {
  sourcePath: string;
}

interface CopySourceOccurrence extends SourceOccurrence {
  sourceLocationKey: string;
}

interface RawSourceOccurrence extends SourceOccurrence {
  componentName: string | null;
  isAnonymous: boolean;
  isTrusted: boolean;
  sourceLocationKeys: string[];
}

interface StructuredSourceNameOccurrence {
  columnNumber: number | null;
  componentName: string;
  consumed: boolean;
  lineNumber: number | null;
}

function normalizePortalBase(portalBase: string) {
  const normalized = portalBase.trim().replace(/^\/+|\/+$/g, "");
  return normalized ? `/${normalized}/` : "/";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLimitedDelimiterIndexes(value: string, delimiter: string) {
  const indexes: number[] = [];
  let delimiterIndex = value.indexOf(delimiter);

  while (delimiterIndex !== -1) {
    if (indexes.length === MAX_SOURCE_LOCATION_CANDIDATES) return null;
    indexes.push(delimiterIndex);
    delimiterIndex = value.indexOf(delimiter, delimiterIndex + 1);
  }

  return indexes;
}

function normalizeDecodedSourcePath(value: string) {
  try {
    return decodeURIComponent(value).replace(/\\/g, "/");
  } catch {
    return value.replace(/\\/g, "/");
  }
}

function getContextOrigin(context: ReactGrabElementContextLike) {
  if (!context.element || typeof context.element !== "object") return null;

  const ownerDocument = (context.element as { ownerDocument?: unknown })
    .ownerDocument;
  if (!ownerDocument || typeof ownerDocument !== "object") return null;

  const location = (ownerDocument as { location?: unknown }).location;
  if (!location || typeof location !== "object") return null;

  const origin = (location as { origin?: unknown }).origin;
  if (typeof origin !== "string") return null;

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function getFiberDebugStack(fiber: unknown) {
  if (!fiber || typeof fiber !== "object") return null;

  const debugStack = (fiber as { _debugStack?: unknown })._debugStack;
  if (!debugStack || typeof debugStack !== "object") return null;

  const stack = (debugStack as { stack?: unknown }).stack;
  return typeof stack === "string" ? stack : null;
}

function getFiberDebugStacks(fiber: unknown) {
  const stacks: string[] = [];
  const visited = new Set<object>();
  let hasMissingDebugStack = false;
  let currentFiber = fiber;

  while (currentFiber && typeof currentFiber === "object") {
    if (visited.has(currentFiber)) break;
    visited.add(currentFiber);

    const stack = getFiberDebugStack(currentFiber);
    if (stack) {
      stacks.push(stack);
    } else {
      hasMissingDebugStack = true;
    }

    currentFiber = (currentFiber as { _debugOwner?: unknown })._debugOwner;
  }

  return { hasMissingDebugStack, stacks };
}

function getPortalSourcePaths(
  source: string,
  portalBase: string,
  expectedOrigin: string | null
) {
  const normalizedBase = normalizePortalBase(portalBase);
  const sourcePattern = new RegExp(
    `^(?:(https?:\\/\\/[^/()\\s]+))?` +
      `${escapeRegExp(normalizedBase)}` +
      `((?:registry|src)/[^?#\\r\\n]+?\\.[cm]?[jt]sx?)` +
      `(?:[?#][^\\r\\n]*)?(?::\\d+){0,2}$`,
    "i"
  );
  const match = source.trim().match(sourcePattern);
  if (!match) return [];

  if (match[1]) {
    if (!expectedOrigin) return [];
    try {
      if (new URL(match[1]).origin !== expectedOrigin) return [];
    } catch {
      return [];
    }
  }

  const relativePath = normalizeDecodedSourcePath(match[2]);
  return relativePath.split("/").includes("..") ? [] : [relativePath];
}

function getSourcePosition(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function formatSourcePosition(
  sourceLocation: PortalSourceLocation | null | undefined,
  originalPosition: string | undefined
) {
  if (!sourceLocation?.lineNumber) return originalPosition ?? "";

  const original = originalPosition?.match(/^:(\d+)(?::(\d+))?$/);
  const originalColumn =
    Number(original?.[1]) === sourceLocation.lineNumber && original?.[2]
      ? Number(original[2])
      : null;
  const columnNumber = sourceLocation.columnNumber ?? originalColumn;

  return `:${sourceLocation.lineNumber}${
    columnNumber ? `:${columnNumber}` : ""
  }`;
}

function isAliasSourcePositionCompatible(
  sourceLocation: PortalSourceLocation | null | undefined,
  originalPosition: string | undefined
) {
  if (!originalPosition || !sourceLocation?.lineNumber) return true;

  const original = originalPosition.match(/^:(\d+)(?::(\d+))?$/);
  if (!original || Number(original[1]) !== sourceLocation.lineNumber) {
    return false;
  }

  return (
    !original[2] ||
    !sourceLocation.columnNumber ||
    Number(original[2]) === sourceLocation.columnNumber
  );
}

function getSourceFileName(value: string) {
  const tail = value
    .replace(/\\/g, "/")
    .replace(/[?#].*$/, "")
    .split("/")
    .pop();
  const fileName = tail?.match(/^(.*\.[cm]?[jt]sx?)(?::\d+){0,2}$/i)?.[1];
  if (!fileName) return null;

  return normalizeDecodedSourcePath(fileName).split("/").pop() ?? null;
}

function parseSourceLocation(value: string): ParsedSourceLocation | null {
  const source = value.match(
    /^(.+\.[cm]?[jt]sx?)([?#][^\s]*?)?((?::\d+)(?::\d+)?)?$/i
  );
  if (!source) return null;

  const sourcePath = `${source[1]}${source[2] ?? ""}`;
  const fileName = getSourceFileName(sourcePath);
  return fileName
    ? { fileName, position: source[3], sourcePath }
    : null;
}

function getParsedSourcePosition(value: string) {
  const position = parseSourceLocation(value)?.position?.match(
    /^:(\d+)(?::(\d+))?$/
  );
  if (!position) return null;

  return {
    columnNumber: position[2] ? Number(position[2]) : null,
    lineNumber: Number(position[1]),
  };
}

function canUseStructuredSourcePosition(
  fileName: string,
  relativePath: string,
  portalBase: string,
  expectedOrigin: string | null
) {
  const normalizedFileName = normalizeDecodedSourcePath(
    fileName
    .replace(/\\/g, "/")
    .replace(/[?#].*$/, "")
      .replace(/:\d+(?::\d+)?$/, "")
  );
  if (!normalizedFileName.includes("/")) {
    return true;
  }

  if (/^(?:[a-z][a-z\d+.-]*:\/\/|\/|[A-Za-z]:\/)/i.test(normalizedFileName)) {
    const matchingPaths = getPortalSourcePaths(
      fileName,
      portalBase,
      expectedOrigin
    );
    return matchingPaths.length === 1 && matchingPaths[0] === relativePath;
  }

  const normalizedRelativePath = normalizedFileName.replace(/^(?:\.\/)+/, "");
  return (
    !normalizedRelativePath.split("/").includes("..") &&
    normalizedRelativePath === relativePath
  );
}

function normalizeUrlPathname(pathname: string) {
  const normalizeEscape = (escape: string) => {
    const character = String.fromCharCode(
      Number.parseInt(escape.slice(1), 16)
    );
    return URI_UNRESERVED_CHARACTER.test(character)
      ? character
      : escape.toUpperCase();
  };

  try {
    return pathname
      .split(/(%[\da-f]{2})/gi)
      .map((part, index) =>
        index % 2 === 1
          ? normalizeEscape(part)
          : encodeURI(part).replace(/%[\da-f]{2}/gi, normalizeEscape)
      )
      .join("");
  } catch {
    return pathname.replace(/%[\da-f]{2}/gi, normalizeEscape);
  }
}

function getComparableSourcePath(
  source: string,
  portalBase: string,
  expectedOrigin: string | null
) {
  const portalSourcePaths = getPortalSourcePaths(
    source,
    portalBase,
    expectedOrigin
  );
  if (portalSourcePaths.length === 1) {
    return `portal:${portalSourcePaths[0]}`;
  }

  const sourceWithoutPosition = source.trim().replace(/(?::\d+){1,2}$/, "");
  const normalizedSource = normalizeDecodedSourcePath(
    sourceWithoutPosition.replace(/[?#].*$/, "")
  );
  const normalizedRelativeSource = normalizedSource.replace(/^(?:\.\/)+/, "");
  if (/^(?:registry|src)\//i.test(normalizedRelativeSource)) {
    return `portal:${normalizedRelativeSource}`;
  }
  if (!normalizedSource.includes("/")) return null;
  if (/^[A-Za-z]:\//.test(normalizedSource)) {
    return `path:${normalizedSource[0].toUpperCase()}${normalizedSource.slice(1)}`;
  }

  try {
    const url = new URL(sourceWithoutPosition);
    return `url:${JSON.stringify([
      url.protocol,
      url.host,
      normalizeUrlPathname(url.pathname),
    ])}`;
  } catch {
    return `path:${normalizedSource}`;
  }
}

function getUrlSourcePathname(source: string) {
  const sourceWithoutPosition = source.trim().replace(/(?::\d+){1,2}$/, "");
  try {
    return normalizeUrlPathname(new URL(sourceWithoutPosition).pathname);
  } catch {
    return null;
  }
}

function getOriginlessAbsoluteCopyPath(
  source: string,
  portalBase: string,
  expectedOrigin: string | null
) {
  if (getPortalSourcePaths(source, portalBase, expectedOrigin).length > 0) {
    return null;
  }

  const sourceWithoutPosition = source.trim().replace(/(?::\d+){1,2}$/, "");
  const sourcePath = sourceWithoutPosition
    .replace(/[?#].*$/, "")
    .replace(/\\/g, "/");
  return /^\/(?!\/)/.test(sourcePath)
    ? normalizeUrlPathname(sourcePath)
    : null;
}

function createSourceOccurrenceMatcher(
  rawSources: RawSourceOccurrence[],
  copySources: CopySourceOccurrence[],
  portalBase: string,
  expectedOrigin: string | null
) {
  const rawMatches = rawSources.map(({ sourcePath }) => {
    const comparablePath = getComparableSourcePath(
      sourcePath,
      portalBase,
      expectedOrigin
    );
    return {
      comparablePath,
      urlPathname: comparablePath?.startsWith("url:")
        ? getUrlSourcePathname(sourcePath)
        : null,
    };
  });
  const copyMatches = copySources.map(({ sourcePath }) => ({
    comparablePath: getComparableSourcePath(
      sourcePath,
      portalBase,
      expectedOrigin
    ),
    originlessAbsolutePath: getOriginlessAbsoluteCopyPath(
      sourcePath,
      portalBase,
      expectedOrigin
    ),
  }));
  const rawIndexBySource = new Map(
    rawSources.map((source, rawIndex) => [source, rawIndex] as const)
  );
  const canMatchSources = (
    rawIndex: number,
    copyIndex: number,
    matchSourceLocationKeys: boolean
  ) => {
    const { comparablePath: rawPath, urlPathname } = rawMatches[rawIndex];
    const { comparablePath: copyPath, originlessAbsolutePath } =
      copyMatches[copyIndex];
    const hasCompatiblePath =
      !copyPath ||
      copyPath === rawPath ||
      (originlessAbsolutePath !== null &&
        originlessAbsolutePath === urlPathname);
    return (
      hasCompatiblePath &&
      (!matchSourceLocationKeys ||
        rawSources[rawIndex].sourceLocationKeys.includes(
          copySources[copyIndex].sourceLocationKey
        ))
    );
  };

  const getSelectedRawIndexes = (selectedSources: RawSourceOccurrence[]) => {
    const selectedRawIndexes: number[] = [];
    for (const source of selectedSources) {
      const rawIndex = rawIndexBySource.get(source);
      if (rawIndex === undefined) return null;
      selectedRawIndexes.push(rawIndex);
    }
    return selectedRawIndexes;
  };

  const normalGraphs = new Map<
    boolean,
    { copyToRawIndexes: number[][]; rawToCopyIndexes: number[][] }
  >();
  const getNormalGraph = (matchSourceLocationKeys: boolean) => {
    const existingGraph = normalGraphs.get(matchSourceLocationKeys);
    if (existingGraph) return existingGraph;

    const rawToCopyIndexes = rawMatches.map((_match, rawIndex) =>
      copyMatches.flatMap((_copyMatch, copyIndex) =>
        canMatchSources(rawIndex, copyIndex, matchSourceLocationKeys)
          ? [copyIndex]
          : []
      )
    );
    const copyToRawIndexes = copyMatches.map((_match, copyIndex) =>
      rawMatches.flatMap((_rawMatch, rawIndex) =>
        canMatchSources(rawIndex, copyIndex, matchSourceLocationKeys)
          ? [rawIndex]
          : []
      )
    );
    const graph = { copyToRawIndexes, rawToCopyIndexes };
    normalGraphs.set(matchSourceLocationKeys, graph);
    return graph;
  };

  const hasCompleteNormalMatching = (
    selectedRawIndexes: number[],
    matchSourceLocationKeys: boolean
  ) => {
    const { copyToRawIndexes, rawToCopyIndexes } = getNormalGraph(
      matchSourceLocationKeys
    );
    const relevantRawIndexes = new Set<number>();
    const relevantCopyIndexes = new Set<number>();
    const pendingRawIndexes: number[] = [];

    selectedRawIndexes.forEach((rawIndex) => {
      relevantRawIndexes.add(rawIndex);
      pendingRawIndexes.push(rawIndex);
    });

    for (let cursor = 0; cursor < pendingRawIndexes.length; cursor += 1) {
      const rawIndex = pendingRawIndexes[cursor];
      for (const copyIndex of rawToCopyIndexes[rawIndex]) {
        if (relevantCopyIndexes.has(copyIndex)) continue;
        relevantCopyIndexes.add(copyIndex);

        for (const connectedRawIndex of copyToRawIndexes[copyIndex]) {
          if (relevantRawIndexes.has(connectedRawIndex)) continue;
          relevantRawIndexes.add(connectedRawIndex);
          pendingRawIndexes.push(connectedRawIndex);
        }
      }
    }

    if (relevantRawIndexes.size > relevantCopyIndexes.size) return false;

    const matchedRawIndexes = new Array<number>(copySources.length).fill(-1);
    const matchRawSource = (
      rawIndex: number,
      visitedCopies: Set<number>
    ): boolean => {
      for (const copyIndex of rawToCopyIndexes[rawIndex]) {
        if (visitedCopies.has(copyIndex)) continue;

        visitedCopies.add(copyIndex);
        const matchedRawIndex = matchedRawIndexes[copyIndex];
        if (
          matchedRawIndex === -1 ||
          matchRawSource(matchedRawIndex, visitedCopies)
        ) {
          matchedRawIndexes[copyIndex] = rawIndex;
          return true;
        }
      }

      return false;
    };

    return [...relevantRawIndexes].every((rawIndex) =>
      matchRawSource(rawIndex, new Set())
    );
  };

  const groupedAnalyses = new Map<
    boolean,
    {
      componentResults: boolean[];
      rawGroupIndexByRawIndex: number[];
      rawGroupToComponentIndex: number[];
    }
  >();
  const createGroupedAnalysis = (matchSourceLocationKeys: boolean) => {
    const rawGroups: Array<{
      comparablePath: string | null;
      count: number;
      sourceLocationKeys: Set<string>;
      urlPathname: string | null;
    }> = [];
    const rawGroupIndexBySignature = new Map<string, number>();
    const rawGroupIndexByRawIndex: number[] = [];
    rawMatches.forEach(({ comparablePath, urlPathname }, rawIndex) => {
      const sourceLocationKeys = matchSourceLocationKeys
        ? [...new Set(rawSources[rawIndex].sourceLocationKeys)].sort()
        : [];
      const signature = JSON.stringify([
        comparablePath,
        urlPathname,
        sourceLocationKeys,
      ]);
      let rawGroupIndex = rawGroupIndexBySignature.get(signature);
      if (rawGroupIndex === undefined) {
        rawGroupIndex = rawGroups.length;
        rawGroupIndexBySignature.set(signature, rawGroupIndex);
        rawGroups.push({
          comparablePath,
          count: 0,
          sourceLocationKeys: new Set(sourceLocationKeys),
          urlPathname,
        });
      }
      rawGroups[rawGroupIndex].count += 1;
      rawGroupIndexByRawIndex[rawIndex] = rawGroupIndex;
    });

    const copyGroups: Array<{
      comparablePath: string | null;
      count: number;
      originlessAbsolutePath: string | null;
      sourceLocationKey: string | null;
    }> = [];
    const copyGroupIndexBySignature = new Map<string, number>();
    copyMatches.forEach(
      ({ comparablePath, originlessAbsolutePath }, copyIndex) => {
        const sourceLocationKey = matchSourceLocationKeys
          ? copySources[copyIndex].sourceLocationKey
          : null;
        const signature = JSON.stringify([
          comparablePath,
          originlessAbsolutePath,
          sourceLocationKey,
        ]);
        const existingCopyGroupIndex =
          copyGroupIndexBySignature.get(signature);
        if (existingCopyGroupIndex !== undefined) {
          copyGroups[existingCopyGroupIndex].count += 1;
          return;
        }

        copyGroupIndexBySignature.set(signature, copyGroups.length);
        copyGroups.push({
          comparablePath,
          count: 1,
          originlessAbsolutePath,
          sourceLocationKey,
        });
      }
    );

    const addIndex = (
      indexesByValue: Map<string, number[]>,
      value: string,
      index: number
    ) => {
      const indexes = indexesByValue.get(value);
      if (indexes) indexes.push(index);
      else indexesByValue.set(value, [index]);
    };
    const copyGroupIndexesByComparablePath = new Map<string, number[]>();
    const copyGroupIndexesByOriginlessPath = new Map<string, number[]>();
    const copyGroupsWithoutComparablePath: number[] = [];
    const copyGroupIndexesByComparablePathAndKey = new Map<
      string,
      number[]
    >();
    const copyGroupIndexesByOriginlessPathAndKey = new Map<
      string,
      number[]
    >();
    const copyGroupIndexesWithoutComparablePathByKey = new Map<
      string,
      number[]
    >();
    copyGroups.forEach((copyGroup, copyGroupIndex) => {
      if (matchSourceLocationKeys && copyGroup.sourceLocationKey !== null) {
        if (copyGroup.comparablePath) {
          addIndex(
            copyGroupIndexesByComparablePathAndKey,
            JSON.stringify([
              copyGroup.comparablePath,
              copyGroup.sourceLocationKey,
            ]),
            copyGroupIndex
          );
        } else {
          addIndex(
            copyGroupIndexesWithoutComparablePathByKey,
            copyGroup.sourceLocationKey,
            copyGroupIndex
          );
        }
        if (copyGroup.originlessAbsolutePath) {
          addIndex(
            copyGroupIndexesByOriginlessPathAndKey,
            JSON.stringify([
              copyGroup.originlessAbsolutePath,
              copyGroup.sourceLocationKey,
            ]),
            copyGroupIndex
          );
        }
        return;
      }

      if (copyGroup.comparablePath) {
        addIndex(
          copyGroupIndexesByComparablePath,
          copyGroup.comparablePath,
          copyGroupIndex
        );
      } else {
        copyGroupsWithoutComparablePath.push(copyGroupIndex);
      }
      if (copyGroup.originlessAbsolutePath) {
        addIndex(
          copyGroupIndexesByOriginlessPath,
          copyGroup.originlessAbsolutePath,
          copyGroupIndex
        );
      }
    });

    const rawGroupToCopyGroups = rawGroups.map((rawGroup) => {
      if (matchSourceLocationKeys) {
        const candidates = new Set<number>();
        for (const sourceLocationKey of rawGroup.sourceLocationKeys) {
          for (const copyGroupIndex of
            copyGroupIndexesWithoutComparablePathByKey.get(
              sourceLocationKey
            ) ?? []) {
            candidates.add(copyGroupIndex);
          }
          if (rawGroup.comparablePath) {
            for (const copyGroupIndex of
              copyGroupIndexesByComparablePathAndKey.get(
                JSON.stringify([
                  rawGroup.comparablePath,
                  sourceLocationKey,
                ])
              ) ?? []) {
              candidates.add(copyGroupIndex);
            }
          }
          if (rawGroup.urlPathname) {
            for (const copyGroupIndex of
              copyGroupIndexesByOriginlessPathAndKey.get(
                JSON.stringify([rawGroup.urlPathname, sourceLocationKey])
              ) ?? []) {
              candidates.add(copyGroupIndex);
            }
          }
        }
        return [...candidates];
      }

      const candidates = new Set(copyGroupsWithoutComparablePath);
      if (rawGroup.comparablePath) {
        for (const copyGroupIndex of
          copyGroupIndexesByComparablePath.get(rawGroup.comparablePath) ?? []) {
          candidates.add(copyGroupIndex);
        }
      }
      if (rawGroup.urlPathname) {
        for (const copyGroupIndex of
          copyGroupIndexesByOriginlessPath.get(rawGroup.urlPathname) ?? []) {
          candidates.add(copyGroupIndex);
        }
      }

      return [...candidates];
    });
    const copyGroupToRawGroups = copyGroups.map(() => [] as number[]);
    rawGroupToCopyGroups.forEach((copyGroupIndexes, rawGroupIndex) => {
      for (const copyGroupIndex of copyGroupIndexes) {
        copyGroupToRawGroups[copyGroupIndex].push(rawGroupIndex);
      }
    });

    const hasCompleteComponentMatching = (
      componentRawGroupIndexes: number[],
      componentCopyGroupIndexes: number[]
    ) => {
      const rawCount = componentRawGroupIndexes.reduce(
        (count, rawGroupIndex) => count + rawGroups[rawGroupIndex].count,
        0
      );
      const copyCount = componentCopyGroupIndexes.reduce(
        (count, copyGroupIndex) => count + copyGroups[copyGroupIndex].count,
        0
      );
      if (rawCount > copyCount) return false;

      type FlowEdge = {
        capacity: number;
        reverseIndex: number;
        to: number;
      };
      const sourceNode = 0;
      const firstRawNode = 1;
      const firstCopyNode = firstRawNode + componentRawGroupIndexes.length;
      const sinkNode = firstCopyNode + componentCopyGroupIndexes.length;
      const graph = Array.from(
        { length: sinkNode + 1 },
        () => [] as FlowEdge[]
      );
      const addFlowEdge = (from: number, to: number, capacity: number) => {
        const forwardEdge = {
          capacity,
          reverseIndex: graph[to].length,
          to,
        };
        const reverseEdge = {
          capacity: 0,
          reverseIndex: graph[from].length,
          to: from,
        };
        graph[from].push(forwardEdge);
        graph[to].push(reverseEdge);
      };
      const copyNodeByGroupIndex = new Map<number, number>();
      componentCopyGroupIndexes.forEach((copyGroupIndex, index) => {
        const copyNode = firstCopyNode + index;
        copyNodeByGroupIndex.set(copyGroupIndex, copyNode);
        addFlowEdge(
          copyNode,
          sinkNode,
          copyGroups[copyGroupIndex].count
        );
      });
      componentRawGroupIndexes.forEach((rawGroupIndex, index) => {
        const rawNode = firstRawNode + index;
        addFlowEdge(sourceNode, rawNode, rawGroups[rawGroupIndex].count);
        for (const copyGroupIndex of rawGroupToCopyGroups[rawGroupIndex]) {
          const copyNode = copyNodeByGroupIndex.get(copyGroupIndex);
          if (copyNode !== undefined) {
            addFlowEdge(rawNode, copyNode, rawCount);
          }
        }
      });

      let matchedCount = 0;
      const levels = new Array<number>(graph.length).fill(-1);
      const nextEdgeIndexes = new Array<number>(graph.length).fill(0);
      const buildLevels = () => {
        levels.fill(-1);
        levels[sourceNode] = 0;
        const queue = [sourceNode];
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const node = queue[cursor];
          for (const edge of graph[node]) {
            if (edge.capacity <= 0 || levels[edge.to] !== -1) continue;
            levels[edge.to] = levels[node] + 1;
            queue.push(edge.to);
          }
        }
        return levels[sinkNode] !== -1;
      };
      const sendFlow = (node: number, flow: number): number => {
        if (node === sinkNode) return flow;

        for (
          ;
          nextEdgeIndexes[node] < graph[node].length;
          nextEdgeIndexes[node] += 1
        ) {
          const edge = graph[node][nextEdgeIndexes[node]];
          if (edge.capacity <= 0 || levels[edge.to] !== levels[node] + 1) {
            continue;
          }
          const sentFlow = sendFlow(edge.to, Math.min(flow, edge.capacity));
          if (sentFlow <= 0) continue;

          edge.capacity -= sentFlow;
          graph[edge.to][edge.reverseIndex].capacity += sentFlow;
          return sentFlow;
        }

        return 0;
      };

      while (matchedCount < rawCount && buildLevels()) {
        nextEdgeIndexes.fill(0);
        let sentFlow = sendFlow(
          sourceNode,
          Math.max(0, rawCount - matchedCount)
        );
        while (sentFlow > 0) {
          matchedCount += sentFlow;
          sentFlow = sendFlow(
            sourceNode,
            Math.max(0, rawCount - matchedCount)
          );
        }
      }
      return matchedCount === rawCount;
    };

    const rawGroupToComponentIndex = new Array<number>(rawGroups.length).fill(
      -1
    );
    const componentResults: boolean[] = [];
    for (
      let startRawGroupIndex = 0;
      startRawGroupIndex < rawGroups.length;
      startRawGroupIndex += 1
    ) {
      if (rawGroupToComponentIndex[startRawGroupIndex] !== -1) continue;

      const componentIndex = componentResults.length;
      const componentRawGroupIndexes = [startRawGroupIndex];
      const componentCopyGroupIndexes = new Set<number>();
      rawGroupToComponentIndex[startRawGroupIndex] = componentIndex;
      for (
        let cursor = 0;
        cursor < componentRawGroupIndexes.length;
        cursor += 1
      ) {
        const rawGroupIndex = componentRawGroupIndexes[cursor];
        for (const copyGroupIndex of rawGroupToCopyGroups[rawGroupIndex]) {
          if (componentCopyGroupIndexes.has(copyGroupIndex)) continue;
          componentCopyGroupIndexes.add(copyGroupIndex);
          for (const connectedRawGroupIndex of
            copyGroupToRawGroups[copyGroupIndex]) {
            if (rawGroupToComponentIndex[connectedRawGroupIndex] !== -1) {
              continue;
            }
            rawGroupToComponentIndex[connectedRawGroupIndex] = componentIndex;
            componentRawGroupIndexes.push(connectedRawGroupIndex);
          }
        }
      }

      const componentEdgeCount = componentRawGroupIndexes.reduce(
        (edgeCount, rawGroupIndex) =>
          edgeCount + rawGroupToCopyGroups[rawGroupIndex].length,
        0
      );
      componentResults.push(
        componentEdgeCount <= MAX_GROUPED_SOURCE_MATCHING_EDGES &&
          hasCompleteComponentMatching(
            componentRawGroupIndexes,
            [...componentCopyGroupIndexes]
          )
      );
    }

    return {
      componentResults,
      rawGroupIndexByRawIndex,
      rawGroupToComponentIndex,
    };
  };

  return {
    hasCompleteMatching(
      selectedSources: RawSourceOccurrence[],
      matchSourceLocationKeys = false
    ) {
      const selectedRawIndexes = getSelectedRawIndexes(selectedSources);
      if (!selectedRawIndexes) return false;
      if (selectedRawIndexes.length === 0) return true;

      if (
        rawSources.length <= MAX_SOURCE_OCCURRENCES_PER_FILE &&
        copySources.length <= MAX_SOURCE_OCCURRENCES_PER_FILE
      ) {
        return hasCompleteNormalMatching(
          selectedRawIndexes,
          matchSourceLocationKeys
        );
      }

      let groupedAnalysis = groupedAnalyses.get(matchSourceLocationKeys);
      if (!groupedAnalysis) {
        groupedAnalysis = createGroupedAnalysis(matchSourceLocationKeys);
        groupedAnalyses.set(matchSourceLocationKeys, groupedAnalysis);
      }
      return selectedRawIndexes.every((rawIndex) => {
        const rawGroupIndex =
          groupedAnalysis.rawGroupIndexByRawIndex[rawIndex];
        const componentIndex =
          groupedAnalysis.rawGroupToComponentIndex[rawGroupIndex];
        return groupedAnalysis.componentResults[componentIndex] === true;
      });
    },
  };
}

function getSourceLocationKey(componentName: string, fileName: string) {
  return `${componentName.trim()}\0${fileName}`;
}

function parseCopySourceLine(
  line: string,
  componentSourcePaths: Map<string, string | null>,
  structuredSourcePathHintsByKey: Map<string, Set<string>>
) {
  if (line.length > MAX_SOURCE_STACK_LINE_LENGTH) return null;

  const prefix = line.match(/^(\s*in )/)?.[1];
  if (!prefix || !line.endsWith(")")) return null;

  const body = line.slice(prefix.length, -1);
  const delimiterIndexes = getLimitedDelimiterIndexes(body, " (at ");
  if (!delimiterIndexes) return null;

  const candidates: Array<{
    componentName: string;
    prefix: string;
    source: ParsedSourceLocation;
  }> = [];
  for (const delimiterIndex of delimiterIndexes) {
    const componentName = body.slice(0, delimiterIndex);
    const source = parseSourceLocation(body.slice(delimiterIndex + 5));
    if (componentName.trim() && source) {
      candidates.push({ componentName, prefix, source });
    }
  }

  if (candidates.length === 1) return candidates[0];

  const trustedRawCandidates = candidates.filter(
    ({ componentName, source }) =>
      Boolean(
        componentSourcePaths.get(
          getSourceLocationKey(componentName, source.fileName)
        )
      )
  );
  const untrustedRawCandidates = candidates.filter(({ componentName, source }) => {
    const key = getSourceLocationKey(componentName, source.fileName);
    return componentSourcePaths.has(key) && !componentSourcePaths.get(key);
  });
  const structuredCandidates = candidates.filter(
    ({ componentName, source }) =>
      structuredSourcePathHintsByKey.has(
        getSourceLocationKey(componentName, source.fileName)
      )
  );
  if (untrustedRawCandidates.length > 0) return null;

  const sharedCandidates = trustedRawCandidates.filter((candidate) =>
    structuredCandidates.includes(candidate)
  );
  if (sharedCandidates.length === 1) return sharedCandidates[0];
  if (sharedCandidates.length > 1) return null;
  if (trustedRawCandidates.length === 1 && structuredCandidates.length === 0) {
    return trustedRawCandidates[0];
  }
  if (trustedRawCandidates.length === 0 && structuredCandidates.length === 1) {
    return structuredCandidates[0];
  }
  return null;
}

function hasNestedDebugSource(
  source: string,
  delimiter: " (" | "@"
) {
  const delimiterIndexes = getLimitedDelimiterIndexes(source, delimiter);
  if (!delimiterIndexes) return true;

  for (const delimiterIndex of delimiterIndexes) {
    if (
      SOURCE_FILE_REFERENCE.test(source.slice(0, delimiterIndex)) &&
      SOURCE_LIKE_PREFIX.test(
        source.slice(delimiterIndex + delimiter.length)
      )
    ) {
      return true;
    }
  }

  return false;
}

function parseV8DebugSourceLine(
  line: string,
  portalBase: string,
  expectedOrigin: string | null,
  structuredSourceKeys: Set<string>,
  structuredSourcePathIdentities: Set<string>
) {
  if (line.length > MAX_SOURCE_STACK_LINE_LENGTH) return null;

  const prefix = line.match(/^\s*at\s+/)?.[0];
  if (!prefix || !line.trimEnd().endsWith(")")) return null;

  const body = line.trimEnd().slice(prefix.length, -1);
  const delimiterIndexes = getLimitedDelimiterIndexes(body, " (");
  if (!delimiterIndexes) return null;

  const candidates: DebugSourceLine[] = [];
  for (const delimiterIndex of delimiterIndexes) {
    const componentName = body.slice(0, delimiterIndex);
    const source = body.slice(delimiterIndex + 2);
    if (componentName.trim() && SOURCE_LIKE_PREFIX.test(source)) {
      candidates.push({ componentName, source });
    }
  }

  const viableCandidates = candidates.filter(
    ({ source }) => !hasNestedDebugSource(source, " (")
  );
  if (viableCandidates.length === 1) return viableCandidates[0];

  const portalCandidates = viableCandidates.filter(
    ({ source }) =>
      getPortalSourcePaths(source, portalBase, expectedOrigin).length === 1
  );
  const structuredPathCandidates = viableCandidates.filter(({ source }) => {
    const sourceIdentity = getComparableSourcePath(
      source,
      portalBase,
      expectedOrigin
    );
    return (
      sourceIdentity !== null &&
      structuredSourcePathIdentities.has(sourceIdentity)
    );
  });
  const structuredCandidates = viableCandidates.filter(
    ({ componentName, source }) => {
      const fileName = getSourceFileName(source);
      if (!componentName?.trim() || !fileName) return false;

      return structuredSourceKeys.has(
        getSourceLocationKey(componentName, fileName)
      );
    }
  );
  if (portalCandidates.length === 1) return portalCandidates[0];
  const sharedPathCandidates = portalCandidates.filter((candidate) =>
    structuredPathCandidates.includes(candidate)
  );
  if (sharedPathCandidates.length === 1) return sharedPathCandidates[0];
  if (sharedPathCandidates.length > 1) return null;
  const sharedCandidates = portalCandidates.filter((candidate) =>
    structuredCandidates.includes(candidate)
  );
  if (sharedCandidates.length === 1) return sharedCandidates[0];
  if (portalCandidates.length > 1) return null;
  if (structuredPathCandidates.length === 1) {
    return structuredPathCandidates[0];
  }
  if (structuredCandidates.length === 1) {
    return structuredCandidates[0];
  }
  return null;
}

function parseWebKitDebugSourceLine(
  line: string,
  portalBase: string,
  expectedOrigin: string | null,
  structuredSourceKeys: Set<string>,
  structuredSourcePathIdentities: Set<string>
) {
  if (line.length > MAX_SOURCE_STACK_LINE_LENGTH) return null;

  const body = line.trim();
  const delimiterIndexes = getLimitedDelimiterIndexes(body, "@");
  if (!delimiterIndexes) return null;

  const candidates: DebugSourceLine[] = [];
  for (const delimiterIndex of delimiterIndexes) {
    const componentName = body.slice(0, delimiterIndex) || null;
    const source = body.slice(delimiterIndex + 1);
    if (SOURCE_LIKE_PREFIX.test(source)) {
      candidates.push({ componentName, source });
    }
  }

  const viableCandidates = candidates.filter(
    ({ source }) => !hasNestedDebugSource(source, "@")
  );
  if (viableCandidates.length === 1) return viableCandidates[0];

  const portalCandidates = viableCandidates.filter(
    ({ source }) =>
      getPortalSourcePaths(source, portalBase, expectedOrigin).length === 1
  );
  const structuredPathCandidates = viableCandidates.filter(({ source }) => {
    const sourceIdentity = getComparableSourcePath(
      source,
      portalBase,
      expectedOrigin
    );
    return (
      sourceIdentity !== null &&
      structuredSourcePathIdentities.has(sourceIdentity)
    );
  });
  const structuredCandidates = viableCandidates.filter(
    ({ componentName, source }) => {
      const fileName = getSourceFileName(source);
      if (!componentName?.trim() || !fileName) return false;
      return structuredSourceKeys.has(
        getSourceLocationKey(componentName, fileName)
      );
    }
  );

  if (portalCandidates.length === 1) return portalCandidates[0];
  const sharedPathCandidates = portalCandidates.filter((candidate) =>
    structuredPathCandidates.includes(candidate)
  );
  if (sharedPathCandidates.length === 1) return sharedPathCandidates[0];
  if (sharedPathCandidates.length > 1) return null;
  const sharedCandidates = portalCandidates.filter((candidate) =>
    structuredCandidates.includes(candidate)
  );
  if (sharedCandidates.length === 1) return sharedCandidates[0];
  if (portalCandidates.length > 1) return null;
  if (structuredPathCandidates.length === 1) {
    return structuredPathCandidates[0];
  }
  return structuredCandidates.length === 1 ? structuredCandidates[0] : null;
}

function parseDebugSourceLine(
  line: string,
  portalBase: string,
  expectedOrigin: string | null,
  structuredSourceKeys: Set<string>,
  structuredSourcePathIdentities: Set<string>
) {
  const namedV8Line = parseV8DebugSourceLine(
    line,
    portalBase,
    expectedOrigin,
    structuredSourceKeys,
    structuredSourcePathIdentities
  );
  if (namedV8Line) return namedV8Line;

  const anonymousV8Line = line.match(V8_ANONYMOUS_DEBUG_SOURCE_LINE);
  if (anonymousV8Line) {
    return { componentName: null, source: anonymousV8Line[1] };
  }

  return parseWebKitDebugSourceLine(
    line,
    portalBase,
    expectedOrigin,
    structuredSourceKeys,
    structuredSourcePathIdentities
  );
}

function isReactRuntimeSource(source: string) {
  const normalizedSource = source.replace(/\\/g, "/");
  return /\/node_modules\/(?:\.vite\/deps\/(?:react[-_]dom(?:_client)?|react_jsx(?:-dev)?-runtime)\.js|react(?:-dom)?\/.*(?:jsx.*runtime|react-dom))/i.test(
    normalizedSource
  );
}

function getPrimaryDebugSourceLines(
  debugStacks: string[],
  portalBase: string,
  expectedOrigin: string | null,
  structuredSourceKeys: Set<string>,
  structuredSourcePathIdentities: Set<string>
) {
  const sourceLines: DebugSourceLine[] = [];
  let hasUnknownDebugStack = false;

  for (const stack of debugStacks) {
    let sourceLine: DebugSourceLine | null = null;

    for (const line of stack.split(/\r?\n/)) {
      const parsedLine = parseDebugSourceLine(
        line,
        portalBase,
        expectedOrigin,
        structuredSourceKeys,
        structuredSourcePathIdentities
      );
      if (parsedLine) {
        if (isReactRuntimeSource(parsedLine.source)) continue;
        sourceLine = parsedLine;
        break;
      }

      if (/^\s*at(?:\s|$)|^\s*[^@\s].*@/.test(line)) break;
    }

    if (sourceLine) {
      sourceLines.push(sourceLine);
    } else {
      hasUnknownDebugStack = true;
    }
  }

  return { hasUnknownDebugStack, sourceLines };
}

function flattenReactGrabStack(stackString: string) {
  return stackString.replace(/\r?\n\s+/g, " ").trimEnd();
}

function getCopyStackRange(
  content: string,
  context: ReactGrabElementContextLike
) {
  if (typeof context.stackString !== "string") return null;

  const copyStack = flattenReactGrabStack(context.stackString);
  if (!copyStack.trim()) return null;

  const candidates: number[] = [];
  let searchFrom = 0;

  while (searchFrom <= content.length - copyStack.length) {
    const start = content.indexOf(copyStack, searchFrom);
    if (start === -1) break;

    const suffix = content.slice(start + copyStack.length);
    if (
      suffix.startsWith("]") ||
      suffix.startsWith(" key: ") ||
      suffix.startsWith(" selector: ")
    ) {
      candidates.push(start);
    }
    searchFrom = start + 1;
  }

  return candidates.length === 1
    ? { copyStack, stackString: context.stackString, start: candidates[0] }
    : null;
}

function getUniqueSourcePaths(
  sources: string[],
  portalBase: string,
  expectedOrigin: string | null
) {
  const sourcePaths = new Map<string, string | null>();

  for (const source of sources) {
    for (const relativePath of getPortalSourcePaths(
      source,
      portalBase,
      expectedOrigin
    )) {
      const fileName = relativePath.split("/").pop();
      if (!fileName) continue;

      const existingPath = sourcePaths.get(fileName);
      if (existingPath === undefined) {
        sourcePaths.set(fileName, relativePath);
      } else if (existingPath !== relativePath) {
        sourcePaths.set(fileName, null);
      }
    }
  }

  return sourcePaths;
}

function getComponentSourcePaths(
  sourceLines: DebugSourceLine[],
  portalBase: string,
  expectedOrigin: string | null,
  hasUnknownDebugStack: boolean
) {
  const componentSourcePaths = new Map<string, string | null>();
  const componentSourcePathKeyCounts = new Map<string, number>();
  const trustedComponentSourcePathKeyCounts = new Map<string, number>();
  const unkeyedUntrustedComponentNames = new Set<string>();
  const untrustedAnonymousFileNameCounts = new Map<string, number>();
  const untrustedFileNames = new Set<string>();
  let hasUnkeyedUntrustedAnonymousSource = false;
  let hasUntrustedSource = hasUnknownDebugStack;

  const addSource = (componentName: string | null, source: string) => {
    const fileName = getSourceFileName(source);
    const matchingPaths = getPortalSourcePaths(
      source,
      portalBase,
      expectedOrigin
    ).filter((relativePath) => relativePath.endsWith(`/${fileName}`));
    const relativePath =
      matchingPaths.length === 1 ? matchingPaths[0] : null;
    if (!relativePath) {
      hasUntrustedSource = true;
      if (componentName?.trim()) {
        if (!fileName) {
          unkeyedUntrustedComponentNames.add(componentName.trim());
        }
      } else if (fileName) {
        untrustedAnonymousFileNameCounts.set(
          fileName,
          (untrustedAnonymousFileNameCounts.get(fileName) ?? 0) + 1
        );
      } else {
        hasUnkeyedUntrustedAnonymousSource = true;
      }
      if (fileName) untrustedFileNames.add(fileName);
    }
    if (!componentName?.trim() || !fileName) return;

    const key = getSourceLocationKey(componentName, fileName);
    componentSourcePathKeyCounts.set(
      key,
      (componentSourcePathKeyCounts.get(key) ?? 0) + 1
    );
    if (relativePath) {
      trustedComponentSourcePathKeyCounts.set(
        key,
        (trustedComponentSourcePathKeyCounts.get(key) ?? 0) + 1
      );
    }
    const existingPath = componentSourcePaths.get(key);

    if (!componentSourcePaths.has(key)) {
      componentSourcePaths.set(key, relativePath);
    } else if (existingPath !== relativePath) {
      componentSourcePaths.set(key, null);
    }
  };

  for (const sourceLine of sourceLines) {
    addSource(sourceLine.componentName, sourceLine.source);
  }

  return {
    componentSourcePathKeyCounts,
    componentSourcePaths,
    hasUnkeyedUntrustedAnonymousSource,
    hasUntrustedSource,
    trustedComponentSourcePathKeyCounts,
    untrustedAnonymousFileNameCounts,
    unkeyedUntrustedComponentNames,
    untrustedFileNames,
  };
}

function resolveSourcePath(
  componentName: string,
  fileName: string,
  sourcePaths: Map<string, string | null>,
  componentSourcePaths: Map<string, string | null>,
  allowUniqueFallback: boolean
) {
  const key = getSourceLocationKey(componentName, fileName);
  if (componentSourcePaths.has(key)) {
    return componentSourcePaths.get(key) ?? null;
  }

  return allowUniqueFallback ? (sourcePaths.get(fileName) ?? null) : null;
}

function addUniqueSourceLocation(
  sourceLocations: Map<string, PortalSourceLocation | null>,
  key: string,
  location: PortalSourceLocation
) {
  const existingLocation = sourceLocations.get(key);

  if (!sourceLocations.has(key)) {
    sourceLocations.set(key, location);
  } else if (
    !existingLocation ||
    existingLocation.relativePath !== location.relativePath ||
    existingLocation.lineNumber !== location.lineNumber ||
    existingLocation.columnNumber !== location.columnNumber
  ) {
    sourceLocations.set(key, null);
  }
}

function getUniqueSourceLocations(
  context: ReactGrabElementContextLike,
  portalBase: string
) {
  const stackFrames = Array.isArray(context.stack)
    ? context.stack.filter(
        (frame): frame is ReactGrabStackFrameLike =>
          Boolean(frame) && typeof frame === "object"
      )
    : [];
  const { hasMissingDebugStack, stacks: debugStacks } =
    getFiberDebugStacks(context.fiber);
  const expectedOrigin = getContextOrigin(context);
  const structuredSourceKeys = new Set<string>();
  const structuredSourcePathIdentities = new Set<string>();
  const structuredSourceNameOccurrencesByIdentity = new Map<
    string,
    StructuredSourceNameOccurrence[]
  >();
  for (const {
    columnNumber,
    fileName,
    functionName,
    lineNumber,
  } of stackFrames) {
    const normalizedComponentName =
      typeof functionName === "string" ? functionName.trim() : "";
    if (typeof fileName === "string") {
      const sourceIdentity = getComparableSourcePath(
        fileName,
        portalBase,
        expectedOrigin
      );
      if (sourceIdentity) {
        structuredSourcePathIdentities.add(sourceIdentity);
        if (normalizedComponentName) {
          const occurrences =
            structuredSourceNameOccurrencesByIdentity.get(sourceIdentity);
          const occurrence = {
            columnNumber: getSourcePosition(columnNumber),
            componentName: normalizedComponentName,
            consumed: false,
            lineNumber: getSourcePosition(lineNumber),
          };
          if (occurrences) {
            occurrences.push(occurrence);
          } else {
            structuredSourceNameOccurrencesByIdentity.set(sourceIdentity, [
              occurrence,
            ]);
          }
        }
      }
    }
    if (typeof fileName !== "string" || typeof functionName !== "string") {
      continue;
    }

    const normalizedFileName = getSourceFileName(fileName);
    if (normalizedComponentName && normalizedFileName) {
      structuredSourceKeys.add(
        getSourceLocationKey(normalizedComponentName, normalizedFileName)
      );
    }
  }
  const { hasUnknownDebugStack: hasUnparsedDebugStack, sourceLines } =
    getPrimaryDebugSourceLines(
      debugStacks,
      portalBase,
      expectedOrigin,
      structuredSourceKeys,
      structuredSourcePathIdentities
    );
  const hasUnknownDebugStack =
    hasMissingDebugStack || hasUnparsedDebugStack;
  const sourcePaths = getUniqueSourcePaths(
    sourceLines.map(({ source }) => source),
    portalBase,
    expectedOrigin
  );
  const anonymousSourcePaths = getUniqueSourcePaths(
    sourceLines
      .filter(({ componentName }) => !componentName?.trim())
      .map(({ source }) => source),
    portalBase,
    expectedOrigin
  );
  const rawSourceOccurrencesByFileName = new Map<
    string,
    RawSourceOccurrence[]
  >();
  const anonymousSourcePathCounts = new Map<string, number>();
  const rawSourceIdentityCounts = new Map<string, number>();
  const untrustedRawSourceIdentities = new Set<string>();
  const nextStructuredOccurrenceIndexByIdentity = new Map<string, number>();
  for (const { source } of sourceLines) {
    const sourceIdentity = getComparableSourcePath(
      source,
      portalBase,
      expectedOrigin
    );
    if (!sourceIdentity) continue;

    rawSourceIdentityCounts.set(
      sourceIdentity,
      (rawSourceIdentityCounts.get(sourceIdentity) ?? 0) + 1
    );
    if (
      getPortalSourcePaths(source, portalBase, expectedOrigin).length === 0
    ) {
      untrustedRawSourceIdentities.add(sourceIdentity);
    }
  }

  for (const { componentName, source } of sourceLines) {
    const sourceFileName = getSourceFileName(source);
    if (sourceFileName) {
      const sourceOccurrences =
        rawSourceOccurrencesByFileName.get(sourceFileName);
      const normalizedComponentName = componentName?.trim() || null;
      const sourceIdentity = getComparableSourcePath(
        source,
        portalBase,
        expectedOrigin
      );
      const sourceComponentNames = new Set<string>();
      if (normalizedComponentName) {
        sourceComponentNames.add(normalizedComponentName);
      }
      const structuredOccurrences = sourceIdentity
        ? (structuredSourceNameOccurrencesByIdentity.get(sourceIdentity) ?? [])
        : [];
      const rawSourceIdentityCount = sourceIdentity
        ? (rawSourceIdentityCounts.get(sourceIdentity) ?? 0)
        : 0;
      let matchingOccurrence: StructuredSourceNameOccurrence | null = null;

      if (
        sourceIdentity &&
        rawSourceIdentityCount === structuredOccurrences.length
      ) {
        const occurrenceIndex =
          nextStructuredOccurrenceIndexByIdentity.get(sourceIdentity) ?? 0;
        matchingOccurrence = structuredOccurrences[occurrenceIndex] ?? null;
        nextStructuredOccurrenceIndexByIdentity.set(
          sourceIdentity,
          occurrenceIndex + 1
        );
      } else if (
        rawSourceIdentityCount <= MAX_SOURCE_OCCURRENCES_PER_FILE &&
        structuredOccurrences.length <= MAX_SOURCE_OCCURRENCES_PER_FILE
      ) {
        const availableOccurrences = structuredOccurrences.filter(
          ({ consumed }) => !consumed
        );
        const sourcePosition = getParsedSourcePosition(source);
        const positionMatches = sourcePosition
          ? availableOccurrences.filter(
              (occurrence) =>
                occurrence.lineNumber === sourcePosition.lineNumber &&
                (sourcePosition.columnNumber === null ||
                  occurrence.columnNumber === sourcePosition.columnNumber)
            )
          : [];
        const positionMatchNames = new Set(
          positionMatches.map(({ componentName }) => componentName)
        );
        matchingOccurrence =
          positionMatches.length > 0 && positionMatchNames.size === 1
            ? positionMatches[0]
            : null;

        if (!matchingOccurrence && rawSourceIdentityCount === 1) {
          const availableNames = new Set(
            availableOccurrences.map(({ componentName }) => componentName)
          );
          if (availableNames.size === 1) {
            matchingOccurrence = availableOccurrences[0] ?? null;
          }
        }
      }

      if (matchingOccurrence) {
        sourceComponentNames.add(matchingOccurrence.componentName);
        matchingOccurrence.consumed = true;
      }
      const sourceOccurrence = {
        componentName: normalizedComponentName,
        isAnonymous: !normalizedComponentName,
        isTrusted:
          getPortalSourcePaths(source, portalBase, expectedOrigin).length === 1,
        sourcePath: source,
        sourceLocationKeys: [...sourceComponentNames].map((sourceComponentName) =>
          getSourceLocationKey(sourceComponentName, sourceFileName)
        ),
      };
      if (sourceOccurrences) {
        sourceOccurrences.push(sourceOccurrence);
      } else {
        rawSourceOccurrencesByFileName.set(sourceFileName, [sourceOccurrence]);
      }
    }
    if (componentName?.trim()) continue;

    for (const relativePath of getPortalSourcePaths(
      source,
      portalBase,
      expectedOrigin
    )) {
      anonymousSourcePathCounts.set(
        relativePath,
        (anonymousSourcePathCounts.get(relativePath) ?? 0) + 1
      );
    }
  }
  const unresolvedUntrustedStructuredComponentNames = new Set<string>();
  for (const [
    sourceIdentity,
    structuredOccurrences,
  ] of structuredSourceNameOccurrencesByIdentity) {
    if (!untrustedRawSourceIdentities.has(sourceIdentity)) continue;

    for (const { componentName, consumed } of structuredOccurrences) {
      if (!consumed) {
        unresolvedUntrustedStructuredComponentNames.add(componentName);
      }
    }
  }
  const {
    componentSourcePathKeyCounts,
    componentSourcePaths,
    hasUnkeyedUntrustedAnonymousSource,
    hasUntrustedSource,
    trustedComponentSourcePathKeyCounts,
    untrustedAnonymousFileNameCounts,
    unkeyedUntrustedComponentNames,
    untrustedFileNames,
  } = getComponentSourcePaths(
      sourceLines,
      portalBase,
      expectedOrigin,
      hasUnknownDebugStack
    );
  for (const componentName of unresolvedUntrustedStructuredComponentNames) {
    unkeyedUntrustedComponentNames.add(componentName);
  }
  const componentSourceKeysByFileName = new Map<string, Set<string>>();
  for (const key of trustedComponentSourcePathKeyCounts.keys()) {
    const fileName = key.slice(key.indexOf("\0") + 1);
    if (!fileName) continue;

    const componentKeys = componentSourceKeysByFileName.get(fileName);
    if (componentKeys) {
      componentKeys.add(key);
    } else {
      componentSourceKeysByFileName.set(fileName, new Set([key]));
    }
  }

  const sourceLocations = new Map<string, PortalSourceLocation | null>();
  const sourceLocationKeyCounts = new Map<string, number>();
  const aliasSourceLocationKeysByFileName = new Map<string, Set<string>>();
  const anonymousSourceLocationKeysByFileName = new Map<
    string,
    Set<string>
  >();
  const incompatibleStructuredSourceKeys = new Set<string>();
  const structuredSourcePathHintsByKey = new Map<string, Set<string>>();

  for (const frame of stackFrames) {
    const { columnNumber, fileName, functionName, lineNumber } = frame;
    if (typeof fileName !== "string" || typeof functionName !== "string") {
      continue;
    }

    const normalizedComponentName = functionName.trim();
    const normalizedFileName = getSourceFileName(fileName);
    if (!normalizedComponentName || !normalizedFileName) continue;

    const key = getSourceLocationKey(
      normalizedComponentName,
      normalizedFileName
    );
    const structuredSourcePathHints = structuredSourcePathHintsByKey.get(key);
    if (structuredSourcePathHints) {
      structuredSourcePathHints.add(fileName);
    } else {
      structuredSourcePathHintsByKey.set(key, new Set([fileName]));
    }

    const relativePath = normalizedFileName
      ? resolveSourcePath(
          normalizedComponentName,
          normalizedFileName,
          sourcePaths,
          componentSourcePaths,
          !hasUntrustedSource
        )
      : null;
    if (!relativePath) continue;
    if (
      !canUseStructuredSourcePosition(
        fileName,
        relativePath,
        portalBase,
        expectedOrigin
      )
    ) {
      incompatibleStructuredSourceKeys.add(key);
      continue;
    }

    const hasExactComponentSource =
      componentSourcePaths.has(key) &&
      componentSourcePaths.get(key) === relativePath;
    const location = {
      columnNumber: getSourcePosition(columnNumber),
      lineNumber: getSourcePosition(lineNumber),
      relativePath,
    };

    addUniqueSourceLocation(sourceLocations, key, location);
    sourceLocationKeyCounts.set(
      key,
      (sourceLocationKeyCounts.get(key) ?? 0) + 1
    );
    if (
      !hasExactComponentSource &&
      anonymousSourcePaths.get(normalizedFileName) === relativePath
    ) {
      const anonymousKeys = anonymousSourceLocationKeysByFileName.get(
        normalizedFileName
      );
      if (anonymousKeys) {
        anonymousKeys.add(key);
      } else {
        anonymousSourceLocationKeysByFileName.set(
          normalizedFileName,
          new Set([key])
        );
      }
    }
    if (hasExactComponentSource) {
      const aliasKeys = aliasSourceLocationKeysByFileName.get(
        normalizedFileName
      );
      if (aliasKeys) {
        aliasKeys.add(key);
      } else {
        aliasSourceLocationKeysByFileName.set(
          normalizedFileName,
          new Set([key])
        );
      }
    }
  }

  return {
    anonymousSourcePathCounts,
    anonymousSourcePaths,
    anonymousSourceLocationKeysByFileName,
    componentSourcePathKeyCounts,
    componentSourcePaths,
    aliasSourceLocationKeysByFileName,
    componentSourceKeysByFileName,
    hasUnknownDebugStack,
    hasUnkeyedUntrustedAnonymousSource,
    hasUntrustedSource,
    incompatibleStructuredSourceKeys,
    sourceLocations,
    sourceLocationKeyCounts,
    structuredSourcePathHintsByKey,
    trustedComponentSourcePathKeyCounts,
    rawSourceOccurrencesByFileName,
    untrustedAnonymousFileNameCounts,
    unkeyedUntrustedComponentNames,
    untrustedFileNames,
  };
}

export function absolutizeSingleReactGrabCopyContent(
  content: string,
  context: ReactGrabElementContextLike,
  sourceRoot: string,
  portalBase: string
) {
  const normalizedRoot = sourceRoot.replace(/[\\/]+$/, "");
  if (!normalizedRoot) return content;

  const stackRange = getCopyStackRange(content, context);
  if (!stackRange) return content;
  const expectedOrigin = getContextOrigin(context);

  const {
    anonymousSourcePathCounts,
    anonymousSourcePaths,
    anonymousSourceLocationKeysByFileName,
    componentSourcePathKeyCounts,
    aliasSourceLocationKeysByFileName,
    componentSourcePaths,
    componentSourceKeysByFileName,
    hasUnknownDebugStack,
    hasUnkeyedUntrustedAnonymousSource,
    hasUntrustedSource,
    incompatibleStructuredSourceKeys,
    sourceLocations,
    sourceLocationKeyCounts,
    structuredSourcePathHintsByKey,
    trustedComponentSourcePathKeyCounts,
    rawSourceOccurrencesByFileName,
    untrustedAnonymousFileNameCounts,
    unkeyedUntrustedComponentNames,
    untrustedFileNames,
  } = getUniqueSourceLocations(context, portalBase);
  const compatibleExactCopySourceLocationKeyCounts = new Map<string, number>();
  const copyLocationFallbackCounts = new Map<string, number>();
  const copySourceLocationKeyCounts = new Map<string, number>();
  const copySourceOccurrencesByFileName = new Map<
    string,
    CopySourceOccurrence[]
  >();
  const copySourcePathHintsByKey = new Map<string, Set<string>>();
  const copySourceKeysByFileName = new Map<string, Set<string>>();

  for (const line of stackRange.stackString.split(/\r?\n/)) {
    const stackLine = parseCopySourceLine(
      line,
      componentSourcePaths,
      structuredSourcePathHintsByKey
    );
    if (!stackLine) continue;
    const { componentName, source } = stackLine;

    const sourceLocationKey = getSourceLocationKey(
      componentName,
      source.fileName
    );
    copySourceLocationKeyCounts.set(
      sourceLocationKey,
      (copySourceLocationKeyCounts.get(sourceLocationKey) ?? 0) + 1
    );
    const copySourceOccurrences = copySourceOccurrencesByFileName.get(
      source.fileName
    );
    if (copySourceOccurrences) {
      copySourceOccurrences.push({
        sourceLocationKey,
        sourcePath: source.sourcePath,
      });
    } else {
      copySourceOccurrencesByFileName.set(source.fileName, [
        { sourceLocationKey, sourcePath: source.sourcePath },
      ]);
    }
    const sourcePathHints = copySourcePathHintsByKey.get(sourceLocationKey);
    if (sourcePathHints) {
      sourcePathHints.add(source.sourcePath);
    } else {
      copySourcePathHintsByKey.set(
        sourceLocationKey,
        new Set([source.sourcePath])
      );
    }
    const copySourceKeys = copySourceKeysByFileName.get(source.fileName);
    if (copySourceKeys) {
      copySourceKeys.add(sourceLocationKey);
    } else {
      copySourceKeysByFileName.set(
        source.fileName,
        new Set([sourceLocationKey])
      );
    }
    const exactComponentSourcePath = componentSourcePaths.get(
      sourceLocationKey
    );
    if (
      exactComponentSourcePath &&
      canUseStructuredSourcePosition(
        source.sourcePath,
        exactComponentSourcePath,
        portalBase,
        expectedOrigin
      )
    ) {
      compatibleExactCopySourceLocationKeyCounts.set(
        sourceLocationKey,
        (compatibleExactCopySourceLocationKeyCounts.get(sourceLocationKey) ??
          0) + 1
      );
    }
    if (componentSourcePaths.has(sourceLocationKey)) continue;

    copyLocationFallbackCounts.set(
      source.fileName,
      (copyLocationFallbackCounts.get(source.fileName) ?? 0) + 1
    );
  }

  const sourceOccurrenceMatchersByFileName = new Map<
    string,
    ReturnType<typeof createSourceOccurrenceMatcher>
  >();
  const getSourceOccurrenceMatcher = (fileName: string) => {
    const existingMatcher = sourceOccurrenceMatchersByFileName.get(fileName);
    if (existingMatcher) return existingMatcher;

    const matcher = createSourceOccurrenceMatcher(
      rawSourceOccurrencesByFileName.get(fileName) ?? [],
      copySourceOccurrencesByFileName.get(fileName) ?? [],
      portalBase,
      expectedOrigin
    );
    sourceOccurrenceMatchersByFileName.set(fileName, matcher);
    return matcher;
  };
  const unconsumedUntrustedComponentNames = new Set(
    unkeyedUntrustedComponentNames
  );
  for (const [fileName, sourceOccurrences] of rawSourceOccurrencesByFileName) {
    const untrustedSourceGroups = new Map<string, RawSourceOccurrence[]>();
    for (const source of sourceOccurrences) {
      if (source.isAnonymous || source.isTrusted) continue;

      const sourceIdentity =
        getComparableSourcePath(source.sourcePath, portalBase, expectedOrigin) ??
        source.sourcePath;
      const sourceGroupKey = JSON.stringify([
        sourceIdentity,
        [...source.sourceLocationKeys].sort(),
      ]);
      const sourceGroup = untrustedSourceGroups.get(sourceGroupKey);
      if (sourceGroup) sourceGroup.push(source);
      else untrustedSourceGroups.set(sourceGroupKey, [source]);
    }

    for (const sourceGroup of untrustedSourceGroups.values()) {
      if (
        getSourceOccurrenceMatcher(fileName).hasCompleteMatching(
          sourceGroup,
          true
        )
      ) {
        continue;
      }

      for (const source of sourceGroup) {
        for (const key of source.sourceLocationKeys) {
          unconsumedUntrustedComponentNames.add(
            key.slice(0, key.indexOf("\0"))
          );
        }
      }
    }
  }
  let hasUntrustedAnonymousSource = hasUnkeyedUntrustedAnonymousSource;
  for (const fileName of untrustedAnonymousFileNameCounts.keys()) {
    const sourceOccurrences =
      rawSourceOccurrencesByFileName.get(fileName) ?? [];
    if (
      !getSourceOccurrenceMatcher(fileName).hasCompleteMatching(
        sourceOccurrences.filter(
          (source) => source.isAnonymous && !source.isTrusted
        )
      )
    ) {
      hasUntrustedAnonymousSource = true;
      break;
    }
  }
  const hasUnattributableUntrustedSource =
    hasUnknownDebugStack || hasUntrustedAnonymousSource;

  const copySourcePathAliases = new Map<string, string>();
  for (const [fileName, copySourceKeys] of copySourceKeysByFileName) {
    if (hasUntrustedSource || untrustedFileNames.has(fileName)) continue;

    const componentSourceKeys = [
      ...(componentSourceKeysByFileName.get(fileName) ?? []),
    ];
    const availableCopyKeys = [...copySourceKeys].filter(
      (key) =>
        !componentSourcePaths.has(key) &&
        !incompatibleStructuredSourceKeys.has(key)
    );
    const availableComponentKeys = componentSourceKeys.filter((key) => {
      const remainingOccurrenceCount =
        (trustedComponentSourcePathKeyCounts.get(key) ?? 0) -
        (compatibleExactCopySourceLocationKeyCounts.get(key) ?? 0);
      return (
        remainingOccurrenceCount > 0 &&
        !incompatibleStructuredSourceKeys.has(key)
      );
    });

    if (
      availableCopyKeys.length === 1 &&
      availableComponentKeys.length === 1
    ) {
      const relativePath = componentSourcePaths.get(availableComponentKeys[0]);
      const sourcePathHints = copySourcePathHintsByKey.get(
        availableCopyKeys[0]
      );
      const structuredSourcePathHints = [
        ...(structuredSourcePathHintsByKey.get(availableCopyKeys[0]) ?? []),
        ...(structuredSourcePathHintsByKey.get(availableComponentKeys[0]) ??
          []),
      ];
      const hasCompatibleSourcePathHints =
        relativePath &&
        sourcePathHints &&
        [...sourcePathHints, ...structuredSourcePathHints].every(
          (sourcePathHint) =>
            canUseStructuredSourcePosition(
              sourcePathHint,
              relativePath,
              portalBase,
              expectedOrigin
            )
        );
      const anonymousSourcePath = anonymousSourcePaths.get(fileName);
      const hasCompatibleAnonymousSourcePath =
        !anonymousSourcePaths.has(fileName) ||
        anonymousSourcePath === relativePath;
      const hasMatchingPathAliasOccurrenceCount =
        copySourceLocationKeyCounts.get(availableCopyKeys[0]) ===
        (trustedComponentSourcePathKeyCounts.get(availableComponentKeys[0]) ??
          0) -
          (compatibleExactCopySourceLocationKeyCounts.get(
            availableComponentKeys[0]
          ) ?? 0);
      if (
        relativePath &&
        hasCompatibleSourcePathHints &&
        hasCompatibleAnonymousSourcePath &&
        hasMatchingPathAliasOccurrenceCount
      ) {
        copySourcePathAliases.set(availableCopyKeys[0], relativePath);
      }
    }
  }

  const aliasSourceLocationsByFileName = new Map<
    string,
    PortalSourceLocation | null
  >();
  for (const [fileName, aliasKeys] of aliasSourceLocationKeysByFileName) {
    const availableKeys = [...aliasKeys].filter(
      (key) => !copySourceLocationKeyCounts.has(key)
    );
    const availableComponentKeys = [
      ...(componentSourceKeysByFileName.get(fileName) ?? []),
    ].filter(
      (key) =>
        !copySourceLocationKeyCounts.has(key) &&
        !incompatibleStructuredSourceKeys.has(key)
    );
    if (
      availableKeys.length === 1 &&
      availableComponentKeys.length === 1 &&
      availableKeys[0] === availableComponentKeys[0]
    ) {
      aliasSourceLocationsByFileName.set(
        fileName,
        sourceLocations.get(availableKeys[0]) ?? null
      );
    }
  }

  const transformedStack = flattenReactGrabStack(
    stackRange.stackString
      .split(/\r?\n/)
      .map((line) => {
        const stackLine = parseCopySourceLine(
          line,
          componentSourcePaths,
          structuredSourcePathHintsByKey
        );
        if (!stackLine) return line;

        const { componentName, prefix, source } = stackLine;

        const sourceLocationKey = getSourceLocationKey(
          componentName,
          source.fileName
        );
        if (
          hasUntrustedAnonymousSource ||
          unconsumedUntrustedComponentNames.has(componentName.trim())
        ) {
          return line;
        }
        const hasMatchingOccurrenceCount =
          copySourceLocationKeyCounts.get(sourceLocationKey) ===
          sourceLocationKeyCounts.get(sourceLocationKey);
        if (
          hasUnattributableUntrustedSource &&
          incompatibleStructuredSourceKeys.has(sourceLocationKey)
        ) {
          return line;
        }
        if (
          componentSourcePaths.has(sourceLocationKey) &&
          (compatibleExactCopySourceLocationKeyCounts.get(sourceLocationKey) ??
            0) > (componentSourcePathKeyCounts.get(sourceLocationKey) ?? 0)
        ) {
          return line;
        }

        const candidateStructuredSourceLocation = sourceLocations.get(
          sourceLocationKey
        );
        const anonymousSourceLocationKeys =
          anonymousSourceLocationKeysByFileName.get(source.fileName);
        const structuredSourceLocation =
          !hasUntrustedSource &&
          !incompatibleStructuredSourceKeys.has(sourceLocationKey) &&
          sourceLocations.has(sourceLocationKey) &&
          hasMatchingOccurrenceCount &&
          anonymousSourceLocationKeys?.size === 1 &&
          anonymousSourceLocationKeys.has(sourceLocationKey) &&
          anonymousSourcePathCounts.get(
            candidateStructuredSourceLocation?.relativePath ?? ""
          ) === copySourceLocationKeyCounts.get(sourceLocationKey) &&
          anonymousSourcePaths.get(source.fileName) ===
            candidateStructuredSourceLocation?.relativePath
            ? candidateStructuredSourceLocation
            : null;
        const relativePath = componentSourcePaths.has(sourceLocationKey)
          ? (componentSourcePaths.get(sourceLocationKey) ?? null)
          : (copySourcePathAliases.get(sourceLocationKey) ??
            structuredSourceLocation?.relativePath ??
            null);
        if (!relativePath) return line;
        if (
          !canUseStructuredSourcePosition(
            source.sourcePath,
            relativePath,
            portalBase,
            expectedOrigin
          )
        ) {
          return line;
        }

        const hasExactSourceLocation =
          !incompatibleStructuredSourceKeys.has(sourceLocationKey) &&
          sourceLocations.has(sourceLocationKey) &&
          hasMatchingOccurrenceCount;
        const usesAliasSourceLocation =
          !hasExactSourceLocation &&
          !anonymousSourcePaths.has(source.fileName) &&
          copyLocationFallbackCounts.get(source.fileName) === 1 &&
          aliasSourceLocationsByFileName.has(source.fileName);
        let sourceLocation = hasExactSourceLocation
          ? sourceLocations.get(sourceLocationKey)
          : usesAliasSourceLocation
            ? aliasSourceLocationsByFileName.get(source.fileName)
            : undefined;
        const originalPosition = incompatibleStructuredSourceKeys.has(
          sourceLocationKey
        )
          ? undefined
          : source.position;
        if (
          usesAliasSourceLocation &&
          !isAliasSourcePositionCompatible(sourceLocation, originalPosition)
        ) {
          sourceLocation = null;
        }

        const sourcePosition = formatSourcePosition(
          sourceLocation,
          originalPosition
        );

        return `${prefix}${componentName} (at ${normalizedRoot}/${relativePath}${sourcePosition})`;
      })
      .join("\n")
  );

  return `${content.slice(0, stackRange.start)}${transformedStack}${content.slice(
    stackRange.start + stackRange.copyStack.length
  )}`;
}

export function appendReactGrabInputLine(content: string) {
  return content.endsWith("\n") ? content : `${content}\n`;
}

async function transformReactGrabCopyContent(
  content: string,
  elements: Element[]
) {
  if (elements.length !== 1) return appendReactGrabInputLine(content);

  try {
    const { getElementContext } = await import("react-grab/primitives");
    const context = await getElementContext(elements[0]);
    return appendReactGrabInputLine(
      absolutizeSingleReactGrabCopyContent(
        content,
        context,
        __PORTAL_DEV_SOURCE_ROOT__,
        import.meta.env.BASE_URL
      )
    );
  } catch {
    return appendReactGrabInputLine(content);
  }
}

function rewriteReactGrabClipboardAsPlainText(content: string) {
  if (typeof navigator === "undefined") return;

  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") return;

  try {
    void clipboard.writeText(content).catch(() => {});
  } catch {
    // Keep React Grab's successful original copy as the fallback.
  }
}

// React Grab 0.1.50 keeps disabled toolbar buttons and the post-copy menu in
// its Shadow DOM, so hide those controls separately and restore them on cleanup.
export function hideDisabledReactGrabToolbarActions(root: ParentNode) {
  const displaySnapshots = new Map<
    HTMLElement,
    { priority: string; value: string }
  >();

  const hideElement = (element: HTMLElement) => {
    if (displaySnapshots.has(element)) return;

    displaySnapshots.set(element, {
      priority: element.style.getPropertyPriority("display"),
      value: element.style.getPropertyValue("display"),
    });
    element.style.setProperty("display", "none", "important");
  };

  for (const action of REACT_GRAB_DISABLED_ACTIONS) {
    const selector = `[data-react-grab-toolbar-action="${action}"]`;

    for (const button of root.querySelectorAll<HTMLElement>(selector)) {
      const wrapper = button.parentElement ?? button;
      hideElement(wrapper);
    }
  }

  for (const button of root.querySelectorAll<HTMLElement>(
    "[data-react-grab-more-options]"
  )) {
    hideElement(button);
  }

  return () => {
    for (const [wrapper, snapshot] of displaySnapshots) {
      if (snapshot.value) {
        wrapper.style.setProperty(
          "display",
          snapshot.value,
          snapshot.priority
        );
      } else {
        wrapper.style.removeProperty("display");
      }
    }
    displaySnapshots.clear();
  };
}

function observeReactGrabToolbar() {
  if (typeof document === "undefined") return () => {};

  const observedRoots = new Map<ShadowRoot, () => void>();

  const observeRoot = (root: ShadowRoot) => {
    if (observedRoots.has(root)) return;

    let restoreActions = hideDisabledReactGrabToolbarActions(root);
    const observer = new MutationObserver(() => {
      restoreActions();
      restoreActions = hideDisabledReactGrabToolbarActions(root);
    });
    observer.observe(root, { childList: true, subtree: true });

    observedRoots.set(root, () => {
      observer.disconnect();
      restoreActions();
    });
  };

  const observeAvailableRoots = () => {
    for (const host of document.querySelectorAll<HTMLElement>(
      REACT_GRAB_HOST_SELECTOR
    )) {
      if (host.shadowRoot) observeRoot(host.shadowRoot);
    }
  };

  observeAvailableRoots();

  const documentObserver = new MutationObserver(observeAvailableRoots);
  documentObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return () => {
    documentObserver.disconnect();
    for (const disconnect of observedRoots.values()) disconnect();
    observedRoots.clear();
  };
}

const REACT_GRAB_ACTIVE_CURSOR_ATTRIBUTE =
  "data-nocobase-react-grab-active";

function installReactGrabDefaultCursor(): {
  dispose: () => void;
  setActive: (active: boolean) => void;
} {
  if (typeof document === "undefined") {
    return { dispose: () => {}, setActive: () => {} };
  }

  const style = document.createElement("style");
  style.textContent = `
html[${REACT_GRAB_ACTIVE_CURSOR_ATTRIBUTE}],
html[${REACT_GRAB_ACTIVE_CURSOR_ATTRIBUTE}] * {
  cursor: default !important;
}`;
  document.head.append(style);

  return {
    dispose() {
      document.documentElement.removeAttribute(
        REACT_GRAB_ACTIVE_CURSOR_ATTRIBUTE
      );
      style.remove();
    },
    setActive(active: boolean) {
      document.documentElement.toggleAttribute(
        REACT_GRAB_ACTIVE_CURSOR_ATTRIBUTE,
        active
      );
    },
  };
}

export function configureReactGrabPicker(api: ReactGrabAPI) {
  for (const action of REACT_GRAB_DISABLED_ACTIONS) {
    api.unregisterPlugin(action);
  }
  api.setToolbarState({ defaultAction: "copy" });
  const cursor = installReactGrabDefaultCursor();
  cursor.setActive(api.isActive());
  api.registerPlugin({
    name: PORTAL_COPY_PLUGIN,
    hooks: {
      onStateChange: ({ isActive }) => cursor.setActive(isActive),
      onCopySuccess: (_elements, content) =>
        rewriteReactGrabClipboardAsPlainText(content),
      transformCopyContent: transformReactGrabCopyContent,
    },
  });

  const stopObservingToolbar = observeReactGrabToolbar();

  return () => {
    stopObservingToolbar();
    cursor.dispose();
    api.unregisterPlugin(PORTAL_COPY_PLUGIN);
  };
}
