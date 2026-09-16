# Queue database schedules

Database queues use the upstream `KnexAdapter` for both jobs and schedules. The database manager owns the connection; closing the queue does not disconnect it. `table` and `schedulesTable` configure physical table names. Columns must follow the upstream fixed naming contract.

The Scheduler migration creates queue tables through Collection Builder. SQLite schedule dates use `double` columns because Knex binds Dates as epoch milliseconds; TEXT columns would return numeric strings that the upstream adapter cannot parse. These numeric fields are internal queue storage, not Repository date fields. Other dialects use native timestamps. Scheduler business collections use `datetimeTz` and Repository codecs.

The full Scheduler migration currently requires default naming, including its Job deduplication index SQL. Arbitrary Collection naming is not supported by the upstream adapter.
