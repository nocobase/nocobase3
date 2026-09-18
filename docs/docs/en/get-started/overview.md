---
title: 'Before you start'
description: 'Create a NocoBase 3 application, sign in, and build your first order feature with an AI Agent.'
---

# Before you start

Create your first NocoBase 3 application here. Start a local project, then ask your AI Agent to build a small order feature that saves real data.

An **AI Agent** is a development tool that can read project files, edit code, and execute commands. This documentation uses that term throughout.

## Who this section is for

Start here if you understand what NocoBase 3 offers and are ready to try it. You should be able to run terminal commands, open a project in an editor, and check results in a browser. You do not need to learn plugin development first.

Developers can go directly to [Create an application](./create-app). If you are still exploring the product, read [What is NocoBase 3?](./index) first to understand its purpose and use cases.

## What you will build

- An application project in your own directory, including pages, server APIs, and database migrations.
- A local application you can sign in to.
- An order list where you can create and edit orders that remain after refreshing.
- One complete AI Agent collaboration cycle: describe a requirement, review changes, try the feature, and request corrections.

Start with this small feature. The order tutorial later adds customer relationships, salesperson permissions, supervisor decisions, and notifications.

## Prepare your tools

| Tool                | Purpose                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Node.js and pnpm    | Create the project, install dependencies, and run the application; see the creation guide for requirements |
| Editor and AI Agent | Open the application directory and let your AI Agent read and edit its files                               |
| Terminal            | Run creation, startup, and check commands                                                                  |
| Browser             | Sign in, operate pages, and review results                                                                 |

Configure the AI Agent's own account and model access beforehand. The walkthrough uses SQLite, so you do not need a separate database service or an AI employee configured inside the application.

## Reading order

| Step                                                         | Question it answers                               | Completion point                                            |
| ------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| [Create an application](./create-app)                        | Where does the project live, and how does it run? | Open the application in a browser and sign in               |
| [Build your first feature with an AI Agent](./first-feature) | How do you give AI Agent a concrete task?         | Save and edit an order, then refresh to confirm persistence |

Create the project once and continue working in it. You do not initialize another application for every feature.

## Choose your next section

| Your goal                                                   | Read                                        |
| ----------------------------------------------------------- | ------------------------------------------- |
| Try the product and get it running                          | This Get started section                    |
| Describe requirements clearly and review AI Agent output    | [Work with an AI Agent](../ai/)             |
| Connect data, pages, permissions, and processes in one case | [Order application tutorial](../tutorials/) |

## Start through Hub

:::info Guide pending

The Hub getting-started guide is not yet available. Follow [Create an application](./create-app) to start locally.

:::
