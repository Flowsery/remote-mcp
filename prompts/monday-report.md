Save this as a recurring task in your agent (Grok Tasks, ChatGPT scheduled tasks, Claude routines), set to Monday morning. Replace [DOMAIN].

```
Run my weekly session health report for [DOMAIN].

1. Call get_overview twice: once for last week, once for the week before it.
   Fields: visitors, sessions, bounce_rate, conversion_rate, revenue.
2. Call list_issues with status=open. Re-rank by sessionsCount descending.
3. Call get_issue on the top 3 to pull stepsToReplicate and sampleRecordingId.
4. Call get_pages and get_devices for last week, limit 10.

Write the report in this shape:

HEADLINE
One sentence. The single most costly thing happening right now, with its sessionsCount.

WHAT MOVED
Last week vs the week before, only metrics that changed by more than 10%.
Give both numbers and the direction. Skip anything flat.

WHAT BROKE
Top 3 open issues by sessionsCount. For each: title, sessionsCount, the page or
device it concentrates on, the first repro step, and the recording id.

WHERE IT CONCENTRATES
The page and the device or browser carrying the most affected sessions.

WHAT I WOULD FIX FIRST
One item. Say why it beat the others, in terms of sessions and revenue exposure.

Keep it under 300 words. No preamble. If nothing meaningful changed, say
"quiet week" and list only the open issues.
```
