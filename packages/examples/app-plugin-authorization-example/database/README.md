# Database

`migrations/` creates `authorizationExampleTasks`, the one collection this example owns.

`seeds/` creates the `authorization-example-member` Permission Set and assigns it to every signed-in user. The seed is a no-op when the authorization plugin's tables are absent, so the example still installs into an application that runs without it.
