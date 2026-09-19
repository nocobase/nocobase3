---
'@nocobase/app-client': minor
---

Send the application's language on every API request.

The language an application is showing lives in the browser: `useLocale` changes it on the client i18n runtime and stores it under `nocobase.locale`. Nothing told the server, which resolves a request's locale from the session and then from `Accept-Language` — the language the browser was configured with, not the one the user picked. Server-side translation therefore answered in the wrong language, and kept answering in it after a reload: `@nocobase/app-plugin-workflow` and both notification plugins already translate their messages per request and were all affected.

The core API client now resolves `Accept-Language` from the i18n runtime on each request. Resolving it per request rather than capturing it once means a language switch needs nothing invalidated; the next request already carries the new locale.
