import { isDeepStrictEqual } from 'node:util';
import {
  COMPOSITE_RESOURCE_TYPE,
  CompositeReference,
  type AuthorizationPlugin,
  type AuthorizationTitle,
  type CompositeActions,
  type CompositeApi,
  type ResourceRef,
  type ResourceTypeRegistry,
} from '@nocobase/authorization/core';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';

/** A left-side workspace heading, or a subsection of one when `parent` is set. */
export interface AuthorizationUiSection {
  readonly name: string;
  readonly title: AuthorizationTitle;
  /** Required on a top-level section; optional on a subsection. */
  readonly order?: number;
  /** The top-level section a subsection sits in. */
  readonly parent?: string;
}

/** What `ui.sections.add` takes. */
export interface AuthorizationUiSectionDefinition extends AuthorizationUiSection {
  /**
   * Subsections only: extend a subsection another plugin owns, the way a
   * client settings group is extended. Does nothing when the subsection
   * exists, creates it otherwise, and yields to the owner's later add.
   */
  readonly extend?: boolean;
}

/** A top-level section with its subsections, in order. */
export interface AuthorizationUiSectionNode extends AuthorizationUiSection {
  readonly order: number;
  readonly subsections: readonly AuthorizationUiSection[];
}

/** A right-side heading resources are listed under, nested to any depth. */
export interface AuthorizationUiGroup {
  readonly name: string;
  readonly title: AuthorizationTitle;
  readonly parent?: string;
  readonly order?: number;
}

/** Where one resource is listed: a subsection, and optionally a group. */
export interface AuthorizationUiPlacement {
  readonly section: string;
  readonly group?: string;
}

/** A resource to place: a ref, or the reference `composites.define` returns. */
export type AuthorizationUiTarget =
  ResourceRef | CompositeReference<CompositeActions>;

/** `ui.sections`. */
export interface AuthorizationUiSections {
  add(definition: AuthorizationUiSectionDefinition): void;
  has(name: string): boolean;
  /** Whether `name` is a subsection, the only kind a resource is placed in. */
  isSubsection(name: string): boolean;
  get(name: string): AuthorizationUiSection | undefined;
  /** The "Other" subsection of a top-level section, created on first use. */
  other(parent: string): string;
  /** Top-level sections by `order`, each with its subsections by `order`, unordered ones last. */
  tree(): readonly AuthorizationUiSectionNode[];
}

/** `ui.groups`. */
export interface AuthorizationUiGroups {
  add(group: AuthorizationUiGroup): void;
  has(name: string): boolean;
  get(name: string): AuthorizationUiGroup | undefined;
  list(): readonly AuthorizationUiGroup[];
}

/** What startup validation found: errors fail a development boot, warnings never do. */
export interface AuthorizationUiReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** `authz.ui`: where the permission workspace lists each resource. Never read by a check. */
export interface AuthorizationUiApi {
  readonly sections: AuthorizationUiSections;
  readonly groups: AuthorizationUiGroups;
  /**
   * Lists a resource under a subsection and, optionally, a group. The
   * subsection, group and resource may be registered later; startup
   * validation reports any that never are.
   */
  place(
    target: AuthorizationUiTarget,
    placement: AuthorizationUiPlacement,
  ): void;
  /** Lists unplaced resources of `type` under `<section>.other`. */
  defaultSection(type: string, section: string): void;
  /** The top-level section unplaced resources of `type` land in, if any. */
  defaultSectionOf(type: string): string | undefined;
  /** The explicit placement of a resource, if any. */
  placementOf(resource: ResourceRef): AuthorizationUiPlacement | undefined;
  /** Checks every placement against the registered types, items and composites. */
  validate(host: {
    readonly resourceTypes: ResourceTypeRegistry;
    readonly composites?: CompositeApi;
  }): AuthorizationUiReport;
}

export interface UiAuthorizationApi {
  ui: AuthorizationUiApi;
}

export type UiPlugin = AuthorizationPlugin<UiAuthorizationApi>;

/** The subsection every authorization settings item is listed under. */
export const AUTHORIZATION_SETTINGS_SECTION = 'authorization';

const OTHER = 'other';
const text = (key: string): AuthorizationTitle => ({
  key,
  ns: AUTHORIZATION_NAMESPACE,
});

class SectionRegistry implements AuthorizationUiSections {
  private readonly entries = new Map<string, AuthorizationUiSection>();
  /** Subsections created by an `extend` add and not yet claimed by an owner. */
  private readonly extended = new Set<string>();

  add(definition: AuthorizationUiSectionDefinition): void {
    const { extend = false, ...section } = definition;
    if (!section.name) throw new TypeError('A section needs a name');
    if (section.order !== undefined && !Number.isFinite(section.order))
      throw new TypeError(`Section ${section.name} needs a finite order`);
    if (section.parent === undefined) {
      if (extend)
        throw new TypeError(
          `Section ${section.name} can extend only as a subsection`,
        );
      if (section.order === undefined)
        throw new TypeError(`Section ${section.name} needs an order`);
    } else {
      const parent = this.entries.get(section.parent);
      if (!parent)
        throw new Error(
          `Section ${section.name} names an unknown parent: ${section.parent}`,
        );
      if (parent.parent !== undefined)
        throw new Error(
          `Section ${section.name} cannot nest under subsection ${section.parent}`,
        );
    }
    const existing = this.entries.get(section.name);
    if (existing) {
      if (extend) return;
      if (this.extended.has(section.name)) {
        if (existing.parent !== section.parent)
          throw new Error(
            `Section ${section.name} is already registered under ${existing.parent}`,
          );
        this.extended.delete(section.name);
        this.entries.set(section.name, structuredClone(section));
        return;
      }
      if (isDeepStrictEqual(existing, structuredClone(section))) return;
      throw new Error(`Section already registered: ${section.name}`);
    }
    this.entries.set(section.name, structuredClone(section));
    if (extend) this.extended.add(section.name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  isSubsection(name: string): boolean {
    return this.entries.get(name)?.parent !== undefined;
  }

  get(name: string): AuthorizationUiSection | undefined {
    const section = this.entries.get(name);
    return section && structuredClone(section);
  }

  other(parent: string): string {
    const name = `${parent}.${OTHER}`;
    this.add({
      name,
      title: text('sections.other'),
      parent,
      order: Number.MAX_SAFE_INTEGER,
    });
    return name;
  }

  tree(): readonly AuthorizationUiSectionNode[] {
    const all = [...this.entries.values()];
    const byOrder = (
      left: AuthorizationUiSection,
      right: AuthorizationUiSection,
    ): number =>
      (left.order ?? Number.MAX_SAFE_INTEGER - 1) -
      (right.order ?? Number.MAX_SAFE_INTEGER - 1);
    return structuredClone(
      all
        .filter((section) => section.parent === undefined)
        .sort(byOrder)
        .map((section) => ({
          ...section,
          order: section.order ?? 0,
          subsections: all
            .filter((child) => child.parent === section.name)
            .sort(byOrder),
        })),
    );
  }
}

class GroupRegistry implements AuthorizationUiGroups {
  private readonly entries = new Map<string, AuthorizationUiGroup>();

  add(group: AuthorizationUiGroup): void {
    if (!group.name) throw new TypeError('A resource group needs a name');
    if (group.order !== undefined && !Number.isFinite(group.order))
      throw new TypeError(`Resource group ${group.name} needs a finite order`);
    if (group.parent !== undefined && !this.entries.has(group.parent))
      throw new Error(
        `Resource group ${group.name} names an unknown parent: ${group.parent}`,
      );
    const existing = this.entries.get(group.name);
    if (existing) {
      if (isDeepStrictEqual(existing, structuredClone({ ...group }))) return;
      throw new Error(`Resource group already registered: ${group.name}`);
    }
    this.entries.set(group.name, structuredClone({ ...group }));
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): AuthorizationUiGroup | undefined {
    const group = this.entries.get(name);
    return group && structuredClone(group);
  }

  list(): readonly AuthorizationUiGroup[] {
    return structuredClone([...this.entries.values()]);
  }
}

const refKey = (resource: ResourceRef): string =>
  JSON.stringify([resource.type, resource.id]);

class AuthorizationUi implements AuthorizationUiApi {
  readonly sections: SectionRegistry = new SectionRegistry();
  readonly groups: GroupRegistry = new GroupRegistry();
  private readonly placements = new Map<
    string,
    { resource: ResourceRef; placement: AuthorizationUiPlacement }
  >();
  private readonly defaults = new Map<string, string>();

  place(
    target: AuthorizationUiTarget,
    placement: AuthorizationUiPlacement,
  ): void {
    const resource: ResourceRef =
      target instanceof CompositeReference
        ? { type: COMPOSITE_RESOURCE_TYPE, id: target.name }
        : { type: target.type, id: target.id };
    if (!resource.type || !resource.id)
      throw new TypeError('A placement needs a resource type and id');
    if (!placement.section)
      throw new TypeError(
        `Placement of ${resource.type}:${resource.id} needs a section`,
      );
    if (
      this.sections.has(placement.section) &&
      !this.sections.isSubsection(placement.section)
    )
      throw new Error(
        `${resource.type}:${resource.id} can be placed only in a subsection, not ${placement.section}`,
      );
    const value: AuthorizationUiPlacement = {
      section: placement.section,
      ...(placement.group === undefined ? {} : { group: placement.group }),
    };
    const key = refKey(resource);
    const existing = this.placements.get(key);
    if (existing) {
      if (isDeepStrictEqual(existing.placement, value)) return;
      throw new Error(
        `${resource.type}:${resource.id} is already placed in ${existing.placement.section}`,
      );
    }
    this.placements.set(key, { resource, placement: value });
  }

  defaultSection(type: string, section: string): void {
    if (!type) throw new TypeError('A default section needs a resource type');
    if (!this.sections.has(section) || this.sections.isSubsection(section))
      throw new Error(
        `Resource type ${type} names an unknown top-level section: ${section}`,
      );
    const existing = this.defaults.get(type);
    if (existing === section) return;
    if (existing !== undefined)
      throw new Error(
        `Resource type ${type} already defaults to section ${existing}`,
      );
    this.defaults.set(type, section);
  }

  defaultSectionOf(type: string): string | undefined {
    return this.defaults.get(type);
  }

  placementOf(resource: ResourceRef): AuthorizationUiPlacement | undefined {
    const found = this.placements.get(refKey(resource))?.placement;
    return found && structuredClone(found);
  }

  validate(host: {
    readonly resourceTypes: ResourceTypeRegistry;
    readonly composites?: CompositeApi;
  }): AuthorizationUiReport {
    const errors: string[] = [...(host.composites?.validate() ?? [])];
    const warnings: string[] = [];
    for (const { resource, placement } of this.placements.values()) {
      const label = `${resource.type}:${resource.id}`;
      if (!this.sections.isSubsection(placement.section))
        errors.push(
          `${label} is placed in unknown subsection ${placement.section}`,
        );
      if (placement.group !== undefined && !this.groups.has(placement.group))
        errors.push(`${label} is placed in unknown group ${placement.group}`);
      const type = host.resourceTypes.has(resource.type)
        ? host.resourceTypes.get(resource.type)
        : undefined;
      if (!type?.items?.has(resource.id))
        errors.push(`${label} is placed but not registered`);
    }
    for (const type of host.resourceTypes.list()) {
      const section = this.defaults.get(type.type);
      if (section === undefined || !type.items) continue;
      for (const item of type.items.list())
        if (!this.placements.has(refKey({ type: type.type, id: item.id })))
          warnings.push(
            `${type.type}:${item.id} is not placed; it is listed under ${section}.${OTHER}`,
          );
    }
    return { errors, warnings };
  }
}

/**
 * Registers `authz.ui` with the built-in sections `pages`, `business` and
 * `administration`, the `authorization` subsection, and the default sections
 * of `page`, `composite` and `settings`.
 */
export function uiPlugin(): UiPlugin {
  const ui = new AuthorizationUi();
  for (const [name, order] of [
    ['pages', 0],
    ['business', 100],
    ['administration', 200],
  ] as const)
    ui.sections.add({ name, title: text(`sections.${name}`), order });
  ui.sections.add({
    name: AUTHORIZATION_SETTINGS_SECTION,
    parent: 'administration',
    title: text('options.settingsModules.authorization'),
  });
  ui.defaultSection('page', 'pages');
  ui.defaultSection(COMPOSITE_RESOURCE_TYPE, 'business');
  ui.defaultSection('settings', 'administration');
  return { id: 'ui', authorizationApi: { ui } };
}

export interface AuthorizationUiReportOptions {
  /** Production warns about errors instead of throwing. */
  readonly production: boolean;
  warn(message: string): void;
}

/**
 * Reports a validation result: every warning is logged; errors throw in
 * development and are logged in production.
 */
export function reportAuthorizationUi(
  report: AuthorizationUiReport,
  options: AuthorizationUiReportOptions,
): void {
  for (const warning of report.warnings)
    options.warn(`Authorization workspace: ${warning}`);
  if (!report.errors.length) return;
  if (!options.production)
    throw new Error(
      `Authorization workspace is misconfigured:\n- ${report.errors.join('\n- ')}`,
    );
  for (const error of report.errors)
    options.warn(`Authorization workspace: ${error}`);
}
