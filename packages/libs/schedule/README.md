# @nocobase/schedule

Persistent recurring jobs for NocoBase applications. A `ScheduleExecuteService` hands each consumer a private `ScheduleExecutor`, identified by a configuration key and the consumer's `scope`, that stores job rules in a backend and runs the registered handler when a rule fires.

Two adapters implement the same contract:

| Adapter  | Backend                                                                                  | Deployment                                                                                            |
| -------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `redis`  | BullMQ job schedulers, through its public API only                                       | Any number of instances; each firing runs on exactly one of them                                      |
| `memory` | A local state file shared by the processes of one host, changed under a short write lock | The processes of one host; each firing runs once among them; a file written from two hosts is refused |

The package exports factories and types only. It holds no module-level state and reads neither application settings nor the process environment; applications compose it through `@nocobase/app-server/schedule`, which supplies the application name, the storage directory and the logger.
