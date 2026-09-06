---
title: API endpoints
description: Define HTTP endpoints, webhooks, and callbacks, each route carrying its own authentication and authorization.
---

# API endpoints

:::warning Being written
This page is still being written.
:::

This page will cover the difference between `defineApiRoutes()` and `defineRootRoutes()`, and one principle worth stating early: mounting under `/api` does not authenticate anything. Every route declares its own authentication and authorization.
