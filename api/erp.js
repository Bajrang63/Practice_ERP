import {neon} from '@neondatabase/serverless';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
const hash=t=>createHash('sha256').update(t).digest('hex');
const passwordHash=(p,s)=>scryptSync(p,s,64).toString('hex');
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');
try{
const sql=neon(process.env.DATABASE_URL);
const method=req.method, b=req.body||{}, action=req.query.action;
if(method==='POST'||method==='PUT'){
if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Invalid origin'});
}
await sql`CREATE TABLE IF NOT EXISTS practice_accounts (username text PRIMARY KEY, salt text NOT NULL, password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','viewer')))`;
await sql`CREATE TABLE IF NOT EXISTS practice_sessions (token_hash text PRIMARY KEY, username text REFERENCES practice_accounts(username), expires timestamptz NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS practice_workspace (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL, revision integer NOT NULL DEFAULT 0)`;
await sql`CREATE TABLE IF NOT EXISTS practice_login_attempts (bucket text PRIMARY KEY, attempts integer NOT NULL, expires timestamptz NOT NULL)`;
if(action==='login'&&method==='POST'){
const username=String(b.username||'').trim().toLowerCase(), password=String(b.password||'');
if(!username||username.length>80||password.length>256)return res.status(400).json({error:'Invalid credentials'});
const bucket=hash(username);
const [limit]=await sql`INSERT INTO practice_login_attempts VALUES (${bucket},1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN practice_login_attempts.expires<now() THEN 1 ELSE practice_login_attempts.attempts+1 END,expires=CASE WHEN practice_login_attempts.expires<now() THEN now()+interval '15 minutes' ELSE practice_login_attempts.expires END RETURNING attempts`;
if(limit.attempts>10)return res.status(429).json({error:'Try again later'});
if(process.env.ERP_ADMIN_PASSWORD?.length>=16&&username==='admin'){
const salt=randomBytes(16).toString('hex');
await sql`INSERT INTO practice_accounts VALUES ('admin',${salt},${passwordHash(process.env.ERP_ADMIN_PASSWORD,salt)},'admin') ON CONFLICT DO NOTHING`;
}
const [u]=await sql`SELECT * FROM practice_accounts WHERE username=${username}`;
const actual=passwordHash(password,u?.salt||'00000000000000000000000000000000');
if(!u||!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(u.password_hash,'hex')))return res.status(401).json({error:'Invalid credentials'});
const token=randomBytes(32).toString('hex');
await sql`INSERT INTO practice_sessions VALUES (${hash(token)},${username},now()+interval '8 hours')`;
res.setHeader('Set-Cookie','erp_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
return res.json({username,role:u.role});
}
const token=(req.headers.cookie||'').match(/(?:^|; )erp_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const [u]=token?await sql`SELECT a.username,a.role FROM practice_sessions s JOIN practice_accounts a USING(username) WHERE s.token_hash=${hash(token)} AND s.expires>now()`:[];
if(!u)return res.status(401).json({error:'Sign in required'});
if(action==='logout'&&method==='POST'){await sql`DELETE FROM practice_sessions WHERE token_hash=${hash(token)}`;res.setHeader('Set-Cookie','erp_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return res.json({ok:true})}
if(action==='state'&&method==='GET'){const [row]=await sql`SELECT data,revision FROM practice_workspace WHERE id=1`;return res.json({user:u,data:row?.data||null,revision:row?.revision||0})}
if(u.role!=='admin')return res.status(403).json({error:'Admin only'});
if(action==='state'&&method==='PUT'){
if(!b.data||typeof b.data!=='object'||Array.isArray(b.data)||JSON.stringify(b.data).length>1000000||!Number.isInteger(b.revision))return res.status(400).json({error:'Invalid workspace'});
const keys=['Dashboard','Organisation','Branches','Warehouses','Suppliers','Products','Kits','Purchase','Inventory','CRM','Customers','Quotation','Sales Orders','Invoices','Payments','Installments','Returns','Production','HR','Users','Reports','Attendance','Payroll','Supplier Payments','Advances','Refunds','Audit'];
if(Object.keys(b.data).length!==keys.length||keys.some(k=>!Array.isArray(b.data[k])))return res.status(400).json({error:'Invalid modules'});
if(b.data.Inventory.some(x=>!Number.isFinite(x.qty)||x.qty<0))return res.status(400).json({error:'Invalid inventory'});
const rows=await sql`INSERT INTO practice_workspace(id,data,revision) SELECT 1,${JSON.stringify(b.data)}::jsonb,1 WHERE ${b.revision}=0 OR EXISTS(SELECT 1 FROM practice_workspace WHERE id=1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,revision=practice_workspace.revision+1 WHERE practice_workspace.revision=${b.revision} RETURNING revision`;
if(!rows.length)return res.status(409).json({error:'Workspace changed; reload and retry'});
return res.json(rows[0]);
}
return res.status(404).json({error:'Unknown operation'});
}catch(e){console.error('ERP request failed',e.code||e.name);return res.status(500).json({error:'Server unavailable'})}
}
