# LibraryPro — Library Management System

A professional full-stack Library Management System built for a software development internship task.

## Tech Stack
- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend: Node.js + Express.js
- Database: PostgreSQL
- API: REST-style JSON endpoints

## Features
1. Dashboard with live statistics
2. Book CRUD: add, view, edit, delete
3. Book search and availability filter
4. Member CRUD and status management
5. Issue book workflow
6. Return book workflow
7. Automatic overdue detection
8. Fine calculation at ₹5/day
9. Complete transaction history
10. Reports: categories, most borrowed books, overdue list
11. PostgreSQL transactions for issue/return
12. Parameterized SQL queries
13. Responsive professional UI
14. Local JSON fallback mode for quick demo when PostgreSQL is not configured

## Run with PostgreSQL

### 1. Install Node.js
Use Node.js 18+.

### 2. Create database
In PostgreSQL:
```sql
CREATE DATABASE library_management;
```

### 3. Configure environment
Copy `.env.example` to `.env` and update:
```env
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/library_management
```

### 4. Install and run
```bash
npm install
npm start
```

Open:
`http://localhost:5000`

The server automatically creates tables and inserts sample books/members.

## Quick demo without PostgreSQL
If `.env` does not contain `DATABASE_URL`, the application uses `data/library.json`. This mode is only for demonstrating the UI and workflow quickly. For the internship submission, use PostgreSQL and explain the PostgreSQL implementation in the interview.

## Important
Do NOT open `public/index.html` directly with Live Server. Start the Node server with `npm start`, because the frontend calls `/api/...` endpoints.

## Main API endpoints
- GET `/api/dashboard`
- GET/POST `/api/books`
- PUT/DELETE `/api/books/:id`
- GET/POST `/api/members`
- PUT/DELETE `/api/members/:id`
- GET `/api/issue-options`
- POST `/api/transactions/issue`
- GET `/api/transactions`
- POST `/api/transactions/:id/return`
- GET `/api/reports/summary`
- GET `/api/health`

## Interview explanation
The system follows a simple client-server architecture. The browser sends HTTP requests using Fetch API. Express receives the request, validates input and performs database operations through the `pg` PostgreSQL driver. PostgreSQL stores books, members and transactions in related tables. Issue and return operations use database transactions so inventory and transaction records stay consistent.

## Resume bullet
**Library Management System | HTML, CSS, JavaScript, Node.js, Express.js, PostgreSQL**
- Developed a responsive library management application with book/member CRUD, search, issue-return workflows and transaction history.
- Implemented PostgreSQL data persistence, validation, REST APIs, overdue tracking and automated fine calculation.
- Designed a dashboard and reporting module for inventory, members, borrowing and overdue analysis.
