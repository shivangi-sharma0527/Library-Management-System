# Central Library – Staff Portal

A browser-based Library Management System built with **HTML, CSS and vanilla JavaScript** for an internship project.

## Authentication
- Staff login using Library ID and password.
- Registration / Sign Up for new library staff accounts.
- Arithmetic CAPTCHA on both login and registration.
- A newly registered user is **not logged in automatically**; they must return to the Sign In screen and authenticate.
- All dashboard modules are hidden until a valid session exists.
- Session is maintained with `sessionStorage`; registered demo accounts are stored in `localStorage` for this front-end project.

## Main modules
- Dashboard
- Book Management (add, edit, delete, search and availability filter)
- Member Management (add, edit, delete, search and status filter)
- Issue Book
- Return Book with automatic ₹5/day overdue fine calculation
- Transactions / audit history
- Reports and CSV export

## Demo account
For interview demonstration, the project includes a default account:
- Library ID: `LIB1001`
- Password: `Admin@123`

You can also use **Create staff account** to register a new account.

## How to run
Open `index.html` with VS Code Live Server or any local static server.

> This is a front-end internship project. Credentials are stored locally in the browser, so this is not production-grade authentication. A production version should use a backend, hashed passwords, server-side sessions/JWT and a database.
