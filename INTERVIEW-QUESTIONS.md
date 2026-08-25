# Interview Questions – Central Library Staff Portal

## Authentication
1. **Why did you add Sign Up and Login?**  
   To restrict access to library operations and allow staff accounts to be registered before they can use the system.
2. **What happens after Sign Up?**  
   The account is saved in browser storage, but the user is not automatically authenticated. They are sent back to Sign In and must log in.
3. **How do you prevent unauthorised access?**  
   The application shell is hidden by default. Navigation and protected actions call `requireAuth()` before opening a page or operation.
4. **Why use sessionStorage?**  
   It keeps the current login session for the browser tab and is cleared when the session ends or the user signs out.
5. **Why use localStorage for accounts?**  
   This is a front-end-only internship project, so localStorage provides simple persistence without a backend. In production, passwords must never be stored this way.
6. **What is the CAPTCHA doing?**  
   It is a simple arithmetic challenge that checks whether the entered answer matches the generated calculation.

## Library functionality
7. How does book availability change when a book is issued?
8. How do you stop a user from issuing a book when no copy is available?
9. How is overdue fine calculated?
10. Why is a member required to be ACTIVE before issuing a book?
11. Why do you prevent deletion of a book/member with an active transaction?
12. How does search and filtering work?
13. How is transaction history maintained?
14. How does CSV export work?

## JavaScript / frontend
15. Why did you use vanilla JavaScript instead of a framework?
16. What is event-driven programming in this project?
17. What is DOM manipulation and where is it used?
18. Why are functions such as `renderBooks()` and `renderMembers()` separated?
19. What is the purpose of `localStorage` vs `sessionStorage`?
20. What would you change if this became a real production application?

## Strong production answer
If asked about security, say:

> “For the internship demo I implemented client-side authentication using sessionStorage and browser storage so the project can run without a backend. I understand that this is not production-grade security. In a real system I would move authentication to a backend, hash passwords with a strong password-hashing algorithm, validate credentials server-side, use secure sessions or short-lived tokens, and store users and library records in a database.”
