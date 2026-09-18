# Code Review: Vault Dashboard (server.py + index.html)

Reviewed files:
- `/mnt/share/TwoTimesTwo/.opencode/dashboard/server.py` (1060 lines)
- `/mnt/share/TwoTimesTwo/.opencode/dashboard/index.html` (922 lines)
- `/mnt/share/TwoTimesTwo/opencode.json` (131 lines)

---

## Findings

### 🔴 Critical (Must Fix)

1. **SSE_EVENTS memory leak** — server.py:36
   - Problem: `SSE_EVENTS` is a `defaultdict(list)` that accumulates every SSE event for every session indefinitely. Each command adds dozens of events. Over hours of operation, this grows unbounded and will eventually OOM the process.
   - Fix: Prune events for completed session IDs after they're consumed, or add a TTL/max-entries cap. The `wait_for_sse_events` function collects events but never cleans them up.

2. **Thread-unsafe items.json access** — server.py:171,179
   - Problem: `load_items()` and `save_items()` are called from the main HTTP handler thread AND the background `run_command_async` thread with no lock. Two concurrent requests could corrupt `items.json` (read-write race, write-write race).
   - Fix: Add `threading.Lock` around all items.json read/write operations. The lock should be acquired in `load_items` and `save_items`.

3. **Unbounded request body read** — server.py:854-864
   - Problem: `_read_body()` reads `Content-Length` bytes with no upper limit. A malicious or misconfigured client could send a multi-gigabyte body and exhaust server memory.
   - Fix: Reject `Content-Length` > 1MB before reading. Add a size cap.

### 🟠 High (Should Fix)

4. **CORS incomplete** — server.py:876-883
   - Problem: `do_OPTIONS` allows `Content-Type` header but `do_GET` and `do_POST` don't check Origin. The SSE endpoint at `/api/stream` adds CORS headers manually but other endpoints rely on the browser's same-origin policy. If the frontend is served from a different port, some requests may fail.
   - Fix: Add `Access-Control-Allow-Origin` to all responses, or serve the frontend from the same origin.

5. **Silent data loss on malformed timestamp** — server.py:890-898
   - Problem: `do_GET` iterates items and sets `_sort_ts = 0` for any item with an unparseable timestamp. This silently drops the item to the bottom of the sort order with no warning. If a timestamp field is corrupted, the user won't see the item in expected position and won't know why.
   - Fix: Log a warning when timestamp parsing fails, or use the file's mtime as fallback.

6. **Unparsed sections truncated with no recourse** — server.py:714-716
   - Problem: Unparsed sections are truncated to 500 chars with `...(truncated)` appended. The user has no way to see the full content — the "Review raw content" action just runs `/suggest` again.
   - Fix: Include the full section text in the output, or add a "View full" action that fetches the complete text, or link to the session ID so the user can check the TUI.

7. **`extract_suggestions_from_section` sequential regex cascade** — server.py:367-402
   - Problem: Every non-table, non-separator line is tested against up to 5 different regex patterns in sequence (`numbered_q`, `numbered_u`, first bold pattern, second bold pattern, third bold pattern). This is O(n*m) where n = lines and m = patterns. For a 1000-line suggestion output, this is 5000 regex tests. The patterns overlap in coverage — the last three are progressively looser fallbacks that catch many false positives.
   - Fix: Consolidate the bold-title patterns into one regex. Add a detection-phase approach: identify which format the section uses (quoted numbered titles, bold bullet pivots, etc.) and use only the matching parser.

### 🟡 Medium (Fix Soon)

8. **`AGENTS_CACHE` has no refresh loop** — server.py:114
   - Problem: `AGENTS_CACHE` is refreshed once at startup and once 30 seconds later via `threading.Thread(target=lambda: (time.sleep(30), refresh_metadata()), daemon=True).start()`. After that, the agent list is stale. If agents are added or removed, the sidebar selector won't reflect it until the server restarts.
   - Fix: Add a periodic refresh (every 5 minutes) in a background thread.

9. **`rotation_plan` stores raw list instead of string** — server.py:554
   - Problem: `result["rotation_plan"] = body_lines` stores the list directly, while all other result fields (content_mix_audit, voice_drift, etc.) store strings. In `build_suggestion_items`, `"\n".join(parsed["rotation_plan"])` works but is inconsistent with the rest of the codebase.
   - Fix: Store as `"\n".join(body_lines)` in `parse_suggest_output` for consistency.

10. **`get_session_output` is unused dead code** — server.py:280-290
    - Problem: This function was replaced by `get_last_assistant_text` but never removed. It's 11 lines of dead code that won't be maintained and could mislead future readers.
    - Fix: Remove the function.

11. **`EVENTS` list has fixed cap of 200 but no pruning on read** — server.py:197-200
    - Problem: `add_event` pops from the front when length exceeds 200, but the `/api/events` endpoint returns the last 50 regardless of how many exist. The first 150 events are kept in memory but never displayed. Over a long session, this is 150 * ~100 bytes = negligible, but the pattern is inconsistent.
    - Fix: Cap at 50 instead of 200 since that's all the API returns anyway.

12. **Frontend: `setInterval` fallback polling still runs alongside SSE** — index.html
    - Problem: Both `EventSource` and `setInterval(refreshItems, 10000)` run simultaneously. When SSE is connected, the poll is redundant but still fires every 10s, producing unnecessary HTTP requests.
    - Fix: Clear the interval when SSE connects, or set it to a longer interval (60s) as a backup.

### 🟢 Low (Nice to Have)

13. **`escapeHtml` unsafe for onclick attributes** — index.html
    - Problem: The original code used `escapeHtml` inside single-quoted onclick handlers. This was fixed by creating `escAttr()` that also escapes single quotes. However, `escapeHtml` is still used for display text where it works correctly. The two-function approach is correct but could be consolidated: create one function that always escapes both HTML entities and quotes, use it everywhere.
    - Fix: Replace `escapeHtml` with `escAttr` globally since escaping quotes in text content is harmless.

14. **No request logging** — server.py:1042-1043
    - Problem: `log_message` is completely suppressed (`pass`). When debugging issues, there's zero visibility into which endpoints are being hit, response times, or error rates.
    - Fix: Log at least error-status responses (4xx/5xx) with method, path, status, and duration.

15. **`ts` and `ts_sorted` are identical** — server.py:583-584
    - Problem: `ts_sorted` is assigned immediately after `ts` with no difference. They're functionally the same value but serve no distinct purpose. Suggests an unfinished refactor.
    - Fix: Remove `ts_sorted` and use `ts` everywhere, or document why they differ.

### ✅ Strengths

1. **SSE integration**: The SSE listener architecture is clean — a single background thread subscribes to OpenCode's event stream, dispatches events to waiting clients, and the `/api/stream` endpoint forwards them to the frontend. This eliminates polling correctly.

2. **Session forking**: `fork_session()` properly isolates each command's context by creating child sessions. The parent session tracks the workflow while children handle individual commands.

3. **Structured suggestion parsing**: The `parse_suggest_output` function handles multiple output formats (numbered `##` sections, `###` sub-sections, `####` brand analysis) and produces typed dashboard items. The fallback to "unparsed" sections means nothing is lost.

4. **Permission pre-approval**: The 57 bash allow patterns and external_directory rules cover the agent's typical commands comprehensively. The SSE-based auto-reply for `permission.asked` events is a nice safety net.

5. **Frontend UX**: Badge tooltips, agent selector, abort button, SSE-based real-time updates, and structured suggestion cards with angle/why/type all contribute to a polished experience.

---

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 3 | Must fix before next deploy |
| High | 4 | Should fix this iteration |
| Medium | 5 | Fix soon |
| Low | 3 | Nice to have |
| Strengths | 5 | Preserve |
