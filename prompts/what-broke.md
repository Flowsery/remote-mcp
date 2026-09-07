Run this manually on any day. Replace [DOMAIN].

```
What broke on [DOMAIN] in the last 7 days?

Call list_issues with status=open. Re-rank by sessionsCount descending, ignoring
the API sort order. For the top 5, call get_issue and pull the occurrences,
stepsToReplicate and sampleRecordingId.

For each issue give me:
- Title and sessionsCount
- Whether it is getting worse: compare firstSeenAt and lastSeenAt
- The exact steps to replicate, quoted
- The recording id to open
- One line on what it likely costs, based on which page it sits on

Then answer three things directly:
1. Which single issue should a developer pick up first, and why that one.
2. Which issues look like the same underlying cause and should be fixed together.
3. Which of these would never have appeared in an error tracker.

If fewer than 5 issues are open, say so rather than padding the list.
```
