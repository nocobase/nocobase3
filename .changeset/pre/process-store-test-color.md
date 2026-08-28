---
'@nocobase/nb3-cli': patch
---

Fix the process-group test reading a colourized pid. The helper script logged `child.pid` as a number, and `console.log` inspects numbers — wrapping them in ANSI escapes whenever `FORCE_COLOR` is set. `Number()` then produced `NaN`, and the test failed on its liveness precondition before reaching the group-kill it exists to verify.

The test is unchanged otherwise; only the pid crosses the pipe as a plain string now.
