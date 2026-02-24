# X++ Code Review Patterns & Rules

Use the patterns and rules below as your reference when reviewing code. Flag violations as issues and suggest the correct pattern. This is a living document — add new entries at the bottom.

---

## Transaction Scoping

**Bad** — oversized tts scope wrapping non-transactional logic:
```xpp
ttsbegin;
info("Starting process...");
this.validateInput();       // no DB access
this.writeToDatabase();
this.sendNotification();    // external call inside tts
ttscommit;
```

**Good** — narrow tts scope around DB writes only:
```xpp
this.validateInput();
ttsbegin;
this.writeToDatabase();
ttscommit;
this.sendNotification();
```

**Rule**: `ttsbegin`/`ttscommit` should wrap only the database operations. Never include user interaction, external calls, or pure computation inside a transaction scope.

---

## Set-Based vs Row-by-Row Operations

**Bad** — row-by-row updates in a loop:
```xpp
while select forupdate salesLine
    where salesLine.SalesId == salesId
{
    salesLine.LineStatus = SalesLineStatus::Delivered;
    salesLine.update();
}
```

**Good** — set-based update:
```xpp
update_recordset salesLine
    setting LineStatus = SalesLineStatus::Delivered
    where salesLine.SalesId == salesId;
```

**Rule**: Always prefer `update_recordset`, `insert_recordset`, and `delete_from` over loops with `update()`, `insert()`, `delete()`. Row-by-row processing should only be used when per-row business logic (like custom validation or event firing) is required.

---

## Query Construction

**Bad** — string concatenation in query ranges:
```xpp
qbds.addRange(fieldNum(CustTable, AccountNum)).value(userInput);
```

**Good** — use `queryValue()` or `SysQuery` methods:
```xpp
qbds.addRange(fieldNum(CustTable, AccountNum)).value(queryValue(userInput));
```

**Rule**: Always use `queryValue()`, `SysQuery::value()`, or `SysQuery::range()` to wrap values in query ranges. Never concatenate raw input directly — this prevents injection and ensures proper escaping.

---

## Chain of Command (CoC) Extensions

**Bad** — forgetting to call `next`:
```xpp
[ExtensionOf(classStr(SalesFormLetter))]
final class SalesFormLetter_Extension
{
    public void run()
    {
        // custom logic only — next is missing!
        this.doCustomWork();
    }
}
```

**Good** — always call `next`:
```xpp
[ExtensionOf(classStr(SalesFormLetter))]
final class SalesFormLetter_Extension
{
    public void run()
    {
        next run();
        this.doCustomWork();
    }
}
```

**Rule**: Every CoC method MUST call `next`. Omitting `next` breaks the extension chain and prevents standard and other extension logic from executing.

---

## Error Handling

**Bad** — catching all exceptions silently:
```xpp
try
{
    this.riskyOperation();
}
catch
{
    // swallowed — no logging, no rethrow
}
```

**Good** — catch specific exceptions, log, and handle:
```xpp
try
{
    this.riskyOperation();
}
catch (Exception::Error)
{
    error("@MyLabel:OperationFailed");
    // rethrow if the caller needs to know
    throw;
}
catch (Exception::CLRError)
{
    CLRInterop::getLastException().toString();
    error("@MyLabel:UnexpectedCLRError");
}
```

**Rule**: Never use a bare `catch` that swallows errors. Always catch specific exception types and either log + handle or rethrow. Silent failures cause hard-to-diagnose production issues.

---

## Select Statements & Indexing

**Bad** — `select` without index hint on large tables:
```xpp
select firstonly custTrans
    where custTrans.AccountNum == accountNum
    &&    custTrans.TransDate  >= startDate;
```

**Good** — use `index` hint or ensure the appropriate index exists:
```xpp
select firstonly custTrans
    index hint AccountDateIdx
    where custTrans.AccountNum == accountNum
    &&    custTrans.TransDate  >= startDate;
```

**Rule**: For high-volume tables (like transaction tables), verify that the `where` clause fields are covered by an index. Use `index hint` when the query optimizer might not pick the optimal index. Flag any `while select` on large tables without appropriate indexing.

---

## Container Misuse

**Bad** — using containers as dynamic arrays in loops:
```xpp
container result;
while select salesLine where salesLine.SalesId == salesId
{
    result += [salesLine.ItemId];  // O(n) copy each iteration
}
```

**Good** — use `List` or `Array` for dynamic collections:
```xpp
List itemIds = new List(Types::String);
while select salesLine where salesLine.SalesId == salesId
{
    itemIds.addEnd(salesLine.ItemId);
}
```

**Rule**: Containers are immutable — every `+=` creates a full copy, making loops O(n²). Use `List`, `Set`, `Map`, or `Array` for collections that grow dynamically.

---

## Proper Find/Exists Pattern

**Bad** — querying the full record when only existence matters:
```xpp
if (InventTable::find(itemId).RecId != 0)
{
    // just checking existence but fetched entire record
}
```

**Good** — use `exists()` for existence checks:
```xpp
if (InventTable::exist(itemId))
{
    // lightweight existence check
}
```

**Rule**: Use `::exist()` for existence checks and `::find()` only when you need the record data. Static `find` and `exist` methods should be present on every table. If missing, flag it as a best practice issue.

---

## Label Usage

**Bad** — hardcoded strings:
```xpp
info("Record has been saved successfully.");
throw error("Invalid input provided.");
```

**Good** — use labels:
```xpp
info("@MyModule:RecordSavedSuccess");
throw error("@MyModule:InvalidInput");
```

**Rule**: All user-facing strings (infolog messages, errors, form captions, field labels) must use label references (`@LabelFile:LabelId`). Hardcoded strings break localization.

---

## Disposable Objects

**Bad** — not disposing objects that implement `IDisposable` or hold unmanaged resources:
```xpp
SysExcelApplication excelApp = SysExcelApplication::construct();
excelApp.visible(true);
// excelApp is never quit/disposed
```

**Good** — use `try/finally` to ensure cleanup:
```xpp
SysExcelApplication excelApp = SysExcelApplication::construct();
try
{
    excelApp.visible(true);
    // work with Excel
}
finally
{
    excelApp.quit();
}
```

**Rule**: Any object that holds external resources (COM references, file handles, .NET `IDisposable` wrappers) must be cleaned up in a `finally` block.

---

## Foreign Key Field Naming

**Bad** — using `RecId` suffix for foreign key fields:
```xpp
// In PurchCopilotGenActionPlan table
AxTableField: EmailRecId  (references Email table's RecId)
```

**Good** — use a descriptive name without `RecId` suffix:
```xpp
// In PurchCopilotGenActionPlan table
AxTableField: Email  (references Email table's RecId)
```

**Rule**: When a table field is a foreign key referencing another table's `RecId`, the field name should NOT have the `RecId` suffix. Use the related table or entity name directly (e.g., `Email` not `EmailRecId`, `PurchOrder` not `PurchOrderRecId`). The `RecId` suffix is misleading — it exposes an implementation detail. The standard D365 convention uses descriptive names that reflect the relationship.

## Conventions

* A blank line should be added for every `return` statement 
* A blank line should be added **before** every `select` / `while select` query statement
* Same logic code can stay close, but not packed everything together
* Repeated parts should be extracted to a method or even a class
* Parameter of a method should start with an underscore, for example `public void add(int _num1, int _num2)`

## Data Structure Selection

**Bad** — using `Map` when only the values are iterated:
```xpp
Map columns = new Map(Types::Int64, Types::Record);
while select column where column.Table == tableRecId
{
    columns.insert(column.RecId, column); // key is never used
}

MapEnumerator me = columns.getEnumerator();
while (me.moveNext())
{
    PurchCopilotGenTableColumn col = me.currentValue(); // only value accessed
}
```

**Good** — use `List` when you only need to iterate values:
```xpp
List columns = new List(Types::Record);
while select column where column.Table == tableRecId
{
    columns.addEnd(column);
}

ListEnumerator le = columns.getEnumerator();
while (le.moveNext())
{
    PurchCopilotGenTableColumn col = le.current();
}
```

**Rule**: Choose the simplest data structure that fits the use case:
- `List` — ordered collection, iterate only.
- `Set` — uniqueness checks, no duplicates.
- `Map` — only when key-value lookup is actually needed (both key and value are used).
- `container` — small, fixed-size collections; avoid for dynamic growth (O(n²) copy).

Never use `Map` just to store records by RecId if you never look up by that RecId.

---

<!-- Add new patterns below this line -->
