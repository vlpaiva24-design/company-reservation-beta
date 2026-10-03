import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'companies.db');
const PORT = Number(process.env.PORT || 3000);
export const TEAMS = ['Таллин', 'Токио', 'Вавилон', 'Сеул'];
export const FIELDS = ['name','inn','legal_form','industry','phone','email','website','address','contact_person','comment'];
mkdirSync(join(DB_PATH, '..'), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.function('casefold', { deterministic: true }, value => String(value ?? '').toLocaleLowerCase('ru-RU'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  inn TEXT NOT NULL CHECK(length(trim(inn)) > 0),
  legal_form TEXT DEFAULT '', industry TEXT DEFAULT '', phone TEXT DEFAULT '',
  email TEXT DEFAULT '', website TEXT DEFAULT '', address TEXT DEFAULT '',
  contact_person TEXT DEFAULT '', comment TEXT DEFAULT '',
  reserved_by TEXT CHECK(reserved_by IS NULL OR reserved_by IN ('Таллин','Токио','Вавилон','Сеул')),
  reserved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_inn_unique ON companies(inn COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('created','updated','reserved','released')),
  team TEXT,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  details TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS history_company ON history(company_id, id DESC);
`);

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(data),'cache-control':'no-store'});
  res.end(data);
}
function error(res, status, message) { json(res, status, { error: message }); }
function clean(v, max=2000) { return String(v ?? '').trim().slice(0, max); }
function validateCompany(input) {
  const value = {};
  for (const f of FIELDS) value[f] = clean(input?.[f], f === 'comment' ? 5000 : 500);
  if (!value.name) throw new Error('Название обязательно');
  if (!value.inn) throw new Error('ИНН обязателен');
  if (!/^[0-9A-Za-zА-Яа-яЁё._\/-]+$/.test(value.inn)) throw new Error('ИНН содержит недопустимые символы');
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new Error('Некорректный email');
  return value;
}
async function body(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size += chunk.length; if (size > 100_000) throw Object.assign(new Error('Слишком большой запрос'),{status:413}); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Некорректный JSON'),{status:400}); }
}
function teamOf(req, payload) {
  const team = clean(payload?.team || req.headers['x-team'], 30);
  if (!TEAMS.includes(team)) throw Object.assign(new Error('Выберите допустимую команду'),{status:400});
  return team;
}
const selectCompany = `SELECT c.*, CASE WHEN c.reserved_by IS NULL THEN 'free' ELSE 'reserved' END AS status FROM companies c`;

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/meta') return json(res,200,{teams:TEAMS,fields:FIELDS,beta:true});
  if (req.method === 'GET' && url.pathname === '/api/companies') {
    const q=clean(url.searchParams.get('q'),300).toLowerCase();
    const status=clean(url.searchParams.get('status'),20);
    const team=clean(url.searchParams.get('team'),30);
    const args=[]; const where=[];
    if (q) { where.push(`casefold(coalesce(name,'')||' '||coalesce(inn,'')||' '||coalesce(legal_form,'')||' '||coalesce(industry,'')||' '||coalesce(phone,'')||' '||coalesce(email,'')||' '||coalesce(website,'')||' '||coalesce(address,'')||' '||coalesce(contact_person,'')||' '||coalesce(comment,'')||' '||coalesce(reserved_by,'')||' '||CASE WHEN reserved_by IS NULL THEN 'свободна free' ELSE 'забронирована reserved' END) LIKE ?`); args.push('%'+q+'%'); }
    if (status === 'free') where.push('reserved_by IS NULL');
    if (status === 'reserved') where.push('reserved_by IS NOT NULL');
    if (team) { if (!TEAMS.includes(team)) return error(res,400,'Неизвестная команда'); where.push('reserved_by = ?'); args.push(team); }
    const rows=db.prepare(selectCompany+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY updated_at DESC, id DESC').all(...args);
    return json(res,200,{items:rows,total:rows.length});
  }
  if (req.method === 'POST' && url.pathname === '/api/companies') {
    const p=await body(req); let v; try { v=validateCompany(p); } catch(e){ return error(res,400,e.message); }
    try {
      const marks=FIELDS.map(()=>'?').join(',');
      const result=db.prepare(`INSERT INTO companies (${FIELDS.join(',')}) VALUES (${marks})`).run(...FIELDS.map(f=>v[f]));
      db.prepare("INSERT INTO history(company_id,action,details) VALUES (?,'created',?)").run(result.lastInsertRowid,'Компания добавлена');
      return json(res,201,db.prepare(selectCompany+' WHERE c.id=?').get(result.lastInsertRowid));
    } catch(e) { if(String(e).includes('UNIQUE')) return error(res,409,'Компания с таким ИНН уже существует'); throw e; }
  }
  const match=url.pathname.match(/^\/api\/companies\/(\d+)(?:\/(reserve|release|history))?$/);
  if (!match) return false;
  const id=Number(match[1]), action=match[2];
  if (req.method === 'GET' && !action) { const row=db.prepare(selectCompany+' WHERE c.id=?').get(id); return row?json(res,200,row):error(res,404,'Компания не найдена'); }
  if (req.method === 'GET' && action === 'history') return json(res,200,{items:db.prepare('SELECT * FROM history WHERE company_id=? ORDER BY id DESC').all(id)});
  if (req.method === 'PUT' && !action) {
    const p=await body(req); let v; try { v=validateCompany(p); } catch(e){ return error(res,400,e.message); }
    try {
      const result=db.prepare(`UPDATE companies SET ${FIELDS.map(f=>f+'=?').join(',')}, updated_at=datetime('now') WHERE id=?`).run(...FIELDS.map(f=>v[f]),id);
      if (!result.changes) return error(res,404,'Компания не найдена');
      db.prepare("INSERT INTO history(company_id,action,details) VALUES (?,'updated',?)").run(id,'Данные изменены');
      return json(res,200,db.prepare(selectCompany+' WHERE c.id=?').get(id));
    } catch(e) { if(String(e).includes('UNIQUE')) return error(res,409,'Компания с таким ИНН уже существует'); throw e; }
  }
  if (req.method === 'POST' && action === 'reserve') {
    const p=await body(req), team=teamOf(req,p);
    const tx=db.prepare(`UPDATE companies SET reserved_by=?, reserved_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND reserved_by IS NULL`);
    db.exec('BEGIN IMMEDIATE');
    try {
      const r=tx.run(team,id);
      if (!r.changes) { const current=db.prepare('SELECT reserved_by FROM companies WHERE id=?').get(id); db.exec('ROLLBACK'); return current?error(res,409,`Компания уже забронирована командой «${current.reserved_by}»`):error(res,404,'Компания не найдена'); }
      db.prepare("INSERT INTO history(company_id,action,team,details) VALUES (?,'reserved',?,?)").run(id,team,'Компания забронирована');
      db.exec('COMMIT'); return json(res,200,db.prepare(selectCompany+' WHERE c.id=?').get(id));
    } catch(e){ try{db.exec('ROLLBACK')}catch{} throw e; }
  }
  if (req.method === 'POST' && action === 'release') {
    const p=await body(req), team=teamOf(req,p);
    db.exec('BEGIN IMMEDIATE');
    try {
      const r=db.prepare(`UPDATE companies SET reserved_by=NULL,reserved_at=NULL,updated_at=datetime('now') WHERE id=? AND reserved_by=?`).run(id,team);
      if (!r.changes) { const current=db.prepare('SELECT reserved_by FROM companies WHERE id=?').get(id); db.exec('ROLLBACK'); if(!current)return error(res,404,'Компания не найдена'); if(!current.reserved_by)return error(res,409,'Компания уже свободна'); return error(res,403,`Освободить может только команда «${current.reserved_by}»`); }
      db.prepare("INSERT INTO history(company_id,action,team,details) VALUES (?,'released',?,?)").run(id,team,'Бронь освобождена');
      db.exec('COMMIT'); return json(res,200,db.prepare(selectCompany+' WHERE c.id=?').get(id));
    } catch(e){ try{db.exec('ROLLBACK')}catch{} throw e; }
  }
  return false;
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
export const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) { const handled=await api(req,res,url); if(handled===false)error(res,404,'Маршрут не найден'); return; }
    const rel=url.pathname==='/'?'index.html':url.pathname.slice(1); const safe=normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ''); const file=join(PUBLIC,safe);
    if(!file.startsWith(PUBLIC)||!existsSync(file)) return error(res,404,'Файл не найден');
    const data=await readFile(file); res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','content-length':data.length}); res.end(data);
  } catch(e){ console.error(e); if(!res.headersSent) error(res,e.status||500,e.status?e.message:'Внутренняя ошибка сервера'); else res.end(); }
});
if(process.env.NODE_ENV!=='test') server.listen(PORT,()=>console.log(`Company Reservation Beta: http://localhost:${PORT}`));
