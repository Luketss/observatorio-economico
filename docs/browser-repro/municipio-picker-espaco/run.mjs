import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('repro.html')).href;
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage();
await p.goto(url);

await p.focus('#inp');
await p.keyboard.type('bom');
await p.keyboard.press('Space');
await p.keyboard.type('jesus');

const r = await p.evaluate(() => window.resultado());
console.log('RESULTADO:', JSON.stringify(r));
console.log('log:', await p.textContent('#log'));

// Controle: espaco com o proprio button focado deve ativar (comportamento nativo conhecido).
await p.evaluate(() => { window.cliquesAntes = window.resultado().cliques; });
await p.focus('#btn');
await p.keyboard.press('Space');
const r2 = await p.evaluate(() => ({ cliques: window.resultado().cliques, antes: window.cliquesAntes }));
console.log('CONTROLE (button focado):', JSON.stringify(r2));

await b.close();
