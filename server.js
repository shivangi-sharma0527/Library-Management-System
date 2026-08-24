require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;
const dataDir = path.join(__dirname, "data");
const fallbackFile = path.join(dataDir, "library.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let pool = null;
let usePostgres = Boolean(process.env.DATABASE_URL);

if (usePostgres) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
  });
}

const emptyData = { books: [], members: [], transactions: [] };

function loadFallback() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(fallbackFile)) fs.writeFileSync(fallbackFile, JSON.stringify(emptyData, null, 2));
  return JSON.parse(fs.readFileSync(fallbackFile, "utf8"));
}
function saveFallback(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(fallbackFile, JSON.stringify(data, null, 2));
}
function nextId(items) {
  return items.length ? Math.max(...items.map(x => Number(x.id))) + 1 : 1;
}
function dateOnly(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}
function normalizeBook(b) {
  return { ...b, total_copies: Number(b.total_copies), available_copies: Number(b.available_copies), publication_year: Number(b.publication_year) };
}
function normalizeMember(m) {
  return { ...m };
}
function overdue(t) {
  return t.status === "ISSUED" && new Date(t.due_date) < new Date(dateOnly());
}

async function dbQuery(text, params=[]) {
  return pool.query(text, params);
}

async function initPostgres() {
  const schema = fs.readFileSync(path.join(__dirname, "database", "schema.sql"), "utf8");
  await pool.query(schema);
}

app.get("/api/health", async (req, res) => {
  if (!usePostgres) return res.json({ ok: true, mode: "local-demo", message: "Running with local JSON fallback. Configure DATABASE_URL for PostgreSQL." });
  try {
    await dbQuery("SELECT 1");
    res.json({ ok: true, mode: "postgresql", message: "PostgreSQL connected" });
  } catch (e) {
    res.status(503).json({ ok: false, mode: "postgresql", message: "PostgreSQL connection failed" });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    if (usePostgres) {
      const q = await dbQuery(`
        SELECT
          (SELECT COUNT(*) FROM books) AS total_books,
          (SELECT COALESCE(SUM(total_copies),0) FROM books) AS total_copies,
          (SELECT COALESCE(SUM(available_copies),0) FROM books) AS available_copies,
          (SELECT COUNT(*) FROM members WHERE status='ACTIVE') AS active_members,
          (SELECT COUNT(*) FROM transactions WHERE status='ISSUED') AS issued_books,
          (SELECT COUNT(*) FROM transactions WHERE status='ISSUED' AND due_date < CURRENT_DATE) AS overdue_books
      `);
      return res.json(q.rows[0]);
    }
    const d = loadFallback();
    res.json({
      total_books: d.books.length,
      total_copies: d.books.reduce((s,b)=>s+Number(b.total_copies||0),0),
      available_copies: d.books.reduce((s,b)=>s+Number(b.available_copies||0),0),
      active_members: d.members.filter(m=>m.status==="ACTIVE").length,
      issued_books: d.transactions.filter(t=>t.status==="ISSUED").length,
      overdue_books: d.transactions.filter(overdue).length
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/books", async (req,res)=>{
  try {
    const q = String(req.query.q||"").trim();
    const availability = req.query.availability || "all";
    if (usePostgres) {
      const result = await dbQuery(`
        SELECT * FROM books
        WHERE ($1='' OR title ILIKE '%'||$1||'%' OR author ILIKE '%'||$1||'%' OR isbn ILIKE '%'||$1||'%' OR category ILIKE '%'||$1||'%')
        AND ($2='all' OR ($2='available' AND available_copies>0) OR ($2='unavailable' AND available_copies=0))
        ORDER BY id DESC`, [q, availability]);
      return res.json(result.rows);
    }
    let books = loadFallback().books.map(normalizeBook);
    books = books.filter(b => !q || [b.title,b.author,b.isbn,b.category].join(" ").toLowerCase().includes(q.toLowerCase()));
    if (availability==="available") books=books.filter(b=>b.available_copies>0);
    if (availability==="unavailable") books=books.filter(b=>b.available_copies===0);
    res.json(books.sort((a,b)=>b.id-a.id));
  } catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/books", async (req,res)=>{
  try {
    const {title,author,isbn,category,publisher,publication_year,total_copies}=req.body;
    if (!title || !author || !isbn || !category || !publisher || !publication_year || !total_copies) return res.status(400).json({error:"Please fill all required book fields."});
    if (usePostgres) {
      const r=await dbQuery(`INSERT INTO books(title,author,isbn,category,publisher,publication_year,total_copies,available_copies) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
        [title,author,isbn,category,publisher,publication_year,total_copies]);
      return res.status(201).json(r.rows[0]);
    }
    const d=loadFallback(); if(d.books.some(b=>b.isbn===isbn)) return res.status(409).json({error:"ISBN already exists."});
    const book={id:nextId(d.books),title,author,isbn,category,publisher,publication_year:Number(publication_year),total_copies:Number(total_copies),available_copies:Number(total_copies),created_at:new Date().toISOString()};
    d.books.push(book); saveFallback(d); res.status(201).json(book);
  } catch(e){res.status(500).json({error:e.code==="23505"?"ISBN already exists.":e.message});}
});

app.put("/api/books/:id", async (req,res)=>{
  try {
    const id=Number(req.params.id), {title,author,isbn,category,publisher,publication_year,total_copies}=req.body;
    if (usePostgres) {
      const old=await dbQuery("SELECT * FROM books WHERE id=$1",[id]); if(!old.rowCount) return res.status(404).json({error:"Book not found"});
      const issued=old.rows[0].total_copies-old.rows[0].available_copies;
      const total=Number(total_copies); if(total<issued) return res.status(400).json({error:`Total copies cannot be less than ${issued} currently issued copies.`});
      const r=await dbQuery(`UPDATE books SET title=$1,author=$2,isbn=$3,category=$4,publisher=$5,publication_year=$6,total_copies=$7,available_copies=$7-$8 WHERE id=$9 RETURNING *`,
        [title,author,isbn,category,publisher,publication_year,total,issued,id]);
      return res.json(r.rows[0]);
    }
    const d=loadFallback(); const b=d.books.find(x=>x.id===id); if(!b) return res.status(404).json({error:"Book not found"});
    const issued=Number(b.total_copies)-Number(b.available_copies), total=Number(total_copies); if(total<issued) return res.status(400).json({error:`Total copies cannot be less than ${issued} currently issued copies.`});
    Object.assign(b,{title,author,isbn,category,publisher,publication_year:Number(publication_year),total_copies:total,available_copies:total-issued}); saveFallback(d); res.json(b);
  } catch(e){res.status(500).json({error:e.code==="23505"?"ISBN already exists.":e.message});}
});

app.delete("/api/books/:id", async (req,res)=>{
  try {
    const id=Number(req.params.id);
    if(usePostgres){ const r=await dbQuery("DELETE FROM books WHERE id=$1 RETURNING id",[id]); if(!r.rowCount)return res.status(404).json({error:"Book not found"}); return res.json({message:"Book deleted"}); }
    const d=loadFallback(), idx=d.books.findIndex(x=>x.id===id); if(idx<0)return res.status(404).json({error:"Book not found"});
    if(d.transactions.some(t=>t.book_id===id && t.status==="ISSUED")) return res.status(400).json({error:"Cannot delete a book that is currently issued."});
    d.books.splice(idx,1); saveFallback(d); res.json({message:"Book deleted"});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/members", async (req,res)=>{
  try{
    const q=String(req.query.q||"").trim();
    if(usePostgres){const r=await dbQuery(`SELECT * FROM members WHERE ($1='' OR full_name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR phone ILIKE '%'||$1||'%') ORDER BY id DESC`,[q]); return res.json(r.rows);}
    let m=loadFallback().members.filter(x=>!q||[x.full_name,x.email,x.phone].join(" ").toLowerCase().includes(q.toLowerCase()));
    res.json(m.sort((a,b)=>b.id-a.id));
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/members", async(req,res)=>{
  try{
    const {full_name,email,phone,address,membership_date,status="ACTIVE"}=req.body;
    if(!full_name||!email||!phone||!address||!membership_date)return res.status(400).json({error:"Please fill all required member fields."});
    if(usePostgres){const r=await dbQuery(`INSERT INTO members(full_name,email,phone,address,membership_date,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[full_name,email,phone,address,membership_date,status]);return res.status(201).json(r.rows[0]);}
    const d=loadFallback(); if(d.members.some(m=>m.email===email))return res.status(409).json({error:"Email already exists."});
    const m={id:nextId(d.members),full_name,email,phone,address,membership_date,status};d.members.push(m);saveFallback(d);res.status(201).json(m);
  }catch(e){res.status(500).json({error:e.code==="23505"?"Email already exists.":e.message});}
});

app.put("/api/members/:id", async(req,res)=>{
  try{
    const id=Number(req.params.id), {full_name,email,phone,address,membership_date,status}=req.body;
    if(usePostgres){const r=await dbQuery(`UPDATE members SET full_name=$1,email=$2,phone=$3,address=$4,membership_date=$5,status=$6 WHERE id=$7 RETURNING *`,[full_name,email,phone,address,membership_date,status,id]);if(!r.rowCount)return res.status(404).json({error:"Member not found"});return res.json(r.rows[0]);}
    const d=loadFallback(),m=d.members.find(x=>x.id===id);if(!m)return res.status(404).json({error:"Member not found"});Object.assign(m,{full_name,email,phone,address,membership_date,status});saveFallback(d);res.json(m);
  }catch(e){res.status(500).json({error:e.code==="23505"?"Email already exists.":e.message});}
});

app.delete("/api/members/:id", async(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(usePostgres){const active=await dbQuery("SELECT COUNT(*) FROM transactions WHERE member_id=$1 AND status='ISSUED'",[id]);if(Number(active.rows[0].count)>0)return res.status(400).json({error:"Cannot delete a member with an issued book."});const r=await dbQuery("DELETE FROM members WHERE id=$1 RETURNING id",[id]);if(!r.rowCount)return res.status(404).json({error:"Member not found"});return res.json({message:"Member deleted"});}
    const d=loadFallback(),idx=d.members.findIndex(x=>x.id===id);if(idx<0)return res.status(404).json({error:"Member not found"});if(d.transactions.some(t=>t.member_id===id&&t.status==="ISSUED"))return res.status(400).json({error:"Cannot delete a member with an issued book."});d.members.splice(idx,1);saveFallback(d);res.json({message:"Member deleted"});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/transactions", async(req,res)=>{
  try{
    if(usePostgres){const r=await dbQuery(`SELECT t.*,b.title AS book_title,m.full_name AS member_name FROM transactions t JOIN books b ON b.id=t.book_id JOIN members m ON m.id=t.member_id ORDER BY t.id DESC`);return res.json(r.rows.map(t=>({...t,overdue: t.status==="ISSUED"&&new Date(t.due_date)<new Date(dateOnly())})));}
    const d=loadFallback();res.json(d.transactions.slice().sort((a,b)=>b.id-a.id).map(t=>({...t,book_title:d.books.find(b=>b.id===t.book_id)?.title||"Deleted",member_name:d.members.find(m=>m.id===t.member_id)?.full_name||"Deleted",overdue:overdue(t)})));
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/issue-options", async(req,res)=>{
  try{
    if(usePostgres){const books=await dbQuery("SELECT id,title,available_copies FROM books WHERE available_copies>0 ORDER BY title");const members=await dbQuery("SELECT id,full_name FROM members WHERE status='ACTIVE' ORDER BY full_name");return res.json({books:books.rows,members:members.rows});}
    const d=loadFallback();res.json({books:d.books.filter(b=>b.available_copies>0),members:d.members.filter(m=>m.status==="ACTIVE")});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/transactions/issue", async(req,res)=>{
  const {book_id,member_id,due_date}=req.body;
  if(!book_id||!member_id||!due_date)return res.status(400).json({error:"Book, member and due date are required."});
  try{
    if(usePostgres){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const b=await client.query("SELECT * FROM books WHERE id=$1 FOR UPDATE",[book_id]);if(!b.rowCount)throw new Error("Book not found");if(b.rows[0].available_copies<=0)throw new Error("No available copy.");
        const m=await client.query("SELECT * FROM members WHERE id=$1",[member_id]);if(!m.rowCount||m.rows[0].status!=="ACTIVE")throw new Error("Member is not active.");
        const duplicate=await client.query("SELECT id FROM transactions WHERE book_id=$1 AND member_id=$2 AND status='ISSUED'",[book_id,member_id]);if(duplicate.rowCount)throw new Error("This member already has this book.");
        const t=await client.query(`INSERT INTO transactions(book_id,member_id,issue_date,due_date,status) VALUES($1,$2,CURRENT_DATE,$3,'ISSUED') RETURNING *`,[book_id,member_id,due_date]);
        await client.query("UPDATE books SET available_copies=available_copies-1 WHERE id=$1",[book_id]);
        await client.query("COMMIT");return res.status(201).json(t.rows[0]);
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    }
    const d=loadFallback(),b=d.books.find(x=>x.id===Number(book_id)),m=d.members.find(x=>x.id===Number(member_id));
    if(!b||!m)return res.status(404).json({error:"Book or member not found."});if(b.available_copies<=0)return res.status(400).json({error:"No available copy."});if(m.status!=="ACTIVE")return res.status(400).json({error:"Member is not active."});if(d.transactions.some(t=>t.book_id===Number(book_id)&&t.member_id===Number(member_id)&&t.status==="ISSUED"))return res.status(400).json({error:"This member already has this book."});
    const t={id:nextId(d.transactions),book_id:Number(book_id),member_id:Number(member_id),issue_date:dateOnly(),due_date,status:"ISSUED"};d.transactions.push(t);b.available_copies--;saveFallback(d);res.status(201).json(t);
  }catch(e){res.status(400).json({error:e.message});}
});

app.post("/api/transactions/:id/return", async(req,res)=>{
  const id=Number(req.params.id);
  try{
    if(usePostgres){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const t=await client.query("SELECT * FROM transactions WHERE id=$1 FOR UPDATE",[id]);if(!t.rowCount)throw new Error("Transaction not found");if(t.rows[0].status==="RETURNED")throw new Error("Book already returned.");
        const r=await client.query(`UPDATE transactions SET return_date=CURRENT_DATE,status='RETURNED',fine=CASE WHEN CURRENT_DATE>due_date THEN (CURRENT_DATE-due_date)*5 ELSE 0 END WHERE id=$1 RETURNING *`,[id]);
        await client.query("UPDATE books SET available_copies=available_copies+1 WHERE id=$1",[t.rows[0].book_id]);
        await client.query("COMMIT");return res.json(r.rows[0]);
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    }
    const d=loadFallback(),t=d.transactions.find(x=>x.id===id);if(!t)return res.status(404).json({error:"Transaction not found"});if(t.status==="RETURNED")return res.status(400).json({error:"Book already returned."});
    const days=Math.max(0,Math.floor((new Date(dateOnly())-new Date(t.due_date))/86400000));t.return_date=dateOnly();t.status="RETURNED";t.fine=days*5;const b=d.books.find(x=>x.id===t.book_id);if(b)b.available_copies++;saveFallback(d);res.json(t);
  }catch(e){res.status(400).json({error:e.message});}
});

app.get("/api/reports/summary", async(req,res)=>{
  try{
    if(usePostgres){
      const [cats,top,overdue] = await Promise.all([
        dbQuery(`SELECT category,COUNT(*) AS titles,COALESCE(SUM(total_copies),0) AS copies FROM books GROUP BY category ORDER BY copies DESC`),
        dbQuery(`SELECT b.title,COUNT(t.id) AS borrow_count FROM transactions t JOIN books b ON b.id=t.book_id GROUP BY b.id,b.title ORDER BY borrow_count DESC LIMIT 5`),
        dbQuery(`SELECT t.id,b.title,m.full_name,t.due_date,(CURRENT_DATE-t.due_date)*5 AS estimated_fine FROM transactions t JOIN books b ON b.id=t.book_id JOIN members m ON m.id=t.member_id WHERE t.status='ISSUED' AND t.due_date<CURRENT_DATE ORDER BY t.due_date`)
      ]);
      return res.json({categories:cats.rows,most_borrowed:top.rows,overdue:overdue.rows});
    }
    const d=loadFallback(),map={};d.books.forEach(b=>{map[b.category]??={category:b.category,titles:0,copies:0};map[b.category].titles++;map[b.category].copies+=Number(b.total_copies)});
    const counts={};d.transactions.forEach(t=>{counts[t.book_id]=(counts[t.book_id]||0)+1});
    const most=d.books.map(b=>({title:b.title,borrow_count:counts[b.id]||0})).sort((a,b)=>b.borrow_count-a.borrow_count).slice(0,5);
    const over=d.transactions.filter(overdue).map(t=>({id:t.id,title:d.books.find(b=>b.id===t.book_id)?.title,full_name:d.members.find(m=>m.id===t.member_id)?.full_name,due_date:t.due_date,estimated_fine:Math.max(0,Math.floor((new Date(dateOnly())-new Date(t.due_date))/86400000))*5}));
    res.json({categories:Object.values(map),most_borrowed:most,overdue:over});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

(async()=>{
  if(usePostgres){
    try{await initPostgres();console.log("PostgreSQL initialized.");}
    catch(e){console.error("PostgreSQL initialization failed:",e.message);}
  } else {
    loadFallback();
    console.log("No DATABASE_URL found. Local JSON demo mode enabled.");
  }
  app.listen(PORT,()=>console.log(`Library Management System running at http://localhost:${PORT}`));
})();
