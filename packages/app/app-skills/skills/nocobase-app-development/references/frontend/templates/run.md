# Run check

| Item         | Details                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| Page         | `/<path>`, application URL `http://…/main`                              |
| Code version | Description of the changes at the time of the check                     |
| Check method | Manual operation / screenshot tool / Playwright assertion script (path) |
| Test data    | How it was prepared and how to clean it up                              |

## Baseline

Console errors seen on an existing page (for example, the homepage). They come from the application shell and are not issues of this page:

- …

## Check results

| ID  | What was checked (matching acceptance criterion) | Method | Result      | Evidence                            |
| --- | ------------------------------------------------ | ------ | ----------- | ----------------------------------- |
| D1  |                                                  |        | Pass / Fail | Screenshot file name, script output |

Must cover: the core flow, every state, character-by-character typing and Chinese IME input, keyboard operation, the dark theme, narrow screens, the English interface.

## Console and requests

- Console errors introduced by this page:
- Failed requests (note which ones the check caused on purpose):

## Issues found

| ID  | Issue | Handling                                             |
| --- | ----- | ---------------------------------------------------- |
|     |       | Fixed / Left for the reviewer to judge (explain why) |

## Not verified

| Item | Reason |
| ---- | ------ |
|      |        |
