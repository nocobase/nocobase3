// Keep demo metadata readable in generated prompts while translating its UI.
// Unknown text keeps its original fallback.
const messageKeys = new Map<string, string>([
  ['Conversation list', 'demo.conversationList'],
  ['AI employee selector', 'demo.aiEmployeeSelector'],
  ['Model selector', 'demo.modelSelector'],
  ['Personalized prompt editor', 'demo.personalizedPromptEditor'],
  ['Upload files', 'demo.uploadFiles'],
  ['Panel expand / collapse', 'demo.panelExpandCollapse'],
  ['Sets the width used by the side-panel variant.', 'demo.props.width'],
  ['Allows Escape to close the active surface.', 'demo.props.closeOnEscape'],
  [
    'Shows an outside close handle for the side-panel variant.',
    'demo.props.showCloseHandle',
  ],
  [
    'Adds layout or sizing classes to the root conversation window.',
    'demo.props.className',
  ],
  [
    'Adds surface actions such as expand, collapse, or close to the header.',
    'demo.props.headerActions',
  ],
  [
    'Application-specific buttons rendered in the composer toolbar.',
    'demo.props.composerActions',
  ],
  ['Shows the conversation-list control.', 'demo.props.showConversationToggle'],
  ['Shows the new-conversation action.', 'demo.props.showNewConversation'],
  [
    'Shows the AI employee selector in the composer.',
    'demo.props.showEmployeeSelector',
  ],
  ['Shows the model selector in the composer.', 'demo.props.showModelSelector'],
  [
    'Shows the personalized AI employee prompt editor.',
    'demo.props.showUserPrompt',
  ],
  [
    'Enables file picker, drag-and-drop, and pasted-image uploads.',
    'demo.props.enableAttachments',
  ],
  [
    'Places the attachment action at a specific position in the composer toolbar.',
    'demo.props.attachmentActionIndex',
  ],
  [
    'Observes approve, reject, or edit decisions after AIChatProvider has processed them; use it for application side effects or telemetry.',
    'demo.props.onToolCallDecision',
  ],
  ['Composer placeholder text.', 'demo.props.placeholder'],
  ['Customizes or hides the footer disclaimer.', 'demo.props.disclaimer'],
  [
    'Changes only the outer presentation while keeping the same chat window mounted.',
    'demo.props.variant',
  ],
  ['Controls whether the surface is open.', 'demo.props.open'],
  [
    'Receives close requests from Escape, the dialog backdrop, or surface actions.',
    'demo.props.onOpenChange',
  ],
  ['Chooses the side used by the side-panel variant.', 'demo.props.side'],
  ['Inside the page', 'demo.insideThePage'],
  ['Dedicated page', 'demo.dedicatedPage'],
  ['Right side panel', 'demo.rightSidePanel'],
  ['Mobile region', 'demo.mobileRegion'],
  ['Push side panel', 'demo.pushSidePanel'],
  ['Mobile container', 'demo.mobileContainer'],
  ['Preview block', 'demo.previewBlock'],
  ['Preview page', 'demo.previewPage'],
  ['Open panel', 'demo.openPanel'],
  ['Open dialog', 'demo.openDialog'],
  ['Preview mobile', 'demo.previewMobile'],
  [
    'Place chat inside a dashboard, record page, or workspace region.',
    'demo.containers.embeddedDescription',
  ],
  [
    'Give the conversation a full route and the largest working area.',
    'demo.containers.pageDescription',
  ],
  [
    'Keep the page operable while the content narrows for chat.',
    'demo.containers.panelDescription',
  ],
  [
    'Open a focused conversation from an action without changing route.',
    'demo.containers.dialogDescription',
  ],
  [
    'Use the same component in a narrow, touch-friendly viewport.',
    'demo.containers.mobileDescription',
  ],
  [
    'Embed chat in the selected content region.',
    'demo.placements.embeddedDescription',
  ],
  [
    'Create a full route for the AI conversation.',
    'demo.placements.pageDescription',
  ],
  [
    'Push the page narrower while chat is open.',
    'demo.placements.panelDescription',
  ],
  [
    'Open chat from a button or page action.',
    'demo.placements.dialogDescription',
  ],
  [
    'Optimize the embedded container for a narrow viewport.',
    'demo.placements.mobileDescription',
  ],
  ['Ticket analysis', 'demo.ticketAnalysis'],
  ['Response drafting', 'demo.responseDrafting'],
  ['Workflow design', 'demo.workflowDesign'],
  ['Inspect record', 'demo.inspectRecord'],
  ['Search records', 'demo.searchRecords'],
  ['Update record', 'demo.updateRecord'],
  ['Suggestions', 'demo.suggestions'],
  ['Business report', 'demo.businessReport'],
  ['Chart', 'demo.chart'],
  ['Sub-agent', 'demo.subAgent'],
  ['Workflow output', 'demo.workflowOutput'],
  ['Pick page element', 'demo.pickPageElement'],
  ['Message your AI employee…', 'demo.messagePlaceholder'],
  ['Full transcript', 'demo.fullTranscript'],
  ['Compact + history dialog', 'demo.compactHistory'],
  ['Analyze this ticket', 'demo.analyzeThisTicket'],
  ['Draft a customer reply', 'demo.draftACustomerReply'],
  ['Review operational risk', 'demo.reviewOperationalRisk'],
  ['Contextual Shortcut', 'demo.contextualShortcut'],
  ['Tasks inside a chat', 'demo.tasksInsideAChat'],
  ['Page', 'demo.page'],
  ['Embedded block', 'demo.embeddedBlock'],
  ['Side panel', 'demo.sidePanel'],
  ['Dialog', 'demo.dialog'],
  ['Global side panel', 'demo.globalSidePanel'],
  ['Embedded chat', 'demo.embeddedChat'],
  ['Use employee default', 'demo.useEmployeeDefault'],
  ['Auto send', 'demo.autoSend'],
  ['Web search', 'demo.webSearch'],
  ['Preset', 'demo.preset'],
]);

export function messageKey(message: string): string {
  return messageKeys.get(message) ?? message;
}
