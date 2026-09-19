---
'@nocobase/app-plugin-ai-employee': patch
---

Use the shared Dialog and Button components for the LLM model editor so backdrop clicks and Escape dismiss it, focus is managed and restored, and modal styling matches the application's component library.

Use a searchable multi-select Combobox for provider models, with selected chips and the search input inside the same field. Filter by model label or ID, preserve selections while searching, and portal the options outside the editor's scroll container with viewport-aware list scrolling. Escape closes the picker before the editor.

Show localized loading and empty states while discovering LLM services instead of leaving the settings table blank.
