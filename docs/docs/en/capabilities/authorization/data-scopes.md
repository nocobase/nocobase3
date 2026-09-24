---
title: 'Record scopes and rules'
description: 'Separate job scope, common baselines, collaboration and exclusions.'
---

# Record scopes and rules

Record scopes limit data for an already granted operation. Choices may include all records, owned/created/prepared records, regions and custom conditions. “Mine” depends on the ownership field defined by the business system, not necessarily its creator.

Permission-set scopes, default access and sharing can add records; restrictions narrow the result. This is not an override where an explicit role scope suppresses defaults. A broad edit default can reopen records excluded by a narrow preparer scope.

| Requirement                                              | Use                               |
| -------------------------------------------------------- | --------------------------------- |
| Every quote viewer can consult public reference material | [Default access](default-access)  |
| A proposal team takes over selected quotes               | [Sharing](sharing-rules)          |
| Collaboration must exclude confidential records          | [Restrictions](restriction-rules) |

None grants missing operations, fields or pages. Sharing a quote cannot give someone the Submit capability.

Submission may require both quote write access and parent-project read access. Sharing one does not share the other. The business state must also permit the transition; authorization does not make a submitted quote a draft again.

Order-team association, delivery checks and collaborator notes are separate relation capabilities. Seeing a team name does not grant editing that team. Developers explicitly declare target ranges and relation fields.

Database policies combine scope and fields. If sources grant different fields or relation capabilities on different rows, the result can conservatively intersect scopes. Ask the developer to inspect operation boundaries instead of adding unrestricted access to bypass an unexpected intersection.
