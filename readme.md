# SAP CAP — Class-based Service (extends cds.ApplicationService)

CAP supports two styles for implementing a service handler. The class style is the modern recommended approach — it supports inheritance, reusable methods, and method overriding.

---

## Function Style vs Class Style

```js
// ── Function style (legacy, still valid) ────────────────────
module.exports = (srv) => {
  srv.before('CREATE', 'Books', req => { ... })
  srv.on('submitOrder', async req => { ... })
  srv.after('READ', 'Books', books => { ... })
  // No super.init() needed
}

// ── Class style (recommended) ────────────────────────────────
class CatalogService extends cds.ApplicationService {
  async init() {
    this.before('CREATE', Books, req => { ... })
    this.on('submitOrder', async req => { ... })
    this.after('READ', Books, books => { ... })
    return super.init()  // required, always last
  }
}
module.exports = CatalogService
```

| | Function style | Class style |
|---|---|---|
| Handler registration | `srv.before/on/after` | `this.before/on/after` |
| Needs `super.init()` | ❌ | ✅ must be last |
| Supports inheritance | ❌ | ✅ |
| Reusable methods | ❌ | ✅ `this.myMethod()` |
| Child can override parent handlers | ❌ | ✅ via method overriding |
| CAP recommended | legacy | ✅ current recommendation |

---

## Project Structure

```
my-class-service/
├── db/
│   ├── schema.cds
│   └── data/
│       └── my.bookshop-Books.csv
├── srv/
│   ├── cat-service.cds
│   ├── cat-service.js       ← base class
│   ├── admin-service.cds
│   └── admin-service.js     ← extends CatalogService
├── .cdsrc.json               ← mock users for Basic Auth
└── package.json
```

---

## Data Model

### `db/schema.cds`

```cds
namespace my.bookshop;
using { cuid, managed } from '@sap/cds/common';

entity Books : cuid, managed {
  title     : String(200);
  price     : Decimal(9, 2);
  stock     : Integer default 0;
  published : Boolean default false;
}
```

### `db/data/my.bookshop-Books.csv`

```
ID,title,price,stock,published
b0000001-0000-0000-0000-000000000001,Clean Code,38.00,10,false
b0000001-0000-0000-0000-000000000002,The Pragmatic Programmer,45.00,5,false
b0000001-0000-0000-0000-000000000003,Refactoring,42.00,0,true
```

---

## Service Definitions

### `srv/cat-service.cds`

```cds
using my.bookshop as db from '../db/schema';

service CatalogService @(requires: 'user') {
  entity Books as projection on db.Books;
  action submitOrder(bookID: UUID, amount: Integer) returns { message: String; };
}
```

### `srv/admin-service.cds`

```cds
using my.bookshop as db from '../db/schema';

service AdminService @(requires: 'admin') {
  entity Books as projection on db.Books;
  action resetStock(bookID: UUID) returns { message: String; };
}
```

---

## Service Implementations

### `srv/cat-service.js` — base class

```js
const cds = require('@sap/cds')

class CatalogService extends cds.ApplicationService {

  async init() {
    const { Books } = this.entities
    // this.entities → all entities exposed by this service

    // Register handlers using this.before / this.on / this.after
    // (same as srv.before/on/after in function style)
    this.before('CREATE', Books, req => this.validateBook(req))

    this.on('submitOrder', async req => {
      const { bookID, amount } = req.data
      const book = await SELECT.one.from(Books).where({ ID: bookID })

      if (!book)               return req.error(404, 'Book not found')
      if (book.stock == null)  return req.error(500, 'Stock data is invalid')
      if (book.stock < amount) return req.error(409, `Insufficient stock, available: ${book.stock}`)

      await UPDATE(Books).set({ stock: book.stock - amount }).where({ ID: bookID })

      return { message: `Order placed for "${book.title}" x${amount}` }
    })

    this.after('READ', Books, books => {
      if (!books) return
      const list = Array.isArray(books) ? books : [books]
      for (const book of list) {
        book.priceWithTax = +(book.price * 1.1).toFixed(2)
      }
    })

    // super.init() registers CAP's generic handlers (auto CRUD)
    // Must always be the LAST line — missing it breaks all GET/POST/PATCH/DELETE
    return super.init()
  }

  // Class-style methods can be called with this.xxx() inside handlers
  // Subclasses can override these methods to change behaviour
  validateBook(req) {
    if (!req.data.title) return req.error(400, 'title is required')
    if (req.data.price <= 0) return req.error(400, 'price must be greater than 0')
  }
}

module.exports = CatalogService
```

### `srv/admin-service.js` — extends CatalogService

```js
const CatalogService = require('./cat-service')

class AdminService extends CatalogService {

  async init() {
    const { Books } = this.entities

    // Child-only handler: not in CatalogService
    this.on('resetStock', async req => {
      const { bookID } = req.data
      const book = await SELECT.one.from(Books).where({ ID: bookID })
      if (!book) return req.error(404, 'Book not found')

      await UPDATE(Books).set({ stock: 100 }).where({ ID: bookID })
      return { message: `"${book.title}" stock reset to 100` }
    })

    // super.init() here calls CatalogService.init()
    // which registers all parent handlers including before CREATE
    return super.init()
  }

  // Override the parent's validateBook method
  // This is the correct way to skip/change parent validation
  // The before CREATE handler in the parent calls this.validateBook(req)
  // so overriding this method is enough — no duplicate handler needed
  validateBook(req) {
    // Admins only require a title — price=0 is allowed
    if (!req.data.title) return req.error(400, 'title is required')
  }
}

module.exports = AdminService
```

---

## Mock Authentication

### `.cdsrc.json`

```json
{
  "requires": {
    "auth": {
      "kind": "basic",
      "users": {
        "admin": {
          "password": "admin",
          "roles": ["admin"]
        },
        "user": {
          "password": "user",
          "roles": ["user"]
        }
      }
    }
  }
}
```

Without this file, `cds watch` runs with no authentication and ignores any `Authorization` header sent by the client.

---

## Running the Project

```bash
cds watch
```

---

## HTTP Request Examples

### Read books (CatalogService — requires 'user' role)
```http
GET /odata/v4/catalog/Books
Authorization: Basic user:user
# → each book includes priceWithTax = price * 1.1 (added in after READ)
```

### Place an order
```http
POST /odata/v4/catalog/submitOrder
Authorization: Basic user:user
Content-Type: application/json

{ "bookID": "b0000001-0000-0000-0000-000000000001", "amount": 2 }
```

### Create a book — price=0 is rejected by CatalogService
```http
POST /odata/v4/catalog/Books
Authorization: Basic user:user
Content-Type: application/json

{ "title": "Test", "price": 0, "stock": 5 }
# → 400 price must be greater than 0
```

### Create a book via AdminService — price=0 is allowed
```http
POST /odata/v4/admin/Books
Authorization: Basic admin:admin
Content-Type: application/json

{ "title": "Internal Doc", "price": 0, "stock": 0 }
# → 201 Created — AdminService overrides validateBook() to allow price=0
```

### Reset stock (AdminService only)
```http
POST /odata/v4/admin/resetStock
Authorization: Basic admin:admin
Content-Type: application/json

{ "bookID": "b0000001-0000-0000-0000-000000000003" }
```

### Access AdminService with wrong role
```http
GET /odata/v4/admin/Books
Authorization: Basic user:user
# → 403 Forbidden
```

---

## Inheritance and Handler Execution

```
AdminService.init() is called
        ↓
Child registers: this.on('resetStock', ...)
        ↓
super.init() → CatalogService.init() runs
        ↓
Parent registers: this.before('CREATE', Books, req => this.validateBook(req))
Parent registers: this.on('submitOrder', ...)
Parent registers: this.after('READ', Books, ...)
        ↓
super.init() inside CatalogService → registers CAP generic handlers
```

When a `POST /admin/Books` request arrives, the parent's `before CREATE` runs and calls `this.validateBook(req)`. Because `this` refers to the `AdminService` instance, JavaScript resolves `validateBook` on the child class — so the overridden version runs, not the parent's.

---

## Gotchas

**`return super.init()` must always be the last line**
```js
async init() {
  this.before(...)
  this.on(...)
  return super.init()  // ✅ last line, always return
}

// ❌ Missing super.init() → all GET/POST/PATCH/DELETE stop working
// ❌ super.init() before handlers → handlers may be overwritten by generic ones
```

**Child handlers do NOT replace parent handlers — both run**
```js
// ❌ Wrong assumption: child before CREATE replaces parent before CREATE
class AdminService extends CatalogService {
  async init() {
    this.before('CREATE', Books, req => { /* skip price check */ })
    return super.init()
    // Both before CREATE handlers run — parent price check still executes
  }
}

// ✅ Correct: extract validation into an overridable method in the parent
validateBook(req) { /* parent: checks price */ }

// Child overrides the method — only one before CREATE handler exists
validateBook(req) { /* child: skips price check */ }
```

**`this.entities` only contains entities from the current service**
```js
// In CatalogService: this.entities → { Books }
// In AdminService:   this.entities → { Books } (AdminService's own projection)
// They point to the same db table but are different service-layer projections
```

**`module.exports` exports the class, not an instance**
```js
// ✅ Export the class
module.exports = CatalogService

// ❌ Do not instantiate it yourself
module.exports = new CatalogService()  // CAP handles instantiation
```
