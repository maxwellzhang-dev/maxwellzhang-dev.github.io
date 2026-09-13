import { chromium } from 'playwright';
const file = 'file://' + process.argv[2];
const b = await chromium.launch();

const errs = [], out = [];
const t = async (n, fn) => { try { out.push([n, await fn() ? 'ok' : 'FAIL']); } catch (e) { out.push([n, 'THREW ' + e.message]); } };

const p = await b.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(file);
await p.waitForTimeout(600);

const type = async (cmd) => {
  await p.locator('#entry').fill(cmd);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(180);
  return await p.locator('#history .block').last().innerText();
};
const all = async () => await p.locator('#history').innerText();

await t('boot rendered', async () => (await p.locator('#history .block').count()) >= 3);
await t('titlebar size', async () => /\d+×\d+/.test(await p.locator('#titletext').innerText()));

// --- every chip, in both languages ---
for (const c of await p.locator('button.chip').all()) {
  const label = (await c.innerText()).trim();
  if (label === '中文' || label === 'English') continue;
  const before = await p.locator('#history .block').count();
  await c.click(); await p.waitForTimeout(200);
  out.push(['chip ' + label, (await p.locator('#history .block').count()) > before ? 'ok' : 'FAIL']);
}

// --- filesystem ---
await t('tree',        async () => (await type('tree')).includes('experience'));
await t('tree counts', async () => /\d+ (directories|个目录)/.test(await type('tree')));
await t('cd nested',   async () => { await type('cd experience/mediacorp'); return (await p.locator('#liveline .path').innerText()).includes('mediacorp'); });
await t('ls',          async () => (await type('ls')).includes('dialect-tts.md'));
await t('ls -l',       async () => (await type('ls -l')).includes('-rw-r--r--'));
await t('ls size>0',   async () => /\s[1-9]\d{2,}\s/.test(await type('ls -l')));
await t('cat file',    async () => (await type('cat dialect-tts.md')).includes('Qwen3-TTS'));
await t('cd ..',       async () => { await type('cd ..'); return (await p.locator('#liveline .path').innerText()).endsWith('experience'); });
await t('cd ~',        async () => { await type('cd ~'); return (await p.locator('#liveline .path').innerText()).trim() === '~'; });
await t('cd abs path', async () => { await type('cd ~/education'); return (await p.locator('#liveline .path').innerText()).includes('education'); });
await t('cat rel ..',  async () => (await type('cat ../skills.md')).includes('PyTorch'));
await t('cd ~ again',  async () => { await type('cd ~'); return true; });
await t('cat dir err', async () => /directory|目录/.test(await type('cat experience')));
await t('cd file err', async () => /Not a directory|不是目录/.test(await type('cd skills.md')));
await t('ls missing',  async () => /No such|没有那个/.test(await type('ls nope')));
await t('pwd',         async () => (await type('pwd')).includes('~'));

// --- grep ---
await t('grep',        async () => (await type('grep LightRAG')).includes('.md'));
await t('grep -r',     async () => (await type('grep -r Pydantic')).includes('mediacorp'));
await t('grep miss',   async () => /no match|未匹配/.test(await type('grep zzzzz')));
await t('grep usage',  async () => /usage|用法/.test(await type('grep')));
await t('grep path',   async () => (await type('grep -r RAG experience')).includes('experience/'));

// --- misc ---
await t('bad cmd',     async () => (await type('nope')).includes('zsh:'));
await t('alias cv',    async () => (await type('cv')).includes('Mediacorp'));
await t('theme list',  async () => /default/.test(await type('theme')));
await t('theme set',   async () => { await type('theme green'); return (await p.locator('html').getAttribute('data-phosphor')) === 'green'; });
await t('theme bad',   async () => /unknown|未知/.test(await type('theme pink')));
await t('vim egg',     async () => /vim/i.test(await type('vim')));
await t('sudo egg',    async () => /sudoers/.test(await type('sudo rm -rf /')));
await t('clear',       async () => {
  await p.locator('#entry').fill('clear'); await p.keyboard.press('Enter'); await p.waitForTimeout(180);
  return (await p.locator('#history .block').count()) === 0;
});

// --- pipes ---
await t('pipe grep',   async () => { const o = await type('skills | grep RAG'); return o.includes('RAG') && !o.includes('Redis'); });
await t('pipe wc -l',  async () => /^\d+$/m.test((await type('skills | wc -l')).split('\n').pop().trim()));
await t('pipe head',   async () => (await type('tree | head -n 3')).split('\n').length <= 5);
await t('pipe chain',  async () => (await type('experience | grep Azure | wc -l')).trim().length > 0);
await t('pipe sort',   async () => (await type('ls | sort -r')).includes('.md'));
await t('pipe grep -v',async () => !(await type('skills | grep -v Python')).includes('Cypher, Git'));
await t('bad filter',  async () => /not a filter|不是过滤器/.test(await type('skills | nope')));
await t('filter alone',async () => /pipe|管道/.test(await type('wc')));

// --- man / history / suggestions ---
await t('man cmd',     async () => { const o = await type('man grep'); return /SYNOPSIS|用法/.test(o); });
await t('man index',   async () => { const o = await type('man'); return o.includes('neofetch') && o.includes('keys'); });
await t('man keys',    async () => /Ctrl\+L/.test(await type('man keys')));
await t('man pipes',   async () => /grep RAG/.test(await type('man pipes')));
await t('help terse',  async () => { const o = await type('help'); return o.includes('whoami') && !/\bpwd\b|\buniq\b/.test(o); });
await t('man bad',     async () => /No manual|手册页/.test(await type('man zzz')));
await t('history',     async () => (await type('history')).includes('man grep'));
await t('did you mean',async () => /Did you mean|想输入/.test(await type('skils')));
await t('no suggest',  async () => !/Did you mean|想输入/.test(await type('qqqqqqqq')));

// --- readline keys ---
await t('ctrl+c',      async () => {
  await p.locator('#entry').fill('half typed');
  await p.keyboard.press('Control+c'); await p.waitForTimeout(120);
  return (await p.locator('#entry').inputValue()) === '' && (await all()).includes('^C');
});
await t('ctrl+l',      async () => {
  await type('pwd');
  await p.locator('#entry').focus();
  await p.keyboard.press('Control+l'); await p.waitForTimeout(120);
  return (await p.locator('#history .block').count()) === 0;
});
await t('ctrl+u',      async () => {
  await p.locator('#entry').fill('abcdef'); await p.locator('#entry').focus();
  await p.locator('#entry').evaluate(el => el.setSelectionRange(6, 6));
  await p.keyboard.press('Control+u'); await p.waitForTimeout(80);
  return (await p.locator('#entry').inputValue()) === '';
});
await t('ctrl+w',      async () => {
  await p.locator('#entry').fill('cat one two'); await p.locator('#entry').focus();
  await p.locator('#entry').evaluate(el => el.setSelectionRange(11, 11));
  await p.keyboard.press('Control+w'); await p.waitForTimeout(80);
  return (await p.locator('#entry').inputValue()) === 'cat one';
});
await p.locator('#entry').fill('');

// --- completion ---
const tab = async (v) => { await p.locator('#entry').fill(v); await p.keyboard.press('Tab'); await p.waitForTimeout(120); return await p.locator('#entry').inputValue(); };
await t('tab unique',  async () => (await tab('neo')).trim() === 'neofetch');
await t('tab prefix',  async () => (await tab('e')) === 'e');
await t('tab path',    async () => (await tab('cd exp')).trim() === 'cd experience/');
await t('tab nested',  async () => (await tab('cat experience/mediacorp/dia')).trim() === 'cat experience/mediacorp/dialect-tts.md');
await t('tab cd dirs', async () => { await p.locator('#entry').fill('cd '); await p.keyboard.press('Tab'); await p.waitForTimeout(120); return (await all()).includes('experience/'); });
await p.locator('#entry').fill('');

// --- history keys ---
await t('arrow up',    async () => { await type('pwd'); await p.locator('#entry').fill(''); await p.locator('#entry').focus(); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(80); return (await p.locator('#entry').inputValue()) === 'pwd'; });
await p.locator('#entry').fill('');

// --- Chinese mode: run the same core set ---
await type('zh');
await t('zh switched',  async () => (await all()).includes('在读'));
await t('zh tree',      async () => (await type('tree')).includes('experience'));
await t('zh cat',       async () => (await type('cat skills.md')).includes('图-向量混合检索'));
await t('zh education', async () => (await type('education')).includes('南京农业大学'));
await t('zh experience',async () => (await type('experience')).includes('慢病管理'));
await t('zh grep',      async () => (await type('grep 评测')).includes('.md'));
await t('zh bad cmd',   async () => (await type('nope')).includes('zsh:'));
await t('zh alias',     async () => (await type('经历')).includes('新传媒'));
await t('zh help',      async () => { const o = await type('help'); return o.includes('neofetch') && !/\\bls\\b|\\bcd\\b|\\bpwd\\b|\\bhistory\\b/.test(o); });
await t('en back',      async () => { await type('en'); return /NANYANG/i.test(await type('education')); });

// --- window chrome ---
await t('zoom',     async () => { await p.locator('#btnZoom').click(); await p.waitForTimeout(150); return await p.locator('.shell').evaluate(e => e.classList.contains('zoomed')); });
await t('unzoom',   async () => { await p.locator('#btnZoom').click(); await p.waitForTimeout(150); return !(await p.locator('.shell').evaluate(e => e.classList.contains('zoomed'))); });
await t('minimise', async () => { await p.locator('#btnMin').click(); await p.waitForTimeout(150); return await p.locator('.window').evaluate(e => e.classList.contains('mini')); });
await t('restore',  async () => { await p.locator('#btnMin').click(); await p.waitForTimeout(150); return !(await p.locator('.window').evaluate(e => e.classList.contains('mini'))); });
await t('close',    async () => { await p.locator('#btnClose').click(); await p.waitForTimeout(150); return await p.locator('body').evaluate(e => e.classList.contains('closed-mode')); });
await t('reopen',   async () => { await p.locator('#reopen').click(); await p.waitForTimeout(150); return !(await p.locator('body').evaluate(e => e.classList.contains('closed-mode'))); });
const dragEdge = async (sel, dx, dy) => {
  const b = await p.locator(sel).boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(200);
  return await p.locator('.shell').boundingBox();
};
await t('handles x8',  async () => (await p.locator('.rz').count()) === 8);
await t('drag SE',     async () => { const a = await p.locator('.shell').boundingBox(); const b = await dragEdge('.rz-se', -220, -120); return b.width < a.width - 100 && b.height < a.height - 50; });
await t('drag E',      async () => { const a = await p.locator('.shell').boundingBox(); const b = await dragEdge('.rz-e', 120, 0); return b.width > a.width + 60 && Math.abs(b.x - a.x) < 4; });
await t('drag W keeps right edge', async () => {
  const a = await p.locator('.shell').boundingBox();
  const b = await dragEdge('.rz-w', 90, 0);
  return b.width < a.width - 40 && Math.abs((b.x + b.width) - (a.x + a.width)) < 6;
});
await t('drag N keeps bottom', async () => {
  const a = await p.locator('.shell').boundingBox();
  const b = await dragEdge('.rz-n', 0, 70);
  return b.height < a.height - 30 && Math.abs((b.y + b.height) - (a.y + a.height)) < 6;
});
await t('min size',    async () => { const b = await dragEdge('.rz-se', -3000, -3000); return b.width >= 330 && b.height >= 210; });

// --- selection is copyable ---
await t('selectable', async () => {
  await p.locator('#history').first().evaluate(el => {
    const r = document.createRange(); r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await p.waitForTimeout(50);
  return (await p.evaluate(() => String(getSelection()).length)) > 50;
});

// --- persistence across reload ---
await t('theme persists', async () => {
  await type('theme amber');
  await p.reload(); await p.waitForTimeout(500);
  return (await p.locator('html').getAttribute('data-phosphor')) === 'amber';
});
await t('lang persists', async () => {
  await type('zh'); await p.reload(); await p.waitForTimeout(500);
  const v = (await all()).includes('在读'); await type('en'); return v;
});

// --- narrow viewport ---
const m = await b.newPage({ viewport: { width: 390, height: 780 } });
const merr = [];
m.on('pageerror', e => merr.push(e.message));
await m.goto(file); await m.waitForTimeout(500);
await t('mobile boots',  async () => (await m.locator('#history .block').count()) >= 3);
await t('no h-scroll',   async () => await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await t('mobile no err', async () => merr.length === 0);

console.log(out.map(([a, s]) => `${s === 'ok' ? '  ' : '!!'} ${a.padEnd(16)} ${s}`).join('\n'));
console.log(errs.length ? '\nJS ERRORS:\n' + errs.join('\n') : '\nno JS errors');
await b.close();
process.exit(out.some(([, s]) => s !== 'ok') || errs.length ? 1 : 0);
