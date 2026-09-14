# @nocobase/db-testkit

Shared, parameterized test contracts for `@nocobase/db` dialect packages.

The testkit does not create connections and does not know the list of supported
dialects. Each `@nocobase/db-<dialect>` package supplies an adapter and owns its
database configuration, cleanup, and dialect-specific tests.
