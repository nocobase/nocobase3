---
pageType: home
pageName: home
title: 'NocoBase 3 Documentation'
description: 'NocoBase 3 is a foundation for building business systems with AI. Create an application and the source code is yours; let AI write the business logic, and cover authentication, permissions, workflows, and notifications with mature plugins.'
keywords: 'NocoBase,NocoBase 3,AI development,business systems,low-code,open-source'
hero:
  name: NocoBase 3 Documentation
  text: Build business systems that hold up, together with AI
  actions:
    - theme: brand
      text: Get started
      link: /get-started/
    - theme: alt
      text: GitHub
      link: https://github.com/nocobase/nocobase

features:
  - title: Start
    details: Create an application of your own, get it running, and see your first page within ten minutes.
    items:
      - title: What NocoBase 3 is
        details: One command generates a complete application — client, server, database, and the conventions AI works from. The code is yours from that moment on.
        link: /get-started/
      - title: Create an application
        details: Generate a project with pnpm create @nocobase/app, choose a database, and start the development server.
        link: /get-started/create-app
      - title: Project structure
        details: What belongs in client, server, and database, and how three composition roots decide what the application is made of.
        link: /get-started/project-structure
      - title: Your first feature
        details: Create a table, add an endpoint, write a page — the whole path, end to end.
        link: /get-started/first-feature

  - title: Building applications
    details: Business logic lives in your own source. The project ships the conventions AI reads, so what it writes matches what you would have written.
    items:
      - title: Developing with AI
        details: AGENTS.md sets the rules and skills supply the detail, so an agent follows the project's conventions instead of guessing at them.
        link: /app/ai-development
      - title: Pages and routes
        details: Declare routes, write page components, register navigation entries, and handle auth modes and settings pages.
        link: /app/pages-and-routes
      - title: Components and styling
        details: Compose interfaces from shadcn/ui and keep light and dark themes consistent with semantic Tailwind tokens.
        link: /app/components-and-styling
      - title: API endpoints
        details: Define HTTP endpoints, webhooks, and callbacks, each route carrying its own authentication and authorization.
        link: /app/server-routes
      - title: Reading and writing data
        details: Resolve the database at runtime, run queries and writes, and work with transactions.
        link: /app/database
      - title: Database migrations
        details: Record schema changes as migrations, and prepare the data the application needs as seeds.
        link: /app/migrations
      - title: Services and jobs
        details: Collect domain logic into services you reuse across routes, and run background and scheduled work.
        link: /app/services-and-jobs
      - title: More...
        details: Internationalization, testing and verification, AI employees, and more.
        link: /app/

  - title: Built-in capabilities
    details: Authentication, permissions, workflows — register a plugin rather than implementing the whole category yourself.
    items:
      - title: Using plugins
        details: One command installs and wires a plugin, and its skill documentation syncs into the project for AI to read.
        link: /plugins/
      - title: Authentication and permissions
        details: Sign-in and registration, sessions, roles, and data-scoped access.
        link: /plugins/auth
      - title: Workflows
        details: Approvals, multi-step processes, and business rules that outlive a single request.
        link: /plugins/workflow
      - title: More...
        details: File storage, notifications, internationalization, and how to build a reusable plugin.
        link: /plugins/

  - title: Deployment
    details: From local development to running in production.
    items:
      - title: Configuration
        details: config.yml, environment variables, and how to see what the application actually resolved.
        link: /deployment/configuration
      - title: Build and run
        details: Build for production and run standalone, or deploy with Docker.
        link: /deployment/standalone
      - title: Hub
        details: Create, start, and host applications with a Hub, and deploy an application to it once it is built.
        link: /deployment/hub
---
