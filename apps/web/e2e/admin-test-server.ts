// Isolated integration harness. Never imported by a production entry point.
import { mock } from 'node:test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import Stripe from 'stripe';
const databaseUrl = process.env.GEMS_TEST_DATABASE_URL;
if (!databaseUrl || !['localhost','127.0.0.1'].includes(new URL(databaseUrl).hostname) || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Isolated localhost *_test database required');
process.env.DATABASE_URL=databaseUrl;
process.env.VERCEL='1';
process.env.NODE_ENV='development';
process.env.RESEND_API_KEY='';
process.env.AZURE_STORAGE_CONNECTION_STRING='';
process.env.FIREBASE_SERVICE_ACCOUNT='{}';
process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT='{}';
process.env.STRIPE_SECRET_KEY='sk_test_fixture';
process.env.STRIPE_PUBLISHABLE_KEY='pk_test_fixture';
process.env.STRIPE_WEBHOOK_SECRET='whsec_fixture';
process.env.STRIPE_CURRENCY='LKR';
process.env.PUBLIC_SITE_URL='http://127.0.0.1:4199';
const fixture={status:'paid', checkoutStatus:'complete', subscription:'sub_fixture', fail:false};
class FixtureStripe extends Stripe {
  constructor(...args:ConstructorParameters<typeof Stripe>) {
    super(...args);
    this.checkout.sessions.retrieve=(async(id:string)=>{if(fixture.fail)throw new Error('Simulated Stripe outage');return {id,status:fixture.checkoutStatus,payment_status:fixture.status,subscription:fixture.subscription,invoice:'in_fixture',customer:'cus_fixture'};}) as any;
    this.checkout.sessions.create=(async()=>({id:'cs_fixture',url:'http://127.0.0.1:4199/__fixture/checkout'})) as any;
    this.invoices.retrieve=(async(id:string)=>({id,status:fixture.status,amount_remaining:1000,currency:'lkr',billing_reason:'subscription_cycle',parent:{subscription_details:{subscription:fixture.subscription}},confirmation_secret:{client_secret:'fixture_secret'}})) as any;
    this.subscriptions.update=(async(id:string)=>({id,cancel_at_period_end:true})) as any;
  }
}
mock.module('stripe',{defaultExport:FixtureStripe});
mock.module(new URL('../server/auth.ts',import.meta.url).href,{namedExports:{
  readBearerToken:(request:any)=>(request.headers.authorization??'').replace(/^Bearer /,''),
  verifyAdminFirebaseIdToken:async(token:string)=>{if(token!=='test-admin')throw new Error('Unauthorized');return {email:'admin@example.invalid',role:'admin'};},
  verifyFirebaseIdToken:async(token:string)=>{if(token!=='test-user')throw new Error('Unauthorized');return {uid:'int-user-1',email:'test1@example.invalid',name:'Test User 1'};},
  generatePasswordResetLink:async()=>'',generateImpersonationToken:async()=> 'test-custom-token',getActiveAdminEmails:async()=>[]
}});
const {handleApi}=await import('../server/server.js');
const webRoot=fileURLToPath(new URL('..',import.meta.url));
const output=resolve(tmpdir(),'gems-admin-browser-build');
const defines=Object.fromEntries(['VITE_ADMIN_FIREBASE_API_KEY','VITE_ADMIN_FIREBASE_AUTH_DOMAIN','VITE_ADMIN_FIREBASE_PROJECT_ID','VITE_ADMIN_FIREBASE_APP_ID','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'].map(key=>[`import.meta.env.${key}`,JSON.stringify('fixture-config')]));
await build({entryPoints:[resolve(webRoot,'src/admin-main.tsx'),resolve(webRoot,'src/main.tsx')],outdir:output,bundle:true,format:'esm',platform:'browser',jsx:'automatic',tsconfig:resolve(webRoot,'tsconfig.json'),
  alias:{'firebase/auth':fileURLToPath(new URL('./fixtures/firebase-auth.ts',import.meta.url))},
  define:{'import.meta.env':'{}','process.env.NODE_ENV':'"development"',...defines},external:['/assets/*'],loader:{'.woff2':'file','.woff':'file','.png':'file','.jpg':'file','.svg':'file'}});
const server=createServer(async(req,res)=>{
  try {
    if(req.url?.startsWith('/__fixture/stripe')){Object.assign(fixture,Object.fromEntries(new URL(req.url,'http://localhost').searchParams));fixture.fail=String(fixture.fail)==='true';res.end('ok');return;}
    if(await handleApi(req,res))return;
    const pathname=new URL(req.url??'/', 'http://localhost').pathname;
    const extension=extname(pathname);
    if(!extension) {
      const entry=pathname.startsWith('/admin') ? 'admin-main' : 'main';
      res.setHeader('content-type','text/html');
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/${entry}.css"></head><body><div id="root"></div><script type="module" src="/${entry}.js"></script></body></html>`);return;
    }
    const path=pathname.startsWith('/assets/') ? resolve(webRoot,'public',pathname.slice(1)) : resolve(output,pathname.slice(1));
    if(!path.startsWith(output+'/')&&!path.startsWith(resolve(webRoot,'public')+'/')){res.statusCode=404;res.end();return;}
    res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'} as Record<string,string>)[extension]??'application/octet-stream');
    res.end(await readFile(path));
  }catch(error){console.error(error);res.statusCode=500;res.end(JSON.stringify({error:'Test server failure'}));}
});
server.listen(4199,'127.0.0.1',()=>console.log('Isolated admin integration server: http://127.0.0.1:4199/admin'));
