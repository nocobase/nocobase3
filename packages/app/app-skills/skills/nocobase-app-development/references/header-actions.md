# Top-right header actions

Apply these rules when adding or changing icon buttons in the page's top-right header action area. Choose the interaction by what the entry does, and follow the existing application shell rather than adding a separate interaction mechanism.

| Entry behavior                                          | Hover behavior                                                                                                                                    | Examples                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Navigates to another page                               | Show a short tooltip describing the destination or purpose.                                                                                       | Component examples, Settings, Notifications |
| Opens a menu or configuration panel on the current page | Open the panel on hover; close a hover-opened panel when the pointer leaves the trigger and panel interaction region. Do not also show a tooltip. | Appearance, Account                         |

## Navigation entries

Use the existing shadcn `Tooltip`, `TooltipTrigger`, and `TooltipContent`, with the router `Link` supplied through the trigger's `render` prop. Reuse the header's `TooltipProvider`; show the tooltip below the entry with `side='bottom'`. Keep the link's route, access checks, and button styling intact.

Use a few words such as “Settings” or “通知中心”, not a sentence explaining how to click. Show the same hint on keyboard focus. Translate both the tooltip and the accessible label; an unread notification count may supplement the label. Remove the native `title` attribute to avoid a second browser tooltip, and keep an accessible name on the icon-only trigger.

## Menus and configuration panels

Use the existing shadcn `DropdownMenu` for action menus and submenus, or `Popover` for a configuration panel. These application components use Base UI: set `openOnHover` and `delay={0}` on their trigger. Closing has no configured delay (`closeDelay` defaults to `0`).

Moving from the trigger into its panel, or between a menu and its portalled submenu, must leave the controls reachable. Let the component manage this interaction region, positioning, focus, and dismissal. Preserve click and touch opening, keyboard navigation, and Escape dismissal.

Follow the component's default distinction: a hover-opened panel closes on pointer exit, while a click-opened panel may remain open until an outside click or Escape. Do not force click-opened panels to behave like hover-opened panels with custom mouse-leave handlers, coordinate checks, timers, or extra open state. Prefer the existing public component options over recreating their behavior.

When choosing a menu option completes the action, use the component's built-in dismissal. Account language radio items use `closeOnClick` so the menu closes immediately after selection; radio items otherwise default to remaining open. Appearance controls remain available for further adjustments and follow the Popover's default dismissal.

## Consistency

Use localized text and the existing [theme tokens](theme-tokens.md). Keep header icon sizes, spacing, focus indicators, and button styling consistent. Let the component position its floating content within the viewport, including at the right edge. Reuse existing interaction tests for the affected entry; avoid reproducing layout or submenu pointer geometry in jsdom, where it does not represent real browser behavior.
