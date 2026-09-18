---
name: code-review
description: Structured code review covering security, architecture, error handling, code quality, performance, and edge cases
agent: explore
---

# Code Review

Run a structured code review against a codebase. Covers six categories:
Security, Architecture, Error Handling, Code Quality, Performance, Edge Cases.

## Method

For each file under review, analyze in this order:

### 1. Security
- Injection risks (command injection, XSS, path traversal)
- Secrets exposure (keys in code, env handling)
- Input validation (size limits, type checking)
- Concurrent access (race conditions, thread safety)
- CORS and access control

### 2. Architecture
- Separation of concerns
- Coupling between components
- State management
- Error boundaries
- Dependency direction

### 3. Error Handling
- Exception types caught (too broad? too narrow?)
- Silent failure modes (bare `except: pass`)
- Fallback behavior when dependencies fail
- Logging granularity

### 4. Code Quality
- Duplicate logic
- Unused code/dead paths
- Naming consistency
- Function size and complexity
- Comment quality (missing vs misleading vs good)

### 5. Performance
- Unbounded data structures (memory leaks)
- Redundant API calls
- Blocking operations in tight loops
- File I/O patterns

### 6. Edge Cases
- Empty states (no data, missing files, null responses)
- Malformed input (corrupt JSON, truncated data)
- Timeout behavior
- Concurrent operations on shared state

## Output Format

```
## Findings

### 🔴 Critical (Must Fix)
1. **Issue** — file:line
   - Problem: ...
   - Fix: ...

### 🟠 High (Should Fix)
...

### 🟡 Medium (Fix Soon)
...

### 🟢 Low (Nice to Have)
...

### ✅ Strengths
- ...
```

## Tools
- Read — read files under review
- Grep — search for patterns across files
- Bash — run syntax checks, linters
