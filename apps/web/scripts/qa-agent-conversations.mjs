import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const base = new URL(process.env.QA_BASE_URL || 'http://127.0.0.1:3066');
if (!['localhost','127.0.0.1'].includes(base.hostname)) throw new Error('Synthetic QA requires localhost.');
const output = process.env.QA_OUTPUT || '/tmp/verkli-agent-conversations-qa';
fs.mkdirSync(output,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const results=[];
const evidence = async(page) => JSON.parse(await page.getByTestId('request-evidence').textContent());
async function send(page,name,message) {
  await page.getByRole('textbox',{name:`Message to ${name}`,exact:true}).fill(message);
  await page.getByRole('button',{name:`Send message to ${name}`,exact:true}).click();
}
async function append(page,text) {
  await page.locator('.ProseMirror').evaluate(element => {
    element.focus();const range=document.createRange();range.selectNodeContents(element);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.insertText(text);
}
const cases=[
 ['exact correction, formatting, autosave, undo and follow-up',async(page)=>{
   await send(page,'Edith','Please fix the spelling.');
   await page.getByRole('button',{name:'Apply to chapter',exact:true}).click();
   await expect(page.locator('.ProseMirror strong')).toHaveText('weird');
   await expect(page.getByTestId('save-status')).toContainText('Saved locally');
   await page.getByRole('button',{name:'Undo',exact:true}).click();
   await expect(page.locator('.ProseMirror strong')).toHaveText('wierd');
   await send(page,'Edith','Keep that sentence but suggest the correction again.');
   await expect.poll(async()=>(await evidence(page)).filter(r=>r.path.endsWith('/ai/chat')).length).toBe(2);
   const calls=(await evidence(page)).filter(r=>r.path.endsWith('/ai/chat'));
   expect(calls[1].body.history.length).toBe(2);
   expect(calls[1].body.history[1].content).toContain('weird');
   expect(calls[1].body.history[1].content).toContain('Applied to your draft');
   await page.screenshot({path:`${output}/edith-desktop.png`,fullPage:true});
 }],
 ['stale text and different chapter are rejected',async(page)=>{
   await send(page,'Edith','Fix the spelling.');
   await expect(page.getByRole('button',{name:'Apply to chapter',exact:true})).toBeVisible();
   await append(page,' Another sentence.');
   await page.getByRole('button',{name:'Apply to chapter',exact:true}).click();
   await expect(page.getByRole('alert').filter({hasText:/./})).toContainText('changed');
   await expect(page.locator('.ProseMirror strong')).toHaveText('wierd');
   await page.getByRole('button',{name:'Switch chapter',exact:true}).click();
   await page.getByRole('button',{name:'Apply to chapter',exact:true}).click();
   await expect(page.getByRole('alert').filter({hasText:/./})).toContainText('same chapter');
   await expect(page.locator('.ProseMirror')).toContainText('Mira took the boat');
 }],
 ['specialists retain independent history, drafts and late replies',async(page)=>{
   await page.getByRole('button',{name:'cover',exact:true}).click();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('delay');
   await send(page,'Stella','A beautiful cover please.');
   await page.getByRole('textbox',{name:'Message to Stella',exact:true}).fill('Make it warmer next.');
   await page.getByRole('button',{name:'audiobook',exact:true}).click();
   await expect(page.getByRole('heading',{name:'August',exact:true})).toBeVisible();
   await expect(page.getByRole('log')).not.toContainText('A beautiful cover');
   await page.getByRole('button',{name:'cover',exact:true}).click();
   await expect(page.getByRole('textbox',{name:'Message to Stella',exact:true})).toHaveValue('Make it warmer next.');
   await expect(page.getByRole('button',{name:'Generate cover options',exact:true})).toBeVisible();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('normal');
   await page.getByRole('button',{name:'Send message to Stella',exact:true}).click();
   await expect.poll(async()=>(await evidence(page)).filter(r=>r.path.endsWith('/ai/chat')).length).toBe(2);
   expect((await evidence(page)).filter(r=>r.path.endsWith('/ai/chat'))[1].body.history[1].content).toContain('quiet blue harbour');
 }],
 ['pronunciation preview failure and successful retry',async(page)=>{
   await page.getByRole('button',{name:'audiobook',exact:true}).click();
   await send(page,'August','Mira sounds wrong. Help me correct it.');
   await expect(page.getByRole('button',{name:'Listen to corrected sample',exact:true})).toBeVisible();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('failure');
   await page.getByRole('button',{name:'Listen to corrected sample',exact:true}).click();
   await expect(page.getByRole('alert').filter({hasText:/./})).toContainText('could not be generated');
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('normal');
   await page.getByRole('button',{name:'Listen to corrected sample',exact:true}).dblclick();
   await expect(page.locator('audio')).toHaveAttribute('src',/^blob:/);
   await expect(page.getByRole('log')).toContainText('Mee-rah heard a sound');
   expect((await evidence(page)).filter(r=>r.path.endsWith('/audiobook/preview'))).toHaveLength(2);
   await expect(page.getByTestId('chapter-evidence')).toContainText('Mira heard');
   await expect(page.getByTestId('chapter-evidence')).not.toContainText('Mee-rah');
   await page.screenshot({path:`${output}/august-desktop.png`,fullPage:true});
 }],
 ['cover generation, pricing draft and failed chat retry',async(page)=>{
   await page.getByRole('button',{name:'cover',exact:true}).click();
   await send(page,'Stella','Make a more beautiful cover.');
   await expect(page.getByRole('button',{name:'Generate cover options',exact:true})).toBeVisible();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('failure');
   await page.getByRole('button',{name:'Generate cover options',exact:true}).click();
   await expect(page.getByRole('alert').filter({hasText:/./})).toContainText('not generated');
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('normal');
   await page.getByRole('button',{name:'Generate cover options',exact:true}).click();
   await expect(page.getByTestId('cover-options')).toHaveText('4 options');
   expect((await evidence(page)).filter(r=>r.path.endsWith('/cover/generate'))[1].body.prompt).toContain('quiet blue harbour');
   await page.getByRole('button',{name:'pricing',exact:true}).click();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('failure');
   await send(page,'Ernst','Prepare 99 SEK.');
   await expect(page.getByRole('button',{name:'Retry message'})).toBeVisible();
   await page.getByRole('textbox',{name:'Message to Ernst',exact:true}).fill('A later question.');
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('normal');
   await page.getByRole('button',{name:'Retry message'}).click();
   await page.getByRole('button',{name:'Review in pricing',exact:true}).click();
   await expect(page.getByTestId('price-draft')).toHaveText('99 SEK — not saved');
   await expect(page.getByRole('textbox',{name:'Message to Ernst',exact:true})).toHaveValue('A later question.');
   expect((await evidence(page)).every(r=>r.path.endsWith('/ai/chat')||r.path.endsWith('/cover/generate'))).toBe(true);
 }],
 ['Alma opens editor and applies once; narrow dock and fallback',async(page)=>{
   await page.getByRole('button',{name:'translate',exact:true}).click();
   await send(page,'Alma','Correct the spelling in this edition.');
   await page.getByRole('button',{name:'Apply to chapter',exact:true}).click();
   await expect(page.locator('.ProseMirror strong')).toHaveText('weird');
   await expect(page.getByRole('heading',{name:'Alma',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Close AI assistant',exact:true}).click();
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
   await page.getByRole('button',{name:'Talk to Edith',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'Book specialist'})).toBeVisible();
   await page.getByRole('dialog',{name:'Book specialist'}).evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
   await page.screenshot({path:`${output}/edith-mobile-dark.png`});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.getByRole('button',{name:'Close AI assistant',exact:true}).click();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('fallback');
   await page.getByRole('button',{name:'Talk to Edith',exact:true}).click();
   await send(page,'Edith','Check the chapter.');
   await expect(page.getByRole('log')).toContainText('AI service is unavailable');
   await expect(page.getByRole('button',{name:'Apply to chapter',exact:true})).toHaveCount(0);
   await page.getByRole('button',{name:'Close AI assistant',exact:true}).click();
   await page.getByRole('combobox',{name:'Response mode'}).selectOption('invalid');
   await page.getByRole('button',{name:'Talk to Edith',exact:true}).click();
   await send(page,'Edith','Try a different correction.');
   await expect(page.getByRole('log')).toContainText('This suggestion failed validation. No changes were applied.');
   await expect(page.getByRole('button',{name:'Apply to chapter',exact:true})).toHaveCount(0);
 }],
];
try {
 for(const [name,run] of cases) {
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const errors=[],network=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base.origin||u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method())){network.push(`${r.method()} ${u.origin}${u.pathname}`);return route.abort();}return route.continue();});
  await page.addInitScript(() => {localStorage.setItem('verkli-cookie-consent','declined');localStorage.setItem('verkli-theme','light');});
  try {
   await page.goto(`${base.origin}/dev/agent-conversations`);
   await expect(page.getByRole('textbox',{name:'Message to Edith',exact:true})).toBeVisible({timeout:45000});
   await expect(page.locator('.ProseMirror')).toBeVisible();
   await run(page);expect(errors).toEqual([]);expect(network).toEqual([]);
   results.push({name,result:'PASS'});console.log(`${name}: PASS`);
  } catch(error) {results.push({name,result:'FAIL',error:error.message,errors,network});console.error(`${name}: ${error.message}`);await page.screenshot({path:`${output}/failure-${results.length}.png`,fullPage:true});}
  finally {await page.close();}
 }
} finally {await browser.close();fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));}
if(results.some(r=>r.result==='FAIL'))process.exit(1);
