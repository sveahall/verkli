const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('path');
(async()=>{const browser=await chromium.launch({headless:true,channel:"chrome"});
for(const suffix of ['', '-Mobile']){
 const page=await browser.newPage({viewport:{width:suffix?960:1600,height:suffix?1280:900},deviceScaleFactor:1});
 const file=path.resolve(`output/pdf/Verkli-Tech-Week-Teaser-v5${suffix}.html`);
 await page.goto('file://'+file);await page.evaluate(()=>document.fonts.ready);
 await page.emulateMedia({media:'print'});
 console.log(suffix||'Desktop',await page.evaluate(()=>[...document.querySelectorAll('.slide')].map((s,i)=>({page:i+1,overflow:[...s.querySelectorAll('h1,h2,h3,p,.market,.traction,.contact,.source')].filter(e=>e.getBoundingClientRect().bottom>s.querySelector('footer').getBoundingClientRect().top-8).map(e=>e.textContent)}))));
 await page.pdf({path:file.replace('.html','.pdf'),preferCSSPageSize:true,printBackground:true});
 const slides=page.locator('.slide');for(let i=0;i<await slides.count();i++)await slides.nth(i).screenshot({path:`tmp/pdfs/teaser-v5/${suffix?'mobile':'deck'}-${i+1}.png`});
 await page.close();
}await browser.close()})();
