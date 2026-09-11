import fs from 'node:fs';
import { start } from './node-harness.mjs';
const [root,result,mode]=process.argv.slice(2);
const w=start(root);
try {
  const opened=await w.call({op:'walletOpen'});
  if(mode==='contend') {fs.writeFileSync(result,JSON.stringify(opened),{flag:'wx'});await w.destroy();}
  else {
    if(opened.error) throw Error(JSON.stringify(opened));
    await w.call({op:'crash',crash:{op:'write',file:'wallet.db',nth:1}});
    const checkpoint=await w.call({op:'walletScan'});
    if(!checkpoint.checkpoint) throw Error(JSON.stringify(checkpoint));
    fs.writeFileSync(result,JSON.stringify({pid:process.pid,...checkpoint}),{flag:'wx'});
    // Keep actual SQLite owner blocked in its synchronous VFS checkpoint.
    // Parent observes the receipt, SIGKILLs the whole process, waits for signal exit.
  }
} catch(e) {fs.writeFileSync(result,JSON.stringify({error:String(e.stack)}),{flag:'wx'});await w.destroy();process.exitCode=1;}
