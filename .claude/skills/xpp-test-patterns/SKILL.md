---
name: xpp-test-patterns
description: X++ test writing patterns and rules for D365 Finance and Operations SysTest framework. Covers AAA pattern, test class structure, naming conventions, setup/cleanup, assertion best practices, and helper method extraction. Use when writing or reviewing X++ test classes.
user-invocable: false
---

# X++ Test Patterns & Rules

Use the patterns and rules below as your reference when writing X++ tests. This is a living document — add new entries at the bottom.

For comprehensive reference on class attributes, base classes, ATL entity builders, mocking/detours, form adaptors, and real-world pattern examples, see [reference.md](reference.md).

---

## Use Specific Legal Entity in Test

We can add `[SysTestCaseDataDependency('USMF')]` this tag at the top of the test class to use a specific legal entity. But it's not mandatory to do so.

---

## Test Methods Should Follow the AAA (3-Step) Pattern

When writing test cases, we follow the 3-step pattern for setup, execute, and validation. The code is structured as:

```
// Arrange
// Act
// Assert
```

Or:

```
// Given
// When
// Then
```

**Formatting rules**:
- There should be a blank line **before** each section marker (except when it immediately follows the opening brace `{`).
- There should be **no** blank line between the marker and the code under it.
- Within each section (especially `// Assert`), keep code **readable** by adding blank lines between logically distinct groups:
  - Separate record/row lookups from cell lookups and assertions.
  - Keep each "find cell → assert" pair together, then add a blank line before the next pair.
  - Group related statements; don't pack unrelated lines together wall-to-wall.

**Example** — simple test (Act + Assert only):
```xpp
[SysTestMethod]
public void testEmailStored()
{
    // Act
    RecId actionPlanRecId = parser.parse(this.getCompleteActionPlanJson());

    // Assert
    PurchCopilotGenActionPlan actionPlanTable;
    select firstonly actionPlanTable
        where actionPlanTable.RecId == actionPlanRecId;

    this.assertEquals(emailStaging.RecId, actionPlanTable.Email, 'Email should match the staging record');
}
```

**Example** — full Arrange / Act / Assert:
```xpp
[SysTestMethod]
public void testEmptyActionPlanArray()
{
    // Arrange
    str jsonString = strFmt('{"emailId": "%1", "actionPlan": [], "summary": "Empty plan", "issues": "None"}', TestEmailId);

    // Act
    RecId actionPlanRecId = parser.parse(jsonString);

    // Assert
    PurchCopilotGenActionPlan actionPlanTable;
    select firstonly actionPlanTable
        where actionPlanTable.RecId == actionPlanRecId;

    this.assertNotEqual(0, actionPlanTable.RecId, 'ActionPlan should be created');
    this.assertEquals('Empty plan', actionPlanTable.Summary);
    this.assertEquals(0, this.countPlanActions(actionPlanRecId), 'No PlanActions should be created');
}
```

**Rule**: Every `[SysTestMethod]` must use the AAA pattern. If there is no explicit arrange step, start with `// Act`. Omit `// Arrange` only when setup is handled entirely by `setUp()`. Within each section, group related statements and use blank lines to separate logical blocks for readability — never pack all lines together wall-to-wall.

---

## Test Class Structure

A well-structured X++ test class follows this layout:

```xpp
[SysTestCaseAutomaticSetUp]
class MyFeatureTests extends SysTestCase
{
    // 1. Constants (test data identifiers)
    // 2. Class-level variables (shared across tests)
    // 3. setUp() — initialize shared fixtures, clean up stale data
    // 4. Test methods — one per behavior/scenario
    // 5. Helper methods — shared setup/assertion utilities
}
```

**Rules**:
- Use `[SysTestCaseAutomaticSetUp]` when `setUp()` should run before every test.
- Use `[SysTestCaseDataDependency('USMF')]` when tests depend on demo data in a specific company.
- Use constants for test identifiers (e.g., `const str TestEmailId = 'TEST-001'`) — never hardcode strings in multiple places.
- Extract repeated setup or assertion logic into helper methods (e.g., `findCellByFieldName()`, `countPlanActions()`).

---

## Test Naming Conventions

Test method names should clearly describe the scenario and expected outcome:

**Bad**:
```xpp
public void test1() { ... }
public void testParser() { ... }
```

**Good**:
```xpp
public void testEmptyActionPlanArrayCreatesNoActions() { ... }
public void testEmailStoredOnActionPlan() { ... }
public void testChangeDetectedRowHasExtractedValues() { ... }
```

**Rule**: Test method names should read as a sentence describing the behavior being tested. Use the pattern `test<Scenario><ExpectedOutcome>` or `test<WhatIsBeingTested>`.

---

## Setup and Cleanup Pattern

**Bad** — no cleanup, tests depend on leftover data:
```xpp
[SysTestMethod]
public void testCreateRecord()
{
    MyTable record;
    record.Name = 'Test';
    record.insert();
    // no cleanup — next test run fails with duplicate key
}
```

**Good** — cleanup-first pattern in setUp:
```xpp
public void setUp()
{
    super();

    // Clean up any stale test data FIRST
    delete_from myTable
        where myTable.Name like 'TEST-*';

    // Then set up fresh test data
    this.createTestFixtures();
}
```

**Rule**: Prefer the cleanup-first pattern — delete stale test data at the start of `setUp()` before creating fresh fixtures. This is more reliable than tearDown-based cleanup because it handles cases where previous test runs crashed or were interrupted.

---

## Test Data — Explicit Failure Over Silent Skip

**Bad** — test silently passes when required data is missing:
```xpp
[SysTestMethod]
public void testWithRealData()
{
    if (!realDataLoaded)
    {
        return; // silently skips all assertions — test always "passes"
    }
    this.assertEquals(expected, actual);
}
```

**Good** — fail explicitly when prerequisites are not met:
```xpp
[SysTestMethod]
public void testWithRealData()
{
    if (!realDataLoaded)
    {
        throw error('Test requires purchase order data in USMF. Ensure demo data is loaded.');
    }
    this.assertEquals(expected, actual);
}
```

**Rule**: Tests must never silently skip assertions. If required test data or prerequisites are missing, throw an explicit error so the failure is visible. Vacuously passing tests hide real problems.

---

## Assertion Best Practices

- Always include a descriptive message in assertions:
  ```xpp
  this.assertEquals(expected, actual, 'Order status should be Confirmed after approval');
  ```
- Assert one logical concept per test method — avoid testing unrelated behaviors in a single test.
- Use `assertNotEqual(0, record.RecId, ...)` to verify a record was created.
- Use `assertEquals(0, count, ...)` to verify no records were created.
- For complex assertions, break them into helper methods with descriptive names.

---

## Test Helper Method Patterns

Extract common lookup/assertion patterns into reusable helpers:

```xpp
/// <summary>
/// Finds a cell by field name in a given row and table.
/// </summary>
private PurchCopilotGenTableCell findCellByFieldName(RecId _rowRecId, RecId _tableRecId, str _fieldName)
{
    PurchCopilotGenTableCell cell;
    PurchCopilotGenTableColumn column;

    select firstonly cell
        where cell.Row == _rowRecId
    join column
        where column.RecId == cell.Column
           && column.Table == _tableRecId
           && column.Name == _fieldName;

    return cell;
}
```

**Rule**: If you find yourself writing the same lookup or assertion pattern in multiple tests, extract it into a private helper method on the test class. This improves readability and reduces duplication.

---

<!-- Add new test patterns below this line -->
