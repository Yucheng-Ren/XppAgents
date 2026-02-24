# X++ Test Patterns & Rules

Use the patterns and rules below as your reference when writing X++ tests. This is a living document — add new entries at the bottom.

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

**Example** — readable Assert with multiple find-then-assert pairs:
```xpp
[SysTestMethod]
public void testChangeDetectedRowHasExtractedValues()
{
    // Act
    RecId actionPlanRecId = parser.parse(this.getSimpleHeaderActionJson());

    // Assert
    var actionInstance = PurchCopilotGenActionInstance::findByActionPlanId(actionPlanRecId);
    PurchCopilotGenTableRow changeDetectedRow = this.findHeaderRow(actionInstance.RecId, PurchCopilotGenRowType::ChangeDetected);

    PurchCopilotGenTableCell dateCell = this.findCellByFieldName(changeDetectedRow.RecId, headerTable.RecId, FieldConfirmedDeliveryDate);
    this.assertEquals(mkDate(12, 1, 2026), dateCell.DateValue, 'ChangeDetected row should have extracted date value');

    PurchCopilotGenTableCell intentCell = this.findCellByFieldName(changeDetectedRow.RecId, headerTable.RecId, FieldIntent);
    this.assertEquals(TestIntent, intentCell.StringValue, 'ChangeDetected row should have extracted intent value');
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

---

## Comprehensive X++ Test Pattern Reference

---

### 1. Class Declaration Attributes

Class-level attributes control test granularity, data dependencies, feature toggles, and security context.

| Attribute | Purpose | Example Files |
|-----------|---------|---------------|
| `SysTestGranularity(SysTestGranularity::Unit)` | Marks test as unit-level (fast, isolated) | PurchCopilotInboundEmailProcessingTaskTests, PurchCopilotGenTableColumnTest |
| `SysTestTarget(classStr(...))` or `SysTestTarget(tableStr(...))` | Declares which class/table is under test | PurchCopilotGenActionPlanParserTest, AgreementClassificationTest |
| `SysTestTargetAttribute(classStr(...))` | Alternate form of SysTestTarget | PurchCopilotEntityActionTest, PurchCopilotGenControllerExecuteActionTest |
| `SysTestCaseDataDependency('USMF')` | Test requires demo data from a specific legal entity | PurchCopilotGenActionPlanParserTest, PurchCopilotEntityActionTest, PurchCopilotGenControllerExecuteActionTest |
| `SysTestCaseAutomaticNumberSequences` | Auto-configures number sequences for the test | DataQualityBaseTest, AgreementConfirm_PurchTest, AgreementClassificationTest (method-level) |
| `SysTestCaseMethodLevelContextEnabled` | Enables per-method test isolation/context | PurchCopilotInboundEmailProcessingTaskTests, AgreementClassificationTest |
| `SysTestCheckinTest` / `SysTestCheckInTest` | Marks as a check-in (fast) test to run on every build | PurchCopilotGenTableColumnTest, PurchCopilotInboundEmailApplySuggestionTest, AgreementClassificationTest, AgreementConfirm_PurchTest |
| `SysTestFeatureDependency(classStr(...), true/false)` | Enables/disables feature flights for the test | PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, DataQualityBaseTest |
| `SysTestSecurity(roleStr(...), [...], bool)` | Runs tests with specific security roles | PurchCopilotGenControllerExecuteActionTest, PurchCopilotInboundEmailWorkspaceScenarioTest |
| `SysTestCategory('SCMCopilot')` | Categorizes test for filtering | PurchCopilotGenTableColumnTest |
| `SysTestFixture(classstr(...))` | Specifies a fixture/suite class | AgreementClassificationTest |

**Representative example:**
```xpp
[SysTestTargetAttribute(classStr(PurchCopilotGenActionPlanParser)),
 SysTestCaseDataDependency('USMF')]
internal final class PurchCopilotGenActionPlanParserTest extends SysTestCase
```

```xpp
[
    SysTestCheckInTest,
    SysTestFeatureDependency(classStr(PurchCopilotInboundEmailProcessingFeature)),
    SysTestFeatureDependency(classStr(PurchCopilotDisableAgentValidatorFlight)),
    SysTestFeatureDependency(classStr(PurchCopilotInboundUseLLMBasedLineMatchingFlight), false)
]
internal final class PurchCopilotInboundEmailApplySuggestionTest extends AtlPurchaseTestCase
```

**Rules:**
- Use `SysTestGranularity::Unit` for fast, isolated tests.
- Use `SysTestCaseDataDependency('USMF')` when tests need existing demo data (e.g., existing POs).
- Use `SysTestFeatureDependency` to explicitly enable/disable feature flights — pass `true` to enable, `false` to disable.
- Multiple `SysTestFeatureDependency` attributes can be stacked.
- `SysTestSecurity` takes a persona ID, an array of role names, and a boolean (whether the role is the full set).
- Copilot tests consistently use `internal final class`.
- Legacy SCM tests may use `public class` or `public final class`.

---

### 2. Base Classes

| Base Class | Purpose | Files Using It |
|------------|---------|----------------|
| `SysTestCase` | Standard base for all X++ tests | PurchCopilotGenActionPlanParserTest, PurchCopilotEntityActionTest, PurchCopilotInboundEmailProcessingTaskTests, PurchCopilotGenControllerExecuteActionTest, DataQualityBaseTest, PurchCopilotGenTableColumnTest, AgreementClassificationTest, AgreementConfirm_PurchTest |
| `AtlPurchaseTestCase` | ATL-enriched base providing `purch`, `data`, `vend`, `vendors`, `invent`, `items`, `warehouse` context objects | PurchCopilotFollowupTaskTemplateTest, PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase |

**Convention:** When tests use ATL entities heavily (purchase orders, vendors, inventory), extend `AtlPurchaseTestCase`. It provides pre-initialized `purch`, `data`, `vend`, `vendors`, `invent`, `items`, `warehouse` members that let you fluently create test data. When tests are simpler or use direct record manipulation, extend `SysTestCase`.

**AtlPurchaseTestCase provides these members (available in setUp via super()):**
- `purch` — `AtlDataPurch` node for purchase orders, agreements, parameters
- `data` — `AtlDataRootNode` for all data areas
- `vend` — vendor data node
- `vendors` — vendor entity collection
- `invent` — inventory data node
- `items` — item entity collection
- `warehouse` — default warehouse entity

---

### 3. setUp() / setUpTestData() Patterns

**Pattern A: Simple setUp with super() + field init**
```xpp
public void setUp()
{
    super();
    this.data = AtlDataRootNode::construct();
}
```
Files: DataQualityBaseTest

**Pattern B: setUp delegates to a private setupTestData() method**
```xpp
public void setUp()
{
    super();
    parser = PurchCopilotGenActionPlanParser::construct();
    this.loadRealPurchaseOrderData();
    this.setupTestData();
    headerTable = PurchCopilotGenTable::findByName(HeaderGenTableName);
    lineTable = PurchCopilotGenTable::findByName(LineGenTableName);
}
```
Files: PurchCopilotGenActionPlanParserTest, PurchCopilotEntityActionTest, PurchCopilotGenControllerExecuteActionTest

**Pattern C: setUp with ATL fluent data creation inside ttsbegin/ttscommit**
```xpp
public void setUp()
{
    super();

    ttsbegin;
    purchCopilotInbound = purch.copilot().inbound();
    purch.parameters().setUpdateConfirmedDeliveryDate(TradeTable2LineUpdate::Always);

    var wh = data.invent().warehouses().default();
    var vendor = vend.vendors().createDefault()
        .setCollaborationType(VendVendorCollaborationType::Disabled)
        .save();
    SysUnitTestData_Invent::createInventTable(item1Id);

    purchaseOrder = purch.purchaseOrders().createDefault().setVendor(vendor).save();
    // ... more ATL setup ...
    ttscommit;
}
```
Files: PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase

**Pattern D: Cleanup-first in setUp/setupTestData**
```xpp
private void setupTestData()
{
    ttsbegin;
    AtlDataPurchCopilotGen::cleanupAll();   // <-- cleanup first

    // Then create fresh data...
    AtlEntityPurchCopilotGenTable tableEntity = AtlDataPurchCopilotGen::createGenTable(...);
    // ...
    ttscommit;
}
```
Files: PurchCopilotGenActionPlanParserTest, PurchCopilotEntityActionTest, PurchCopilotGenControllerExecuteActionTest

**Rule:** Always call `super()` first in `setUp()`. Prefer cleanup-first (delete stale data before creating fresh fixtures). Wrap data manipulation in `ttsbegin`/`ttscommit`.

---

### 4. tearDown() Pattern

**Standard tearDown:**
```xpp
public void tearDown()
{
    this.cleanupTestData();
    super();
}

private void cleanupTestData()
{
    AtlDataPurchCopilotGen::cleanupAll();
}
```
Files: PurchCopilotGenActionPlanParserTest, PurchCopilotEntityActionTest, PurchCopilotGenControllerExecuteActionTest

**Minimal tearDown (cleanup only):**
```xpp
internal void tearDown()
{
    AtlDataPurchCopilotGen::cleanupAll();
    super();
}
```
Files: PurchCopilotGenTableColumnTest

**Rules:**
- Always call `super()` LAST in tearDown (opposite of setUp).
- Use a centralized `cleanupAll()` static method to clean up all test data tables in the correct order (respecting FK constraints).
- tearDown is primarily used for gen-table/copilot test classes; ATL-based tests often rely on automatic rollback or cleanup-first in setUp.
- Many ATL test classes (InboundEmailApply, Workspace, E2E) do NOT have an explicit tearDown — they rely on `AtlPurchaseTestCase` cleanup.

---

### 5. Test Method Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `[SysTestMethod]` | Standard test method marker | Most test methods |
| `[SysTestCheckinTest]` / `[SysTestCheckInTest]` | Marks method as check-in level (can be class-level or method-level) | AgreementClassificationTest methods |
| `[SysTestMethodProperty]` | Sets test method properties | (Not observed in these files but known X++ pattern) |
| `[SysTestFeatureDependency(classStr(...), true)]` | Method-level feature toggle | PurchCopilotInboundEmailApplySuggestionTest.lineChangesEmailApplyLineSuggestion_DeliverDateUpdated |
| `[SysTestCaseAutomaticNumberSequences]` | Method-level number sequence setup | AgreementClassificationTest.changeDirectInvoiceEnable_LinkedPurchaseAgreement_Warning |

**Convention:** Use `[SysTestMethod]` as the standard marker. `[SysTestCheckinTest]` can be applied at class level (all methods) or individual method level. Feature dependencies can also be applied per-method when only one test needs a specific flight.

---

### 6. Test Data Construction Patterns

#### 6a. ATL (Acceptance Test Library) — Fluent Entity Builders

The most common modern pattern. ATL provides fluent builder APIs via entity classes.

```xpp
// Purchase order with lines
purchaseOrder = purch.purchaseOrders().createDefault().setVendor(vendor).save();
poLine1 = purchaseOrder.addLine()
    .setItemId(item1Id)
    .setInventDims([wh])
    .setQuantity(1)
    .setConfirmedDeliveryDate(lastWeekDate)
    .save();
```

```xpp
// ATL entity builder chain
AtlEntityPurchCopilotGenTable tableEntity = AtlDataPurchCopilotGen::createGenTable(TestTableName, TestEntityName);
AtlEntityPurchCopilotGenTableColumn keyColEntity = AtlDataPurchCopilotGen::createColumn(
    genTableRecId, TestKeyColumnName, TestKeyColumnName,
    PurchCopilotDataType::Text, NoYes::Yes);
```

```xpp
// ATL construct → set → save pattern
AtlEntityPurchCopilotGenActionPlan planEntity = AtlEntityPurchCopilotGenActionPlan::construct()
    .setSummary('Test action plan')
    .save();
```

```xpp
// Deeply chained ATL for production routes
route1.addOperation().setOperation(production.operations().assembly())
    .setOperationNumber(10).setNextOperationNumber(0).save()
    .addDetails()
    .addResourceRequirement(resource1, AtlWrkCtrUsedFor::JobAndOperationScheduling)
    .setProcessTime(_estimatedRouteProcessTime)
    .save();
```

Files: PurchCopilotFollowupTaskTemplateTest, PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase, PurchCopilotEntityActionTest, DataQualityBaseTest

#### 6b. Direct Record Insert with doInsert()

Used when ATL doesn't cover the table, or when you need to bypass validation logic:

```xpp
prodTable.ProdId = _prodId;
prodTable.ItemId = _itemId;
prodTable.RouteId = _routeId;
prodTable.ProdStatus = ProdStatus::Completed;
prodTable.doInsert();
```

```xpp
PurchCopilotGenAction badAction;
badAction.ClassName = 'NonExistentClassName';
badAction.Name = 'Bad Action';
badAction.doInsert();
```

Files: DataQualityBaseTest, PurchCopilotGenControllerExecuteActionTest

#### 6c. Standard insert()

Used for simple records where validation is desired:

```xpp
AgreementClassification ac;
ac.IsImmutable = NoYes::Yes;
ac.Name = 'Sales Agreement';
ac.AgreementRelationType = tablenum(SalesAgreementHeader);
ac.insert();
```

Files: AgreementClassificationTest

#### 6d. JSON Payload Construction

Copilot tests frequently build JSON payloads for parsing/processing:

```xpp
private str getSimpleHeaderActionJson()
{
    return strFmt(@'{
        "emailId": "%1",
        "actionPlan": [
            {
                "name": "%2",
                "payload": {
                    "legalEntity": "%3",
                    "%8": {
                        "keys": { "PurchaseOrderNumber": "%4" },
                        "fields": {
                            "ConfirmedDeliveryDate": {"wasDetectedInEmail": true, "changeDetected": true, "currentValue": "", "extractedValue": "%5"}
                        },
                        "children": {}
                    }
                },
                "reasoning": "%7"
            }
        ],
        "summary": "Header confirmation",
        "issues": "None"
    }',
        TestEmailId, ActionUpdateHeader, TestLegalEntity,
        realPurchaseOrderNumber, TestExtractedDate, TestIntent,
        TestHeaderReasoning, HeaderGenTableName
    );
}
```

```xpp
// Inline JSON construction with string concatenation
str emailMapping = strFmt(
    '{ "orders": ['
    +'{"orderIds": [{"fieldName": "Your ref id","fieldValue": "%1"}],'
    +'"deliveryDate": [{"fieldName": "Delivery date","fieldValue": "%2"}],'
    +'"legalEntity": "DAT",'
    +'"intent": "change",'
    +'"lines": []}'
    + '] }'
    , purchId, date2StrUsr(nextWeek));
```

Files: PurchCopilotGenActionPlanParserTest, PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase

**Rules:**
- Use ATL entities when available — prefer fluent builder chains.
- Use `doInsert()` to bypass business logic when needed for edge case tests.
- Use `strFmt()` with `@'...'` (verbatim strings) for multi-line JSON construction.
- Extract JSON builders into private helper methods (e.g., `getCompleteActionPlanJson()`, `getSimpleHeaderActionJson()`).
- Use constants for all repeated string values within JSON templates.

---

### 7. Constants and Field Declaration Patterns

```xpp
// String constants for test data
private const str TestTableName          = 'TestSecurityTable';
private const str TestEntityName         = 'PurchPurchaseOrderHeaderV2Entity';
private const str TestActionClassName    = 'PurchCopilotActionUpdatePurchaseOrder';
private const str TestLegalEntity        = 'usmf';

// ItemId constants
private const ItemId item1Id = 'it1';
private const ItemId item2Id = 'it2';

// Numeric constants
protected const int originalLineQty = 3;
protected const int changedLineQty = 7;

// Computed readonly dates
private readonly date tomorrow = DateTimeUtil::date(DateTimeUtil::addDays(DateTimeUtil::utcNow(), 1));
private readonly date nextWeek = DateTimeUtil::date(DateTimeUtil::addDays(DateTimeUtil::utcNow(), 7));

// RecId tracking
private RecId genTableRecId;
private RecId actionRecId;
private RecId actionPlanRecId;

// Table column records (for assertions)
private PurchCopilotGenTableColumn keyColumn;
private PurchCopilotGenTableColumn dateColumn;
```

**Conventions:**
- Use `private const str` for string identifiers used across tests.
- Use `private const` with typed EDTs (like `ItemId`) when appropriate.
- Use `private readonly date` for computed relative dates.
- Track `RecId` values as class-level fields when setUp creates records and tests need them.
- Store full record buffers (e.g., `PurchCopilotGenTableColumn keyColumn`) when multiple tests need to reference the same record's fields.
- ATL entity references are stored as class-level fields: `private AtlEntityPurchaseOrder poHeader`.
- Use `protected` for fields in abstract base classes that subclasses need.

---

### 8. Helper/Utility Method Patterns

#### 8a. Lookup helpers (find record by criteria)
```xpp
private PurchCopilotGenTableRow findHeaderRow(RecId _actionInstance, PurchCopilotGenRowType _rowType = PurchCopilotGenRowType::ChangeDetected)
{
    PurchCopilotGenTableRow row;
    select firstonly row
        where row.ActionInstance == _actionInstance
           && row.Table == headerTable.RecId
           && row.Parent == 0
           && row.Type == _rowType;
    return row;
}
```

#### 8b. Count helpers
```xpp
private int countPlanActions(RecId _actionPlan)
{
    PurchCopilotGenActionInstance actionInstance;
    int actionCount = 0;
    while select actionInstance
        where actionInstance.ActionPlan == _actionPlan
    {
        actionCount++;
    }
    return actionCount;
}
```

#### 8c. Data creation helpers (parameterized)
```xpp
protected void addProdTransaction(
    ItemId _itemId,
    RouteId _routeId,
    ProdId _prodId,
    InventDim inventDim,
    date _transactionDate,
    RouteOprId _oprId,
    RouteOprTimeProcess _estimatedRouteProcessTime,
    RouteOprTimeProcess _actualRouteProcessTime)
{
    ttsbegin;
    // ... direct record insert ...
    ttscommit;
}
```

#### 8d. Additional row creation helpers
```xpp
private RecId createAdditionalChangeDetectedRow(str _keyValue)
{
    ttsbegin;
    AtlEntityPurchCopilotGenTableRow rowEntity = AtlEntityPurchCopilotGenTableRow::construct()
        .setTable(genTableRecId)
        .setActionInstance(actionInstanceRecId)
        .setType(PurchCopilotGenRowType::ChangeDetected)
        .save();
    // ... create cells ...
    ttscommit;
    return newRowRecId;
}
```

#### 8e. Validation helpers (encapsulate complex assertions)
```xpp
private void validateRowsForActivePOHeaderWithConfirmedDeliveryChange(
    AtlEntityPurchaseOrder _purchOrder,
    AtlEntityPurchCopilotInboundEmailMatchingOrder _matchingOrder,
    date _newConfirmedDeliveryDate,
    boolean _expectsExplanation,
    int _expectedLinesCount,
    FormAdaptor _emailWorkspace)
{
    var validator = PurchCopilotInboundEmailWorkspaceTestHeaderGroupValidator::construct(_emailWorkspace, _expectedLinesCount);
    validator.validateOriginalRow(_purchOrder);
    if (_expectsExplanation)
    {
        validator.validateHistoryRow(_matchingOrder.getHistoryEntry(PurchCopilotInboundEmailMatchingHistoryType::ValueFromEmail));
    }
    validator.validateChangeRow(
        PurchCopilotInboundAgentSuggestion::ChangeDetected,
        enum2Str(this.getExpectedDocumentStateAfterChange()),
        _newConfirmedDeliveryDate,
        _purchOrder.parmDeliveryDate(),
        _purchOrder.parmPurchaseOrderStatus());
}
```

#### 8f. Reread helpers
```xpp
private void rereadMatchingOrdersAndLines()
{
    matchingOrder.reread();
    matchingLine1.reread();
    matchingLine2.reread();
    matchingLine3.reread();
}
```

**Rules:**
- Extract any repeated lookup into a named helper.
- Parameterize helpers to make them reusable across similar but different scenarios.
- Wrap complex multi-step validations in descriptive helper methods.
- Use `reread()` helpers after actions that modify data.

---

### 9. Assertion Patterns and Styles

#### 9a. Standard assertEquals/assertTrue/assertFalse
```xpp
this.assertEquals(1, appCopilotAgentTask.RecId, 'AppCopilotAgentTask should have 1 record');
this.assertTrue(hasAccess, 'Default admin user should have access');
this.assertFalse(canDelete, 'validateDelete should return false for managed-by-Microsoft columns');
this.assertNotEqual(0, actionPlanTable.RecId, 'ActionPlan should be created');
```

#### 9b. Infolog message assertion
```xpp
// Check that a specific error/warning was posted to the infolog
this.assertExpectedInfoLogMessage("@SCM:ErrorSecondaryResponsibleWorkerWithoutAPrimary");
AtlInfologValidator::assertError("Cannot delete a field managed by Microsoft.");
```
Files: AgreementClassificationTest, PurchCopilotGenTableColumnTest

#### 9c. MessageCenter validation (form-level messages)
```xpp
MessageCenterAdaptor::validateContainsMessage(MessageCenterEntryType::Warning, strFmt("@SCM:AgreementClassificationValidateField", ...));
MessageCenterAdaptor::clear();
```
Files: AgreementClassificationTest

#### 9d. Form adaptor validation (UI assertion)
```xpp
emailWorkspace.HeaderChangesGrid().validateCount(2);
emailWorkspace.PurchCopilotInboundReviewHeaderMatchingTmp_Description().validate(enum2Str(PurchCopilotInboundAgentSuggestion::None));
emailWorkspace.PurchCopilotInboundReviewHeaderMatchingTmp_ConfirmedDlv().validate(nextWeek);
emailWorkspace.ExplainAgentActionsCheckbox().validate(false);
emailWorkspace.ShowChangesOnlyButton().validate(true);
```
Files: PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase

#### 9e. Reread-then-assert pattern
```xpp
purchaseOrder.reread();
poLine.reread();
this.assertEquals(VersioningDocumentState::Confirmed, purchaseOrder.parmDocumentState(), 'Email was not confirmed');
this.assertEquals(nextWeek, purchaseOrder.parmConfirmedDeliveryDate(), 'Unexpected confirmed delivery date on header');
```

**Rules:**
- ALWAYS include a descriptive message string in assertions.
- Use `assertNotEqual(0, record.RecId, ...)` to verify record creation.
- Use `reread()` on ATL entities before asserting after an action that modifies data.
- For infolog validation, use `this.assertExpectedInfoLogMessage()` or `AtlInfologValidator::assertError()`.

---

### 10. Mocking / Detours / Testable Classes

#### 10a. SysDetourContext (Method Detours)

The primary mocking mechanism. Use `SysDetourContext` to intercept and mock method calls:

```xpp
using (var context = SysDetourContext::createContext())
{
    // Mock a static method to return void (no-op)
    context.whenMethodCalled(UtilElementType::Class, classStr(AppCopilotEmailFilterClient), staticMethodStr(AppCopilotEmailFilterClient, deleteFilter))
        .doReturnVoid();

    // ... test code that would normally call the real method ...
}
```
Files: PurchCopilotInboundEmailProcessingTaskTests

**Key API:**
- `SysDetourContext::createContext()` — creates a detour context (disposable via `using`)
- `.whenMethodCalled(UtilElementType, classStr, methodStr)` — specifies which method to intercept
- `.doReturnVoid()` — makes the method do nothing
- `.doReturn(value)` — makes the method return a specific value (not shown in these files but known pattern)

#### 10b. Testable Classes

Used to expose protected/internal methods for testing:

```xpp
// In test class declaration
private PurchCopilotEntityActionTestable testable;

// In setUp
testable = PurchCopilotEntityActionTestable::construct();
testable.testableInit(actionInstanceRecord);

// In test methods — call exposed protected methods via testable wrapper
List columns = testable.testableGetKeyColumns();
Map result = testable.testableBuildFieldValues(changeDetectedRowRecId, columns);
testable.testableSetFieldValuesOnBuffer(entityBuf, fieldValues, tableId);
boolean isEmpty = testable.testableIsEmptyCellValue('', col);
```
Files: PurchCopilotEntityActionTest

**Convention:** The testable class wraps the production class and exposes protected methods as `testable<MethodName>()`. The testable class itself sits in the test module (not production code).

#### 10c. SysTestSecurityContext (Security Persona Switching)
```xpp
using (var securityScope = SysTestSecurityContext::setCurrentPersona('PurchCopilotTestNoAccessUser'))
{
    boolean hasAccess = hasMenuItemAccess(
        menuItemActionStr(PurchCopilotActionUpdatePurchaseOrder),
        MenuItemType::Action);
    this.assertFalse(hasAccess, 'User with no access role should not have access');
}
```
Files: PurchCopilotGenControllerExecuteActionTest

**Convention:** Use `SysTestSecurity` attribute at class level to define personas and roles. Use `SysTestSecurityContext::setCurrentPersona()` in specific tests via `using` block. The persona name must match the one defined in the class-level attribute.

---

### 11. Exception Testing Patterns

#### 11a. Boolean flag try/catch
```xpp
boolean exceptionThrown = false;
try
{
    parser.parse('not valid json');
}
catch
{
    exceptionThrown = true;
}
this.assertTrue(exceptionThrown, 'Invalid JSON should throw an exception');
```
Files: PurchCopilotGenActionPlanParserTest

#### 11b. Typed exception catch
```xpp
boolean exceptionThrown = false;
try
{
    localTestable.testableInit(emptyInstance);
}
catch (Exception::Error)
{
    exceptionThrown = true;
}
this.assertTrue(exceptionThrown, 'Expected error for empty action instance.');
```
Files: PurchCopilotEntityActionTest

#### 11c. Verify NO exception thrown
```xpp
boolean wasExceptionThrown = false;
try
{
    controller.executeAction(actionInstance, null);
}
catch
{
    wasExceptionThrown = true;
}
this.assertFalse(wasExceptionThrown, 'executeAction should not throw when user lacks menu item access');
```
Files: PurchCopilotGenControllerExecuteActionTest

**Convention:** X++ tests use a `boolean exceptionThrown` flag + try/catch because there is no `assertThrows()` method in the framework. Always assert the flag's expected value with a descriptive message.

---

### 12. Transaction Handling Patterns

#### 12a. ttsbegin / ttscommit wrapping data setup
```xpp
ttsbegin;

var taskTemplate = PurchCopilotInboundEmailProcessingTaskTemplate::construct();
taskTemplate.createOrUpdateTaskForConfiguration(...);
// ... queries and assertions ...
delete_from appCopilotAgentTask;
// ... more assertions ...

ttscommit;
```
Files: PurchCopilotInboundEmailProcessingTaskTests

#### 12b. ttsbegin / ttscommit in setUp only
```xpp
public void setUp()
{
    super();
    ttsbegin;
    // ... all data creation ...
    ttscommit;
}
```
Files: PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase

#### 12c. ttsbegin / ttsabort for read-only tests
```xpp
ttsbegin;
ac.IsImmutable = NoYes::Yes;
ac.Name = 'Sales Agreement';
ac.insert();
this.assertFalse(ac.validateDelete(), 'should not be possible to delete immutable record');
ttsabort;  // Roll back — don't persist test data
```
Files: AgreementClassificationTest

#### 12d. Mixed — ttsbegin in Given, ttscommit before When
```xpp
// Given
ttsbegin;
// ... setup data ...
ttscommit;

// When
using (EmailWorkspaceFormAdaptor emailWorkspace = EmailWorkspaceFormAdaptor::open())
{
    // ... form interactions ...
}

// Then
purchaseOrder.reread();
this.assertEquals(...);
```
Files: PurchCopilotInboundEmailApplySuggestionTest E2E tests

**Rules:**
- Wrap data creation in `ttsbegin`/`ttscommit`.
- Use `ttsabort` when you want to test validation logic without persisting records.
- In E2E tests, commit before opening forms (form adaptors need committed data).
- Helper methods that create data should have their own `ttsbegin`/`ttscommit` scope.

---

### 13. Form Adaptor / UI Testing Patterns

Form adaptors enable UI-level testing through strongly-typed form proxies.

#### 13a. Using directive for form type providers
```xpp
using EmailWorkspaceFormAdaptor = Microsoft.Dynamics.AX.TypeProviders.FormAdaptors.FormAdaptorTypeProvider@[formStr(PurchCopilotInboundEmailWorkspace)];
using PurchEditLinesFormAdaptor = Microsoft.Dynamics.AX.TypeProviders.FormAdaptors.FormAdaptorTypeProvider@[formStr(PurchEditLines)];
using DialogFormAdaptor = Microsoft.Dynamics.AX.TypeProviders.FormAdaptors.FormAdaptorTypeProvider@[formStr(Dialog)];
using SysBoxFormFormAdaptor = Microsoft.Dynamics.AX.TypeProviders.FormAdaptors.FormAdaptorTypeProvider@[formStr(SysBoxForm)];
```

#### 13b. Opening a form
```xpp
using (EmailWorkspaceFormAdaptor emailWorkspace = EmailWorkspaceFormAdaptor::open())
{
    // ... interact with form ...
}
```

#### 13c. Attaching to a dialog that opens
```xpp
emailWorkspace.ApplyAllSuggestionsButton().click();
using (PurchEditLinesFormAdaptor editLines = PurchEditLinesFormAdaptor::attach())
{
    editLines.OK().click();
}
```

#### 13d. ClientContext for navigating via menu items
```xpp
using (var context = ClientContext::create())
{
    using (var agreementClassificationContext = context.navigate(menuItemDisplayStr(PurchAgreementClassification), formStr(AgreementClassification)))
    {
        AgreementClassificationFormAdaptor agreementClassification = agreementClassificationContext.form();
        agreementClassification.SystemDefinedViewEditButton().click();
        agreementClassification.AgreementClassification_DirectInvoiceEnable_PSN().setValue(false);
    }
}
```
Files: AgreementClassificationTest

#### 13e. Grid navigation
```xpp
emailWorkspace.HeaderChangesGrid().moveFirst();
emailWorkspace.HeaderChangesGrid().moveNext();
emailWorkspace.HeaderChangesGrid().moveLast();
emailWorkspace.HeaderChangesGrid().moveForward(4);
emailWorkspace.LineChangesGrid().markActiveRow();
```

#### 13f. Form field validation and setting values
```xpp
emailWorkspace.ShowChangesOnlyButton().setValue(false);
emailWorkspace.ExplainAgentActionsCheckbox().validate(false);
emailWorkspace.PurchCopilotInboundReviewLineMatchingTmp_ItemIdDisplay().setValue(item3.ItemId);
emailWorkspace.PurchCopilotInboundReviewLineMatchingTmp_Description().validate(enum2Str(PurchCopilotInboundAgentSuggestion::None));
```

#### 13g. Interacting with dialog prompts
```xpp
using(SysBoxFormFormAdaptor dialog = SysBoxFormFormAdaptor::attach())
{
    dialog.Yes().click();  // or dialog.No().click()
}

using(DialogFormAdaptor dialog = DialogFormAdaptor::attach())
{
    dialog.OkButton().click();
}
```

Files: PurchCopilotInboundEmailApplySuggestionTest, PurchCopilotInboundEmailWorkspaceScenarioTest, PurchCopilotInboundEmailE2EApplySuggestionsTestBase, AgreementClassificationTest

**Rules:**
- Always use `using` blocks for form adaptors — they auto-close the form.
- Use `::open()` to open a new form, `::attach()` to attach to a dialog that was triggered.
- Validate state before clicking action buttons.
- Use dedicated test helper/validator classes (e.g., `PurchCopilotInboundEmailWorkspaceTestHelper`, `PurchCopilotInboundEmailWorkspaceTestHeaderGroupValidator`) for complex form validations.

---

### 14. Abstract Test Base Class Pattern

For E2E tests with multiple variants (draft PO vs confirmed PO), use an abstract base:

```xpp
internal abstract class PurchCopilotInboundEmailE2EApplySuggestionsTestBase extends AtlPurchaseTestCase
{
    // Shared constants, fields, setUp, test methods

    protected abstract void reactToApplyChangesPrompt() { }
    protected abstract VersioningDocumentState getExpectedDocumentStateAfterChange() { }
    protected abstract AtlEntityPurchaseOrder createPurchaseOrderHeader() { }
}
```

Concrete subclasses override the abstract methods:
```xpp
internal final class PurchCopilotInboundEmailE2EDraftPOTest extends PurchCopilotInboundEmailE2EApplySuggestionsTestBase
{
    protected void reactToApplyChangesPrompt()
    {
        using (PurchEditLinesFormAdaptor editLines = PurchEditLinesFormAdaptor::attach())
        {
            editLines.OK().click();
        }
    }

    protected VersioningDocumentState getExpectedDocumentStateAfterChange()
    {
        return VersioningDocumentState::Confirmed;
    }

    protected AtlEntityPurchaseOrder createPurchaseOrderHeader()
    {
        return purch.purchaseOrders().createDefault();
    }
}
```

Files: PurchCopilotInboundEmailE2EApplySuggestionsTestBase

**Convention:** Use `protected abstract` methods for the parts that vary. Use `protected` constants and fields. Keep all shared test logic and validation helpers in the base class. Each concrete subclass is small and focused on its variant.

---

### 15. ATL Static Data Factory Pattern

Centralized test data creation via static helper classes:

```xpp
// AtlDataPurchCopilotGen provides static factory methods
AtlDataPurchCopilotGen::cleanupAll();
AtlDataPurchCopilotGen::createGenTable(TestTableName, TestEntityName);
AtlDataPurchCopilotGen::createAction(ActionClassName, 'Update PO', 'Description', genTableRecId);
AtlDataPurchCopilotGen::createColumn(tableRecId, 'PurchId', 'PurchId', PurchCopilotDataType::Text, NoYes::Yes);
AtlDataPurchCopilotGen::createRelation(EntityLine, headerRecId, lineRecId);
AtlDataPurchCopilotGen::createActionParameter(actionRecId, 'ColumnName', genTableRecId);
AtlDataPurchCopilotGen::createEmailStaging(TestEmailId);
```

Files: PurchCopilotGenActionPlanParserTest, PurchCopilotEntityActionTest, PurchCopilotGenControllerExecuteActionTest, PurchCopilotGenTableColumnTest

**Convention:** One `AtlData*` class per feature area. It provides:
- `cleanupAll()` — deletes all test data in correct FK order
- `create*()` methods — return ATL entity wrappers
- Consistent parameter ordering (required params first, optional params with defaults)

---

### 16. Test Naming Conventions (Expanded)

Observed naming patterns across all files:

| Style | Example | Files |
|-------|---------|-------|
| `test<What><Expected>` | `testParseCompleteActionPlan`, `testEmailStored` | PurchCopilotGenActionPlanParserTest |
| `test<Action><Condition>` | `testDeleteAgentTask_VerifyCascadeDelete` | PurchCopilotInboundEmailProcessingTaskTests |
| `test<MethodName>Returns<What>` | `testHasMenuItemAccessReturnsTrueForDefaultUser` | PurchCopilotGenControllerExecuteActionTest |
| `<scenario>_<outcome>` (no test prefix) | `insert_withEntityFieldName_autoPopulatesLabelFromReflection` | PurchCopilotGenTableColumnTest |
| `<action>_<condition>_<result>` (no test prefix) | `confirmEmailE2E_confirmDateHeaderNoLinesMatched_newDateApplied` | PurchCopilotInboundEmailApplySuggestionTest |
| `<scenario>` (no test prefix, concise) | `changedLinesWithoutExplanation`, `allLinesWithExplanation` | PurchCopilotInboundEmailWorkspaceScenarioTest |
| `<action>_<scenario>` (E2E) | `draftPO_applyAllChanges`, `draftPO_applySomeChangesAndIgnoreRest` | PurchCopilotInboundEmailE2EApplySuggestionsTestBase |
| `method_case_result` (BDD-style) | `findOrCreateAgreementClassification_Sales` | AgreementClassificationTest |
| `Given_When_Then` doc comment | Full GIVEN/WHEN/THEN in XML doc comment | PurchCopilotInboundEmailApplySuggestionTest |

**Convention:** The newer Copilot tests prefer the `<scenario>_<condition>_<outcome>` naming without a `test` prefix. Older SCM tests use `test<Description>`. Both are acceptable. The key is that the name reads as a clear description of what's being tested.

---

### 17. Using .NET Libraries in X++ Tests

Test classes can import .NET namespaces using `using` directives at the class level:

```xpp
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Text;
```
Files: PurchCopilotFollowupTaskTemplateTest

**Convention:** Place `using` directives at the top of the declaration block, before class attributes. Common .NET imports include `Newtonsoft.Json` for JSON manipulation and `System.Text` for string building.

---

### 18. Test Data Using SysUnitTestData Helpers

Legacy/cross-cutting test data helpers:

```xpp
HcmWorkerRecId worker = SysUnitTestData_HCM::createHcmWorker().RecId;
SysUnitTestData_Invent::createInventTable(item1Id);
new AgreementXUnitTestSuite().setUp();  // TODO: Optimize for Fixture or similar
```
Files: AgreementClassificationTest, AgreementConfirm_PurchTest, PurchCopilotInboundEmailApplySuggestionTest

**Convention:** Use `SysUnitTestData_*` static helpers for cross-module test data (HCM workers, inventory items). These are simpler than ATL for basic entity creation.

---

### 19. Conditional Test Skip Pattern

When tests depend on real data that may not exist:

```xpp
if (!realDataLoaded)
{
    this.assertTrue(true, 'Skipping entity value test - no real data available');
    return;
}
```
Files: PurchCopilotGenActionPlanParserTest

**CAUTION:** This pattern is fragile — it silently passes. Prefer explicit failure (see rule in existing patterns). Only use this as a last resort when the test cannot reasonably fail in all environments.

---

### 20. Using Newtonsoft for Structured JSON

Pattern for working with JSON in test setup:

```xpp
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

str json = '';
json += '{ "orders": [';
json += '    { "orderIds": [ { "fieldName": "Your ref id", "fieldValue": "' + poHeader.parmPurchId() + '" } ],';
json += '      "intent": "change",';
json += '      "lines": [ ... ]';
json += '    }';
json += ']}';
```

Also via `strFmt(@'...')` for verbatim multi-line:
```xpp
return strFmt(@'{
    "emailId": "%1",
    "actionPlan": [ ... ],
    "summary": "%2"
}', emailId, summary);
```

Files: PurchCopilotFollowupTaskTemplateTest, PurchCopilotGenActionPlanParserTest, PurchCopilotInboundEmailApplySuggestionTest

---