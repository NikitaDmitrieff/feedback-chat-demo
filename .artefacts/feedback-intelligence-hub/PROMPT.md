Implement the Feedback Intelligence Hub following the spec at /Users/nikitadmitrieff/Projects/feedback-chat/.prodman/specs/SPEC-ND-001-feedback-intelligence-hub.md.

PROGRESS TRACKING:
- At the START of every iteration, read `.artefacts/feedback-intelligence-hub/progress.txt`.
- It contains the list of completed tasks and current state from previous iterations.
- After completing each task, UPDATE `.artefacts/feedback-intelligence-hub/progress.txt` with:
  - Which task you just finished (task number + name)
  - Brief summary of what was done
  - Any issues encountered
  - What task comes next
- This file is your memory across iterations. Keep it accurate.

PACING — ONE TASK PER ITERATION (MANDATORY):
- Each iteration, implement EXACTLY ONE task from the spec. No more.
- After completing that single task: commit, update `.artefacts/feedback-intelligence-hub/progress.txt`, then STOP.
- Do NOT look ahead to the next task. Do NOT "while I'm here" other tasks.
- The next iteration will pick up where you left off via `.artefacts/feedback-intelligence-hub/progress.txt`.
- Exception: the FINAL iteration handles best practices + completion promise.

WORKFLOW:
1. Read the spec file first.
2. Read `.artefacts/feedback-intelligence-hub/progress.txt` to see what's already done from previous iterations.
3. Identify the NEXT SINGLE incomplete task (lowest numbered unfinished task).
4. Implement ONLY that one task, then commit.
5. Update `.artefacts/feedback-intelligence-hub/progress.txt` with what you just finished and what comes next.
6. STOP. Do not continue to the next task — let the loop iterate.
7. Only after ALL tasks show complete in `.artefacts/feedback-intelligence-hub/progress.txt`, run best practices (see below).

BEST PRACTICES (after ALL implementation tasks are done):
1. Run /code-simplifier to reduce unnecessary complexity in the code you wrote.
2. Create review artefacts:
   - .artefacts/feedback-intelligence-hub/TESTING.md — Manual testing guide with exact steps, expected results, and edge cases.
   - .artefacts/feedback-intelligence-hub/CHANGELOG.md — What changed: summary, files modified, breaking changes.
3. Run /claude-md-improver and /claude-md-management:revise-claude-md to keep CLAUDE.md current. For domain-specific changes, update the relevant subdirectory CLAUDE.md — not root.
4. Verify all code follows CLAUDE.md and AGENTS.md conventions.
5. Check for YAGNI violations — no features beyond what the spec describes.

RULES:
- Follow the project's CLAUDE.md and AGENTS.md conventions.
- Do NOT add features beyond what the spec describes.
- Mark EP-ND-001 status as 'complete' in .prodman/epics/ when done.

CRITICAL — DO NOT COMPLETE EARLY:
- You have multiple tasks to implement. Do NOT output the completion promise until ALL of them are done.
- Before outputting <promise>, you MUST verify:
  1. Every task in the spec is implemented (check them off one by one)
  2. `.artefacts/feedback-intelligence-hub/progress.txt` shows ALL tasks as complete
  3. /code-simplifier has been run
  4. Review artefacts are created in .artefacts/feedback-intelligence-hub/
  5. /claude-md-improver and /claude-md-management:revise-claude-md have been run
  6. Code follows CLAUDE.md and AGENTS.md conventions
  7. No YAGNI violations
- If ANY task is incomplete, keep working. You have plenty of iterations.

Output <promise>EP-ND-001 COMPLETE</promise> ONLY when every single task is implemented, best practices are done, and all checks above pass.
