---
title: 'Default access'
description: 'A common record baseline for existing operation holders.'
---

# Default access

Use default access for a stable baseline: everyone with View quotes may consult non-confidential quotes, while Edit remains limited to the preparer.

In Settings → Authorization → Default access, choose the business resource, action and named scope, configure its range and save. Configure different actions and tables separately. Clearing a rule removes that baseline, not action grants or independent sharing.

Defaults combine with role scope and sharing; they are not used only when a role has no selected scope. Do not copy a broad read baseline into editing. Verify both an action holder and a person without that action; the latter must remain denied.

Use the [AI request template](develop-with-ai) when a new scope is needed. Specify which operation holders should always receive which records.
