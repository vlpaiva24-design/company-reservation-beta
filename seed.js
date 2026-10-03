import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const path=process.env.DB_PATH||join(import.meta.dirname,'data','companies.db'); mkdirSync(join(path,'..'),{recursive:true});
process.env.NODE_ENV='test';
await import('./server.js');
const db=new DatabaseSync(path);
const rows=[
 ['Альфа Логистика','7701000001','ООО','Логистика','+7 495 100-20-30','hello@alfa-log.example','https://alfa-log.example','Москва, ул. Складская, 7','Анна Орлова','Перевозки по СНГ'],
 ['Северный Свет','7812000002','АО','Энергетика','+7 812 555-18-00','office@sever.example','https://sever.example','Санкт-Петербург, Невский пр., 40','Илья Морозов','Поставщик оборудования'],
 ['Самарканд Текстиль','302000003','ООО','Текстиль','+998 66 240-11-22','info@samtext.example','https://samtext.example','Самарканд, ул. Буюк Ипак Йули, 15','Дилшод Каримов','Экспортная компания']
];
const stmt=db.prepare('INSERT OR IGNORE INTO companies(name,inn,legal_form,industry,phone,email,website,address,contact_person,comment) VALUES (?,?,?,?,?,?,?,?,?,?)');
let added=0; for(const row of rows){const r=stmt.run(...row); added+=r.changes; if(r.changes)db.prepare("INSERT INTO history(company_id,action,details) VALUES (?,'created','Добавлена seed-скриптом')").run(r.lastInsertRowid);}
console.log(`Добавлено демо-компаний: ${added}`); db.close();
