import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
const extension: AppExtension = { id: "nocobase-files-example", routes: defineAppRoutes([{ name: "files-example", path: "/dev/files-example", lazy: () => import("./files-example").then((module) => ({ default: module.FilesExample })) }]) };
export default extension;
