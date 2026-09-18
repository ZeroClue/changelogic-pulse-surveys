# Naturalize Pass — Design Spec

**Date:** 2026-06-16
**Status:** Approved
**Skill:** humanizer (`.claude/skills/humanizer/`)

## Purpose

A post-processing step that runs after the humanizer removes AI patterns. It adds natural human imperfection — contractions, colloquialisms, and sentence looseness — to make cleaned text sound conversational rather than sterile.

## Transformations

### 1. Contractions (all intensities)

Replace formal uncontracted forms with contractions. Targets ~60-70% of eligible spots.

| Formal | Casual |
|---|---|
| it is / it has | it's |
| we are / we will | we're / we'll |
| they have / they would | they've / they'd |
| cannot / will not | can't / won't |
| do not / does not | don't / doesn't |
| I am / I have | I'm / I've |
| you are / you will | you're / you'll |
| that is / there is | that's / there's |
| did not / was not | didn't / wasn't |
| could not / should not | couldn't / shouldn't |
| would not / must not | wouldn't / mustn't |

### 2. Colloquial word swaps (all intensities)

| Formal → | Casual |
|---|---|
| utilize → use | demonstrate → show |
| assist → help | regarding → about |
| sufficient → enough | nevertheless → but |
| furthermore → also / plus | consequently → so |
| obtain → get | provide → give |
| require → need | attempt → try |
| determine → figure out | prior to → before |
| subsequent to → after | therefore → so |
| initiate → start | maintain → keep |
| perform → do | possess → have |

### 3. Sentence looseners (medium+ only)

- Start 1-2 sentences with "And", "But", "So", "Or"
- Add occasional discourse markers (1 max): "Honestly,", "Actually,", "Look,", "The thing is,"
- Convert some "which" clauses to separate sentences
- Replace some semicolons with periods

## What it does NOT do

- No intentional spelling errors
- No grammatical mistakes
- No homophone swaps
- No meaning-changing restructuring

## Architecture

New file: `src/naturalize.js`

```javascript
function naturalize(text, intensity = 'medium') {
  // 1. Apply contractions
  // 2. Apply colloquial word swaps
  // 3. Apply sentence looseners (medium+ only)
  return text;
}
```

Integrated as optional post-processing. CLI flag: `--naturalize` or `--naturalize=light|medium|heavy`.

## Pipeline

```
Input → Pattern removal → Statistical check → Naturalize (optional) → Output
```

## Testing

1. Run on calibration set — verify scores stay in human range
2. Side-by-side comparison of before/after on a sample post
