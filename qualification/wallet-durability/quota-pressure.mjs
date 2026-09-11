export const LIMIT = 64 * 1024 * 1024;
export const isNativeQuota = e => e instanceof DOMException && e.name === 'QuotaExceededError';
// Firefox's stack alone need not contain the original name/message.
export const errorDetails = e => ({error:String(e),name:e.name,message:e.message,stack:e.stack,code:e.name,nativeCode:e.code});
export async function fill(handle, progress={}) {
  const deadline=performance.now()+12000, errors=[];
  progress.errors=errors;
  const bytes=crypto.getRandomValues(new Uint8Array(65536));
  let chunk=bytes.length;
  for (;;) {
    if(performance.now()>deadline) throw Error('filler deadline');
    const at=handle.getSize();
    progress.bytes=at;
    if(at>=LIMIT) throw Error('64 MiB cap reached without exhausting quota');
    const requested=Math.min(chunk,LIMIT-at);
    Object.assign(progress,{op:'write',at,requested});
    try {
      const n=handle.write(bytes.subarray(0,requested),{at});
      if(n!==requested) throw Error('short filler write');
    } catch(e) {
      if(!isNativeQuota(e)) throw e;
      errors.push({name:e.name,code:e.code,message:e.message,at,requested});
      if(chunk===1) {progress.op='flush';handle.flush();return {bytes:handle.getSize(),errors};}
      chunk=Math.max(1,Math.floor(chunk/2));
    }
  }
}
