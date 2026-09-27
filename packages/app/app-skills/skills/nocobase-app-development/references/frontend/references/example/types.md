# Endpoints and types

Part of the [projects worked example](../example.md).

Rules: ["Calling an endpoint"](../api.md#calling-an-endpoint) and ["Error handling" in `api.md`](../api.md#error-handling).

The example assumes the backend provides these endpoints:

| Method and path            | Description                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/projects`        | Parameters `search` and `status` (optional); returns `{ data: Project[] }`                                                      |
| `GET /api/projects/:id`    | Returns `{ data: Project }`; 404 if it does not exist                                                                           |
| `POST /api/projects`       | Request body `{ name, owner, status }`; returns `{ data: Project }`; 409 with `code: 'PROJECT_NAME_TAKEN'` for a duplicate name |
| `PATCH /api/projects/:id`  | Changes only the fields sent; returns `{ data: Project }`; 404 if it does not exist                                             |
| `DELETE /api/projects/:id` | 204 on success; 404 if it does not exist                                                                                        |

The frontend types live in the page folder, in `client/pages/projects/types.ts`, together with the two context types the overlays pass down ([section 2.2 of `overlay.md`](../overlay.md#22-place-the-outlet-in-the-parent-page)):

```ts
// client/pages/projects/types.ts
export const PROJECT_STATUSES = ['planning', 'active', 'done'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  readonly id: number;
  readonly name: string;
  readonly owner: string | null;
  readonly status: ProjectStatus;
  readonly updatedAt: string;
}

/** What the list page passes to its child routes (create dialog, detail drawer) through `<Outlet context>`. */
export interface ProjectsOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
  /** Called after the detail drawer deletes the record: refreshes the list, then moves focus to the search box. */
  readonly afterDelete: () => void;
}

/** What the detail drawer passes to the edit dialog through `<Outlet context>`. */
export interface ProjectDetailOutletContext {
  /** Called after a successful save: updates the drawer with the record the endpoint returned and refreshes the list (guideline R2). */
  readonly onSaved: (project: Project) => void;
  /** Called on finding that the record no longer exists: the drawer switches to "not found" and the list refreshes (guideline R3). */
  readonly onNotFound: () => void;
}
```
