```skill
---
name: create-pr
description: Create a pull request for the current branch in Azure DevOps. Handles git add, commit, push, and PR creation. Use when the user asks to create a PR, submit a PR, push and create PR, or send changes for review.
disable-model-invocation: false
argument-hint: "[optional: PR title or work item IDs]"
allowed-tools: Bash(powershell *), Bash(pwsh *), Read, Grep, Glob, mcp_ado_repo_create_pull_request, get_changed_files
---

Create a pull request for the current branch in Azure DevOps (ApplicationSuite repo by default).

## Defaults

| Setting | Default | Override |
|---------|---------|---------|
| Repository | ApplicationSuite (`04d50eb9-b9f5-49b2-bd5e-fec00d9620e9`) | User specifies different repo |
| Target branch | `refs/heads/master` | User specifies different target |
| Source branch | Current local branch (auto-detected) | User specifies different source |
| Draft | `false` | User can request draft PR |

## Instructions

### Step 1: Detect Current Branch and Repo

```powershell
$repoPath = "C:\Users\yuchengren\git\ApplicationSuite"
Push-Location $repoPath
$branch = git rev-parse --abbrev-ref HEAD
Pop-Location
```

If the user specifies a different repo path, use that instead.

### Step 2: Check for Uncommitted Changes

```powershell
Push-Location $repoPath
$status = git status --porcelain
Pop-Location
```

If there are uncommitted changes:
1. Use `get_changed_files` with the repo path to review the diffs
2. Summarize the changes into a concise commit message
3. Stage, commit, and push:

```powershell
Push-Location $repoPath
git add .
git commit -m "<summarized commit message based on the changes>"
Pop-Location
```

If there are NO uncommitted changes, skip to Step 3.

### Step 3: Push the Branch

Check if the branch has a remote tracking branch:

```powershell
Push-Location $repoPath
$tracking = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>&1
Pop-Location
```

- If the branch has **no upstream** (error returned), push with set-upstream:
  ```powershell
  Push-Location $repoPath
  git push --set-upstream origin "user/yuchengren/$branch"
  Pop-Location
  ```
  **Note**: The remote branch name is `user/yuchengren/<local-branch-name>`. Update `$branch` to this value for the PR source ref.

- If the branch **already has an upstream**, just push:
  ```powershell
  Push-Location $repoPath
  git push
  Pop-Location
  ```

### Step 4: Determine PR Title and Description

- If the user provided `$ARGUMENTS` as a title, use it.
- Otherwise, generate a title by summarizing the committed changes:
  ```powershell
  Push-Location $repoPath
  git log origin/master..HEAD --oneline
  Pop-Location
  ```
  Use the commit messages to create a concise, descriptive PR title.

- For the description, summarize the overall changes (what was added/modified/removed and why).

### Step 5: Create the Pull Request

Determine the correct source ref name:
- If the branch was pushed with `user/yuchengren/<branch>`, use `refs/heads/user/yuchengren/<branch>`
- If the branch already had an upstream, check the remote branch name:
  ```powershell
  Push-Location $repoPath
  $remoteBranch = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" | ForEach-Object { $_ -replace '^origin/', '' }
  Pop-Location
  ```
  Use `refs/heads/<remoteBranch>`

Call `mcp_ado_repo_create_pull_request` with:
- `repositoryId`: `04d50eb9-b9f5-49b2-bd5e-fec00d9620e9` (ApplicationSuite default, or user-specified)
- `sourceRefName`: `refs/heads/<remote-branch-name>`
- `targetRefName`: `refs/heads/master` (or user-specified target)
- `title`: The summarized or user-provided title
- `description`: Summary of changes (max 4000 chars)
- `workItems`: If user provides work item IDs (in `$ARGUMENTS` or conversation), pass them space-separated
- `isDraft`: `false` unless user requests draft

### Step 6: Report Results

After PR creation, report:
- PR title and ID
- Source → Target branch
- Link to the PR (from the response URL)
- Any linked work items

## Example Usage

**User says**: "create a PR"
1. Auto-detect branch, check for changes
2. Stage, commit with summarized message, push
3. Create PR with auto-generated title targeting master

**User says**: "create a PR for work item 1100459"
1. Same flow, but link work item 1100459

**User says**: "create a PR targeting refs/heads/release/10.0.43"
1. Same flow, but use specified target branch

## Important Notes

- Always use `Push-Location`/`Pop-Location` to change to the repo directory for git commands
- The ApplicationSuite repo is at `C:\Users\yuchengren\git\ApplicationSuite` by default
- Remote branch convention: `user/yuchengren/<branch-name>` for new branches
- If git push fails due to permissions or hooks, report the error clearly
- Never force-push unless explicitly asked
- If the branch has multiple commits, the PR title should summarize the overall change, not just the last commit
```
