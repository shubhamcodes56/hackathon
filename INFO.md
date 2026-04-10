# 📄 INFO DOCUMENT: CampusConnect

### 1. System Overview
**What problem this system solves:**
College students often struggle to find reliable peers to buy/sell old textbooks, find trusted roommates, or exchange skills (e.g., trading math tutoring for coding help). Existing general platforms (like Facebook groups) are chaotic, unverified, and filled with spam. Our system solves this by creating a highly secure, organized, and verified hyper-local marketplace exclusively for students at your university.

**High-level architecture (Simple Explanation):**
Think of the architecture like a restaurant:
- **The Customer (Frontend / App):** A React.js web application running on the user’s browser. This is what the user clicks and interacts with.
- **The Waiter (Backend API):** A Node.js/Express server. It takes the user's order (request) from the frontend and carries it to the kitchen.
- **The Kitchen (Database):** A PostgreSQL/MongoDB database. Here, the data is securely stored, cooked up, and handed back to the waiter to serve to the customer.

---

### 2. Database Design Explanation
**Purpose of each table:**
- **Users Table:** Stores student details (Name, College Email, Hashed Password).
- **Listings Table:** Stores the actual items or skills being offered (Title, Description, Price, Image, Category).
- **Messages Table:** Stores direct messages sent between buyers and sellers.

**Relationships between tables:**
- A **User** can create *many* **Listings** (One-to-Many).
- A **Listing** belongs to exactly *one* **User** (the seller).
- A **Message** links two different **Users** (Sender and Receiver) and references one specific **Listing**.

**Normalization logic used:**
We avoid redundancy perfectly. Notice we don't save the seller's name and email in every single listing they create. Instead, the `Listings` table only saves a `user_id`. When we need the seller's info, we use that ID to look it up. This means if a user updates their profile picture, it automatically updates across all 50 of their listings instantly.

---

### 3. Backend Logic
**Complete data flow (Request → Backend → Database → Response):**
1. **Request:** A user clicks on "Textbooks". The frontend sends an HTTP request to the backend saying: *"Give me all listings in the textbook category."*
2. **Backend:** The Node.js server receives this request. It checks if the user is logged in, then asks the database for the data.
3. **Database:** The database searches its tables and hands the data back to the server.
4. **Response:** The backend formats this data as JSON (standard internet data format) and sends it back to the frontend, which instantly paints the textbook items onto the screen.

**API design reasoning:**
We use a **RESTful API** design. This acts like a highly organized, standardized menu for our waiter. All endpoints are predictable (e.g., `GET /api/listings` to view items, `POST /api/listings` to create one). This means the frontend always knows exactly how to ask the backend for what it needs.

---

### 4. Security Measures
**How SQL injection is prevented:**
We prevent SQL injection by treating all user input purely as *data*, never as executable code. We use **Parameterized Queries** (or an ORM). If a hacker types malicious database commands into the search bar, the system literally just searches the database for those exact malicious words instead of executing the command. 

**Authentication & authorization logic:**
- **Authentication (Who are you?):** Users log in using their college email. Upon login, the system gives them a **JWT (JSON Web Token)**. Think of this like a digital wristband at a concert. They silently show this wristband on every future click to prove they are logged in.
- **Authorization (What are you allowed to do?):** Even with a wristband, a user can only delete or edit *their own* listings. The backend double-checks that the `user_id` making the deletion request strictly matches the `owner_id` of the listing.

**Data protection techniques:**
- Passwords are never stored as plain text. We use **Bcrypt Hashing**, a one-way math equation that scrambles the password completely. Even if a hacker steals the database, they cannot read the passwords.
- All data travels over **HTTPS**, creating an encrypted, unreadable tunnel between the user's phone and our server.

---

### 5. Performance Optimization
**Indexing strategy:**
We apply an **Index** to the `category` and `title` columns in our database. This works exactly like the index at the back of a textbook. Instead of the database painfully reading through 10,000 listings to find textbooks, it checks the index and instantly jumps to the correct rows.

**Query optimization:**
We use **Pagination** (or infinite scrolling). Rather than fetching the entire database and freezing the user's phone, the server only fetches the first 20 items. When the user scrolls to the bottom, the frontend asks for the next 20. 

**Scalability approach:**
The backend is completely **Stateless**. The server doesn't magically "remember" who is logged in—it relies entirely on the database and the JWT wristband. This means if traffic violently spikes, we can simply copy-paste our server code onto 5 different cloud computers, and they will all work perfectly together to share the load.

---

### 6. Edge Cases & Failure Handling
**Possible errors or failures:**
1. The database server crashes or takes too long.
2. Two users click "Buy" on the exact same unique item at the exact same millisecond. 

**How the system handles them:**
- **Graceful Failure:** The backend wraps database requests in `try/catch` blocks. If the database crashes, the server catches the error and politely sends a `500 Internal Server Error` with a friendly UI message ("System under heavy load, please try again"), preventing the whole app from white-screening.
- **Database Locks (Transactions):** We treat a purchase as a "Transaction." Whoever's click registers first locks the row in the database for a millisecond. The second user's click hits the lock, and they get a polite "Sorry, item just got sold!" message.

---

### 7. Hackathon Pitch Ready Explanation
**Explain the system in simple words (for Judges):**
*"Every semester, college students waste hours and get scammed trying to buy textbooks or find roommates on chaotic Facebook groups. **CampusConnect** is a hyper-local, verified marketplace that treats your `.edu` email as your passport. It brings the sleek, secure experience of an app like Amazon to peer-to-peer campus trading, solving a problem every single student in this room relates to."*

**Key points to highlight for impact:**
- **The "Moat" (Trust):** Because signups are restricted to university emails, the trust factor is immediately 10x higher than generic platforms.
- **Real-World Readiness:** Highlight that all edge-cases (like double-booking an item and password hashing) have been natively handled.
- **Scalable Foundation:** Point out that because the backend is stateless and scalable, this exact same software can be rolled out to 1,000 other universities with zero code changes.
