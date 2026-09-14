export const LIMIT = 64 * 1024 * 1024;
export const isNativeQuota = e => e instanceof DOMException && e.name === 'QuotaExceededError';
// Firefox's stack alone need not contain the original name/message.
export const errorDetails = e => ({error:String(e),name:e.name,message:e.message,stack:e.stack,code:e.name,nativeCode:e.code});
export async function fill(handle, progress={}) {
  const deadline=performance.now()+12000, errors=[], writes=[];
  Object.assign(progress,{errors,writes});
  const bytes=crypto.getRandomValues(new Uint8Array(65536));
  let chunk=bytes.length, saturation;
  for(let attempts=0; !saturation; attempts++) {
    if(performance.now()>deadline) throw Error('filler deadline');
    if(attempts>=4096) throw Error('filler attempt limit');
    const at=handle.getSize();
    progress.bytes=at;
    if(at>=LIMIT) throw Error('64 MiB cap reached without exhausting quota');
    const requested=Math.min(chunk,LIMIT-at);
    Object.assign(progress,{op:'write',at,requested});
    try {
      const returned=handle.write(bytes.subarray(0,requested),{at});
      writes.push({op:'write',file:'quota-filler',at,requested,returned});
      if(!Number.isInteger(returned) || returned<0 || returned>requested) throw Error('invalid filler write count');
      progress.bytes=handle.getSize();
      if(returned>0) continue; // Native partial progress is valid; append at actual EOF.
      if(chunk===1) saturation='zero-write';
      else chunk=Math.max(1,Math.floor(chunk/2));
    } catch(e) {
      if(!isNativeQuota(e)) throw e;
      errors.push({name:e.name,code:e.code,message:e.message,op:'write',file:'quota-filler',at,requested});
      if(chunk===1) saturation='native-quota-error';
      else chunk=Math.max(1,Math.floor(chunk/2));
    }
  }
  // One native growth probe on our filler only. A zero write is never relabeled
  // a DOMException, and this separate-file probe cannot satisfy the SQLite gate.
  if(saturation==='zero-write') {
    if(performance.now()>deadline) throw Error('filler deadline');
    const from=handle.getSize(), requestedSize=from+1;
    if(requestedSize>LIMIT) throw Error('64 MiB probe cap');
    const probe=progress.probe={op:'truncate',file:'quota-filler',from,requestedSize};
    try {handle.truncate(requestedSize);probe.sizeAfter=handle.getSize();}
    catch(e) {Object.assign(probe,errorDetails(e),{nativeQuota:isNativeQuota(e)});}
  }
  progress.op='flush';handle.flush();progress.bytes=handle.getSize();
  return {bytes:progress.bytes,errors,writes,saturation,probe:progress.probe};
}
