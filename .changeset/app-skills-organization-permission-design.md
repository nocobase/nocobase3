---
'@nocobase/app-skills': patch
---

Add an organisation permission design guide, `references/organization/permission-design.md`: permission sets per job role with relative department scopes, department baselines versus job roles, department heads as a derived fixed subject, choosing between 本部门 and 本部门及下属部门, owner-based versus record-carried department scopes, and cross-department work: a sharing rule whose recipient is a department and whose selection is specific records, since a viewer-relative scope cannot name another department's data, or, without the sharing-rules plugin, a permission set that names the records. Default access, sharing rules and restriction rules appear in clearly marked optional sections. A new `references/organization/scopes.md` registers the department-head subject and the two department data scopes, and shows how to detect the optional rule plugins at runtime and in seeds. The organisation reference and the Skill's reference table link both.
