// What the rule plugins import to build their settings pages; the workspace itself stays private.
export type {
  AuthorizationOptions,
  AuthorizationRecordOption,
  AuthorizationSubject,
  RecordSelection,
  ResourceGroupOption,
} from './authorization-client.js';
export {
  actionLabel,
  collectionFields,
  humanize,
  resourceLabel,
  selectionLabel,
} from './components/action-labels.js';
export { ConfirmDialog } from './components/confirm-dialog.js';
export {
  DataScopesEditor,
  type DataScopeRuleAction,
} from './components/data-scopes-editor.js';
export {
  ActionsEditor,
  Field,
  ResourceEditor,
  RuleActionsEditor,
  SelectionEditor,
  SubjectsEditor,
} from './components/editors.js';
export { ErrorBox, errorMessage } from './components/feedback.js';
export { incompleteSelection } from './components/filter-ast.js';
export {
  findResource,
  workspaceSubsections,
} from './components/localized-options.js';
export { FilterBar, SearchField } from './components/filters.js';
export {
  EmptyTableRow,
  ManagementTable,
  ManagementToolbar,
  TablePager,
} from './components/management-ui.js';
export { PermissionsPage } from './components/page-shell.js';
export { pageSlice } from './components/pagination.js';
export { RuleDrawer, RuleForm } from './components/rule-drawer.js';
export { defaultSelection, firstActions } from './components/rule-utils.js';
export { SelectionMark } from './components/selection-marks.js';
export { SelectField } from './components/select-field.js';
export { useRuleDraft } from './components/use-rule-draft.js';
export {
  subjectKey,
  useSubjectDetails,
  useSubjectNames,
  type SubjectDetails,
} from './components/use-subject-names.js';
export {
  titleText,
  useAuthorizationTranslation,
  type Translate,
} from './i18n.js';
export {
  AuthorizationPageState,
  useAuthorizationPageData,
} from './pages/page-support.js';
