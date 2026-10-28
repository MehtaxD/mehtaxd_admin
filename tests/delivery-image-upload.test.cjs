const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {NextResponse} = require('next/server');
const id = '9a50db43-e982-4054-b769-82d46286bca9';
function harness() {
  const calls = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname,'../src/app/api/admin/orders/[id]/delivery-images/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, require:(name)=> name==='@/lib/admin-api-route' ? {
      validateAdminOrigin:(r)=>r.headers.get('origin')==='http://localhost:3001'?null:NextResponse.json({message:'Invalid origin'},{status:403}),
      adminBackend:async(path,init)=>{calls.push({path,...init});return NextResponse.json({id:'attachment-id'});},
    }:require(name), Uint8Array, URL,
  });
  return {calls, send:(request,orderId=id)=>exports.POST(request,{params:Promise.resolve({id:orderId})})};
}
function request(headers={},body='image fixture') {return new Request('http://localhost:3001/api/admin/orders/'+id+'/delivery-images',{method:'POST',headers:{Origin:'http://localhost:3001','Content-Type':'multipart/form-data; boundary=test',...headers},body});}
test('delivery upload forwards bounded multipart only to its validated Order',async()=>{
  const h=harness();assert.equal((await h.send(request())).status,200);
  assert.equal(h.calls[0].path,`/admin/orders/${id}/delivery-attachments`);
  assert.equal(new TextDecoder().decode(h.calls[0].body),'image fixture');
  assert.equal((await h.send(request(),'https://evil.invalid')).status,404);
  assert.equal(h.calls.length,1);
});
test('delivery upload rejects wrong origin, type and oversized streamed or declared bodies',async()=>{
  const h=harness();
  assert.equal((await h.send(request({Origin:'https://evil.invalid'}))).status,403);
  assert.equal((await h.send(request({'Content-Type':'application/json'}))).status,415);
  assert.equal((await h.send(request({'Content-Length':String(6*1024*1024)}))).status,413);
  assert.equal((await h.send(request({},'x'.repeat(6*1024*1024)))).status,413);
  assert.equal(h.calls.length,0);
});
