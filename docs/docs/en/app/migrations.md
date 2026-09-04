---
title: Database migrations
description: Record schema changes as migrations, and prepare the data the application needs as seeds.
---

# Database migrations

:::warning Being written
This page is still being written.
:::

A migration is immutable history and must be self-contained — every field, index, and constraint spelled out in the migration itself, never read from a definition that keeps evolving. Seeds write data and never create structure.

This page will cover writing a migration, keeping `up` and `down` in correspondence, and the division of labour between migrations and seeds.
